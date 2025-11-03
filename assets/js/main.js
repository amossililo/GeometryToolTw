import { state } from './state.js';
import { createCanvasDrawing } from './canvasDrawing.js';
import { setupPointerHandlers } from './pointerHandlers.js';
import { createWallActions } from './wallActions.js';
import { computeConnectivity } from './connectivity.js';
import { createMetricsManager, computeMetricsSnapshot } from './metrics.js';
import { selectedWallHasOpenings } from './openings.js';

const canvas = document.getElementById('planCanvas');
const wallCountEl = document.getElementById('wallCount');
const totalLengthEl = document.getElementById('totalLength');
const lastWallEl = document.getElementById('lastWall');
const areaEl = document.getElementById('enclosedArea');
const eraseButton = document.getElementById('eraseButton');
const sheetsUrlInput = document.getElementById('sheetsUrl');
const sheetsStatusEl = document.getElementById('sheetsStatus');
const sendSheetsButton = document.getElementById('sendSheetsButton');
const unitLabelInput = document.getElementById('unitLabel');
const unitPerCellInput = document.getElementById('unitPerCell');
const gridSizeInput = document.getElementById('gridSize');
const undoButton = document.getElementById('undoButton');
const clearButton = document.getElementById('clearButton');
const downloadButton = document.getElementById('downloadButton');
const clearOpeningsButton = document.getElementById('clearOpeningsButton');
const commandHintEl = document.getElementById('commandHint');
const tabButtons = document.querySelectorAll('[role="tab"][data-tab]');
const tabPanels = document.querySelectorAll('.ribbon-panel');
const toolButtons = document.querySelectorAll('[data-tool]');

const drawing = createCanvasDrawing(canvas);
const metricsManager = createMetricsManager({ wallCountEl, totalLengthEl, lastWallEl, areaEl });

function updateEraseButton() {
  eraseButton.disabled = state.selectedWallIndex == null;
}

function updateClearOpeningsButton() {
  if (!clearOpeningsButton) return;
  clearOpeningsButton.disabled = !selectedWallHasOpenings();
}

let hintTimeout = null;

function showCommandHint(message, tone = 'info') {
  if (!commandHintEl) return;
  commandHintEl.textContent = message;
  commandHintEl.dataset.tone = tone;
  if (hintTimeout) {
    clearTimeout(hintTimeout);
  }
  if (message) {
    hintTimeout = setTimeout(() => {
      commandHintEl.textContent = '';
      commandHintEl.dataset.tone = 'info';
    }, 4000);
  }
}

function activateTab(tabName) {
  tabButtons.forEach((btn) => {
    const isActive = btn.dataset.tab === tabName;
    btn.classList.toggle('is-active', isActive);
    btn.setAttribute('aria-selected', String(isActive));
    btn.setAttribute('tabindex', isActive ? '0' : '-1');
  });
  tabPanels.forEach((panel) => {
    const isActive = panel.dataset.tab === tabName;
    panel.classList.toggle('is-active', isActive);
    panel.setAttribute('aria-hidden', String(!isActive));
  });
}

function setActiveTool(tool) {
  state.activeTool = tool;
  toolButtons.forEach((button) => {
    const isActive = button.dataset.tool === tool;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });

  if (tool === 'draw') {
    showCommandHint('Drag on the grid to create new walls.', 'info');
  } else if (tool === 'window') {
    showCommandHint('Click any wall to drop a window in place.', 'info');
  } else if (tool === 'door') {
    showCommandHint('Click a wall to insert a door.', 'info');
  }
}

let sheetsExporter = null;

function handleWallsChanged() {
  computeConnectivity();
  const metrics = metricsManager.updateMetrics();
  updateEraseButton();
  updateClearOpeningsButton();
  drawing.draw();

  if (sheetsExporter && typeof sheetsExporter.setLatestMetrics === 'function') {
    sheetsExporter.setLatestMetrics(metrics);
  }
}

function handleSelectionChanged() {
  updateEraseButton();
  updateClearOpeningsButton();
}

setupPointerHandlers(canvas, drawing, {
  onWallsChanged: handleWallsChanged,
  onSelectionChanged: handleSelectionChanged,
  onToolFeedback: (payload) => {
    if (!payload || !payload.message) return;
    showCommandHint(payload.message, payload.type);
  },
});

const wallActions = createWallActions({
  onWallsChanged: handleWallsChanged,
  onSelectionChanged: handleSelectionChanged,
});

function downloadPNG() {
  const link = document.createElement('a');
  link.download = 'house-plan.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
}

if (gridSizeInput) {
  gridSizeInput.addEventListener('input', (evt) => {
    const value = Number(evt.target.value);
    if (!Number.isFinite(value) || value <= 0) return;
    state.gridSize = value;
    handleWallsChanged();
  });
}

if (unitLabelInput) {
  unitLabelInput.addEventListener('input', (evt) => {
    state.unitLabel = evt.target.value.trim() || 'units';
    handleWallsChanged();
  });
}

if (unitPerCellInput) {
  unitPerCellInput.addEventListener('input', (evt) => {
    const value = Number(evt.target.value);
    if (!Number.isFinite(value) || value <= 0) return;
    state.unitPerCell = value;
    handleWallsChanged();
  });
}

if (undoButton) {
  undoButton.addEventListener('click', () => {
    wallActions.undoLast();
  });
}

if (clearButton) {
  clearButton.addEventListener('click', () => {
    wallActions.clearAll();
  });
}

if (eraseButton) {
  eraseButton.addEventListener('click', () => {
    wallActions.eraseSelected();
  });
}

if (downloadButton) {
  downloadButton.addEventListener('click', downloadPNG);
}

if (clearOpeningsButton) {
  clearOpeningsButton.addEventListener('click', () => {
    const removed = wallActions.clearOpenings();
    if (removed) {
      showCommandHint('Removed all openings from the selected wall.', 'success');
    } else {
      showCommandHint('Select a wall with windows or doors to clear them.', 'info');
    }
    updateClearOpeningsButton();
    drawing.draw();
  });
}

tabButtons.forEach((button) => {
  button.addEventListener('click', () => {
    activateTab(button.dataset.tab);
  });
});

toolButtons.forEach((button) => {
  button.addEventListener('click', () => {
    setActiveTool(button.dataset.tool);
  });
});

activateTab('home');
setActiveTool(state.activeTool || 'draw');

window.addEventListener('keydown', (evt) => {
  if (evt.key === 'Escape') {
    setActiveTool('draw');
  }
});

if (
  typeof window.setupSheetsExport === 'function' &&
  sheetsUrlInput &&
  sendSheetsButton &&
  sheetsStatusEl
) {
  sheetsExporter = window.setupSheetsExport({
    urlInput: sheetsUrlInput,
    triggerButton: sendSheetsButton,
    statusElement: sheetsStatusEl,
    getMetrics: () => {
      const metrics = state.latestMetrics ?? computeMetricsSnapshot();
      return {
        timestamp: new Date().toISOString(),
        metrics: {
          area: metrics.enclosedAreaValue,
          areaLabel: `${metrics.enclosedAreaDisplay} ${metrics.unitLabel}²`,
          areaCells: metrics.enclosedCells,
          wallCount: metrics.wallCount,
          totalWallLength: metrics.totalLengthValue,
          totalWallLengthLabel: `${metrics.totalLengthDisplay} ${metrics.unitLabel}`,
          totalWallLengthCells: metrics.totalLengthCells,
          lastWallLength: metrics.lastWallLengthValue,
          lastWallLengthLabel:
            metrics.lastWallLengthDisplay == null
              ? null
              : `${metrics.lastWallLengthDisplay} ${metrics.unitLabel}`,
          unitLabel: metrics.unitLabel,
          unitsPerSquare: metrics.unitPerCell,
          gridSpacing: metrics.gridSpacing,
        },
      };
    },
  });
}

window.addEventListener('resize', () => {
  drawing.resizeCanvas();
});

drawing.resizeCanvas();
handleWallsChanged();
