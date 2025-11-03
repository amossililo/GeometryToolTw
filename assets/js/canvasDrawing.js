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
        features.forEach((feature) => {
          if (!feature) return;
          const featureLengthPx = Math.min((feature.lengthCells ?? 1) * state.gridSize, wallLengthPx);
          if (!(featureLengthPx > 0)) return;
          const center = startPx + wallLengthPx * (feature.position ?? 0.5);
          const segmentStart = Math.max(startPx, center - featureLengthPx / 2);
          const segmentEnd = Math.min(startPx + wallLengthPx, center + featureLengthPx / 2);
          if (segmentEnd <= segmentStart) return;

          ctx.save();
          ctx.strokeStyle = feature.type === 'door' ? colors.door : colors.window;
          ctx.lineWidth = isSelected ? 8 : 6;
          ctx.lineCap = 'round';
          ctx.beginPath();
          if (isHorizontal) {
            ctx.moveTo(segmentStart, px.y1);
            ctx.lineTo(segmentEnd, px.y1);
          } else {
            ctx.moveTo(px.x1, segmentStart);
            ctx.lineTo(px.x1, segmentEnd);
          }
          ctx.stroke();
          ctx.restore();
        });
      }

      const measurementColor = isOpen ? colors.wallOpen : isSelected ? colors.wallActive : undefined;
      drawMeasurement(px, { color: measurementColor });
    });

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
