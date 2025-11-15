import { pointerSession, resetPointerSession, state } from './state.js';
import { addOpeningToWall } from './openings.js';
import { addWallToState } from './wallUtils.js';
import { trimWallAtCell } from './trimming.js';
import { pushUndoSnapshot, discardUndoSnapshot } from './history.js';

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

  function cloneWall(wall) {
    if (!wall) return null;
    const features = Array.isArray(wall.features)
      ? wall.features.map((feature) => ({ ...feature }))
      : [];
    return { ...wall, features };
  }

  function snapWallToNeighbors(wall, wallIndex) {
    if (!state.snapToWalls || !wall) return wall;

    const endpoints = [];
    state.walls.forEach((candidate, index) => {
      if (!candidate || index === wallIndex) return;
      endpoints.push({ x: candidate.x1, y: candidate.y1 });
      endpoints.push({ x: candidate.x2, y: candidate.y2 });
    });

    if (!endpoints.length) return wall;

    const isHorizontal = wall.y1 === wall.y2;
    const isVertical = wall.x1 === wall.x2;
    if (!isHorizontal && !isVertical) return wall;

    const threshold = 0.75;

    const findSnap = (target, axis, axisValue) => {
      let best = null;
      let bestDist = Infinity;
      for (const endpoint of endpoints) {
        if (axis === 'y' && Math.abs(endpoint.y - axisValue) > threshold) continue;
        if (axis === 'x' && Math.abs(endpoint.x - axisValue) > threshold) continue;
        const dist = Math.hypot(endpoint.x - target.x, endpoint.y - target.y);
        if (dist < bestDist) {
          bestDist = dist;
          best = endpoint;
        }
      }
      if (!best || bestDist > threshold) return null;
      return best;
    };

    const result = {
      ...wall,
      features: Array.isArray(wall.features)
        ? wall.features.map((feature) => ({ ...feature }))
        : [],
    };

    if (isHorizontal) {
      let axisValue = wall.y1;
      const startSnap = findSnap({ x: wall.x1, y: wall.y1 }, 'y', axisValue);
      if (startSnap) {
        result.x1 = Math.round(startSnap.x);
        axisValue = Math.round(startSnap.y);
      }

      const endSnap = findSnap({ x: wall.x2, y: wall.y2 }, 'y', axisValue);
      if (endSnap) {
        result.x2 = Math.round(endSnap.x);
        axisValue = Math.round(endSnap.y);
      }

      result.y1 = axisValue;
      result.y2 = axisValue;
    } else if (isVertical) {
      let axisValue = wall.x1;
      const startSnap = findSnap({ x: wall.x1, y: wall.y1 }, 'x', axisValue);
      if (startSnap) {
        result.y1 = Math.round(startSnap.y);
        axisValue = Math.round(startSnap.x);
      }

      const endSnap = findSnap({ x: wall.x2, y: wall.y2 }, 'x', axisValue);
      if (endSnap) {
        result.y2 = Math.round(endSnap.y);
        axisValue = Math.round(endSnap.x);
      }

      result.x1 = axisValue;
      result.x2 = axisValue;
    }

    return result;
  }

  function revertWallDrag() {
    if (pointerSession.mode !== 'drag-wall' || pointerSession.wallIndex == null) return;
    const original = pointerSession.initialWall;
    if (!original) return;
    state.walls[pointerSession.wallIndex] = cloneWall(original);
    drawing.draw();
    if (pointerSession.undoCaptured && pointerSession.undoSnapshot) {
      discardUndoSnapshot(pointerSession.undoSnapshot);
      pointerSession.undoSnapshot = null;
      pointerSession.undoCaptured = false;
    }
    pointerSession.moved = false;
  }

  function handlePointerDown(evt) {
    evt.preventDefault();

    const tool = state.activeTool || 'draw';

    if (tool === 'window' || tool === 'door') {
      const point = drawing.pointFromEvent(evt);
      const wallIndex = drawing.findWallIndexNearPoint(point);

      if (wallIndex == null) {
        onToolFeedback({ type: 'info', message: 'Click directly on a wall to place an opening.' });
        return;
      }

      const preset = state.openingPresets ? state.openingPresets[tool] : null;
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
        type: tool,
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
          message: tool === 'door' ? 'Door added to the selected wall.' : 'Window added to the selected wall.',
        });
      } else {
        const message =
          result.reason === 'too-short'
            ? 'This wall is too short for that opening. Try a longer wall.'
            : result.reason === 'missing-dimensions'
            ? 'Opening dimensions are missing. Re-open the tool to set them.'
            : result.reason === 'overlap'
            ? 'That placement overlaps another opening. Choose a different spot.'
            : 'Select a wall before placing an opening.';
        onToolFeedback({ type: 'error', message });
      }

      return;
    }

    if (tool === 'move') {
      if (pointerSession.active) return;

      const point = drawing.pointFromEvent(evt);
      const wallIndex = drawing.findWallIndexNearPoint(point, 12);

      if (wallIndex == null) {
        if (state.selectedWallIndex != null) {
          state.selectedWallIndex = null;
          onSelectionChanged();
          drawing.draw();
        }
        onToolFeedback({ type: 'info', message: 'Click a wall to select it before dragging.' });
        return;
      }

      state.selectedWallIndex = wallIndex;
      onSelectionChanged();
      drawing.draw();

      pointerSession.active = true;
      pointerSession.pointerId = evt.pointerId;
      pointerSession.mode = 'drag-wall';
      pointerSession.wallIndex = wallIndex;
      pointerSession.initialWall = cloneWall(state.walls[wallIndex]);
      pointerSession.startPoint = point;
      pointerSession.startCell = null;
      pointerSession.moved = false;
      pointerSession.undoSnapshot = null;
      pointerSession.undoCaptured = false;

      if (typeof canvas.setPointerCapture === 'function') {
        canvas.setPointerCapture(evt.pointerId);
      }

      onToolFeedback({ type: 'info', message: 'Drag to reposition the selected wall.' });
      return;
    }

    if (tool === 'trim') {
      const point = drawing.pointFromEvent(evt);
      const wallIndex = drawing.findWallIndexNearPoint(point, 12);

      if (wallIndex == null) {
        onToolFeedback({ type: 'info', message: 'Click directly on a wall segment to trim it.' });
        return;
      }

      const gridPoint = {
        x: Math.round(point.x / state.gridSize),
        y: Math.round(point.y / state.gridSize),
      };

      const result = trimWallAtCell(wallIndex, gridPoint);

      if (!result?.trimmed) {
        const reason = result?.reason;
        let message;
        let tone = 'info';
        if (reason === 'edge') {
          message = 'Click between corners on the wall to remove a span.';
        } else if (reason === 'intersection') {
          message = 'Pick a point between intersections to trim that wall.';
        } else if (reason === 'no-span') {
          message = 'That point cannot be trimmed—choose a section between corners.';
        } else if (reason === 'unsupported-wall') {
          message = 'Only straight horizontal or vertical walls can be trimmed.';
          tone = 'error';
        } else if (reason === 'invalid-point') {
          message = 'We could not determine where to trim. Try clicking the wall again.';
          tone = 'error';
        } else {
          message = 'Select a wall segment and click inside it to trim.';
        }
        onToolFeedback({ type: tone, message });
        return;
      }

      onWallsChanged();
      onSelectionChanged();

      const trimmedCells = Math.max(Math.round(Math.abs(result.removedCells || 0)), 0);
      const parts = [];
      if (result.resultingSegments === 0) {
        parts.push('Removed the entire wall segment.');
      } else if (trimmedCells > 0) {
        parts.push(
          `Removed ${trimmedCells} grid ${trimmedCells === 1 ? 'cell' : 'cells'} from that wall.`
        );
      } else {
        parts.push('Removed that wall span.');
      }

      if (result.removedFeatures > 0) {
        parts.push(
          `${result.removedFeatures} opening${result.removedFeatures === 1 ? '' : 's'} were deleted.`
        );
      }

      onToolFeedback({ type: 'success', message: parts.join(' ') });
      return;
    }

    if (pointerSession.active) return;

    const point = drawing.pointFromEvent(evt);
    const wallIndex = drawing.findWallIndexNearPoint(point, 12);

    const cell = drawing.cellFromEvent(evt);

    if (wallIndex != null) {
      const wall = state.walls[wallIndex];
      if (wall) {
        const pointerCol = Math.round(point.x / state.gridSize);
        const pointerRow = Math.round(point.y / state.gridSize);

        if (wall.y1 === wall.y2) {
          cell.row = wall.y1;
          const minCol = Math.min(wall.x1, wall.x2);
          const maxCol = Math.max(wall.x1, wall.x2);
          const clampedCol = Math.min(Math.max(pointerCol, minCol), maxCol);
          cell.col = clampedCol;
        } else if (wall.x1 === wall.x2) {
          cell.col = wall.x1;
          const minRow = Math.min(wall.y1, wall.y2);
          const maxRow = Math.max(wall.y1, wall.y2);
          const clampedRow = Math.min(Math.max(pointerRow, minRow), maxRow);
          cell.row = clampedRow;
        }
      }
    }

    pointerSession.active = true;
    pointerSession.pointerId = evt.pointerId;
    pointerSession.startCell = cell;
    pointerSession.mode = 'new-wall';
    pointerSession.startPoint = null;
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
    if (pointerSession.mode === 'drag-wall') {
      if (!pointerSession.initialWall || pointerSession.wallIndex == null) return;
      const point = drawing.pointFromEvent(evt);
      const startPoint = pointerSession.startPoint || point;
      const dxPx = point.x - startPoint.x;
      const dyPx = point.y - startPoint.y;
      const dxCells = Math.round(dxPx / state.gridSize);
      const dyCells = Math.round(dyPx / state.gridSize);

      if (dxCells === 0 && dyCells === 0) {
        if (pointerSession.moved) {
          revertWallDrag();
        }
        return;
      }

      pointerSession.moved = true;
      if (!pointerSession.undoCaptured) {
        pointerSession.undoSnapshot = pushUndoSnapshot();
        pointerSession.undoCaptured = true;
      }
      const initial = pointerSession.initialWall;
      const wall = cloneWall(initial);
      if (!wall) return;

      if (initial.y1 === initial.y2) {
        wall.x1 = initial.x1 + dxCells;
        wall.x2 = initial.x2 + dxCells;
        const newY = initial.y1 + dyCells;
        wall.y1 = newY;
        wall.y2 = newY;
      } else if (initial.x1 === initial.x2) {
        const newX = initial.x1 + dxCells;
        wall.x1 = newX;
        wall.x2 = newX;
        wall.y1 = initial.y1 + dyCells;
        wall.y2 = initial.y2 + dyCells;
      } else {
        wall.x1 = initial.x1 + dxCells;
        wall.x2 = initial.x2 + dxCells;
        wall.y1 = initial.y1 + dyCells;
        wall.y2 = initial.y2 + dyCells;
      }

      const snapped = snapWallToNeighbors(wall, pointerSession.wallIndex);
      state.walls[pointerSession.wallIndex] = snapped;
      drawing.draw();
      return;
    }
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

    if (pointerSession.mode === 'drag-wall') {
      if (!pointerSession.moved) {
        drawing.selectWallAtPoint(drawing.pointFromEvent(evt));
        onSelectionChanged();
        drawing.draw();
      } else {
        onWallsChanged();
      }
    } else if (pointerSession.mode === 'new-wall') {
      if (state.isDrawing && state.preview) {
        const checkpoint = pushUndoSnapshot();
        const result = addWallToState(state.preview, {
          onOverlapRemoved: () => {
            onToolFeedback({
              type: 'info',
              message: 'Overlapping wall detected – existing segment kept.',
            });
          },
        });
        state.preview = null;
        state.selectedWallIndex = null;
        if (result.addedSegments > 0) {
          onWallsChanged();
        } else {
          discardUndoSnapshot(checkpoint);
          drawing.draw();
        }
      } else if (!state.isDrawing && !pointerSession.moved) {
        const point = drawing.pointFromEvent(evt);
        drawing.selectWallAtPoint(point);
        onSelectionChanged();
        drawing.draw();
      } else if (state.isDrawing && !state.preview) {
        drawing.draw();
      }
    }

    releasePointer(evt.pointerId);
    resetPointerSession();
  }

  function handlePointerCancel(evt) {
    if (!pointerSession.active || (evt.pointerId != null && evt.pointerId !== pointerSession.pointerId)) {
      return;
    }

    if (pointerSession.mode === 'drag-wall') {
      revertWallDrag();
    } else if (state.isDrawing) {
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
