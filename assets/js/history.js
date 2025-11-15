import { state } from './state.js';

const MAX_HISTORY = 200;
const undoStack = [];

function cloneFeature(feature) {
  if (!feature || typeof feature !== 'object') return {};
  return { ...feature };
}

function cloneWall(wall) {
  if (!wall || typeof wall !== 'object') return null;
  const features = Array.isArray(wall.features)
    ? wall.features.map((feature) => cloneFeature(feature))
    : [];
  return { ...wall, features };
}

export function pushUndoSnapshot() {
  const snapshot = {
    walls: state.walls.map((wall) => cloneWall(wall)).filter(Boolean),
    selectedWallIndex: state.selectedWallIndex,
  };

  undoStack.push(snapshot);
  if (undoStack.length > MAX_HISTORY) {
    undoStack.shift();
  }

  return snapshot;
}

export function discardUndoSnapshot(snapshot) {
  if (!snapshot) return;
  const index = undoStack.lastIndexOf(snapshot);
  if (index === undoStack.length - 1) {
    undoStack.pop();
  }
}

export function restoreLastSnapshot() {
  if (undoStack.length === 0) {
    return false;
  }

  const snapshot = undoStack.pop();
  state.walls = snapshot.walls.map((wall) => cloneWall(wall)).filter(Boolean);

  const index = snapshot.selectedWallIndex;
  if (Number.isInteger(index) && index >= 0 && index < state.walls.length) {
    state.selectedWallIndex = index;
  } else {
    state.selectedWallIndex = null;
  }

  state.preview = null;
  state.isDrawing = false;

  return true;
}

export function hasUndoHistory() {
  return undoStack.length > 0;
}

export function resetUndoHistory() {
  undoStack.length = 0;
}
