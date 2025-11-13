import { state } from './state.js';

function isHorizontal(wall) {
  return wall && wall.y1 === wall.y2 && wall.x1 !== wall.x2;
}

function isVertical(wall) {
  return wall && wall.x1 === wall.x2 && wall.y1 !== wall.y2;
}

function intersectionPoint(a, b) {
  if (!a || !b) return null;
  const aHorizontal = isHorizontal(a);
  const aVertical = isVertical(a);
  const bHorizontal = isHorizontal(b);
  const bVertical = isVertical(b);

  if (aHorizontal && bVertical) {
    const y = a.y1;
    const x = b.x1;
    const aMinX = Math.min(a.x1, a.x2);
    const aMaxX = Math.max(a.x1, a.x2);
    const bMinY = Math.min(b.y1, b.y2);
    const bMaxY = Math.max(b.y1, b.y2);
    if (x >= aMinX && x <= aMaxX && y >= bMinY && y <= bMaxY) {
      return { x, y };
    }
  } else if (aVertical && bHorizontal) {
    const point = intersectionPoint(b, a);
    return point ? { x: point.x, y: point.y } : null;
  }
  return null;
}

function trimWallTowardsPoint(wall, point, threshold) {
  if (!wall || !point) return false;
  const horizontal = isHorizontal(wall);
  const vertical = isVertical(wall);
  if (!horizontal && !vertical) return false;

  let changed = false;

  if (horizontal && point.y === wall.y1) {
    const distStart = Math.abs(point.x - wall.x1);
    const distEnd = Math.abs(point.x - wall.x2);
    if (distStart > 0 && distStart <= threshold && distStart <= distEnd) {
      wall.x1 = point.x;
      changed = true;
    }
    if (distEnd > 0 && distEnd <= threshold && distEnd < distStart) {
      wall.x2 = point.x;
      changed = true;
    }
    if (!changed && distEnd > 0 && distEnd <= threshold && distStart > threshold) {
      wall.x2 = point.x;
      changed = true;
    } else if (!changed && distStart > 0 && distStart <= threshold && distEnd > threshold) {
      wall.x1 = point.x;
      changed = true;
    }
  } else if (vertical && point.x === wall.x1) {
    const distStart = Math.abs(point.y - wall.y1);
    const distEnd = Math.abs(point.y - wall.y2);
    if (distStart > 0 && distStart <= threshold && distStart <= distEnd) {
      wall.y1 = point.y;
      changed = true;
    }
    if (distEnd > 0 && distEnd <= threshold && distEnd < distStart) {
      wall.y2 = point.y;
      changed = true;
    }
    if (!changed && distEnd > 0 && distEnd <= threshold && distStart > threshold) {
      wall.y2 = point.y;
      changed = true;
    } else if (!changed && distStart > 0 && distStart <= threshold && distEnd > threshold) {
      wall.y1 = point.y;
      changed = true;
    }
  }

  return changed;
}

function wallLengthCells(wall) {
  if (!wall) return 0;
  return Math.abs(wall.x2 - wall.x1) + Math.abs(wall.y2 - wall.y1);
}

export function trimWallExtensions(threshold = 2) {
  let trims = 0;
  const removeIndexes = new Set();

  for (let i = 0; i < state.walls.length; i += 1) {
    const wallA = state.walls[i];
    if (!wallA) continue;

    for (let j = i + 1; j < state.walls.length; j += 1) {
      const wallB = state.walls[j];
      if (!wallB) continue;

      const point = intersectionPoint(wallA, wallB);
      if (!point) continue;

      const trimmedA = trimWallTowardsPoint(wallA, point, threshold);
      const trimmedB = trimWallTowardsPoint(wallB, point, threshold);

      if (trimmedA) trims += 1;
      if (trimmedB) trims += 1;
    }
  }

  state.walls.forEach((wall, index) => {
    if (!wall) return;
    if (wallLengthCells(wall) === 0) {
      removeIndexes.add(index);
    }
  });

  if (removeIndexes.size) {
    state.walls = state.walls.filter((_, index) => !removeIndexes.has(index));
    if (state.selectedWallIndex != null && removeIndexes.has(state.selectedWallIndex)) {
      state.selectedWallIndex = null;
    }
  }

  return { trims, removed: removeIndexes.size };
}
