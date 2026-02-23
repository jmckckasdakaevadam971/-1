import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { geoDistance, nearestNeighborRoute, optimizeMultiDroneRoutes } from './tsp.js';
import {
  addLog,
  createMission,
  findMission,
  getPublicState,
  markLampForReplacement,
  setAmbientTemp,
  state
} from './store.js';

const app = express();
app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.join(__dirname, 'dist');

const PORT = Number(process.env.PORT) || 4000;
const TICK_MS = 1000;
const CHARGE_RATE_PER_TICK = 2;
const FLIGHT_TICK_MS = 250;
const DRONE_STEP_DEG = 0.00075;
const REPLACEMENT_DURATION_MS = 1800;
const DOCK_SERVICE_MS = 30000;
const AUTO_DISPATCH_COOLDOWN_MS = 4000;
const MIN_BATTERY_FOR_FLIGHT = 60;
const RETURN_TO_DOCK_BATTERY_THRESHOLD = 25;
const LAMPS_PER_CONTAINER = 5;
const DOCK_REFILL_INTERVAL_MS = 10000;
const DOCK_REFILL_UNITS = 1;
const DOCK_REFILL_PAUSE_AFTER_SWAP_MS = 60000;
const AUTO_SERVICE_PLAN = {
  'drone-01': [142, 112, 129, 132, 119, 141, 125, 115, 108, 117, 106, 134, 116, 104, 133],
  'drone-02': [128, 130, 145, 124, 136],
  'drone-03': [114, 100, 101, 107, 143, 139],
  'drone-04': [110, 122, 118, 137, 148, 123, 126, 149, 102, 127, 138],
  'drone-05': [109, 144, 120, 147, 146, 113, 121, 105, 140, 103, 131, 111, 135]
};

function getActiveDock(drone) {
  const boundDockId = drone.homeDockId ?? drone.activeDockId;
  return state.docks.find((dock) => dock.id === boundDockId) ?? null;
}

function enforceDroneDockBinding(drone) {
  if (!drone.homeDockId && drone.activeDockId) {
    drone.homeDockId = drone.activeDockId;
  }

  if (drone.homeDockId && drone.activeDockId !== drone.homeDockId) {
    drone.activeDockId = drone.homeDockId;
  }
}

function ensureDroneContainerState(drone) {
  if (!Number.isFinite(drone.containerLampsRemaining)) {
    drone.containerLampsRemaining = LAMPS_PER_CONTAINER;
  }
}

function createDroneForDock(dock, index) {
  return {
    id: `drone-${String(index + 1).padStart(2, '0')}`,
    battery: 100,
    isOperational: true,
    status: 'idle',
    targetLampId: null,
    pendingContainerOps: 0,
    containerLampsRemaining: LAMPS_PER_CONTAINER,
    serviceEndsAt: null,
    homeDockId: dock.id,
    activeDockId: dock.id,
    position: { lat: dock.lat, lng: dock.lng }
  };
}

function ensureDroneCoverageForAllDocks() {
  state.docks.forEach((dock, index) => {
    const dockDrone = state.drones.find((drone) => (drone.homeDockId ?? drone.activeDockId) === dock.id);
    if (!dockDrone) {
      const newDrone = createDroneForDock(dock, index);
      state.drones.push(newDrone);
      addLog('drone', `Добавлен ${newDrone.id} для ${dock.name}`, { droneId: newDrone.id, dockId: dock.id });
    }
  });

  state.drones.forEach((drone) => {
    enforceDroneDockBinding(drone);
    ensureDroneContainerState(drone);
    if (drone.status !== 'enroute' && drone.status !== 'replacing') {
      moveDroneToDockIfAvailable(drone);
    }
  });
}

function moveDroneToDockIfAvailable(drone) {
  const dock = getActiveDock(drone);
  if (dock) {
    drone.position = { lat: dock.lat, lng: dock.lng };
  }
}

function moveDroneTowards(drone, target) {
  if (!target) {
    return true;
  }

  const current = drone.position;
  const deltaLat = target.lat - current.lat;
  const deltaLng = target.lng - current.lng;
  const distance = Math.hypot(deltaLat, deltaLng);

  if (distance <= DRONE_STEP_DEG) {
    drone.position = { lat: target.lat, lng: target.lng };
    return true;
  }

  const ratio = DRONE_STEP_DEG / distance;
  drone.position = {
    lat: current.lat + deltaLat * ratio,
    lng: current.lng + deltaLng * ratio
  };
  return false;
}

function getReadyDronesForMission() {
  return state.drones.filter(
    (drone) => drone.isOperational
      && drone.battery >= MIN_BATTERY_FOR_FLIGHT
      && (drone.status === 'idle' || drone.status === 'charging')
      && !drone.serviceEndsAt
  );
}

const activeMissionTimers = new Map();

function buildMissionRoutes(lamps, drones) {
  return optimizeMultiDroneRoutes(lamps, drones);
}

function getDroneLampCapacity(drone) {
  const availableLamps = Number.isFinite(drone?.containerLampsRemaining)
    ? drone.containerLampsRemaining
    : LAMPS_PER_CONTAINER;
  return Math.max(0, Math.min(LAMPS_PER_CONTAINER, availableLamps));
}

function getOccupiedLampIds(excludeMissionId = null) {
  const occupiedLampIds = new Set();

  state.missions.forEach((mission) => {
    if (mission.id === excludeMissionId || mission.status !== 'running') {
      return;
    }

    const completedLampIds = new Set(mission.completedLampIds ?? []);
    (mission.routeLampIds ?? []).forEach((lampId) => {
      if (!completedLampIds.has(lampId)) {
        occupiedLampIds.add(lampId);
      }
    });
  });

  state.drones.forEach((drone) => {
    if ((drone.status === 'enroute' || drone.status === 'replacing') && typeof drone.targetLampId === 'number') {
      occupiedLampIds.add(drone.targetLampId);
    }
  });

  return occupiedLampIds;
}

function buildCapacityAwareRoutes(lamps, drones) {
  const validLamps = Array.isArray(lamps) ? [...lamps] : [];
  const activeDrones = Array.isArray(drones)
    ? drones.filter((drone) => drone?.isOperational && drone?.position)
    : [];

  if (validLamps.length === 0 || activeDrones.length === 0) {
    return { routeLampIds: [], droneRoutes: {} };
  }

  const assignedByDrone = new Map(activeDrones.map((drone) => [drone.id, []]));
  const capacityByDrone = new Map(activeDrones.map((drone) => [drone.id, getDroneLampCapacity(drone)]));

  validLamps.forEach((lamp) => {
    const sortedDrones = [...activeDrones].sort(
      (left, right) => geoDistance(left.position, lamp) - geoDistance(right.position, lamp)
    );

    const selectedDrone = sortedDrones.find((drone) => (capacityByDrone.get(drone.id) ?? 0) > 0);
    if (!selectedDrone) {
      return;
    }

    assignedByDrone.get(selectedDrone.id).push(lamp);
    capacityByDrone.set(selectedDrone.id, (capacityByDrone.get(selectedDrone.id) ?? 0) - 1);
  });

  const droneRoutes = {};
  activeDrones.forEach((drone) => {
    const assignedLamps = assignedByDrone.get(drone.id) ?? [];
    const orderedLamps = nearestNeighborRoute(assignedLamps, drone.position);
    droneRoutes[drone.id] = orderedLamps.map((lamp) => lamp.id);
  });

  return {
    routeLampIds: Object.values(droneRoutes).flat(),
    droneRoutes
  };
}

function getNearestReadyDroneForLamp(lamp, readyDrones) {
  if (!lamp || !Array.isArray(readyDrones) || readyDrones.length === 0) {
    return null;
  }

  let nearestDrone = readyDrones[0];
  let nearestDistance = geoDistance(nearestDrone.position, lamp);

  for (let index = 1; index < readyDrones.length; index += 1) {
    const drone = readyDrones[index];
    const distance = geoDistance(drone.position, lamp);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestDrone = drone;
    }
  }

  return nearestDrone;
}

function tryStartMission(mission) {
  if (!mission) {
    return { ok: false, statusCode: 404, error: 'Mission not found' };
  }

  if (mission.status === 'running') {
    return { ok: false, statusCode: 400, error: 'Mission already running' };
  }

  if (mission.status === 'completed') {
    return { ok: false, statusCode: 400, error: 'Mission already completed' };
  }

  const readyDrones = getReadyDronesForMission();
  if (readyDrones.length === 0) {
    state.drones.forEach((drone) => {
      if (drone.battery < 100) {
        drone.status = 'charging';
        moveDroneToDockIfAvailable(drone);
      }
    });
    broadcast();
    return { ok: false, statusCode: 409, error: `Нет готовых дронов: зарядите дроны минимум до ${MIN_BATTERY_FOR_FLIGHT}% для вылета.` };
  }

  const lampById = new Map(state.lamps.map((lamp) => [lamp.id, lamp]));
  const occupiedLampIds = getOccupiedLampIds(mission.id);
  let missionRoutes = mission.droneRoutes ?? {};

  if (mission.source === 'manual') {
    const missionLamps = mission.routeLampIds
      .map((id) => lampById.get(id))
      .filter(Boolean);
    const optimized = buildCapacityAwareRoutes(missionLamps, readyDrones);
    missionRoutes = optimized.droneRoutes;
    mission.routeLampIds = optimized.routeLampIds;
    mission.droneRoutes = missionRoutes;
  }

  if (mission.source !== 'manual' && Object.keys(missionRoutes).length === 0) {
    const missionLamps = mission.routeLampIds
      .map((id) => lampById.get(id))
      .filter(Boolean);
    missionRoutes = buildMissionRoutes(missionLamps, readyDrones).droneRoutes;
    mission.droneRoutes = missionRoutes;
  }

  const activeRoutes = {};
  const assignedLampIds = new Set();
  readyDrones.forEach((drone) => {
    const route = Array.isArray(missionRoutes[drone.id])
      ? missionRoutes[drone.id].filter((lampId) => {
        if (occupiedLampIds.has(lampId) || assignedLampIds.has(lampId)) {
          return false;
        }

        const lamp = lampById.get(lampId);
        if (!lamp || lamp.status !== 'replace') {
          return false;
        }

        assignedLampIds.add(lampId);
        return true;
      })
      : [];

    if (route.length > 0) {
      activeRoutes[drone.id] = [...route];
    }
  });

  mission.routeLampIds = Object.values(activeRoutes).flat();

  const hasAnyRoute = Object.values(activeRoutes).some((route) => route.length > 0);
  if (!hasAnyRoute) {
    return { ok: false, statusCode: 400, error: 'Для миссии не найдено доступных маршрутов дронов.' };
  }

  const assignedDrones = readyDrones.filter((drone) => Array.isArray(activeRoutes[drone.id]) && activeRoutes[drone.id].length > 0);
  if (assignedDrones.length === 0) {
    return { ok: false, statusCode: 400, error: 'Не найдено назначенных готовых дронов для запуска миссии.' };
  }

  mission.status = 'running';
  mission.startedAt = new Date().toISOString();
  mission.droneRoutes = activeRoutes;

  assignedDrones.forEach((drone) => {
    moveDroneToDockIfAvailable(drone);
    drone.status = 'enroute';
    drone.targetLampId = null;
  });

  addLog('mission', `Запуск миссии ${mission.id}`, {
    source: mission.source,
    drones: Object.keys(activeRoutes)
  });
  broadcast();

  runMission(mission, activeRoutes, assignedDrones);
  return { ok: true };
}

let lastAutoDispatchAt = 0;
let lastDockRefillAt = 0;
const autoServiceProgress = Object.fromEntries(
  Object.keys(AUTO_SERVICE_PLAN).map((droneId) => [droneId, 0])
);

function findNextPlannedLampsForDrone(droneId, startIndex, maxCount) {
  const plan = AUTO_SERVICE_PLAN[droneId] ?? [];
  let index = startIndex;
  const lampIds = [];

  while (index < plan.length && lampIds.length < maxCount) {
    const lampId = plan[index];
    index += 1;

    const lamp = state.lamps.find((item) => item.id === lampId);
    if (lamp && lamp.status === 'replace') {
      lampIds.push(lampId);
    }
  }

  return { lampIds, nextIndex: index };
}

function buildAutoServiceDispatch(readyDrones) {
  const droneRoutes = {};
  const routeLampIds = [];
  const nextProgress = {};

  readyDrones.forEach((drone) => {
    const currentProgress = autoServiceProgress[drone.id] ?? 0;
    const lampsForDrone = Math.max(1, Math.min(LAMPS_PER_CONTAINER, drone.containerLampsRemaining ?? LAMPS_PER_CONTAINER));
    const { lampIds, nextIndex } = findNextPlannedLampsForDrone(drone.id, currentProgress, lampsForDrone);
    nextProgress[drone.id] = nextIndex;

    if (lampIds.length > 0) {
      droneRoutes[drone.id] = lampIds;
      routeLampIds.push(...lampIds);
    }
  });

  return { droneRoutes, routeLampIds, nextProgress };
}

function tryAutoServiceDispatch(now = Date.now()) {
  if (!state.autoServiceEnabled || now - lastAutoDispatchAt < AUTO_DISPATCH_COOLDOWN_MS) {
    return;
  }

  const hasManualInProgress = state.missions.some(
    (mission) => mission.source === 'manual' && (mission.status === 'planned' || mission.status === 'running')
  );
  if (hasManualInProgress) {
    return;
  }

  const readyDrones = getReadyDronesForMission();
  if (readyDrones.length === 0) {
    return;
  }

  const dispatch = buildAutoServiceDispatch(readyDrones);
  if (dispatch.routeLampIds.length === 0) {
    return;
  }

  const mission = createMission(dispatch.routeLampIds, null, {
    droneRoutes: dispatch.droneRoutes,
    source: 'auto_service'
  });

  const started = tryStartMission(mission);
  if (started.ok) {
    Object.entries(dispatch.nextProgress).forEach(([droneId, progress]) => {
      autoServiceProgress[droneId] = progress;
    });
    lastAutoDispatchAt = now;
    addLog('auto', `Автообслуживание: запуск миссии ${mission.id}`, {
      missionId: mission.id,
      droneRoutes: dispatch.droneRoutes
    });
  } else {
    addLog('error', `Автообслуживание: не удалось запустить миссию ${mission.id}`, {
      missionId: mission.id,
      reason: started.error,
      statusCode: started.statusCode
    });
  }
}

app.get('/api/state', (_req, res) => {
  res.json(getPublicState());
});

app.post('/api/lamps/:lampId/fail', (req, res) => {
  const lamp = markLampForReplacement(Number(req.params.lampId));
  if (!lamp) {
    return res.status(404).json({ error: 'Lamp not found' });
  }

  let autoServiceStarted = false;
  if (state.autoServiceEnabled) {
    const beforeMissionCount = state.missions.length;
    tryAutoServiceDispatch();
    autoServiceStarted = state.missions.length > beforeMissionCount;
  }

  broadcast();
  return res.json({ lamp, autoServiceStarted });
});

app.post('/api/environment', (req, res) => {
  const value = Number(req.body.ambientTemp);
  if (!Number.isFinite(value)) {
    return res.status(400).json({ error: 'ambientTemp must be a number' });
  }

  setAmbientTemp(value);
  addLog('env', `Температура среды обновлена до ${value}°C`);
  broadcast();
  return res.json({ ambientTemp: value });
});

app.post('/api/missions/plan', (req, res) => {
  const requestedLampIds = Array.isArray(req.body.lampIds)
    ? req.body.lampIds.map((id) => Number(id)).filter((id) => Number.isFinite(id))
    : [];
  const requestedLampIdSet = new Set(requestedLampIds);
  const occupiedLampIds = getOccupiedLampIds();
  const candidateLamps = state.lamps.filter(
    (lamp) => requestedLampIdSet.has(lamp.id)
      && lamp.status === 'replace'
      && !occupiedLampIds.has(lamp.id)
  );

  if (candidateLamps.length === 0) {
    addLog('error', 'Не удалось сформировать план миссии: нет столбов в статусе replace', {
      requestedLampIds,
      statusCode: 400
    });
    broadcast();
    return res.status(400).json({ error: 'No replace-status lampIds selected' });
  }

  const availableDrones = state.drones.filter(
    (drone) => drone.isOperational && getDroneLampCapacity(drone) > 0
  );
  const optimized = buildCapacityAwareRoutes(candidateLamps, availableDrones);

  if (optimized.routeLampIds.length === 0) {
    addLog('error', 'Не удалось сформировать план миссии: нет доступных дронов с лампами', {
      requestedLampIds,
      statusCode: 409
    });
    broadcast();
    return res.status(409).json({ error: 'No available drones with replacement lamps' });
  }

  const mission = createMission(optimized.routeLampIds, null, {
    droneRoutes: optimized.droneRoutes,
    source: 'manual'
  });
  broadcast();

  return res.json({
    mission,
    droneRoutes: mission.droneRoutes,
    orderedLamps: candidateLamps
  });
});

function handleAutoServiceToggle(req, res) {
  if (typeof req.body?.enabled !== 'boolean') {
    return res.status(400).json({ error: 'enabled must be a boolean' });
  }

  const enabled = req.body.enabled;
  state.autoServiceEnabled = enabled;

  addLog('auto', enabled ? 'Автообслуживание включено' : 'Автообслуживание выключено');
  broadcast();

  return res.json({ autoServiceEnabled: state.autoServiceEnabled, autoDispatchEnabled: state.autoServiceEnabled });
}

app.post('/api/auto-service', handleAutoServiceToggle);
app.post('/api/auto-dispatch', handleAutoServiceToggle);

app.post('/api/drones/containers/replace-all', (_req, res) => {
  const nowIso = new Date().toISOString();

  state.drones.forEach((drone) => {
    drone.containerLampsRemaining = LAMPS_PER_CONTAINER;
    drone.pendingContainerOps = 0;
    drone.serviceEndsAt = null;

    if (drone.status === 'servicing') {
      drone.status = drone.battery < 100 ? 'charging' : 'idle';
    }
  });

  state.docks.forEach((dock) => {
    dock.containerSwapStatus = 'replaced';
    dock.containerSwapUpdatedAt = nowIso;
    dock.lastSwapCompletedAt = Date.now();
  });

  addLog('dock', 'Контейнеры принудительно заменены на всех дронах', {
    drones: state.drones.map((drone) => ({
      droneId: drone.id,
      containerLampsRemaining: drone.containerLampsRemaining
    })),
    lampsPerContainer: LAMPS_PER_CONTAINER
  });
  broadcast();

  return res.json({
    ok: true,
    lampsPerContainer: LAMPS_PER_CONTAINER,
    drones: state.drones.map((drone) => ({
      id: drone.id,
      containerLampsRemaining: drone.containerLampsRemaining
    }))
  });
});

app.post('/api/logs/error', (req, res) => {
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (!message) {
    return res.status(400).json({ error: 'message must be a non-empty string' });
  }

  const payload = req.body?.payload && typeof req.body.payload === 'object' ? req.body.payload : {};
  addLog('error', message, payload);
  broadcast();

  return res.json({ ok: true });
});

app.post('/api/missions/:missionId/start', (req, res) => {
  const mission = findMission(req.params.missionId);
  const started = tryStartMission(mission);
  if (!started.ok) {
    addLog('error', `Не удалось запустить миссию ${req.params.missionId}`, {
      missionId: req.params.missionId,
      reason: started.error,
      statusCode: started.statusCode
    });
    broadcast();
    return res.status(started.statusCode).json({ error: started.error });
  }
  return res.json({ mission });
});

if (existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      return next();
    }

    return res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

function runMission(mission, droneRoutes, missionDrones) {
  const workers = missionDrones.map((drone) => ({
    drone,
    queue: [...(droneRoutes[drone.id] ?? [])],
    targetLampId: null,
    replaceStartedAt: 0,
    replacedCount: 0,
    returning: false,
    completed: false
  }));

  const completeMission = () => {
    const timerId = activeMissionTimers.get(mission.id);
    if (timerId) {
      clearInterval(timerId);
      activeMissionTimers.delete(mission.id);
    }

    mission.status = 'completed';
    mission.finishedAt = new Date().toISOString();
    workers.forEach(({ drone }) => {
      drone.targetLampId = null;
      if (drone.status !== 'servicing') {
        drone.status = drone.battery < 100 ? 'charging' : 'idle';
        if (drone.status === 'charging') {
          moveDroneToDockIfAvailable(drone);
        }
      }
    });
    addLog('mission', `Миссия ${mission.id} завершена`);
    broadcast();
  };

  const missionTimer = setInterval(() => {
    workers.forEach((worker) => {
      if (worker.completed || !worker.drone.isOperational) {
        return;
      }

      if (
        worker.drone.battery <= RETURN_TO_DOCK_BATTERY_THRESHOLD
        && worker.targetLampId !== null
        && worker.drone.status !== 'replacing'
      ) {
        addLog('drone', `${worker.drone.id}: возврат на док для подзарядки`, {
          droneId: worker.drone.id,
          battery: worker.drone.battery,
          threshold: RETURN_TO_DOCK_BATTERY_THRESHOLD,
          interruptedLampId: worker.targetLampId
        });
        worker.queue = [];
        worker.targetLampId = null;
        worker.drone.targetLampId = null;
        worker.drone.status = 'enroute';
      }

      if (worker.targetLampId !== null) {
        const lamp = state.lamps.find((item) => item.id === worker.targetLampId);
        if (!lamp) {
          worker.targetLampId = null;
          worker.drone.targetLampId = null;
          worker.drone.status = 'enroute';
          return;
        }

        if (worker.drone.status !== 'replacing' && lamp.status !== 'replace') {
          addLog('replace', `${worker.drone.id} пропустил ${lamp.name}: повторная замена не требуется`, {
            lampId: lamp.id,
            droneId: worker.drone.id,
            lampStatus: lamp.status
          });
          worker.targetLampId = null;
          worker.drone.targetLampId = null;
          worker.drone.status = 'enroute';
          return;
        }

        if (worker.drone.status === 'replacing') {
          if (Date.now() - worker.replaceStartedAt < REPLACEMENT_DURATION_MS) {
            return;
          }

          lamp.status = 'ok';
          lamp.cassettePresent = true;
          lamp.powerOn = true;
          lamp.energyW = 100 + Math.round(Math.random() * 12);
          mission.completedLampIds.push(lamp.id);
          worker.drone.battery = Math.max(20, worker.drone.battery - (4 + Math.round(Math.random() * 2)));
          worker.drone.containerLampsRemaining = Math.max(0, worker.drone.containerLampsRemaining - 1);
          worker.replacedCount += 1;
          addLog('replace', `${worker.drone.id} завершил замену на ${lamp.name}`, {
            lampId: lamp.id,
            droneId: worker.drone.id,
            containerLampsRemaining: worker.drone.containerLampsRemaining,
            lampsPerContainer: LAMPS_PER_CONTAINER
          });

          worker.targetLampId = null;
          worker.drone.targetLampId = null;
          worker.drone.status = 'enroute';
          return;
        }

        worker.drone.status = 'enroute';
        const arrived = moveDroneTowards(worker.drone, { lat: lamp.lat, lng: lamp.lng });
        if (arrived) {
          if (lamp.status !== 'replace') {
            worker.targetLampId = null;
            worker.drone.targetLampId = null;
            worker.drone.status = 'enroute';
            return;
          }

          if (worker.drone.containerLampsRemaining <= 0) {
            const dock = getActiveDock(worker.drone);
            addLog('dock', `${worker.drone.id}: контейнер пуст, требуется замена`, {
              droneId: worker.drone.id,
              dockId: dock?.id ?? null,
              lampsPerContainer: LAMPS_PER_CONTAINER
            });
            worker.queue = [];
            worker.targetLampId = null;
            worker.drone.targetLampId = null;
            worker.drone.status = 'enroute';
            return;
          }

          lamp.status = 'in_progress';
          worker.drone.status = 'replacing';
          worker.replaceStartedAt = Date.now();
          addLog('replace', `${worker.drone.id} выполняет замену кассеты на ${lamp.name}`, { lampId: lamp.id, droneId: worker.drone.id });
        }
        return;
      }

      if (worker.queue.length > 0) {
        const [nextLampId] = worker.queue.splice(0, 1);
        if (typeof nextLampId === 'number') {
          worker.targetLampId = nextLampId;
          worker.drone.targetLampId = nextLampId;
          worker.drone.status = 'enroute';
        }
        return;
      }

      const dock = getActiveDock(worker.drone);
      if (!dock) {
        worker.drone.targetLampId = null;
        worker.drone.status = worker.drone.battery < 100 ? 'charging' : 'idle';
        worker.completed = true;
        return;
      }

      worker.returning = true;
      worker.drone.status = 'enroute';
      const arrived = moveDroneTowards(worker.drone, { lat: dock.lat, lng: dock.lng });
      if (arrived) {
        worker.drone.targetLampId = null;
        if (worker.drone.containerLampsRemaining <= 0) {
          worker.drone.status = 'servicing';
          worker.drone.pendingContainerOps += 1;
          worker.drone.serviceEndsAt = Date.now() + DOCK_SERVICE_MS;
          dock.containerSwapStatus = 'in_progress';
          dock.containerSwapUpdatedAt = new Date().toISOString();
          addLog('dock', `${worker.drone.id} начал сервис контейнеров на ${dock.name}`, {
            droneId: worker.drone.id,
            dockId: dock.id,
            replacements: worker.replacedCount,
            containersToSwap: worker.drone.pendingContainerOps,
            lampsRemaining: worker.drone.containerLampsRemaining,
            serviceSeconds: Math.floor(DOCK_SERVICE_MS / 1000)
          });
          worker.replacedCount = 0;
        } else {
          worker.drone.status = worker.drone.battery < 100 ? 'charging' : 'idle';
        }
        worker.completed = true;
      }
    });

    const missionDone = workers.every((worker) => worker.completed || !worker.drone.isOperational);
    if (missionDone) {
      completeMission();
      return;
    }

    broadcast();
  }, FLIGHT_TICK_MS);

  activeMissionTimers.set(mission.id, missionTimer);
}

const server = app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend started: http://localhost:${PORT}`);
});

const wss = new WebSocketServer({ server });

function broadcast() {
  const payload = JSON.stringify({ type: 'state', data: getPublicState() });

  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(payload);
    }
  });
}

wss.on('connection', (socket) => {
  socket.send(JSON.stringify({ type: 'state', data: getPublicState() }));
});

setInterval(() => {
  const now = Date.now();

  ensureDroneCoverageForAllDocks();

  if (now - lastDockRefillAt >= DOCK_REFILL_INTERVAL_MS) {
    state.docks.forEach((dock) => {
      const lastSwapCompletedAt = typeof dock.lastSwapCompletedAt === 'number' ? dock.lastSwapCompletedAt : 0;
      if (now - lastSwapCompletedAt < DOCK_REFILL_PAUSE_AFTER_SWAP_MS) {
        return;
      }

      const refillUnits = Math.min(DOCK_REFILL_UNITS, dock.emptyContainers);
      if (refillUnits > 0) {
        dock.emptyContainers -= refillUnits;
        dock.fullContainers += refillUnits;
      }
    });
    lastDockRefillAt = now;
  }

  state.drones.forEach((drone) => {
    if (drone.status === 'servicing') {
      if (drone.serviceEndsAt && now >= drone.serviceEndsAt) {
        const dock = getActiveDock(drone);
        if (dock && drone.pendingContainerOps > 0) {
          const ops = drone.pendingContainerOps;
          dock.fullContainers = Math.max(0, dock.fullContainers - ops);
          dock.emptyContainers += ops;
          dock.containerSwapStatus = 'replaced';
          dock.lastSwapCompletedAt = now;
          dock.containerSwapUpdatedAt = new Date().toISOString();
          drone.containerLampsRemaining = LAMPS_PER_CONTAINER * ops;
          addLog('dock', `${drone.id}: сервис контейнеров завершен`, {
            droneId: drone.id,
            dockId: dock.id,
            processedContainers: ops,
            lampsLoaded: drone.containerLampsRemaining
          });
        }

        drone.pendingContainerOps = 0;
        drone.serviceEndsAt = null;
        drone.status = drone.battery < 100 ? 'charging' : 'idle';
      }
      return;
    }

    if (drone.status === 'idle' || drone.status === 'charging') {
      if (drone.battery < 100) {
        drone.status = 'charging';
        moveDroneToDockIfAvailable(drone);
        drone.battery = Math.min(100, drone.battery + CHARGE_RATE_PER_TICK);

        if (drone.battery >= 100) {
          drone.status = 'idle';
          addLog('drone', `${drone.id} полностью заряжен и готов к вылету`, { droneId: drone.id });
        }
      } else if (drone.status === 'charging') {
        drone.status = 'idle';
      }
    }
  });

  state.drone = state.drones[0] ?? state.drone;
  tryAutoServiceDispatch();
  broadcast();
}, TICK_MS);
