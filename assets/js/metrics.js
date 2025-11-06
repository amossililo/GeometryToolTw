import { state } from './state.js';
import { computeEnclosedAreaCells } from './geometry.js';

export function computeMetricsSnapshot() {
  const wallCount = state.walls.length;
  const totalLengthCells = state.walls.reduce((sum, w) => {
    return sum + Math.abs(w.x2 - w.x1) + Math.abs(w.y2 - w.y1);
  }, 0);
  const totalLengthValue = totalLengthCells * state.unitPerCell;
  const totalLengthDisplay = Number.isInteger(totalLengthValue)
    ? totalLengthValue
    : Number(totalLengthValue.toFixed(2));

  const enclosedCells = computeEnclosedAreaCells();
  const enclosedAreaValue = enclosedCells * state.unitPerCell * state.unitPerCell;
  const enclosedAreaDisplay = Number.isInteger(enclosedAreaValue)
    ? enclosedAreaValue
    : Number(enclosedAreaValue.toFixed(2));

  const unitLabel = state.unitLabel || 'units';

  const lastWall = state.walls[wallCount - 1];
  let lastWallLengthValue = null;
  let lastWallLengthDisplay = null;
  if (lastWall) {
    const cells = Math.abs(lastWall.x2 - lastWall.x1) + Math.abs(lastWall.y2 - lastWall.y1);
    lastWallLengthValue = cells * state.unitPerCell;
    lastWallLengthDisplay = Number.isInteger(lastWallLengthValue)
      ? lastWallLengthValue
      : Number(lastWallLengthValue.toFixed(2));
  }

  let windowArea = 0;
  let doorArea = 0;
  let windowCount = 0;
  let doorCount = 0;
  state.walls.forEach((wall) => {
    if (!wall || !Array.isArray(wall.features)) return;
    wall.features.forEach((feature) => {
      if (!feature || !feature.type) return;
      const area = Number.isFinite(feature.area)
        ? feature.area
        : Number(feature.widthUnits) * Number(feature.heightUnits);
      if (feature.type === 'door') {
        doorCount += 1;
        if (Number.isFinite(area) && area > 0) {
          doorArea += area;
        }
      } else if (feature.type === 'window') {
        windowCount += 1;
        if (Number.isFinite(area) && area > 0) {
          windowArea += area;
        }
      }
    });
  });

  return {
    wallCount,
    totalLengthCells,
    totalLengthValue,
    totalLengthDisplay,
    enclosedCells,
    enclosedAreaValue,
    enclosedAreaDisplay,
    unitLabel,
    lastWallLengthValue,
    lastWallLengthDisplay,
    gridSpacing: state.gridSize,
    unitPerCell: state.unitPerCell,
    windowArea,
    doorArea,
    windowCount,
    doorCount,
  };
}

export function createMetricsManager({
  wallCountEl,
  totalLengthEl,
  lastWallEl,
  areaEl,
  windowCountEl,
  doorCountEl,
}) {
  function updateMetrics() {
    const metrics = computeMetricsSnapshot();
    state.latestMetrics = metrics;

    if (wallCountEl) {
      wallCountEl.textContent = metrics.wallCount.toString();
    }
    if (totalLengthEl) {
      totalLengthEl.textContent = `${metrics.totalLengthDisplay} ${metrics.unitLabel}`;
    }
    if (areaEl) {
      areaEl.textContent = `${metrics.enclosedAreaDisplay} ${metrics.unitLabel}²`;
    }
    if (lastWallEl) {
      lastWallEl.textContent =
        metrics.lastWallLengthDisplay == null
          ? '–'
          : `${metrics.lastWallLengthDisplay} ${metrics.unitLabel}`;
    }
    if (windowCountEl) {
      windowCountEl.textContent = metrics.windowCount.toString();
    }
    if (doorCountEl) {
      doorCountEl.textContent = metrics.doorCount.toString();
    }

    return metrics;
  }

  return { updateMetrics };
}
