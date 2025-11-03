import { pointerSession, resetPointerSession, state } from './state.js';

export function setupPointerHandlers(canvas, drawing, callbacks) {
  const {
    onWallsChanged = () => {},
    onSelectionChanged = () => {},
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
      state.walls.push(state.preview);
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
