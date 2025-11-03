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

  return {
    undoLast,
    clearAll,
    eraseSelected,
  };
}
