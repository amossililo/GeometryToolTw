import { state } from './state.js';

function isHorizontal(wall) {
  return wall && wall.y1 === wall.y2 && wall.x1 !== wall.x2;
}

function isVertical(wall) {
  return wall && wall.x1 === wall.x2 && wall.y1 !== wall.y2;
}

function normalizeWallForProcessing(wall) {
  if (!wall) return null;
  if (isHorizontal(wall)) {
    const start = Math.min(wall.x1, wall.x2);
    const end = Math.max(wall.x1, wall.x2);
    if (start === end) return null;
    return {
      orientation: 'horizontal',
      constant: wall.y1,
      start,
      end,
      length: end - start,
    };
  }
  if (isVertical(wall)) {
    const start = Math.min(wall.y1, wall.y2);
    const end = Math.max(wall.y1, wall.y2);
    if (start === end) return null;
    return {
      orientation: 'vertical',
      constant: wall.x1,
      start,
      end,
      length: end - start,
    };
  }
  return null;
}

function subtractInterval(intervals, otherStart, otherEnd) {
  if (!Array.isArray(intervals) || !intervals.length) return [];
  const result = [];

  for (const segment of intervals) {
    const { start, end } = segment;
    if (end <= otherStart || start >= otherEnd) {
      result.push(segment);
      continue;
    }

    if (otherStart > start) {
      result.push({ start, end: otherStart });
    }
    if (otherEnd < end) {
      result.push({ start: otherEnd, end });
    }
  }

  return result;
}

function buildIntervalsWithoutOverlap(candidate) {
  let intervals = [{ start: candidate.start, end: candidate.end }];

  state.walls.forEach((existing) => {
    const normalized = normalizeWallForProcessing(existing);
    if (!normalized) return;
    if (normalized.orientation !== candidate.orientation) return;
    if (normalized.constant !== candidate.constant) return;
    intervals = subtractInterval(intervals, normalized.start, normalized.end);
    if (!intervals.length) return;
  });

  return intervals.filter((segment) => segment.end - segment.start > 0);
}

function segmentsToWalls(candidate, segments) {
  const walls = [];
  segments.forEach(({ start, end }) => {
    if (end <= start) return;
    if (candidate.orientation === 'horizontal') {
      walls.push({
        x1: start,
        y1: candidate.constant,
        x2: end,
        y2: candidate.constant,
        features: [],
      });
    } else {
      walls.push({
        x1: candidate.constant,
        y1: start,
        x2: candidate.constant,
        y2: end,
        features: [],
      });
    }
  });
  return walls;
}

export function addWallToState(wall, options = {}) {
  const { onOverlapRemoved } = options;
  const candidate = normalizeWallForProcessing(wall);
  if (!candidate) {
    return { addedSegments: 0, addedCells: 0, removedCells: 0 };
  }

  const intervals = buildIntervalsWithoutOverlap(candidate);
  const insertedWalls = segmentsToWalls(candidate, intervals);

  insertedWalls.forEach((segment) => {
    state.walls.push(segment);
  });

  const addedCells = intervals.reduce((sum, segment) => sum + (segment.end - segment.start), 0);
  const removedCells = candidate.length - addedCells;

  if (removedCells > 0 && typeof onOverlapRemoved === 'function') {
    onOverlapRemoved({ removedCells });
  }

  return {
    addedSegments: insertedWalls.length,
    addedCells,
    removedCells,
  };
}

