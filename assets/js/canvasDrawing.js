import { state, colors } from './state.js';

export function createCanvasDrawing(canvas) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;

  function cellFromEvent(evt) {
    const rect = canvas.getBoundingClientRect();
    const x = evt.clientX - rect.left;
    const y = evt.clientY - rect.top;
    return {
      col: Math.round(x / state.gridSize),
      row: Math.round(y / state.gridSize),
    };
  }

  function pointFromEvent(evt) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: evt.clientX - rect.left,
      y: evt.clientY - rect.top,
    };
  }

  function wallToPixels(wall) {
    return {
      x1: wall.x1 * state.gridSize,
      y1: wall.y1 * state.gridSize,
      x2: wall.x2 * state.gridSize,
      y2: wall.y2 * state.gridSize,
    };
  }

  function findWallIndexNearPoint(point, tolerance = 10) {
    for (let i = state.walls.length - 1; i >= 0; i -= 1) {
      const px = wallToPixels(state.walls[i]);
      const minX = Math.min(px.x1, px.x2) - tolerance;
      const maxX = Math.max(px.x1, px.x2) + tolerance;
      const minY = Math.min(px.y1, px.y2) - tolerance;
      const maxY = Math.max(px.y1, px.y2) + tolerance;
      if (point.x < minX || point.x > maxX || point.y < minY || point.y > maxY) continue;

      if (px.y1 === px.y2) {
        if (Math.abs(point.y - px.y1) <= tolerance) {
          return i;
        }
      } else if (px.x1 === px.x2) {
        if (Math.abs(point.x - px.x1) <= tolerance) {
          return i;
        }
      }
    }
    return null;
  }

  function selectWallAtPoint(point) {
    const index = findWallIndexNearPoint(point);
    state.selectedWallIndex = index;
    return index !== null;
  }

  function drawMeasurement(pxWall, options = {}) {
    const { isPreview = false, color } = options;
    const dx = pxWall.x2 - pxWall.x1;
    const dy = pxWall.y2 - pxWall.y1;
    const lengthCells = Math.round((Math.abs(dx) + Math.abs(dy)) / state.gridSize);
    if (lengthCells === 0) return;
    const lengthRealRaw = lengthCells * state.unitPerCell;
    const lengthReal = Number.isInteger(lengthRealRaw)
      ? lengthRealRaw
      : Number(lengthRealRaw.toFixed(2));

    const cx = (pxWall.x1 + pxWall.x2) / 2;
    const cy = (pxWall.y1 + pxWall.y2) / 2;

    ctx.save();
    ctx.fillStyle = color || (isPreview ? colors.wallActive : colors.wallText);
    ctx.font = '600 14px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = `${lengthReal} ${state.unitLabel}`;
    ctx.fillText(label, cx, cy - 12);
    ctx.restore();
  }

  function drawOpenEndpoints() {
    if (!state.openEndpoints.length) return;
    ctx.save();
    ctx.fillStyle = colors.wallOpen;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;

    for (const point of state.openEndpoints) {
      const px = {
        x: point.x * state.gridSize,
        y: point.y * state.gridSize,
      };
      ctx.beginPath();
      ctx.arc(px.x, px.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawSuggestions() {
    if (!Array.isArray(state.suggestions) || state.suggestions.length === 0) return;

    const suggestionColor = colors.suggestion || '#22c55e';
    const rendered = new Set();

    ctx.save();
    ctx.strokeStyle = suggestionColor;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.setLineDash([10, 6]);
    ctx.globalAlpha = 0.4;

    state.suggestions.forEach((suggestion) => {
      const walls = Array.isArray(suggestion?.walls) ? suggestion.walls : [];
      walls.forEach((wall) => {
        if (!wall) return;
        const key = `${wall.x1},${wall.y1}-${wall.x2},${wall.y2}`;
        if (rendered.has(key)) return;
        rendered.add(key);
        const px = wallToPixels(wall);
        ctx.beginPath();
        ctx.moveTo(px.x1, px.y1);
        ctx.lineTo(px.x2, px.y2);
        ctx.stroke();
        drawMeasurement(px, { isPreview: true, color: suggestionColor });
      });
    });

    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawGrid() {
    const { gridSize } = state;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;

    const width = canvas.width / dpr;
    const height = canvas.height / dpr;

    ctx.beginPath();
    for (let x = 0; x <= width; x += gridSize) {
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, height);
    }
    for (let y = 0; y <= height; y += gridSize) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(width, y + 0.5);
    }
    ctx.stroke();

    ctx.strokeStyle = colors.gridBold;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    for (let x = 0; x <= width; x += gridSize * 5) {
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, height);
    }
    for (let y = 0; y <= height; y += gridSize * 5) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(width, y + 0.5);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawWalls() {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    state.walls.forEach((wall, index) => {
      const px = wallToPixels(wall);
      const isOpen = state.openWallIndexes.has(index);
      const isSelected = index === state.selectedWallIndex;

      ctx.strokeStyle = isOpen
        ? colors.wallOpen
        : isSelected
        ? colors.wallActive
        : colors.wall;
      ctx.lineWidth = isSelected ? 8 : 6;
      ctx.beginPath();
      ctx.moveTo(px.x1, px.y1);
      ctx.lineTo(px.x2, px.y2);
      ctx.stroke();

      const features = Array.isArray(wall.features) ? wall.features : [];
      if (features.length) {
        const isHorizontal = px.y1 === px.y2;
        const wallLengthPx = isHorizontal ? Math.abs(px.x2 - px.x1) : Math.abs(px.y2 - px.y1);
        const startPx = isHorizontal ? Math.min(px.x1, px.x2) : Math.min(px.y1, px.y2);
        const orientationForward = isHorizontal ? px.x2 >= px.x1 : px.y2 >= px.y1;
        const baseLineWidth = isSelected ? 3 : 2;

        features.forEach((feature) => {
          if (!feature) return;
          const featureLengthPx = Math.min((feature.lengthCells ?? 1) * state.gridSize, wallLengthPx);
          if (!(featureLengthPx > 0)) return;
          const center = startPx + wallLengthPx * (feature.position ?? 0.5);
          const segmentStart = Math.max(startPx, center - featureLengthPx / 2);
          const segmentEnd = Math.min(startPx + wallLengthPx, center + featureLengthPx / 2);
          if (segmentEnd <= segmentStart) return;

          const span = segmentEnd - segmentStart;
          const spanAbs = Math.abs(span);
          if (!(spanAbs > 0)) return;

          if (feature.type === 'door') {
            const doorReach = Math.max(Math.min(spanAbs, state.gridSize * 4), state.gridSize * 0.9);
            const hingeCoord = orientationForward ? segmentStart : segmentEnd;
            const sweepDir = orientationForward ? 1 : -1;
            const doorLeafColor = colors.doorLeaf || '#f59e0b';
            const doorSwingColor = colors.doorSwing || '#b45309';

            if (isHorizontal) {
              const hingeX = hingeCoord;
              const baseY = px.y1;

              ctx.save();
              ctx.beginPath();
              ctx.moveTo(hingeX, baseY);
              ctx.lineTo(hingeX + sweepDir * doorReach, baseY);
              ctx.lineTo(hingeX, baseY + doorReach);
              ctx.closePath();
              ctx.fillStyle = doorLeafColor;
              ctx.globalAlpha = 0.25;
              ctx.fill();
              ctx.globalAlpha = 1;
              ctx.strokeStyle = doorSwingColor;
              ctx.lineWidth = baseLineWidth;
              ctx.lineJoin = 'round';
              ctx.stroke();
              ctx.restore();

              ctx.save();
              ctx.strokeStyle = doorSwingColor;
              ctx.lineWidth = Math.max(1, baseLineWidth - 0.5);
              ctx.beginPath();
              ctx.moveTo(hingeX, baseY);
              ctx.lineTo(hingeX, baseY + doorReach);
              ctx.stroke();
              ctx.restore();
            } else {
              const hingeY = hingeCoord;
              const baseX = px.x1;

              ctx.save();
              ctx.beginPath();
              ctx.moveTo(baseX, hingeY);
              ctx.lineTo(baseX, hingeY + sweepDir * doorReach);
              ctx.lineTo(baseX + doorReach, hingeY);
              ctx.closePath();
              ctx.fillStyle = doorLeafColor;
              ctx.globalAlpha = 0.25;
              ctx.fill();
              ctx.globalAlpha = 1;
              ctx.strokeStyle = doorSwingColor;
              ctx.lineWidth = baseLineWidth;
              ctx.lineJoin = 'round';
              ctx.stroke();
              ctx.restore();

              ctx.save();
              ctx.strokeStyle = doorSwingColor;
              ctx.lineWidth = Math.max(1, baseLineWidth - 0.5);
              ctx.beginPath();
              ctx.moveTo(baseX, hingeY);
              ctx.lineTo(baseX + doorReach, hingeY);
              ctx.stroke();
              ctx.restore();
            }
          } else {
            const windowLength = Math.max(spanAbs, state.gridSize * 1.2);
            const windowThickness = Math.max(
              state.gridSize * 0.6,
              Math.min(windowLength * 0.6, state.gridSize * 2.2)
            );
            const windowStroke = colors.windowStroke || '#0284c7';
            const windowFill = colors.windowFill || 'rgba(14,165,233,0.35)';
            const windowCrossbar = colors.windowCrossbar || windowStroke;

            if (isHorizontal) {
              const iconCenter = (segmentStart + segmentEnd) / 2;
              const left = iconCenter - windowLength / 2;
              const top = px.y1 - windowThickness / 2;

              ctx.save();
              ctx.fillStyle = windowFill;
              ctx.strokeStyle = windowStroke;
              ctx.lineWidth = baseLineWidth;
              ctx.lineJoin = 'round';
              ctx.beginPath();
              ctx.rect(left, top, windowLength, windowThickness);
              ctx.fill();
              ctx.stroke();

              ctx.strokeStyle = windowCrossbar;
              ctx.lineWidth = Math.max(1, baseLineWidth - 0.5);
              ctx.beginPath();
              ctx.moveTo(left, px.y1);
              ctx.lineTo(left + windowLength, px.y1);
              ctx.stroke();

              ctx.beginPath();
              ctx.moveTo(iconCenter, top);
              ctx.lineTo(iconCenter, top + windowThickness);
              ctx.stroke();
              ctx.restore();
            } else {
              const iconCenter = (segmentStart + segmentEnd) / 2;
              const left = px.x1 - windowThickness / 2;
              const top = iconCenter - windowLength / 2;

              ctx.save();
              ctx.fillStyle = windowFill;
              ctx.strokeStyle = windowStroke;
              ctx.lineWidth = baseLineWidth;
              ctx.lineJoin = 'round';
              ctx.beginPath();
              ctx.rect(left, top, windowThickness, windowLength);
              ctx.fill();
              ctx.stroke();

              ctx.strokeStyle = windowCrossbar;
              ctx.lineWidth = Math.max(1, baseLineWidth - 0.5);
              ctx.beginPath();
              ctx.moveTo(px.x1, top);
              ctx.lineTo(px.x1, top + windowLength);
              ctx.stroke();

              ctx.beginPath();
              ctx.moveTo(left, iconCenter);
              ctx.lineTo(left + windowThickness, iconCenter);
              ctx.stroke();
              ctx.restore();
            }
          }
        });
      }

      const measurementColor = isOpen ? colors.wallOpen : isSelected ? colors.wallActive : undefined;
      drawMeasurement(px, { color: measurementColor });
    });

    drawSuggestions();

    if (state.preview) {
      const px = wallToPixels(state.preview);
      ctx.save();
      ctx.strokeStyle = colors.wallActive;
      ctx.lineWidth = 6;
      ctx.setLineDash([12, 8]);
      ctx.beginPath();
      ctx.moveTo(px.x1, px.y1);
      ctx.lineTo(px.x2, px.y2);
      ctx.stroke();
      ctx.setLineDash([]);
      drawMeasurement(px, { isPreview: true });
      ctx.restore();
    }

    ctx.restore();
    drawOpenEndpoints();
  }

  function draw() {
    drawGrid();
    drawWalls();
  }

  function resizeCanvas() {
    const wrapper = canvas.parentElement;
    const rect = wrapper.getBoundingClientRect();

    let displayWidth = rect.width;
    if (!displayWidth || displayWidth < 1) {
      displayWidth = wrapper.clientWidth || canvas.clientWidth || window.innerWidth || 800;
    }

    let displayHeight = rect.height;
    if (!displayHeight || displayHeight < 1) {
      displayHeight = wrapper.clientHeight;

      if (!displayHeight || displayHeight < 1) {
        const mainEl = wrapper.closest('main');
        if (mainEl) {
          const mainRect = mainEl.getBoundingClientRect();
          if (mainRect.height) {
            const topBar = mainEl.querySelector('.top-bar');
            const footer = mainEl.querySelector('.footer');
            let available = mainRect.height;
            if (topBar) available -= topBar.getBoundingClientRect().height;
            if (footer) available -= footer.getBoundingClientRect().height;
            if (available > 0) displayHeight = available;
          }
        }
      }

      if (!displayHeight || displayHeight < 1) {
        displayHeight = Math.max(window.innerHeight - 200, 320);
      }

      wrapper.style.minHeight = `${Math.max(displayHeight, 320)}px`;
    }

    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  return {
    ctx,
    draw,
    resizeCanvas,
    cellFromEvent,
    pointFromEvent,
    wallToPixels,
    findWallIndexNearPoint,
    selectWallAtPoint,
  };
}
