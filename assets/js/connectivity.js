import { state } from './state.js';
import { isPointOnWall } from './geometry.js';

export function computeConnectivity() {
  if (state.walls.length === 0) {
    state.openWallIndexes = new Set();
    state.openEndpoints = [];
    return;
  }

  const endpointMap = new Map();
  state.walls.forEach((wall, index) => {
    const startKey = `${wall.x1},${wall.y1}`;
    const endKey = `${wall.x2},${wall.y2}`;

    if (!endpointMap.has(startKey)) endpointMap.set(startKey, []);
    endpointMap.get(startKey).push({ index, point: { x: wall.x1, y: wall.y1 } });

    if (!endpointMap.has(endKey)) endpointMap.set(endKey, []);
    endpointMap.get(endKey).push({ index, point: { x: wall.x2, y: wall.y2 } });
  });

  endpointMap.forEach((entries, key) => {
    const [xStr, yStr] = key.split(',');
    const point = { x: Number(xStr), y: Number(yStr) };
    state.walls.forEach((wall, wallIndex) => {
      if (entries.some((entry) => entry.index === wallIndex)) return;
      if (isPointOnWall(point, wall)) {
        entries.push({ index: wallIndex, point });
      }
    });
  });

  const openSet = new Set();
  const openPoints = [];

  endpointMap.forEach((entries) => {
    if (entries.length <= 1) {
      entries.forEach((entry) => {
        openSet.add(entry.index);
        openPoints.push(entry.point);
      });
    }
  });

  state.openWallIndexes = openSet;
  state.openEndpoints = openPoints;
}
