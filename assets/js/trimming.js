import { state } from './state.js';
import { pushUndoSnapshot } from './history.js';

function isHorizontal(wall) {
  return wall && wall.y1 === wall.y2 && wall.x1 !== wall.x2;
}

function isVertical(wall) {
  return wall && wall.x1 === wall.x2 && wall.y1 !== wall.y2;
}

function getWallSpan(wall) {
  if (!wall) return null;
  if (isHorizontal(wall)) {
    const minX = Math.min(wall.x1, wall.x2);
    const maxX = Math.max(wall.x1, wall.x2);
    if (minX === maxX) return null;
    return {
      orientation: 'horizontal',
      startCoord: minX,
      endCoord: maxX,
      constant: wall.y1,
      isIncreasing: wall.x1 <= wall.x2,
      length: maxX - minX,
    };
  }
  if (isVertical(wall)) {
    const minY = Math.min(wall.y1, wall.y2);
    const maxY = Math.max(wall.y1, wall.y2);
    if (minY === maxY) return null;
    return {
      orientation: 'vertical',
      startCoord: minY,
      endCoord: maxY,
      constant: wall.x1,
      isIncreasing: wall.y1 <= wall.y2,
      length: maxY - minY,
    };
  }
  return null;
}

function projectWallFeatures(wall, span) {
  if (!wall || !span) return [];
  const features = Array.isArray(wall.features) ? wall.features : [];
  const axisStart = span.startCoord;
  const length = span.length;
  if (!(length > 0)) return [];

  return features.map((feature) => {
    const position = Number.isFinite(feature?.position) ? feature.position : 0.5;
    const lengthCells = Number.isFinite(feature?.lengthCells) && feature.lengthCells > 0 ? feature.lengthCells : 0;
    const center = axisStart + position * length;
    const half = lengthCells / 2;
    return {
      feature,
      center,
      start: center - half,
      end: center + half,
    };
  });
}

function assignFeaturesToRange(range, span, projections) {
  const rangeLength = range.end - range.start;
  if (!(rangeLength > 0)) return [];

  const orientationIncreasing = span.isIncreasing;
  const assigned = [];

  projections.forEach((projection) => {
    if (!projection) return;
    const { feature, start, end, center } = projection;
    if (start < range.start - 1e-6 || end > range.end + 1e-6) {
      return;
    }
    const normalizedPosition = orientationIncreasing
      ? (center - range.start) / rangeLength
      : (range.end - center) / rangeLength;
    const clamped = Math.min(Math.max(normalizedPosition, 0), 1);
    assigned.push({ ...feature, position: clamped });
  });

  return assigned;
}

function buildSegmentFromRange(wall, span, range, projections) {
  const rangeLength = range.end - range.start;
  if (!(rangeLength > 0)) return null;

  const features = assignFeaturesToRange(range, span, projections);

  if (span.orientation === 'horizontal') {
    const x1 = span.isIncreasing ? range.start : range.end;
    const x2 = span.isIncreasing ? range.end : range.start;
    return {
      x1,
      y1: wall.y1,
      x2,
      y2: wall.y2,
      features,
    };
  }

  const y1 = span.isIncreasing ? range.start : range.end;
  const y2 = span.isIncreasing ? range.end : range.start;
  return {
    x1: wall.x1,
    y1,
    x2: wall.x2,
    y2,
    features,
  };
}

function findTrimBounds(wallIndex, span, targetCoord) {
  let leftBoundary = span.startCoord;
  let rightBoundary = span.endCoord;
  let touchesIntersection = false;

  for (let i = 0; i < state.walls.length; i += 1) {
    if (i === wallIndex) continue;
    const other = state.walls[i];
    if (!other) continue;

    if (span.orientation === 'horizontal' && isVertical(other)) {
      const minY = Math.min(other.y1, other.y2);
      const maxY = Math.max(other.y1, other.y2);
      if (span.constant < minY || span.constant > maxY) continue;
      const x = other.x1;
      if (x <= span.startCoord || x >= span.endCoord) continue;
      if (x === targetCoord) {
        touchesIntersection = true;
      } else if (x < targetCoord) {
        leftBoundary = Math.max(leftBoundary, x);
      } else if (x > targetCoord) {
        rightBoundary = Math.min(rightBoundary, x);
      }
    } else if (span.orientation === 'vertical' && isHorizontal(other)) {
      const minX = Math.min(other.x1, other.x2);
      const maxX = Math.max(other.x1, other.x2);
      if (span.constant < minX || span.constant > maxX) continue;
      const y = other.y1;
      if (y <= span.startCoord || y >= span.endCoord) continue;
      if (y === targetCoord) {
        touchesIntersection = true;
      } else if (y < targetCoord) {
        leftBoundary = Math.max(leftBoundary, y);
      } else if (y > targetCoord) {
        rightBoundary = Math.min(rightBoundary, y);
      }
    }
  }

  return { leftBoundary, rightBoundary, touchesIntersection };
}

export function trimWallAtCell(wallIndex, point) {
  const wall = state.walls[wallIndex];
  if (!wall) {
    return { trimmed: false, reason: 'missing-wall' };
  }

  const span = getWallSpan(wall);
  if (!span) {
    return { trimmed: false, reason: 'unsupported-wall' };
  }

  const targetCoordRaw = span.orientation === 'horizontal' ? point?.x : point?.y;
  const targetCoord = Number.isFinite(targetCoordRaw) ? targetCoordRaw : null;
  if (targetCoord == null) {
    return { trimmed: false, reason: 'invalid-point' };
  }

  if (targetCoord <= span.startCoord || targetCoord >= span.endCoord) {
    return { trimmed: false, reason: 'edge' };
  }

  const { leftBoundary, rightBoundary, touchesIntersection } = findTrimBounds(
    wallIndex,
    span,
    targetCoord
  );

  if (touchesIntersection) {
    return { trimmed: false, reason: 'intersection' };
  }

  if (rightBoundary - leftBoundary <= 0) {
    return { trimmed: false, reason: 'no-span' };
  }

  const projections = projectWallFeatures(wall, span);

  const segments = [];
  if (leftBoundary > span.startCoord + 1e-6) {
    const segment = buildSegmentFromRange(
      wall,
      span,
      { start: span.startCoord, end: leftBoundary },
      projections
    );
    if (segment) {
      segments.push(segment);
    }
  }

  if (rightBoundary < span.endCoord - 1e-6) {
    const segment = buildSegmentFromRange(
      wall,
      span,
      { start: rightBoundary, end: span.endCoord },
      projections
    );
    if (segment) {
      segments.push(segment);
    }
  }

  const keptFeatures = segments.reduce((sum, segment) => sum + (segment.features?.length || 0), 0);
  const removedFeatures = Math.max(projections.length - keptFeatures, 0);

  const netChange = segments.length - 1;

  pushUndoSnapshot();
  state.walls.splice(wallIndex, 1, ...segments);

  if (state.selectedWallIndex === wallIndex) {
    state.selectedWallIndex = null;
  } else if (state.selectedWallIndex != null && netChange !== 0 && state.selectedWallIndex > wallIndex) {
    state.selectedWallIndex += netChange;
  }

  return {
    trimmed: true,
    removedCells: rightBoundary - leftBoundary,
    resultingSegments: segments.length,
    removedFeatures,
  };
}
