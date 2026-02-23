function toRad(value) {
  return (value * Math.PI) / 180;
}

export function geoDistance(a, b) {
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

function* permutations(items) {
  if (items.length <= 1) {
    yield items;
    return;
  }

  for (let index = 0; index < items.length; index += 1) {
    const current = items[index];
    const remaining = [...items.slice(0, index), ...items.slice(index + 1)];

    for (const tail of permutations(remaining)) {
      yield [current, ...tail];
    }
  }
}

function bruteForceBestRoute(lamps, startPosition) {
  if (lamps.length <= 1) {
    return lamps;
  }

  let bestRoute = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const route of permutations(lamps)) {
    let distance = geoDistance(startPosition, route[0]);

    for (let index = 0; index < route.length - 1; index += 1) {
      distance += geoDistance(route[index], route[index + 1]);
    }

    if (distance < bestDistance) {
      bestDistance = distance;
      bestRoute = route;
    }
  }

  return bestRoute ?? lamps;
}

export function nearestNeighborRoute(lamps, startPosition) {
  if (!Array.isArray(lamps) || lamps.length === 0) {
    return [];
  }

  const MAX_EXACT_POINTS = 8;
  if (lamps.length <= MAX_EXACT_POINTS) {
    return bruteForceBestRoute(lamps, startPosition);
  }

  const remaining = [...lamps];
  const route = [];
  let current = { lat: startPosition.lat, lng: startPosition.lng };

  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let index = 0; index < remaining.length; index += 1) {
      const distance = geoDistance(current, remaining[index]);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }

    const [nextLamp] = remaining.splice(bestIndex, 1);
    route.push(nextLamp);
    current = { lat: nextLamp.lat, lng: nextLamp.lng };
  }

  return route;
}

function routeDistance(route, startPosition) {
  if (!route || route.length === 0) {
    return 0;
  }

  let distance = geoDistance(startPosition, route[0]);
  for (let index = 0; index < route.length - 1; index += 1) {
    distance += geoDistance(route[index], route[index + 1]);
  }
  return distance;
}

function bestInsertionDelta(route, lamp, startPosition) {
  if (route.length === 0) {
    return { index: 0, delta: geoDistance(startPosition, lamp) };
  }

  let bestIndex = 0;
  let bestDelta = Number.POSITIVE_INFINITY;

  for (let insertIndex = 0; insertIndex <= route.length; insertIndex += 1) {
    const prev = insertIndex === 0 ? startPosition : route[insertIndex - 1];
    const next = insertIndex === route.length ? null : route[insertIndex];

    const removed = next ? geoDistance(prev, next) : 0;
    const added = geoDistance(prev, lamp) + (next ? geoDistance(lamp, next) : 0);
    const delta = added - removed;

    if (delta < bestDelta) {
      bestDelta = delta;
      bestIndex = insertIndex;
    }
  }

  return { index: bestIndex, delta: bestDelta };
}

function twoOptRoute(route, startPosition) {
  if (route.length < 4) {
    return route;
  }

  let improved = true;
  let bestRoute = [...route];
  let bestDistance = routeDistance(bestRoute, startPosition);

  while (improved) {
    improved = false;

    for (let i = 0; i < bestRoute.length - 2; i += 1) {
      for (let j = i + 1; j < bestRoute.length - 1; j += 1) {
        const candidate = [
          ...bestRoute.slice(0, i),
          ...bestRoute.slice(i, j + 1).reverse(),
          ...bestRoute.slice(j + 1)
        ];

        const candidateDistance = routeDistance(candidate, startPosition);
        if (candidateDistance < bestDistance) {
          bestRoute = candidate;
          bestDistance = candidateDistance;
          improved = true;
        }
      }
    }
  }

  return bestRoute;
}

export function optimizeMultiDroneRoutes(lamps, drones) {
  const validLamps = Array.isArray(lamps) ? [...lamps] : [];
  const activeDrones = Array.isArray(drones)
    ? drones.filter((drone) => drone?.isOperational && drone?.position)
    : [];

  if (validLamps.length === 0 || activeDrones.length === 0) {
    return { routeLampIds: [], droneRoutes: {} };
  }

  const routesByDrone = new Map(activeDrones.map((drone) => [drone.id, []]));
  const unassigned = [...validLamps];

  const seedDrones = [...activeDrones];
  while (seedDrones.length > 0 && unassigned.length > 0) {
    let bestDroneIndex = 0;
    let bestLampIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let droneIndex = 0; droneIndex < seedDrones.length; droneIndex += 1) {
      const drone = seedDrones[droneIndex];
      for (let lampIndex = 0; lampIndex < unassigned.length; lampIndex += 1) {
        const distance = geoDistance(drone.position, unassigned[lampIndex]);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestDroneIndex = droneIndex;
          bestLampIndex = lampIndex;
        }
      }
    }

    const [chosenDrone] = seedDrones.splice(bestDroneIndex, 1);
    const [seedLamp] = unassigned.splice(bestLampIndex, 1);
    routesByDrone.get(chosenDrone.id).push(seedLamp);
  }

  while (unassigned.length > 0) {
    let bestLampIndex = 0;
    let bestDroneId = activeDrones[0].id;
    let bestInsertIndex = 0;
    let bestDelta = Number.POSITIVE_INFINITY;

    for (let lampIndex = 0; lampIndex < unassigned.length; lampIndex += 1) {
      const lamp = unassigned[lampIndex];

      for (const drone of activeDrones) {
        const route = routesByDrone.get(drone.id);
        const insertion = bestInsertionDelta(route, lamp, drone.position);

        if (insertion.delta < bestDelta) {
          bestDelta = insertion.delta;
          bestLampIndex = lampIndex;
          bestDroneId = drone.id;
          bestInsertIndex = insertion.index;
        }
      }
    }

    const [lampToAssign] = unassigned.splice(bestLampIndex, 1);
    const targetRoute = routesByDrone.get(bestDroneId);
    targetRoute.splice(bestInsertIndex, 0, lampToAssign);
  }

  const droneRoutes = {};
  activeDrones.forEach((drone) => {
    const optimized = twoOptRoute(routesByDrone.get(drone.id), drone.position);
    droneRoutes[drone.id] = optimized.map((lamp) => lamp.id);
  });

  const routeLampIds = Object.values(droneRoutes).flat();
  return { routeLampIds, droneRoutes };
}
