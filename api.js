function resolveApiBase() {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE) {
    return import.meta.env.VITE_API_BASE;
  }

  if (typeof window !== 'undefined' && window.location.port === '5173') {
    return 'http://localhost:4000/api';
  }

  return '/api';
}

const API_BASE = resolveApiBase();

export async function getState() {
  const response = await fetch(`${API_BASE}/state`);
  if (!response.ok) {
    throw new Error('Не удалось получить состояние');
  }
  return response.json();
}

export async function failLamp(lampId) {
  const response = await fetch(`${API_BASE}/lamps/${lampId}/fail`, { method: 'POST' });
  if (!response.ok) {
    throw new Error('Не удалось перевести фонарь в аварийный режим');
  }
  return response.json();
}

export async function updateEnvironment(ambientTemp) {
  const response = await fetch(`${API_BASE}/environment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ambientTemp })
  });

  if (!response.ok) {
    throw new Error('Не удалось обновить температуру');
  }

  return response.json();
}

export async function planMission(lampIds) {
  const response = await fetch(`${API_BASE}/missions/plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lampIds })
  });

  if (!response.ok) {
    throw new Error('Не удалось построить план миссии');
  }

  return response.json();
}

export async function startMission(missionId) {
  const response = await fetch(`${API_BASE}/missions/${missionId}/start`, {
    method: 'POST'
  });

  if (!response.ok) {
    throw new Error('Не удалось запустить миссию');
  }

  return response.json();
}

export async function setAutoService(enabled) {
  const response = await fetch(`${API_BASE}/auto-service`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled })
  });

  if (!response.ok) {
    throw new Error('Не удалось изменить режим автообслуживания');
  }

  return response.json();
}

export const setAutoDispatch = setAutoService;

export async function logError(message, payload = {}) {
  await fetch(`${API_BASE}/logs/error`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, payload })
  });
}
