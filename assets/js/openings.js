import { state } from './state.js';

const OPENING_LENGTHS = {
  window: 2,
  door: 1.5,
};

function ensureWallFeatures(wall) {
  if (!wall) return [];
  if (!Array.isArray(wall.features)) {
    wall.features = [];
  }
  return wall.features;
}

function wallLengthCells(wall) {
  return Math.abs(wall.x2 - wall.x1) + Math.abs(wall.y2 - wall.y1);
}

export function getOpeningLength(type) {
  return OPENING_LENGTHS[type] ?? 1;
}

export function addOpeningToWall(wallIndex, { type, position }) {
  const wall = state.walls[wallIndex];
  if (!wall) return { success: false, reason: 'missing-wall' };

  const features = ensureWallFeatures(wall);
  const lengthCells = getOpeningLength(type);
  const available = wallLengthCells(wall);
  if (available <= 0 || available < lengthCells) {
    return { success: false, reason: 'too-short' };
  }

  const clampedPosition = Math.min(Math.max(position, 0), 1);
  features.push({
    type,
    position: Number.isFinite(clampedPosition) ? clampedPosition : 0.5,
    lengthCells,
  });

  return { success: true };
}

export function clearOpeningsFromWall(wallIndex) {
  const wall = state.walls[wallIndex];
  if (!wall || !Array.isArray(wall.features) || wall.features.length === 0) {
    return false;
  }
  wall.features = [];
  return true;
}

export function selectedWallHasOpenings() {
  const wall = state.walls[state.selectedWallIndex];
  return Boolean(wall && Array.isArray(wall.features) && wall.features.length);
}

export function normalizeWallFeatures(wall) {
  return ensureWallFeatures(wall);
}
