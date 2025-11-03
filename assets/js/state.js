export const state = {
  gridSize: 30,
  walls: [],
  isDrawing: false,
  preview: null,
  unitLabel: 'm',
  unitPerCell: 1,
  selectedWallIndex: null,
  openWallIndexes: new Set(),
  openEndpoints: [],
  latestMetrics: null,
};

export const pointerSession = {
  active: false,
  pointerId: null,
  startCell: null,
  moved: false,
};

export const colors = {
  grid: '#d1d5db',
  gridBold: '#9ca3af',
  wall: '#111827',
  wallActive: '#2563eb',
  wallOpen: '#dc2626',
  wallText: 'rgba(17,24,39,0.85)',
};

export function resetPointerSession() {
  pointerSession.active = false;
  pointerSession.pointerId = null;
  pointerSession.startCell = null;
  pointerSession.moved = false;
  state.isDrawing = false;
  state.preview = null;
}
