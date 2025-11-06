import { state } from './state.js';
import { createCanvasDrawing } from './canvasDrawing.js';
import { setupPointerHandlers } from './pointerHandlers.js';
import { createWallActions } from './wallActions.js';
import { computeConnectivity } from './connectivity.js';
import { createMetricsManager, computeMetricsSnapshot } from './metrics.js';
import { selectedWallHasOpenings, getOpeningPreset, setOpeningPreset } from './openings.js';

const DEFAULT_SHEETS_WEB_APP_URL =
  'https://script.google.com/macros/s/AKfycbysgPsNY_xsYgQJnxN0QuIvRRHKHMZfdRcx4T8rLqVMmcgMc-zEIJoe-QU71cN5HR4/exec';

const canvas = document.getElementById('planCanvas');
const wallCountEl = document.getElementById('wallCount');
const totalLengthEl = document.getElementById('totalLength');
const lastWallEl = document.getElementById('lastWall');
const areaEl = document.getElementById('enclosedArea');

const setupToggle = document.getElementById('setupToggle');
const setupPanel = document.getElementById('setupPanel');

const drawToolButton = document.getElementById('drawToolButton');
const windowToolButton = document.getElementById('windowToolButton');
const doorToolButton = document.getElementById('doorToolButton');

const undoButton = document.getElementById('undoButton');
const clearButton = document.getElementById('clearButton');
const eraseButton = document.getElementById('eraseButton');
const downloadButton = document.getElementById('downloadButton');
const clearOpeningsButton = document.getElementById('clearOpeningsButton');
const generateBoqButton = document.getElementById('generateBoqButton');

const sheetsUrlInput = document.getElementById('sheetsUrl');
const sheetsStatusEl = document.getElementById('sheetsStatus');
const sendSheetsButton = document.getElementById('sendSheetsButton');

const unitLabelInput = document.getElementById('unitLabel');
const unitPerCellInput = document.getElementById('unitPerCell');
const gridSizeInput = document.getElementById('gridSize');

const commandHintEl = document.getElementById('commandHint');

const openingPrompt = document.getElementById('openingPrompt');
const openingForm = document.getElementById('openingForm');
const openingCancelButton = document.getElementById('openingCancel');
const openingWidthInput = document.getElementById('openingWidth');
const openingHeightInput = document.getElementById('openingHeight');
const openingPromptTitle = document.getElementById('openingPromptTitle');
const openingPromptDescription = document.getElementById('openingPromptDescription');

const boqPrompt = document.getElementById('boqPrompt');
const boqDownloadButton = document.getElementById('boqDownloadButton');
const boqCloseButton = document.getElementById('boqCloseButton');

const toolButtons = [drawToolButton, windowToolButton, doorToolButton].filter(Boolean);

const drawing = createCanvasDrawing(canvas);
const metricsManager = createMetricsManager({ wallCountEl, totalLengthEl, lastWallEl, areaEl });

if (gridSizeInput) {
  gridSizeInput.value = state.gridSize;
}
if (unitLabelInput) {
  unitLabelInput.value = state.unitLabel;
}
if (unitPerCellInput) {
  unitPerCellInput.value = state.unitPerCell;
}
if (sheetsUrlInput && !sheetsUrlInput.value) {
  sheetsUrlInput.value = DEFAULT_SHEETS_WEB_APP_URL;
}

let sheetsExporter = null;
let hintTimeout = null;
let pendingOpeningType = null;
let lastOpeningTrigger = null;
let lastFocusedBeforeBoq = null;

function formatNumber(value) {
  if (!Number.isFinite(value)) return '';
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toString();
}

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

function updateEraseButton() {
  if (!eraseButton) return;
  eraseButton.disabled = state.selectedWallIndex == null;
}

function updateClearOpeningsButton() {
  if (!clearOpeningsButton) return;
  clearOpeningsButton.disabled = !selectedWallHasOpenings();
}

function updateToolStates(activeTool) {
  toolButtons.forEach((button) => {
    if (!button || !button.dataset.tool) return;
    const isActive = button.dataset.tool === activeTool;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });
}

function setActiveTool(tool) {
  state.activeTool = tool;
  updateToolStates(tool);

  if (tool === 'draw') {
    showCommandHint('Drag on the grid to create new walls.', 'info');
    return;
  }

  const preset = getOpeningPreset(tool);
  const unitLabel = state.unitLabel || 'units';
  if (!preset) {
    showCommandHint('Set dimensions for that opening before placing it.', 'error');
    return;
  }

  const sizeMessage = `${formatNumber(preset.width)} × ${formatNumber(preset.height)} ${unitLabel}`;
  if (tool === 'window') {
    showCommandHint(`Window tool ready (${sizeMessage}). Click a wall to place it.`, 'info');
  } else if (tool === 'door') {
    showCommandHint(`Door tool ready (${sizeMessage}). Click a wall to place it.`, 'info');
  }
}

function toggleSetupPanel(forceState) {
  if (!setupPanel || !setupToggle) return;
  const isOpen = forceState != null ? forceState : setupPanel.hasAttribute('hidden');
  if (isOpen) {
    setupPanel.removeAttribute('hidden');
  } else {
    setupPanel.setAttribute('hidden', '');
  }
  setupToggle.setAttribute('aria-expanded', String(isOpen));
}

function closeSetupPanel() {
  if (!setupPanel || setupPanel.hasAttribute('hidden')) return;
  setupPanel.setAttribute('hidden', '');
  if (setupToggle) {
    setupToggle.setAttribute('aria-expanded', 'false');
  }
}

function openOpeningPrompt(type, triggerButton) {
  if (!openingPrompt || !openingForm || !openingWidthInput || !openingHeightInput) return;
  closeSetupPanel();
  pendingOpeningType = type;
  lastOpeningTrigger = triggerButton || null;

  const preset = getOpeningPreset(type) || { width: 1, height: 1 };
  openingPrompt.dataset.tool = type;
  openingPromptTitle.textContent = type === 'door' ? 'Door dimensions' : 'Window dimensions';
  const unitLabel = state.unitLabel || 'units';
  openingPromptDescription.textContent = `Enter the ${type} width and height in ${unitLabel}. The last values you used are pre-filled.`;
  const widthValue = Number.isFinite(preset.width) && preset.width > 0 ? preset.width : 1;
  const heightValue = Number.isFinite(preset.height) && preset.height > 0 ? preset.height : 1;
  openingWidthInput.value = String(widthValue);
  openingHeightInput.value = String(heightValue);
  openingPrompt.removeAttribute('hidden');
  openingWidthInput.focus();
}

function closeOpeningPrompt({ focusTrigger = true } = {}) {
  if (!openingPrompt) return;
  openingPrompt.setAttribute('hidden', '');
  pendingOpeningType = null;
  if (focusTrigger && lastOpeningTrigger && typeof lastOpeningTrigger.focus === 'function') {
    lastOpeningTrigger.focus();
  }
  lastOpeningTrigger = null;
}

function openBoqPrompt() {
  if (!boqPrompt) return;
  lastFocusedBeforeBoq = document.activeElement;
  boqPrompt.removeAttribute('hidden');
  const focusTarget = boqDownloadButton || boqCloseButton;
  focusTarget?.focus?.();
}

function closeBoqPrompt({ restoreFocus = true } = {}) {
  if (!boqPrompt) return;
  boqPrompt.setAttribute('hidden', '');
  if (restoreFocus && lastFocusedBeforeBoq && typeof lastFocusedBeforeBoq.focus === 'function') {
    lastFocusedBeforeBoq.focus();
  }
  lastFocusedBeforeBoq = null;
}

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
  if (!canvas) return;
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

if (setupToggle) {
  setupToggle.addEventListener('click', () => {
    const willOpen = setupPanel && setupPanel.hasAttribute('hidden');
    toggleSetupPanel(willOpen);
    if (willOpen && setupPanel) {
      setupPanel.focus?.();
    }
  });
}

document.addEventListener('click', (evt) => {
  if (!setupPanel || setupPanel.hasAttribute('hidden')) return;
  const target = evt.target;
  if (setupPanel.contains(target) || setupToggle === target || setupToggle?.contains(target)) {
    return;
  }
  closeSetupPanel();
});

if (drawToolButton) {
  drawToolButton.addEventListener('click', () => {
    closeOpeningPrompt({ focusTrigger: false });
    setActiveTool('draw');
  });
}

if (windowToolButton) {
  windowToolButton.addEventListener('click', () => {
    openOpeningPrompt('window', windowToolButton);
  });
}

if (doorToolButton) {
  doorToolButton.addEventListener('click', () => {
    openOpeningPrompt('door', doorToolButton);
  });
}

if (openingCancelButton) {
  openingCancelButton.addEventListener('click', () => {
    closeOpeningPrompt();
    setActiveTool('draw');
  });
}

if (openingPrompt) {
  openingPrompt.addEventListener('click', (evt) => {
    if (evt.target === openingPrompt) {
      closeOpeningPrompt();
      setActiveTool('draw');
    }
  });
}

if (boqPrompt) {
  boqPrompt.addEventListener('click', (evt) => {
    if (evt.target === boqPrompt) {
      closeBoqPrompt();
    }
  });
}

if (boqCloseButton) {
  boqCloseButton.addEventListener('click', () => {
    closeBoqPrompt();
  });
}

if (boqDownloadButton) {
  boqDownloadButton.addEventListener('click', () => {
    const downloadUrl = `${DEFAULT_SHEETS_WEB_APP_URL}?action=export&type=pdf`;
    const downloadWindow = window.open(downloadUrl, '_blank', 'noopener');
    if (downloadWindow) {
      downloadWindow.opener = null;
    }
    closeBoqPrompt({ restoreFocus: false });
    showCommandHint('BOQ download opened in a new tab.', 'success');
  });
}

if (openingForm) {
  openingForm.addEventListener('submit', (evt) => {
    evt.preventDefault();
    if (!pendingOpeningType) return;
    const toolType = pendingOpeningType;
    const width = Number(openingWidthInput?.value);
    const height = Number(openingHeightInput?.value);
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
      showCommandHint('Enter positive values for width and height.', 'error');
      return;
    }

    const saved = setOpeningPreset(toolType, { width, height });
    if (!saved) {
      showCommandHint('Enter positive values for width and height.', 'error');
      return;
    }

    closeOpeningPrompt({ focusTrigger: false });
    setActiveTool(toolType);
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
    setActiveTool('draw');
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

if (generateBoqButton) {
  generateBoqButton.addEventListener('click', () => {
    if (!sheetsExporter) {
      showCommandHint('Google Sheets export is still initialising. Try again in a moment.', 'error');
      return;
    }
    closeSetupPanel();
    const metrics = metricsManager.updateMetrics();
    sheetsExporter.setLatestMetrics?.(metrics);
    sheetsExporter.send();
  });
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
    defaultUrl: DEFAULT_SHEETS_WEB_APP_URL,
    onBeforeSend: () => {
      if (generateBoqButton) {
        generateBoqButton.disabled = true;
        generateBoqButton.setAttribute('aria-busy', 'true');
      }
    },
    onAfterSend: () => {
      if (generateBoqButton) {
        generateBoqButton.disabled = false;
        generateBoqButton.removeAttribute('aria-busy');
      }
    },
    onSuccess: () => {
      showCommandHint('Metrics sent to Google Sheets. Ready to download BOQ.', 'success');
      closeSetupPanel();
      openBoqPrompt();
    },
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
          doorArea: metrics.doorArea,
          doorAreaLabel:
            metrics.doorArea > 0
              ? `${formatNumber(metrics.doorArea)} ${metrics.unitLabel}²`
              : null,
          windowArea: metrics.windowArea,
          windowAreaLabel:
            metrics.windowArea > 0
              ? `${formatNumber(metrics.windowArea)} ${metrics.unitLabel}²`
              : null,
        },
      };
    },
  });
}

window.addEventListener('keydown', (evt) => {
  if (evt.key === 'Escape') {
    let closedBoq = false;
    if (boqPrompt && !boqPrompt.hasAttribute('hidden')) {
      closeBoqPrompt();
      closedBoq = true;
    }
    if (openingPrompt && !openingPrompt.hasAttribute('hidden')) {
      closeOpeningPrompt();
    }
    if (setupPanel && !setupPanel.hasAttribute('hidden')) {
      closeSetupPanel();
    }
    if (!closedBoq) {
      setActiveTool('draw');
    }
  }
});

window.addEventListener('resize', () => {
  drawing.resizeCanvas();
});

drawing.resizeCanvas();
handleWallsChanged();
setActiveTool(state.activeTool || 'draw');
