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
  activeTool: 'draw',
  openingPresets: {
    window: { width: 1.5, height: 1.2 },
    door: { width: 0.9, height: 2 },
  },
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
  window: '#0ea5e9',
  door: '#b45309',
};

export function resetPointerSession() {
  pointerSession.active = false;
  pointerSession.pointerId = null;
  pointerSession.startCell = null;
  pointerSession.moved = false;
  state.isDrawing = false;
  state.preview = null;
}
