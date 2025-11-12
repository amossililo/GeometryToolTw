import { state } from './state.js';
import { createCanvasDrawing } from './canvasDrawing.js';
import { setupPointerHandlers } from './pointerHandlers.js';
import { createWallActions } from './wallActions.js';
import { computeConnectivity } from './connectivity.js';
import { createMetricsManager, computeMetricsSnapshot } from './metrics.js';
import { selectedWallHasOpenings, getOpeningPreset, setOpeningPreset } from './openings.js';

const DEFAULT_SHEETS_WEB_APP_URL =
  'https://script.google.com/macros/s/AKfycbxXBv-LEIhYb0KbWuhRYRu_6wl3_mk6hqcdA5Y_uXXiXP3gnFvbDuzA8MBIWTPxLSvE/exec';
const DEFAULT_BOQ_EXPORT_URL = `${DEFAULT_SHEETS_WEB_APP_URL}?action=export&type=pdf`;

const canvas = document.getElementById('planCanvas');
const wallCountEl = document.getElementById('wallCount');
const totalLengthEl = document.getElementById('totalLength');
const lastWallEl = document.getElementById('lastWall');
const areaEl = document.getElementById('enclosedArea');
const windowCountEl = document.getElementById('windowCount');
const doorCountEl = document.getElementById('doorCount');

const setupToggle = document.getElementById('setupToggle');
const setupPanel = document.getElementById('setupPanel');
const setupCloseButton = document.getElementById('setupClose');

const drawToolButton = document.getElementById('drawToolButton');
const moveToolButton = document.getElementById('moveToolButton');
const windowToolButton = document.getElementById('windowToolButton');
const doorToolButton = document.getElementById('doorToolButton');

const undoButton = document.getElementById('undoButton');
const clearButton = document.getElementById('clearButton');
const eraseButton = document.getElementById('eraseButton');
const downloadButton = document.getElementById('downloadButton');
const clearOpeningsButton = document.getElementById('clearOpeningsButton');
const generateBoqButton = document.getElementById('generateBoqButton');
const offsetWallButton = document.getElementById('offsetWallButton');

const sheetsUrlInput = document.getElementById('sheetsUrl');
const sheetsStatusEl = document.getElementById('sheetsStatus');
const sendSheetsButton = document.getElementById('sendSheetsButton');

const unitLabelInput = document.getElementById('unitLabel');
const unitPerCellInput = document.getElementById('unitPerCell');
const gridSizeInput = document.getElementById('gridSize');

const commandHintEl = document.getElementById('commandHint');

const snapToggleButton = document.getElementById('snapToggleButton');
const instructionsToggle = document.getElementById('instructionsToggle');
const instructionsCard = document.querySelector('.instructions-card');
const instructionsContent = document.getElementById('instructionsContent');

let instructionsCollapsedForMobile = true;
const mobileInstructionsMedia =
  typeof window.matchMedia === 'function' ? window.matchMedia('(max-width: 720px)') : null;

const openingPrompt = document.getElementById('openingPrompt');
const openingForm = document.getElementById('openingForm');
const openingCancelButton = document.getElementById('openingCancel');
const openingWidthInput = document.getElementById('openingWidth');
const openingHeightInput = document.getElementById('openingHeight');
const openingPromptTitle = document.getElementById('openingPromptTitle');
const openingPromptDescription = document.getElementById('openingPromptDescription');

const boqPrompt = document.getElementById('boqPrompt');
const boqPromptDescription = document.getElementById('boqPromptDescription');
const boqDownloadButton = document.getElementById('boqDownloadButton');
const boqCloseButton = document.getElementById('boqCloseButton');
const boqResponsePreview = document.getElementById('boqResponsePreview');
const boqProgressSteps = boqPrompt
  ? {
      send: boqPrompt.querySelector('[data-progress-step="send"]'),
      review: boqPrompt.querySelector('[data-progress-step="review"]'),
      compile: boqPrompt.querySelector('[data-progress-step="compile"]'),
    }
  : {};

const toolButtons = [drawToolButton, moveToolButton, windowToolButton, doorToolButton].filter(Boolean);

const drawing = createCanvasDrawing(canvas);
const metricsManager = createMetricsManager({
  wallCountEl,
  totalLengthEl,
  lastWallEl,
  areaEl,
  windowCountEl,
  doorCountEl,
});

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
let lastDownloadUrl = DEFAULT_BOQ_EXPORT_URL;
let boqPollTimeout = null;

updateSnapToggleButton();
applyInstructionsLayout();

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

function updateOffsetButton() {
  if (!offsetWallButton) return;
  offsetWallButton.disabled = state.selectedWallIndex == null;
}

function updateToolStates(activeTool) {
  toolButtons.forEach((button) => {
    if (!button || !button.dataset.tool) return;
    const isActive = button.dataset.tool === activeTool;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });
}

function updateSnapToggleButton() {
  if (!snapToggleButton) return;
  snapToggleButton.classList.toggle('is-active', state.snapToWalls);
  snapToggleButton.setAttribute('aria-pressed', String(state.snapToWalls));
  snapToggleButton.textContent = state.snapToWalls ? 'Wall snapping: On' : 'Wall snapping: Off';
}

function setInstructionsCollapsed(collapsed, options = {}) {
  if (!instructionsCard || !instructionsContent || !instructionsToggle) return;
  const { skipStore = false } = options;
  instructionsCard.dataset.collapsed = collapsed ? 'true' : 'false';
  if (collapsed) {
    instructionsContent.setAttribute('hidden', '');
  } else {
    instructionsContent.removeAttribute('hidden');
  }
  instructionsToggle.setAttribute('aria-expanded', String(!collapsed));
  instructionsToggle.textContent = collapsed ? 'Show help' : 'Hide help';
  if (!skipStore) {
    instructionsCollapsedForMobile = collapsed;
  }
}

function applyInstructionsLayout() {
  if (!instructionsCard || !instructionsContent || !instructionsToggle) return;
  if (!mobileInstructionsMedia) {
    instructionsToggle.hidden = true;
    setInstructionsCollapsed(false, { skipStore: true });
    return;
  }
  if (mobileInstructionsMedia.matches) {
    instructionsToggle.hidden = false;
    setInstructionsCollapsed(instructionsCollapsedForMobile, { skipStore: true });
  } else {
    instructionsToggle.hidden = true;
    setInstructionsCollapsed(false, { skipStore: true });
  }
}

function setActiveTool(tool) {
  state.activeTool = tool;
  updateToolStates(tool);

  if (tool === 'draw') {
    showCommandHint('Drag on the grid to create new walls.', 'info');
    return;
  }

  if (tool === 'move') {
    showCommandHint('Click a wall, then drag to reposition it. Use Draw walls to sketch new segments.', 'info');
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

function closeSetupPanel(options = {}) {
  const { focusToggle = false } = options;
  if (!setupPanel || setupPanel.hasAttribute('hidden')) return;
  setupPanel.setAttribute('hidden', '');
  if (setupToggle) {
    setupToggle.setAttribute('aria-expanded', 'false');
    if (focusToggle && typeof setupToggle.focus === 'function') {
      setupToggle.focus();
    }
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

function updateBoqProgress(stepKey, state) {
  if (!boqProgressSteps || !stepKey) return;
  const step = boqProgressSteps[stepKey];
  if (!step) return;
  step.dataset.state = state;
  const icon = step.querySelector('.progress-step__icon');
  if (!icon) return;
  if (state === 'complete') {
    icon.textContent = '✓';
  } else if (state === 'pending') {
    icon.textContent = '…';
  } else if (state === 'error') {
    icon.textContent = '!';
  } else {
    icon.textContent = '';
  }
}

function resetBoqProgress() {
  lastDownloadUrl = DEFAULT_BOQ_EXPORT_URL;
  if (boqPollTimeout) {
    clearTimeout(boqPollTimeout);
    boqPollTimeout = null;
  }
  updateBoqProgress('send', 'pending');
  updateBoqProgress('review', 'idle');
  updateBoqProgress('compile', 'idle');
  if (boqPromptDescription) {
    boqPromptDescription.textContent =
      "We're sharing your plan with our engineers. Sit tight—we'll fetch the BOQ status as soon as it's ready.";
  }
  if (boqDownloadButton) {
    boqDownloadButton.disabled = true;
    boqDownloadButton.setAttribute('hidden', '');
    boqDownloadButton.textContent = 'Open BOQ link';
  }
  if (boqResponsePreview) {
    boqResponsePreview.textContent = '';
    boqResponsePreview.setAttribute('hidden', '');
  }
}

function openBoqPrompt({ resetProgress = false } = {}) {
  if (!boqPrompt) return;
  if (resetProgress) {
    resetBoqProgress();
  }
  lastFocusedBeforeBoq = document.activeElement;
  boqPrompt.removeAttribute('hidden');
  const focusTarget =
    boqDownloadButton && !boqDownloadButton.hasAttribute('hidden') ? boqDownloadButton : boqCloseButton || boqDownloadButton;
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

function normalizeDownloadUrl(downloadUrl) {
  if (!downloadUrl) return '';
  try {
    const parsed = new URL(downloadUrl, window.location.href);
    if (parsed.hostname.includes('drive.google.com')) {
      const idFromPath = parsed.pathname.match(/\/d\/([^/]+)/);
      const idFromParams = parsed.searchParams.get('id');
      const fileId = idFromPath ? idFromPath[1] : idFromParams;
      if (fileId) {
        return `https://drive.google.com/file/d/${fileId}/view`;
      }
    }
    return parsed.toString();
  } catch (error) {
    console.warn('Failed to normalise download URL:', error);
    return downloadUrl;
  }
}

function buildBoqExportUrl(sourceUrl) {
  try {
    const parsed = new URL(sourceUrl || DEFAULT_SHEETS_WEB_APP_URL, window.location.href);
    parsed.searchParams.set('action', 'export');
    parsed.searchParams.set('type', 'pdf');
    return parsed.toString();
  } catch (error) {
    console.warn('Failed to build BOQ export URL from source:', error);
    return DEFAULT_BOQ_EXPORT_URL;
  }
}

function handleWallsChanged() {
  computeConnectivity();
  const metrics = metricsManager.updateMetrics();
  updateEraseButton();
  updateClearOpeningsButton();
  updateOffsetButton();
  drawing.draw();

  if (sheetsExporter && typeof sheetsExporter.setLatestMetrics === 'function') {
    sheetsExporter.setLatestMetrics(metrics);
  }
}

function handleSelectionChanged() {
  updateEraseButton();
  updateClearOpeningsButton();
  updateOffsetButton();
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

if (setupCloseButton) {
  setupCloseButton.addEventListener('click', () => {
    closeSetupPanel({ focusToggle: true });
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

if (snapToggleButton) {
  snapToggleButton.addEventListener('click', () => {
    state.snapToWalls = !state.snapToWalls;
    updateSnapToggleButton();
    showCommandHint(
      state.snapToWalls
        ? 'Wall snapping enabled. Dragged walls will attach to nearby ends.'
        : 'Wall snapping disabled. Walls will move freely.',
      'info'
    );
  });
}

if (instructionsToggle) {
  instructionsToggle.addEventListener('click', () => {
    const isCollapsed = instructionsCard?.dataset.collapsed === 'true';
    setInstructionsCollapsed(!isCollapsed);
  });
}

if (typeof mobileInstructionsMedia?.addEventListener === 'function') {
  mobileInstructionsMedia.addEventListener('change', applyInstructionsLayout);
} else if (typeof mobileInstructionsMedia?.addListener === 'function') {
  mobileInstructionsMedia.addListener(applyInstructionsLayout);
}

if (drawToolButton) {
  drawToolButton.addEventListener('click', () => {
    closeOpeningPrompt({ focusTrigger: false });
    setActiveTool('draw');
  });
}

if (moveToolButton) {
  moveToolButton.addEventListener('click', () => {
    closeOpeningPrompt({ focusTrigger: false });
    setActiveTool('move');
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
    const targetUrl = lastDownloadUrl || DEFAULT_BOQ_EXPORT_URL;
    if (!targetUrl) {
      showCommandHint('No BOQ link is available yet. Please wait a moment and try again.', 'error');
      return;
    }

    try {
      const openedWindow = window.open(targetUrl, '_blank', 'noopener');
      if (openedWindow) {
        openedWindow.opener = null;
        updateBoqProgress('compile', 'complete');
        if (boqPromptDescription) {
          boqPromptDescription.textContent =
            'We opened the BOQ link in a new tab. If you need it again, use the button below or copy the response.';
        }
        showCommandHint('Opened the BOQ link in a new tab.', 'success');
      } else {
        throw new Error('Popup blocked or window was not created.');
      }
    } catch (downloadError) {
      updateBoqProgress('compile', 'error');
      if (boqPromptDescription) {
        boqPromptDescription.textContent =
          'We could not open the BOQ link automatically. Copy the link from the response preview or adjust your popup settings.';
      }
      const message = downloadError && downloadError.message ? downloadError.message : 'Unknown error.';
      showCommandHint(`We couldn’t open the BOQ link automatically: ${message}`, 'error');
    }
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
    updateOffsetButton();
    drawing.draw();
  });
}

if (offsetWallButton) {
  offsetWallButton.addEventListener('click', () => {
    const selectedIndex = state.selectedWallIndex;
    if (selectedIndex == null) {
      showCommandHint('Select a wall before using Offset wall.', 'info');
      return;
    }

    const wall = state.walls[selectedIndex];
    if (!wall) {
      showCommandHint('The selected wall could not be found. Try selecting it again.', 'error');
      updateOffsetButton();
      return;
    }

    const unitLabel = state.unitLabel || 'units';
    const unitPerCell = Number.isFinite(state.unitPerCell) && state.unitPerCell > 0 ? state.unitPerCell : 1;
    const defaultDistance = unitPerCell;
    const response = window.prompt(
      `How far should we offset the wall? Enter a distance in ${unitLabel} (multiples of ${formatNumber(
        unitPerCell
      )} ${unitLabel}). Use negative values to offset in the opposite direction.`,
      formatNumber(defaultDistance)
    );

    if (response == null) {
      return;
    }

    const offsetUnits = Number(response);
    if (!Number.isFinite(offsetUnits) || offsetUnits === 0) {
      showCommandHint('Enter a non-zero number for the offset distance.', 'error');
      return;
    }

    const offsetCellsRaw = offsetUnits / unitPerCell;
    if (!Number.isFinite(offsetCellsRaw)) {
      showCommandHint('Enter a valid number for the offset distance.', 'error');
      return;
    }

    const offsetCells = Math.round(offsetCellsRaw);
    if (offsetCells === 0) {
      showCommandHint('The offset must be at least half a grid square.', 'error');
      return;
    }

    const snapped = Math.abs(offsetCellsRaw - offsetCells) > 1e-6;
    const result = wallActions.offsetSelected(offsetCells);

    if (result.success) {
      const distanceUnits = Math.abs(offsetCells) * unitPerCell;
      const distanceLabel = formatNumber(distanceUnits);
      const message = snapped
        ? `Offset wall created ${distanceLabel} ${unitLabel} away (snapped to the nearest grid line).`
        : `Offset wall created ${distanceLabel} ${unitLabel} away.`;
      showCommandHint(message, 'success');
      updateOffsetButton();
      drawing.draw();
    } else {
      const message =
        result.reason === 'no-selection'
          ? 'Select a wall before using Offset wall.'
          : result.reason === 'invalid-offset'
          ? 'Enter a non-zero number for the offset distance.'
          : result.reason === 'unsupported-orientation'
          ? 'Only straight horizontal or vertical walls can be offset.'
          : 'We could not create the offset wall. Try again.';
      showCommandHint(message, 'error');
    }
  });
}

if (generateBoqButton) {
  generateBoqButton.addEventListener('click', () => {
    if (!sheetsExporter) {
      showCommandHint('The engineer handoff is still warming up. Try again in a moment.', 'error');
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
      openBoqPrompt({ resetProgress: true });
    },
    onAfterSend: () => {
      if (generateBoqButton) {
        generateBoqButton.disabled = false;
        generateBoqButton.removeAttribute('aria-busy');
      }
    },
    onSuccess: ({ responseJson, url }) => {
      openBoqPrompt();
      updateBoqProgress('send', 'complete');
      updateBoqProgress('review', 'pending');
      if (boqPromptDescription) {
        boqPromptDescription.textContent = 'Our engineers are reviewing your structure.';
      }

      const normalisedUrl = normalizeDownloadUrl(responseJson?.downloadUrl);
      lastDownloadUrl = normalisedUrl || DEFAULT_BOQ_EXPORT_URL;
      const exportUrl = buildBoqExportUrl(url);

      if (boqPollTimeout) {
        clearTimeout(boqPollTimeout);
        boqPollTimeout = null;
      }

      updateBoqProgress('review', 'complete');
      updateBoqProgress('compile', 'pending');
      if (boqPromptDescription) {
        boqPromptDescription.textContent =
          'Engineers are compiling your BOQ. We will check back for the download link in about 3 seconds.';
      }

      if (boqDownloadButton) {
        boqDownloadButton.disabled = false;
        boqDownloadButton.removeAttribute('hidden');
        boqDownloadButton.textContent = 'Open BOQ link';
      }

      if (boqResponsePreview) {
        boqResponsePreview.textContent = '';
        boqResponsePreview.setAttribute('hidden', '');
      }

      showCommandHint('Waiting 3 seconds before checking the BOQ export response…', 'info');

      boqPollTimeout = window.setTimeout(async () => {
        boqPollTimeout = null;
        try {
          const pollResponse = await fetch(exportUrl, {
            method: 'GET',
            headers: { Accept: 'application/json' },
          });
          const pollText = await pollResponse.text();
          let displayText = pollText || '(empty response)';
          let parsedPayload = null;
          if (pollText) {
            try {
              parsedPayload = JSON.parse(pollText);
              displayText = JSON.stringify(parsedPayload, null, 2);
            } catch (parseError) {
              // Non-JSON payloads will be shown as raw text.
            }
          }

          if (parsedPayload && parsedPayload.downloadUrl) {
            const fetchedUrl = normalizeDownloadUrl(parsedPayload.downloadUrl);
            if (fetchedUrl) {
              lastDownloadUrl = fetchedUrl;
            }
          }

          if (boqResponsePreview) {
            boqResponsePreview.textContent = displayText;
            boqResponsePreview.removeAttribute('hidden');
          }

          if (pollResponse.ok) {
            updateBoqProgress('compile', 'complete');
            if (boqPromptDescription) {
              boqPromptDescription.textContent =
                'Engineers compiled the BOQ. Review the response below and open the link when you are ready.';
            }
            showCommandHint('BOQ response received. Use the link button to open it when ready.', 'success');
          } else {
            updateBoqProgress('compile', 'error');
            if (boqPromptDescription) {
              boqPromptDescription.textContent =
                'We received a response, but it indicated an error. Review the details below.';
            }
            showCommandHint('The BOQ export returned an error response. Review the details shown.', 'error');
          }
        } catch (pollError) {
          updateBoqProgress('compile', 'error');
          const errorMessage = pollError && pollError.message ? pollError.message : 'Unknown polling error.';
          if (boqResponsePreview) {
            boqResponsePreview.textContent = `Polling failed: ${errorMessage}`;
            boqResponsePreview.removeAttribute('hidden');
          }
          if (boqPromptDescription) {
            boqPromptDescription.textContent =
              'We could not fetch the BOQ response automatically. Use the link button to try manually.';
          }
          showCommandHint('We could not fetch the BOQ response automatically. Try the link button.', 'error');
        }
      }, 3000);
    },
    onError: (error) => {
      openBoqPrompt();
      updateBoqProgress('send', 'error');
      updateBoqProgress('review', 'idle');
      updateBoqProgress('compile', 'idle');
      if (boqPollTimeout) {
        clearTimeout(boqPollTimeout);
        boqPollTimeout = null;
      }
      if (boqPromptDescription) {
        boqPromptDescription.textContent =
          'We couldn’t reach our engineers. Please check the handoff link and try again.';
      }
      if (boqDownloadButton) {
        boqDownloadButton.disabled = true;
        boqDownloadButton.setAttribute('hidden', '');
      }
      if (boqResponsePreview) {
        boqResponsePreview.textContent = '';
        boqResponsePreview.setAttribute('hidden', '');
      }
      const message = error && error.message ? error.message : 'Unknown error.';
      showCommandHint(`We couldn’t reach our engineers: ${message}`, 'error');
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
          doorCount: metrics.doorCount,
          windowCount: metrics.windowCount,
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
