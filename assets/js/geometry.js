import { state } from './state.js';

export function isPointOnWall(point, wall) {
  const { x, y } = point;
  if (wall.x1 === wall.x2 && wall.y1 === wall.y2) {
    return wall.x1 === x && wall.y1 === y;
  }
  if (wall.y1 === wall.y2) {
    if (y !== wall.y1) return false;
    const minX = Math.min(wall.x1, wall.x2);
    const maxX = Math.max(wall.x1, wall.x2);
    return x >= minX && x <= maxX;
  }
  if (wall.x1 === wall.x2) {
    if (x !== wall.x1) return false;
    const minY = Math.min(wall.y1, wall.y2);
    const maxY = Math.max(wall.y1, wall.y2);
    return y >= minY && y <= maxY;
  }
  return false;
}

export function computeEnclosedAreaCells() {
  if (state.walls.length === 0) {
    return 0;
  }

  const xs = state.walls.flatMap((wall) => [wall.x1, wall.x2]);
  const ys = state.walls.flatMap((wall) => [wall.y1, wall.y2]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const padding = 2;
  const minXExpanded = minX - padding;
  const maxXExpanded = maxX + padding;
  const minYExpanded = minY - padding;
  const maxYExpanded = maxY + padding;

  const horizontalSegments = new Set();
  const verticalSegments = new Set();

  state.walls.forEach((wall) => {
    if (wall.y1 === wall.y2) {
      const y = wall.y1;
      const start = Math.min(wall.x1, wall.x2);
      const end = Math.max(wall.x1, wall.x2);
      for (let x = start; x < end; x += 1) {
        horizontalSegments.add(`${x},${y}`);
      }
    } else if (wall.x1 === wall.x2) {
      const x = wall.x1;
      const start = Math.min(wall.y1, wall.y2);
      const end = Math.max(wall.y1, wall.y2);
      for (let y = start; y < end; y += 1) {
        verticalSegments.add(`${x},${y}`);
      }
    }
  });

  const width = maxXExpanded - minXExpanded;
  const height = maxYExpanded - minYExpanded;
  const visited = Array.from({ length: height }, () => Array(width).fill(false));
  const queue = [];

  const enqueue = (cx, cy) => {
    const ix = cx - minXExpanded;
    const iy = cy - minYExpanded;
    if (ix < 0 || ix >= width || iy < 0 || iy >= height) return;
    if (visited[iy][ix]) return;
    visited[iy][ix] = true;
    queue.push({ cx, cy });
  };

  enqueue(minXExpanded, minYExpanded);

  for (let i = 0; i < queue.length; i += 1) {
    const { cx, cy } = queue[i];

    if (!verticalSegments.has(`${cx + 1},${cy}`)) enqueue(cx + 1, cy);
    if (!verticalSegments.has(`${cx},${cy}`)) enqueue(cx - 1, cy);
    if (!horizontalSegments.has(`${cx},${cy + 1}`)) enqueue(cx, cy + 1);
    if (!horizontalSegments.has(`${cx},${cy}`)) enqueue(cx, cy - 1);
  }

  let enclosedCells = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!visited[y][x]) enclosedCells += 1;
    }
  }

  return enclosedCells;
}
