import { state } from './state.js';
import { createCanvasDrawing } from './canvasDrawing.js';
import { setupPointerHandlers } from './pointerHandlers.js';
import { createWallActions } from './wallActions.js';
import { computeConnectivity } from './connectivity.js';
import { createMetricsManager, computeMetricsSnapshot } from './metrics.js';

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

const drawing = createCanvasDrawing(canvas);
const metricsManager = createMetricsManager({ wallCountEl, totalLengthEl, lastWallEl, areaEl });

function updateEraseButton() {
  eraseButton.disabled = state.selectedWallIndex == null;
}

let sheetsExporter = null;

function handleWallsChanged() {
  computeConnectivity();
  const metrics = metricsManager.updateMetrics();
  updateEraseButton();
  drawing.draw();

  if (sheetsExporter && typeof sheetsExporter.setLatestMetrics === 'function') {
    sheetsExporter.setLatestMetrics(metrics);
  }
}

function handleSelectionChanged() {
  updateEraseButton();
}

setupPointerHandlers(canvas, drawing, {
  onWallsChanged: handleWallsChanged,
  onSelectionChanged: handleSelectionChanged,
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
