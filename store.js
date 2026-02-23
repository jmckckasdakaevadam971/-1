const now = () => new Date().toISOString();

function toRad(value) {
  return (value * Math.PI) / 180;
}

function geoDistance(a, b) {
  const earthRadiusKm = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);

  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);

  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));

  return earthRadiusKm * c;
}

function buildDroneDocks() {
  return [
    { id: 'D-1', name: 'Док-станция Центр', lat: 55.79226, lng: 49.12438, roofHeightM: 42, fullContainers: 14, emptyContainers: 4, isOperational: true, containerSwapStatus: 'not_replaced', containerSwapUpdatedAt: null },
    { id: 'D-2', name: 'Док-станция Кремль', lat: 55.79944, lng: 49.10526, roofHeightM: 38, fullContainers: 11, emptyContainers: 6, isOperational: true, containerSwapStatus: 'not_replaced', containerSwapUpdatedAt: null },
    { id: 'D-3', name: 'Док-станция Козья слобода', lat: 55.81853, lng: 49.09765, roofHeightM: 35, fullContainers: 9, emptyContainers: 3, isOperational: true, containerSwapStatus: 'not_replaced', containerSwapUpdatedAt: null },
    { id: 'D-4', name: 'Док-станция Савиново', lat: 55.82867, lng: 49.15291, roofHeightM: 40, fullContainers: 12, emptyContainers: 5, isOperational: true, containerSwapStatus: 'not_replaced', containerSwapUpdatedAt: null },
    { id: 'D-5', name: 'Док-станция Юг', lat: 55.75418, lng: 49.19632, roofHeightM: 33, fullContainers: 10, emptyContainers: 2, isOperational: true, containerSwapStatus: 'not_replaced', containerSwapUpdatedAt: null }
  ];
}

function buildReplacementLamps() {
  const lamps = [];
  const totalLamps = 50;

  let seed = 89231;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  const area = {
    minLat: 55.72,
    maxLat: 55.87,
    minLng: 48.98,
    maxLng: 49.27
  };

  const clusters = [
    { lat: 55.791, lng: 49.122, spreadLat: 0.014, spreadLng: 0.02 },
    { lat: 55.807, lng: 49.161, spreadLat: 0.013, spreadLng: 0.02 },
    { lat: 55.772, lng: 49.147, spreadLat: 0.013, spreadLng: 0.018 },
    { lat: 55.759, lng: 49.194, spreadLat: 0.013, spreadLng: 0.02 },
    { lat: 55.832, lng: 49.096, spreadLat: 0.012, spreadLng: 0.017 },
    { lat: 55.845, lng: 49.182, spreadLat: 0.011, spreadLng: 0.017 }
  ];

  const minDistance = 0.0038;

  const waterMasks = [
    { minLat: 55.742, maxLat: 55.829, minLng: 48.98, maxLng: 49.06 },
    { minLat: 55.798, maxLat: 55.834, minLng: 49.06, maxLng: 49.208 },
    { minLat: 55.734, maxLat: 55.769, minLng: 49.045, maxLng: 49.126 },
    { minLat: 55.744, maxLat: 55.812, minLng: 49.026, maxLng: 49.072 }
  ];

  const isInWater = (point) => waterMasks.some(
    (mask) => point.lat >= mask.minLat
      && point.lat <= mask.maxLat
      && point.lng >= mask.minLng
      && point.lng <= mask.maxLng
  );

  const tryGeneratePoint = () => {
    const cluster = clusters[Math.floor(random() * clusters.length)];
    const lat = cluster.lat + (random() - 0.5) * 2 * cluster.spreadLat;
    const lng = cluster.lng + (random() - 0.5) * 2 * cluster.spreadLng;
    return {
      lat: Math.min(area.maxLat, Math.max(area.minLat, lat)),
      lng: Math.min(area.maxLng, Math.max(area.minLng, lng))
    };
  };

  for (let index = 0; index < totalLamps; index += 1) {
    let point = tryGeneratePoint();
    let attempts = 0;

    while (
      attempts < 120
      && (
        isInWater(point)
        || lamps.some((lamp) => Math.hypot(lamp.lat - point.lat, lamp.lng - point.lng) < minDistance)
      )
    ) {
      point = tryGeneratePoint();
      attempts += 1;
    }

    lamps.push({
      id: 100 + index,
      name: `Казань-${index + 1}`,
      lat: Number(point.lat.toFixed(6)),
      lng: Number(point.lng.toFixed(6)),
      status: 'replace',
      powerOn: false,
      ambientTemp: -5,
      cassettePresent: index % 7 !== 0,
      energyW: 0
    });
  }

  return lamps;
}

function buildDrones(docks) {
  return docks.map((dock, index) => ({
    id: `drone-${String(index + 1).padStart(2, '0')}`,
    battery: 100,
    isOperational: true,
    status: 'idle',
    targetLampId: null,
    pendingContainerOps: 0,
    containerLampsRemaining: 5,
    serviceEndsAt: null,
    homeDockId: dock.id,
    activeDockId: dock.id,
    position: { lat: dock.lat, lng: dock.lng }
  }));
}

const docks = buildDroneDocks();
const drones = buildDrones(docks);

export const state = {
  ambientTemp: -5,
  autoServiceEnabled: false,
  docks,
  drones,
  drone: drones[0],
  lamps: buildReplacementLamps(),
  missions: [],
  logs: []
};

export function getPublicState() {
  state.drone = state.drones[0] ?? state.drone;

  return {
    ambientTemp: state.ambientTemp,
    autoServiceEnabled: state.autoServiceEnabled,
    autoDispatchEnabled: state.autoServiceEnabled,
    docks: state.docks,
    drones: state.drones,
    drone: state.drone,
    lamps: state.lamps,
    missions: state.missions,
    logs: state.logs.slice(-50),
    timestamp: now()
  };
}

export function addLog(type, message, payload = {}) {
  state.logs.push({ id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`, type, message, payload, timestamp: now() });
}

export function setAmbientTemp(value) {
  state.ambientTemp = value;
  state.lamps = state.lamps.map((lamp) => ({ ...lamp, ambientTemp: value }));
}

export function markLampForReplacement(lampId) {
  const normalizedLampId = Number(lampId);
  const lamp = state.lamps.find((item) => item.id === normalizedLampId);
  if (!lamp) {
    return null;
  }

  lamp.status = 'replace';
  lamp.powerOn = false;
  lamp.energyW = 0;
  addLog('alarm', `Фонарь ${lamp.name} переведен в статус замены`, { lampId: normalizedLampId });
  return lamp;
}

export function findNearestDock(position) {
  if (!position || !Array.isArray(state.docks) || state.docks.length === 0) {
    return null;
  }

  let nearest = state.docks[0];
  let bestDistance = geoDistance(position, nearest);

  for (let index = 1; index < state.docks.length; index += 1) {
    const dock = state.docks[index];
    const distance = geoDistance(position, dock);
    if (distance < bestDistance) {
      bestDistance = distance;
      nearest = dock;
    }
  }

  return nearest;
}

export function createMission(routeLampIds, launchDockId = null, options = {}) {
  const droneRoutes = options.droneRoutes ?? {};
  const source = options.source ?? 'manual';

  const mission = {
    id: `M-${Date.now()}`,
    createdAt: now(),
    startedAt: null,
    finishedAt: null,
    status: 'planned',
    source,
    launchDockId,
    droneRoutes,
    routeLampIds,
    completedLampIds: []
  };

  state.missions.unshift(mission);
  addLog('mission', `Сформирована миссия ${mission.id}`, { routeLampIds, launchDockId, source });
  return mission;
}

export function findMission(missionId) {
  return state.missions.find((mission) => mission.id === missionId);
}
