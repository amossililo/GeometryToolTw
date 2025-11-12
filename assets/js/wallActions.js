import { state } from './state.js';

export function createWallActions({
  onWallsChanged = () => {},
  onSelectionChanged = () => {},
}) {
  function undoLast() {
    if (state.walls.length === 0) return;
    state.walls.pop();
    if (state.selectedWallIndex != null && state.selectedWallIndex >= state.walls.length) {
      state.selectedWallIndex = null;
      onSelectionChanged();
    }
    onWallsChanged();
  }

  function clearAll() {
    if (state.walls.length === 0) return;
    state.walls = [];
    state.selectedWallIndex = null;
    state.preview = null;
    onSelectionChanged();
    onWallsChanged();
  }

  function eraseSelected() {
    if (state.selectedWallIndex == null) return;
    state.walls.splice(state.selectedWallIndex, 1);
    state.selectedWallIndex = null;
    onSelectionChanged();
    onWallsChanged();
  }

  function clearOpenings() {
    const index = state.selectedWallIndex;
    if (index == null) return false;
    const wall = state.walls[index];
    if (!wall || !Array.isArray(wall.features) || wall.features.length === 0) {
      return false;
    }
    wall.features = [];
    onWallsChanged();
    return true;
  }

  function offsetSelected(offsetCells) {
    const distance = Number(offsetCells);
    if (!Number.isFinite(distance) || distance === 0) {
      return { success: false, reason: 'invalid-offset' };
    }

    const index = state.selectedWallIndex;
    if (index == null) {
      return { success: false, reason: 'no-selection' };
    }

    const wall = state.walls[index];
    if (!wall) {
      return { success: false, reason: 'missing-wall' };
    }

    const isHorizontal = wall.y1 === wall.y2;
    const isVertical = wall.x1 === wall.x2;
    if (!isHorizontal && !isVertical) {
      return { success: false, reason: 'unsupported-orientation' };
    }

    const offset = Math.trunc(distance);
    if (offset === 0) {
      return { success: false, reason: 'invalid-offset' };
    }

    const newWall = {
      x1: wall.x1 + (isVertical ? offset : 0),
      x2: wall.x2 + (isVertical ? offset : 0),
      y1: wall.y1 + (isHorizontal ? offset : 0),
      y2: wall.y2 + (isHorizontal ? offset : 0),
      features: [],
    };

    state.walls.push(newWall);
    state.selectedWallIndex = state.walls.length - 1;
    onSelectionChanged();
    onWallsChanged();

    return { success: true, index: state.selectedWallIndex };
  }

  return {
    undoLast,
    clearAll,
    eraseSelected,
    clearOpenings,
    offsetSelected,
  };
}
