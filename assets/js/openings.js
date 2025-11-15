import { state } from './state.js';
import { pushUndoSnapshot } from './history.js';

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

function clamp01(value) {
  if (!Number.isFinite(value)) return 0.5;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function computeFeatureRange(position, lengthCells, totalCells) {
  if (!Number.isFinite(totalCells) || totalCells <= 0) {
    return null;
  }

  const normalizedLengthRaw =
    Number.isFinite(lengthCells) && lengthCells > 0 ? Math.min(lengthCells / totalCells, 1) : 0;

  if (normalizedLengthRaw <= 0) {
    const center = clamp01(position);
    return { start: center, end: center, center, normalizedLength: 0 };
  }

  if (normalizedLengthRaw >= 1) {
    return { start: 0, end: 1, center: 0.5, normalizedLength: 1 };
  }

  let center = clamp01(position);
  const half = normalizedLengthRaw / 2;
  let start = center - half;
  let end = center + half;

  if (start < 0) {
    start = 0;
    end = normalizedLengthRaw;
    center = normalizedLengthRaw / 2;
  } else if (end > 1) {
    end = 1;
    start = 1 - normalizedLengthRaw;
    center = 1 - normalizedLengthRaw / 2;
  }

  return { start, end, center, normalizedLength: normalizedLengthRaw };
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

  const desiredPosition = Number.isFinite(position) ? position : 0.5;
  const range = computeFeatureRange(desiredPosition, lengthCells, available);
  if (!range || range.normalizedLength <= 0) {
    return { success: false, reason: 'too-short' };
  }

  const overlaps = features.some((existing) => {
    const existingRange = computeFeatureRange(existing?.position, existing?.lengthCells, available);
    if (!existingRange || existingRange.normalizedLength <= 0) return false;
    const overlap = Math.min(existingRange.end, range.end) - Math.max(existingRange.start, range.start);
    return overlap > 1e-4;
  });

  if (overlaps) {
    return { success: false, reason: 'overlap' };
  }

  pushUndoSnapshot();

  features.push({
    type,
    position: range.center,
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
  pushUndoSnapshot();
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
