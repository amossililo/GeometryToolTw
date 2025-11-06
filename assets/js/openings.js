import { state } from './state.js';

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

export function getOpeningPreset(type) {
  if (!state.openingPresets) return null;
  const preset = state.openingPresets[type];
  if (!preset) return null;
  const width = Number.isFinite(preset.width) && preset.width > 0 ? preset.width : null;
  const height = Number.isFinite(preset.height) && preset.height > 0 ? preset.height : null;
  if (width == null || height == null) return null;
  return { width, height };
}

export function setOpeningPreset(type, dimensions) {
  if (!type || !dimensions) return false;
  const width = Number(dimensions.width);
  const height = Number(dimensions.height);
  if (!Number.isFinite(width) || width <= 0) return false;
  if (!Number.isFinite(height) || height <= 0) return false;
  if (!state.openingPresets) {
    state.openingPresets = {};
  }
  state.openingPresets[type] = { width, height };
  return true;
}

function resolveOpeningDimensions(type, override) {
  const preset = getOpeningPreset(type);
  const width = override && Number.isFinite(override.width) && override.width > 0 ? override.width : preset?.width;
  const height = override && Number.isFinite(override.height) && override.height > 0 ? override.height : preset?.height;
  if (!width || !height) {
    return null;
  }
  return { width, height };
}

export function addOpeningToWall(wallIndex, { type, position, width, height }) {
  const wall = state.walls[wallIndex];
  if (!wall) return { success: false, reason: 'missing-wall' };

  const features = ensureWallFeatures(wall);
  const dimensions = resolveOpeningDimensions(type, { width, height });
  if (!dimensions) {
    return { success: false, reason: 'missing-dimensions' };
  }

  const { width: widthUnits, height: heightUnits } = dimensions;
  const unitPerCell = Number.isFinite(state.unitPerCell) && state.unitPerCell > 0 ? state.unitPerCell : 1;
  const lengthCells = widthUnits / unitPerCell;
  const available = wallLengthCells(wall);
  if (available <= 0 || available < lengthCells) {
    return { success: false, reason: 'too-short' };
  }

  const clampedPosition = Math.min(Math.max(position, 0), 1);
  features.push({
    type,
    position: Number.isFinite(clampedPosition) ? clampedPosition : 0.5,
    lengthCells,
    widthUnits,
    heightUnits,
    area: widthUnits * heightUnits,
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
