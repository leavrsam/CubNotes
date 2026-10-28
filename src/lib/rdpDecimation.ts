/**
 * Ramer-Douglas-Peucker (RDP) algorithm for stroke decimation.
 * Simplifies a 2D polyline [x, y, pressure?] by removing points that fall
 * within a perpendicular distance epsilon from the line segment.
 * Preserves curve fidelity while dramatically reducing store bloat and Konva rendering overhead.
 */

function perpendicularDistance(
  point: number[],
  lineStart: number[],
  lineEnd: number[]
): number {
  const x0 = point[0];
  const y0 = point[1];
  const x1 = lineStart[0];
  const y1 = lineStart[1];
  const x2 = lineEnd[0];
  const y2 = lineEnd[1];

  const dx = x2 - x1;
  const dy = y2 - y1;

  if (dx === 0 && dy === 0) {
    return Math.hypot(x0 - x1, y0 - y1);
  }

  // Calculate perpendicular distance from point (x0, y0) to line (x1, y1)-(x2, y2)
  const numerator = Math.abs(dy * x0 - dx * y0 + x2 * y1 - y2 * x1);
  const denominator = Math.hypot(dx, dy);

  return numerator / denominator;
}

/**
 * Recursively decimates stroke points using RDP algorithm.
 * @param points Array of [x, y, pressure?]
 * @param epsilon Maximum allowed distance tolerance in pixels (default: 0.65)
 */
export function ramerDouglasPeucker(points: number[][], epsilon: number = 0.65): number[][] {
  if (points.length <= 2) {
    return points;
  }

  let maxDistance = 0;
  let maxIndex = 0;
  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], first, last);
    if (dist > maxDistance) {
      maxDistance = dist;
      maxIndex = i;
    }
  }

  if (maxDistance > epsilon) {
    const left = ramerDouglasPeucker(points.slice(0, maxIndex + 1), epsilon);
    const right = ramerDouglasPeucker(points.slice(maxIndex), epsilon);
    return left.slice(0, left.length - 1).concat(right);
  } else {
    return [first, last];
  }
}
