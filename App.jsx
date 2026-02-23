import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { failLamp, getState, logError, planMission, setAutoService, startMission, updateEnvironment } from './api.js';
import { MapPanel } from './MapPanel.jsx';
import { ModelPanel } from './ModelPanel1.jsx';

function resolveWsUrl() {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }

  if (typeof window !== 'undefined' && window.location.port === '5173') {
    return 'ws://localhost:4000';
  }

  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}`;
  }

  return 'ws://localhost:4000';
}

const WS_URL = resolveWsUrl();
const DASHBOARD_VIEW = 'dashboard';
const VISUALIZATION_VIEW = 'visualization';
const LOGS_VIEW = 'logs';

function getViewFromHash() {
  if (window.location.hash === '#visualization') {
    return VISUALIZATION_VIEW;
  }

  if (window.location.hash === '#logs') {
    return LOGS_VIEW;
  }

  return DASHBOARD_VIEW;
}

function missionProgress(mission) {
  if (!mission || mission.routeLampIds.length === 0) {
    return 0;
  }
  return Math.round((mission.completedLampIds.length / mission.routeLampIds.length) * 100);
}

function lampStatusView(status) {
  if (status === 'replace') {
    return { label: 'требует замены', badgeClass: 'bad' };
  }

  if (status === 'ok') {
    return { label: 'исправен', badgeClass: 'ok' };
  }

  return { label: status, badgeClass: 'info' };
}

export function App() {
  const [state, setState] = useState({ lamps: [], docks: [], drones: [], drone: { status: 'idle', battery: 100 }, missions: [], logs: [], ambientTemp: 0, autoServiceEnabled: false });
  const [selectedLampId, setSelectedLampId] = useState(null);
  const [selectedLampIds, setSelectedLampIds] = useState([]);
  const [activeMissionId, setActiveMissionId] = useState(null);
  const [error, setError] = useState('');
  const [activeView, setActiveView] = useState(getViewFromHash);
  const socketRef = useRef(null);

  const selectedLamp = useMemo(
    () => state.lamps.find((lamp) => lamp.id === selectedLampId) ?? state.lamps[0] ?? null,
    [state.lamps, selectedLampId]
  );

  const activeMission = useMemo(
    () => state.missions.find((mission) => mission.id === activeMissionId) ?? state.missions[0] ?? null,
    [state.missions, activeMissionId]
  );

  const activeDock = useMemo(
    () => state.docks.find((dock) => dock.id === (state.drone.homeDockId ?? state.drone.activeDockId)) ?? null,
    [state.docks, state.drone.homeDockId, state.drone.activeDockId]
  );

  const toggleLamp = useCallback((lampId) => {
    setSelectedLampIds((previous) =>
      previous.includes(lampId) ? previous.filter((value) => value !== lampId) : [...previous, lampId]
    );
  }, []);

  useEffect(() => {
    getState().then(setState).catch((e) => setError(e.message));

    const ws = new WebSocket(WS_URL);
    socketRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'state') {
          setState(message.data);
          setError('');
        }
      } catch {
        setError('Ошибка декодирования WebSocket сообщения');
      }
    };

    ws.onerror = () => {
      setError('WebSocket отключен. Проверьте backend.');
    };

    return () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    const onHashChange = () => setActiveView(getViewFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const openDashboard = () => {
    window.location.hash = '';
  };

  const openVisualization = () => {
    window.location.hash = 'visualization';
  };

  const openLogs = () => {
    window.location.hash = 'logs';
  };

  const onPlanMission = async () => {
    try {
      setError('');
      const replaceLampIdSet = new Set(
        state.lamps
          .filter((lamp) => lamp.status === 'replace')
          .map((lamp) => lamp.id)
      );

      const selectedReplaceIds = selectedLampIds.filter((lampId) => replaceLampIdSet.has(lampId));
      const targetIds = selectedReplaceIds.length > 0
        ? selectedReplaceIds
        : Array.from(replaceLampIdSet);

      if (selectedReplaceIds.length !== selectedLampIds.length) {
        setSelectedLampIds(selectedReplaceIds);
      }

      const result = await planMission(targetIds);
      setActiveMissionId(result.mission.id);
      setSelectedLampIds(result.mission.routeLampIds);
    } catch (e) {
      setError(e.message);
      await logError('Не удалось составить план замены (client)', {
        reason: e.message,
        selectedLampIds,
        source: 'ui:onPlanMission'
      });
    }
  };

  const onStartMission = async () => {
    try {
      setError('');
      if (!activeMission) {
        throw new Error('Сначала сформируйте миссию');
      }
      await startMission(activeMission.id);
      setActiveMissionId(activeMission.id);
    } catch (e) {
      setError(e.message);
      await logError('Не удалось запустить миссию (client)', {
        reason: e.message,
        missionId: activeMission?.id ?? null,
        source: 'ui:onStartMission'
      });
    }
  };

  const onFailLamp = async () => {
    try {
      setError('');
      if (!selectedLamp) {
        throw new Error('Выберите фонарь');
      }
      await failLamp(selectedLamp.id);
    } catch (e) {
      setError(e.message);
    }
  };

  const onTempChange = async (event) => {
    const value = Number(event.target.value);
    setState((prev) => ({ ...prev, ambientTemp: value }));
    try {
      await updateEnvironment(value);
    } catch (e) {
      setError(e.message);
    }
  };

  const onToggleAutoService = async () => {
    const previousValue = state.autoServiceEnabled;
    const nextValue = !previousValue;
    try {
      setError('');
      setState((prev) => ({ ...prev, autoServiceEnabled: nextValue }));
      const result = await setAutoService(nextValue);
      setState((prev) => ({ ...prev, autoServiceEnabled: result.autoServiceEnabled }));
    } catch (e) {
      setError(e.message);
      setState((prev) => ({ ...prev, autoServiceEnabled: previousValue }));
    }
  };

  return (
    <div className="layout">
      <header className="header">
        <h1>Управление автоматизированной заменой LED-кассет</h1>
        <div className="view-tabs">
          <button type="button" className={activeView === DASHBOARD_VIEW ? 'active' : ''} onClick={openDashboard}>Панель</button>
          <button type="button" className={activeView === VISUALIZATION_VIEW ? 'active' : ''} onClick={openVisualization}>3D-визуализация</button>
          <button type="button" className={activeView === LOGS_VIEW ? 'active' : ''} onClick={openLogs}>Логи</button>
        </div>
        <div className="status-strip">
          <span>Дрон: {state.drone.status}</span>
          <span>Заряд: {state.drone.battery}%</span>
          <span>Температура: {state.ambientTemp}°C</span>
          <span>Выбрано точек: {selectedLampIds.length}</span>
          <span>Док-станция: {activeDock ? activeDock.name : 'не назначена'}</span>
        </div>
      </header>

      {activeView === DASHBOARD_VIEW ? (
        <main className="content">
          <section className="map-panel-wrap">
            <MapPanel
              lamps={state.lamps}
              docks={state.docks}
              drones={state.drones}
              drone={state.drone}
              selectedLampId={selectedLampId}
              selectedLampIds={selectedLampIds}
              onSelectLamp={setSelectedLampId}
              onToggleMissionLamp={toggleLamp}
            />
          </section>

          <aside className="sidebar">
            <div className="card">
              <h3>Панель управления</h3>
              <div className="controls">
                <button type="button" onClick={onFailLamp}>Симулировать поломку</button>
                <button type="button" onClick={onPlanMission}>Составить план замены</button>
                <button type="button" onClick={onStartMission}>Запустить миссию</button>
                <button type="button" onClick={onToggleAutoService}>{state.autoServiceEnabled ? 'Автообслуживание: ВКЛ' : 'Автообслуживание: ВЫКЛ'}</button>
              </div>
              <label htmlFor="temp">Температура среды: {state.ambientTemp}°C</label>
              <input id="temp" type="range" min={-40} max={50} value={state.ambientTemp} onChange={onTempChange} />
              {activeMission && (
                <div className="mission-box">
                  <strong>Миссия {activeMission.id}</strong>
                  <span>Статус: {activeMission.status}</span>
                  <span>Прогресс: {missionProgress(activeMission)}%</span>
                  <span>Маршрут: {activeMission.routeLampIds.join(' → ')}</span>
                </div>
              )}
              {error ? <div className="error">{error}</div> : null}
            </div>

            <div className="card lamp-card">
              <h3>Карточка фонаря</h3>
              {selectedLamp ? (
                <>
                  <span>{selectedLamp.name}</span>
                  {(() => {
                    const statusView = lampStatusView(selectedLamp.status);
                    return (
                      <span>
                        Статус: <strong className={`lamp-badge lamp-card-status ${statusView.badgeClass}`}>{statusView.label}</strong>
                      </span>
                    );
                  })()}
                  <span>Питание: {selectedLamp.powerOn ? 'вкл' : 'выкл'}</span>
                  <span>Потребление: {selectedLamp.energyW} W</span>
                </>
              ) : (
                <span>Выберите фонарь на карте</span>
              )}
            </div>

            <div className="card logs">
              <h3>Журнал выполнения</h3>
              <div className="log-list">
                {state.logs.slice().reverse().map((log) => (
                  <div className="log-row" key={log.id}>
                    <span>{new Date(log.timestamp).toLocaleTimeString('ru-RU')}</span>
                    <span>{log.message}</span>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </main>
      ) : activeView === VISUALIZATION_VIEW ? (
        <main className="visualization-page">
          <div className="visualization-canvas">
            <ModelPanel lamp={selectedLamp} droneStatus={state.drone.status} ambientTemp={state.ambientTemp} />
          </div>
        </main>
      ) : (
        <main className="logs-page">
          <section className="card detailed-logs-card">
            <h3>Подробный журнал событий</h3>
            <div className="detailed-log-list">
              {state.logs.length > 0 ? state.logs.slice().reverse().map((log) => (
                <article className="detailed-log-row" key={log.id}>
                  <div className="detailed-log-header">
                    <span>{new Date(log.timestamp).toLocaleString('ru-RU')}</span>
                    <span className={`detailed-log-type detailed-log-type-${log.type}`}>{log.type}</span>
                  </div>
                  <div className="detailed-log-message">{log.message}</div>
                  {log.payload && Object.keys(log.payload).length > 0 ? (
                    <pre className="detailed-log-payload">{JSON.stringify(log.payload, null, 2)}</pre>
                  ) : (
                    <span className="detailed-log-empty">payload: пусто</span>
                  )}
                </article>
              )) : (
                <div className="detailed-log-empty">Событий пока нет</div>
              )}
            </div>
          </section>
        </main>
      )}
    </div>
  );
}
