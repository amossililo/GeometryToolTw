import { pointerSession, resetPointerSession, state } from './state.js';
import { addOpeningToWall } from './openings.js';

export function setupPointerHandlers(canvas, drawing, callbacks) {
  const {
    onWallsChanged = () => {},
    onSelectionChanged = () => {},
    onToolFeedback = () => {},
  } = callbacks;

  function releasePointer(id) {
    if (
      typeof canvas.hasPointerCapture === 'function' &&
      id != null &&
      canvas.hasPointerCapture(id)
    ) {
      canvas.releasePointerCapture(id);
    }
  }

  function handlePointerDown(evt) {
    evt.preventDefault();

    if (state.activeTool !== 'draw') {
      const point = drawing.pointFromEvent(evt);
      const wallIndex = drawing.findWallIndexNearPoint(point);

      if (wallIndex == null) {
        onToolFeedback({ type: 'info', message: 'Click directly on a wall to place an opening.' });
        return;
      }

      const preset = state.openingPresets ? state.openingPresets[state.activeTool] : null;
      if (!preset || !Number.isFinite(preset.width) || !Number.isFinite(preset.height)) {
        onToolFeedback({ type: 'error', message: 'Set valid dimensions before placing that opening.' });
        return;
      }

      const wall = state.walls[wallIndex];
      const px = drawing.wallToPixels(wall);
      const isHorizontal = px.y1 === px.y2;
      const wallLengthPx = isHorizontal ? Math.abs(px.x2 - px.x1) : Math.abs(px.y2 - px.y1);

      if (!wallLengthPx) {
        onToolFeedback({ type: 'error', message: 'That wall segment is too small for an opening.' });
        return;
      }

      const startPx = isHorizontal ? Math.min(px.x1, px.x2) : Math.min(px.y1, px.y2);
      const pointerCoord = isHorizontal ? point.x : point.y;
      const position = (pointerCoord - startPx) / wallLengthPx;
      const result = addOpeningToWall(wallIndex, {
        type: state.activeTool,
        position,
        width: preset.width,
        height: preset.height,
      });

      state.selectedWallIndex = wallIndex;
      onSelectionChanged();

      if (result.success) {
        onWallsChanged();
        drawing.draw();
        onToolFeedback({
          type: 'success',
          message: state.activeTool === 'door' ? 'Door added to the selected wall.' : 'Window added to the selected wall.',
        });
      } else {
        const message =
          result.reason === 'too-short'
            ? 'This wall is too short for that opening. Try a longer wall.'
            : result.reason === 'missing-dimensions'
            ? 'Opening dimensions are missing. Re-open the tool to set them.'
            : 'Select a wall before placing an opening.';
        onToolFeedback({ type: 'error', message });
      }

      return;
    }

    if (pointerSession.active) return;
    const cell = drawing.cellFromEvent(evt);
    pointerSession.active = true;
    pointerSession.pointerId = evt.pointerId;
    pointerSession.startCell = cell;
    pointerSession.moved = false;
    state.isDrawing = false;
    state.preview = null;

    if (typeof canvas.setPointerCapture === 'function') {
      canvas.setPointerCapture(evt.pointerId);
    }
  }

  function handlePointerMove(evt) {
    if (!pointerSession.active || evt.pointerId !== pointerSession.pointerId) return;
    evt.preventDefault();
    const currentCell = drawing.cellFromEvent(evt);
    const dx = currentCell.col - pointerSession.startCell.col;
    const dy = currentCell.row - pointerSession.startCell.row;

    if (!state.isDrawing) {
      if (dx === 0 && dy === 0) {
        drawing.draw();
        return;
      }
      state.isDrawing = true;
    }

    pointerSession.moved = true;

    const endCell = { ...pointerSession.startCell };
    if (Math.abs(dx) >= Math.abs(dy)) {
      endCell.col += dx;
    } else {
      endCell.row += dy;
    }

    if (endCell.col === pointerSession.startCell.col && endCell.row === pointerSession.startCell.row) {
      state.preview = null;
    } else {
      state.preview = {
        x1: pointerSession.startCell.col,
        y1: pointerSession.startCell.row,
        x2: endCell.col,
        y2: endCell.row,
      };
    }

    drawing.draw();
  }

  function handlePointerUp(evt) {
    if (!pointerSession.active || evt.pointerId !== pointerSession.pointerId) return;
    evt.preventDefault();

    if (state.isDrawing && state.preview) {
      state.walls.push({ ...state.preview, features: [] });
      state.preview = null;
      state.selectedWallIndex = null;
      onWallsChanged();
    } else if (!state.isDrawing && !pointerSession.moved) {
      const point = drawing.pointFromEvent(evt);
      drawing.selectWallAtPoint(point);
      onSelectionChanged();
      drawing.draw();
    } else if (state.isDrawing && !state.preview) {
      drawing.draw();
    }

    releasePointer(evt.pointerId);
    resetPointerSession();
  }

  function handlePointerCancel(evt) {
    if (!pointerSession.active || (evt.pointerId != null && evt.pointerId !== pointerSession.pointerId)) {
      return;
    }

    if (state.isDrawing) {
      state.preview = null;
      drawing.draw();
    }

    if (evt.pointerId != null) {
      releasePointer(evt.pointerId);
    } else if (pointerSession.pointerId != null) {
      releasePointer(pointerSession.pointerId);
    }

    resetPointerSession();
  }

  canvas.addEventListener('pointerdown', handlePointerDown);
  canvas.addEventListener('pointermove', handlePointerMove);
  canvas.addEventListener('pointerup', handlePointerUp);
  canvas.addEventListener('pointercancel', handlePointerCancel);
  canvas.addEventListener('pointerleave', handlePointerCancel);

  return () => {
    canvas.removeEventListener('pointerdown', handlePointerDown);
    canvas.removeEventListener('pointermove', handlePointerMove);
    canvas.removeEventListener('pointerup', handlePointerUp);
    canvas.removeEventListener('pointercancel', handlePointerCancel);
    canvas.removeEventListener('pointerleave', handlePointerCancel);
  };
}
