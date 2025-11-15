import { state } from './state.js';
import { addWallToState } from './wallUtils.js';

function isHorizontal(wall) {
  return wall && wall.y1 === wall.y2 && wall.x1 !== wall.x2;
}

function isVertical(wall) {
  return wall && wall.x1 === wall.x2 && wall.y1 !== wall.y2;
}

function normalizeWall(wall) {
  if (!wall) return null;
  const result = { x1: wall.x1, y1: wall.y1, x2: wall.x2, y2: wall.y2 };
  if (result.x1 === result.x2) {
    if (result.y1 > result.y2) {
      [result.y1, result.y2] = [result.y2, result.y1];
    }
  } else if (result.y1 === result.y2) {
    if (result.x1 > result.x2) {
      [result.x1, result.x2] = [result.x2, result.x1];
    }
  }
  return result;
}

function wallKey(wall) {
  const normalized = normalizeWall(wall);
  if (!normalized) return '';
  return `${normalized.x1},${normalized.y1}-${normalized.x2},${normalized.y2}`;
}

function createAxisInterval(wall) {
  if (!wall) return null;
  if (isHorizontal(wall)) {
    return {
      orientation: 'horizontal',
      constant: wall.y1,
      start: Math.min(wall.x1, wall.x2),
      end: Math.max(wall.x1, wall.x2),
    };
  }
  if (isVertical(wall)) {
    return {
      orientation: 'vertical',
      constant: wall.x1,
      start: Math.min(wall.y1, wall.y2),
      end: Math.max(wall.y1, wall.y2),
    };
  }
  return null;
}

function mergeIntervals(intervals) {
  if (!Array.isArray(intervals) || intervals.length === 0) return [];
  const sorted = intervals
    .map((segment) => ({ start: segment.start, end: segment.end }))
    .filter((segment) => Number.isFinite(segment.start) && Number.isFinite(segment.end))
    .sort((a, b) => a.start - b.start);

  if (!sorted.length) return [];

  const merged = [sorted[0]];

  for (let i = 1; i < sorted.length; i += 1) {
    const current = sorted[i];
    const last = merged[merged.length - 1];
    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push({ start: current.start, end: current.end });
    }
  }

  return merged;
}

function buildExistingWallIndex() {
  const set = new Set();
  const coverage = {
    horizontal: new Map(),
    vertical: new Map(),
  };

  state.walls.forEach((wall) => {
    const key = wallKey(wall);
    if (key) {
      set.add(key);
    }

    const interval = createAxisInterval(wall);
    if (!interval) return;

    const map = interval.orientation === 'horizontal' ? coverage.horizontal : coverage.vertical;
    if (!map.has(interval.constant)) {
      map.set(interval.constant, []);
    }
    map.get(interval.constant).push({ start: interval.start, end: interval.end });
  });

  coverage.horizontal.forEach((intervals, key) => {
    coverage.horizontal.set(key, mergeIntervals(intervals));
  });
  coverage.vertical.forEach((intervals, key) => {
    coverage.vertical.set(key, mergeIntervals(intervals));
  });

  return { set, coverage };
}

function isWallCovered(wall, coverage) {
  if (!coverage) return false;
  const interval = createAxisInterval(wall);
  if (!interval) return false;

  const map = interval.orientation === 'horizontal' ? coverage.horizontal : coverage.vertical;
  if (!map) return false;
  const segments = map.get(interval.constant);
  if (!Array.isArray(segments) || segments.length === 0) return false;

  let cursor = interval.start;
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i];
    if (segment.end <= cursor) {
      continue;
    }
    if (segment.start > cursor) {
      return false;
    }
    if (segment.end >= interval.end) {
      return true;
    }
    cursor = segment.end;
  }

  return false;
}

function computeCornerSuggestions(existingSet, coverage) {
  const endpointMap = new Map();

  state.walls.forEach((wall, wallIndex) => {
    if (!wall) return;
    const endpoints = [
      { x: wall.x1, y: wall.y1, index: 0 },
      { x: wall.x2, y: wall.y2, index: 1 },
    ];
    endpoints.forEach((point) => {
      const key = `${point.x},${point.y}`;
      if (!endpointMap.has(key)) {
        endpointMap.set(key, []);
      }
      endpointMap.get(key).push({ ...point, wall, wallIndex });
    });
  });

  const suggestions = [];
  const seenKeys = new Set();

  endpointMap.forEach((entries, key) => {
    if (!entries || entries.length < 2) return;
    const horizontals = entries.filter((entry) => isHorizontal(entry.wall));
    const verticals = entries.filter((entry) => isVertical(entry.wall));

    horizontals.forEach((horizontal) => {
      verticals.forEach((vertical) => {
        const width = Math.abs(horizontal.wall.x2 - horizontal.wall.x1);
        const height = Math.abs(vertical.wall.y2 - vertical.wall.y1);
        if (!(width > 0 && height > 0)) return;

        const corner = { x: horizontal.x, y: horizontal.y };
        const horizontalOther =
          horizontal.index === 0
            ? { x: horizontal.wall.x2, y: horizontal.wall.y2 }
            : { x: horizontal.wall.x1, y: horizontal.wall.y1 };
        const verticalOther =
          vertical.index === 0
            ? { x: vertical.wall.x2, y: vertical.wall.y2 }
            : { x: vertical.wall.x1, y: vertical.wall.y1 };

        const verticalCompletion = {
          x1: horizontalOther.x,
          y1: corner.y,
          x2: horizontalOther.x,
          y2: verticalOther.y,
        };
        const horizontalCompletion = {
          x1: corner.x,
          y1: verticalOther.y,
          x2: horizontalOther.x,
          y2: verticalOther.y,
        };

        const candidates = [verticalCompletion, horizontalCompletion]
          .map((candidate) => normalizeWall(candidate))
          .filter((candidate) => candidate && Math.abs(candidate.x1 - candidate.x2) + Math.abs(candidate.y1 - candidate.y2) > 0)
          .filter((candidate) => !existingSet.has(wallKey(candidate)))
          .filter((candidate) => !isWallCovered(candidate, coverage));

        if (!candidates.length) return;

        const suggestionKey = candidates
          .map((candidate) => wallKey(candidate))
          .sort()
          .join('|');

        if (!suggestionKey || seenKeys.has(suggestionKey)) return;
        seenKeys.add(suggestionKey);

        suggestions.push({
          type: 'corner',
          description: 'Complete the corner rectangle.',
          walls: candidates,
          anchor: { ...corner },
        });
      });
    });
  });

  return suggestions;
}

function computeGapSuggestions(existingSet, coverage) {
  const suggestions = [];
  const seenKeys = new Set();
  const gapThreshold = 2;

  for (let i = 0; i < state.walls.length; i += 1) {
    const first = state.walls[i];
    if (!first) continue;
    const firstHorizontal = isHorizontal(first);
    const firstVertical = isVertical(first);
    if (!firstHorizontal && !firstVertical) continue;

    const firstStart = normalizeWall(first);
    if (!firstStart) continue;

    for (let j = i + 1; j < state.walls.length; j += 1) {
      const second = state.walls[j];
      if (!second) continue;
      const secondHorizontal = isHorizontal(second);
      const secondVertical = isVertical(second);

      if (firstHorizontal && secondHorizontal && firstStart.y1 === second.y1 && firstStart.y2 === second.y2) {
        const secondNorm = normalizeWall(second);
        if (!secondNorm) continue;
        let left = firstStart;
        let right = secondNorm;
        if (secondNorm.x1 < firstStart.x1) {
          left = secondNorm;
          right = firstStart;
        }
        const gap = right.x1 - left.x2;
        if (gap > 0 && gap <= gapThreshold) {
          const candidate = { x1: left.x2, y1: left.y1, x2: right.x1, y2: left.y1 };
          const key = wallKey(candidate);
          if (key && !existingSet.has(key) && !seenKeys.has(key) && !isWallCovered(candidate, coverage)) {
            seenKeys.add(key);
            suggestions.push({
              type: 'gap',
              description: 'Close the short gap between horizontal walls.',
              walls: [candidate],
            });
          }
        }
      } else if (firstVertical && secondVertical && firstStart.x1 === second.x1 && firstStart.x2 === second.x2) {
        const secondNorm = normalizeWall(second);
        if (!secondNorm) continue;
        let top = firstStart;
        let bottom = secondNorm;
        if (secondNorm.y1 < firstStart.y1) {
          top = secondNorm;
          bottom = firstStart;
        }
        const gap = bottom.y1 - top.y2;
        if (gap > 0 && gap <= gapThreshold) {
          const candidate = { x1: top.x1, y1: top.y2, x2: top.x1, y2: bottom.y1 };
          const key = wallKey(candidate);
          if (key && !existingSet.has(key) && !seenKeys.has(key) && !isWallCovered(candidate, coverage)) {
            seenKeys.add(key);
            suggestions.push({
              type: 'gap',
              description: 'Close the short gap between vertical walls.',
              walls: [candidate],
            });
          }
        }
      }
    }
  }

  return suggestions;
}

export function recomputeSuggestions() {
  const { set: existingSet, coverage } = buildExistingWallIndex();
  const suggestions = [
    ...computeCornerSuggestions(existingSet, coverage),
    ...computeGapSuggestions(existingSet, coverage),
  ];
  state.suggestions = suggestions;
  return suggestions;
}

function applyWalls(walls) {
  let added = 0;
  let adjusted = 0;
  let skipped = 0;

  const safeWalls = Array.isArray(walls) ? walls : [];
  safeWalls.forEach((wall) => {
    if (!wall) {
      skipped += 1;
      return;
    }

    const result = addWallToState(wall);
    if (result.addedSegments > 0) {
      added += result.addedSegments;
      if (result.removedCells > 0) {
        adjusted += 1;
      }
    } else {
      skipped += 1;
    }
  });

  return { added, adjusted, skipped };
}

export function applySuggestions() {
  if (!Array.isArray(state.suggestions) || state.suggestions.length === 0) {
    return { applied: false, added: 0, adjusted: 0, skipped: 0 };
  }

  let added = 0;
  let adjusted = 0;
  let skipped = 0;

  state.suggestions.forEach((suggestion) => {
    const result = applyWalls(suggestion?.walls);
    added += result.added;
    adjusted += result.adjusted;
    skipped += result.skipped;
  });

  state.suggestions = [];

  return { applied: added > 0, added, adjusted, skipped };
}

export function applySuggestionAtIndex(index) {
  if (!Array.isArray(state.suggestions) || index == null) {
    return { applied: false, added: 0, adjusted: 0, skipped: 0 };
  }

  const numericIndex = Number(index);
  if (!Number.isInteger(numericIndex) || numericIndex < 0 || numericIndex >= state.suggestions.length) {
    return { applied: false, added: 0, adjusted: 0, skipped: 0 };
  }

  const suggestion = state.suggestions[numericIndex];
  const result = applyWalls(suggestion?.walls);
  state.suggestions.splice(numericIndex, 1);

  return { applied: result.added > 0, ...result };
}

export function applySuggestionWall(suggestionIndex, wallIndex) {
  if (!Array.isArray(state.suggestions)) {
    return { applied: false, added: 0, adjusted: 0, skipped: 0 };
  }

  const numericSuggestionIndex = Number(suggestionIndex);
  const numericWallIndex = Number(wallIndex);

  if (
    !Number.isInteger(numericSuggestionIndex) ||
    !Number.isInteger(numericWallIndex) ||
    numericSuggestionIndex < 0 ||
    numericSuggestionIndex >= state.suggestions.length
  ) {
    return { applied: false, added: 0, adjusted: 0, skipped: 0 };
  }

  const suggestion = state.suggestions[numericSuggestionIndex];
  const walls = Array.isArray(suggestion?.walls) ? suggestion.walls : null;
  if (!walls || numericWallIndex < 0 || numericWallIndex >= walls.length) {
    return { applied: false, added: 0, adjusted: 0, skipped: 0 };
  }

  const [wall] = walls.splice(numericWallIndex, 1);
  const result = applyWalls([wall]);

  if (walls.length === 0) {
    state.suggestions.splice(numericSuggestionIndex, 1);
  }

  return { applied: result.added > 0, ...result };
}

export function getSuggestionCount() {
  if (!Array.isArray(state.suggestions)) return 0;
  return state.suggestions.reduce((sum, suggestion) => sum + suggestion.walls.length, 0);
}

export function hasSuggestions() {
  return getSuggestionCount() > 0;
}
