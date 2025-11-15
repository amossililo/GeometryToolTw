export const state = {
  gridSize: 13,
  walls: [],
  isDrawing: false,
  preview: null,
  unitLabel: 'm',
  unitPerCell: 0.5,
  selectedWallIndex: null,
  openWallIndexes: new Set(),
  openEndpoints: [],
  latestMetrics: null,
  activeTool: 'draw',
  suggestions: [],
  openingPresets: {
    window: { width: 1.5, height: 1.2 },
    door: { width: 0.9, height: 2 },
  },
  snapToWalls: true,
};

export const pointerSession = {
  active: false,
  pointerId: null,
  startCell: null,
  moved: false,
  mode: null,
  wallIndex: null,
  initialWall: null,
  startPoint: null,
  undoSnapshot: null,
  undoCaptured: false,
};

export const colors = {
  grid: '#d1d5db',
  gridBold: '#9ca3af',
  wall: '#111827',
  wallActive: '#2563eb',
  wallOpen: '#dc2626',
  wallText: 'rgba(17,24,39,0.85)',
  suggestion: '#dc2626',
  windowStroke: '#0284c7',
  windowFill: 'rgba(14,165,233,0.35)',
  windowCrossbar: '#0ea5e9',
  doorLeaf: '#f59e0b',
  doorSwing: '#b45309',
};

export function resetPointerSession() {
  pointerSession.active = false;
  pointerSession.pointerId = null;
  pointerSession.startCell = null;
  pointerSession.moved = false;
  pointerSession.mode = null;
  pointerSession.wallIndex = null;
  pointerSession.initialWall = null;
  pointerSession.startPoint = null;
  pointerSession.undoSnapshot = null;
  pointerSession.undoCaptured = false;
  state.isDrawing = false;
  state.preview = null;
}
