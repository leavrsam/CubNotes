import { ShapeNode, ConnectorNode, AnchorPosition, ConnectorRouting } from "@/components/CustomCanvas";

export interface Point {
  x: number;
  y: number;
}

export function getAnchorPoint(shape: ShapeNode, anchor: AnchorPosition): Point {
  switch (anchor) {
    case 'top':
      return { x: shape.x + shape.width / 2, y: shape.y };
    case 'right':
      return { x: shape.x + shape.width, y: shape.y + shape.height / 2 };
    case 'bottom':
      return { x: shape.x + shape.width / 2, y: shape.y + shape.height };
    case 'left':
      return { x: shape.x, y: shape.y + shape.height / 2 };
  }
}

export function getAnchorNormal(anchor?: AnchorPosition): Point {
  switch (anchor) {
    case 'top':
      return { x: 0, y: -1 };
    case 'right':
      return { x: 1, y: 0 };
    case 'bottom':
      return { x: 0, y: 1 };
    case 'left':
      return { x: -1, y: 0 };
    default:
      return { x: 0, y: 0 };
  }
}

export function resolveConnectorEndpoints(
  connector: ConnectorNode,
  shapes: ShapeNode[],
  fallbackEndPoint?: Point
): { 
  start: Point; 
  end: Point; 
  fromAnchor?: AnchorPosition; 
  toAnchor?: AnchorPosition; 
  fromShape?: ShapeNode; 
  toShape?: ShapeNode 
} | null {
  const shapeMap = new Map<string, ShapeNode>();
  shapes.forEach(s => shapeMap.set(s.id, s));

  let start: Point | null = null;
  let end: Point | null = null;
  let fromShape: ShapeNode | undefined = undefined;
  let toShape: ShapeNode | undefined = undefined;

  if (connector.fromShapeId && shapeMap.has(connector.fromShapeId)) {
    fromShape = shapeMap.get(connector.fromShapeId)!;
    start = getAnchorPoint(fromShape, connector.fromAnchor || 'right');
  } else if (connector.fromPoint) {
    start = connector.fromPoint;
  }

  if (connector.toShapeId && shapeMap.has(connector.toShapeId)) {
    toShape = shapeMap.get(connector.toShapeId)!;
    end = getAnchorPoint(toShape, connector.toAnchor || 'left');
  } else if (connector.toPoint) {
    end = connector.toPoint;
  } else if (fallbackEndPoint) {
    end = fallbackEndPoint;
  }

  if (!start || !end) return null;

  return {
    start,
    end,
    fromAnchor: connector.fromAnchor,
    toAnchor: connector.toAnchor,
    fromShape,
    toShape
  };
}

/**
 * Builds a smooth SVG path through a series of waypoints with rounded corners.
 */
export function pointsToSmoothCurvedPath(points: Point[], cornerRadius = 24): { path: string; midpoint: Point } {
  if (points.length === 0) return { path: '', midpoint: { x: 0, y: 0 } };
  if (points.length === 1) return { path: `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`, midpoint: points[0] };
  if (points.length === 2) {
    return {
      path: `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)} L ${points[1].x.toFixed(1)} ${points[1].y.toFixed(1)}`,
      midpoint: { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 }
    };
  }

  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];

    const d1x = curr.x - prev.x;
    const d1y = curr.y - prev.y;
    const len1 = Math.hypot(d1x, d1y);

    const d2x = next.x - curr.x;
    const d2y = next.y - curr.y;
    const len2 = Math.hypot(d2x, d2y);

    const r = Math.min(cornerRadius, len1 / 2, len2 / 2);

    if (r < 1 || len1 === 0 || len2 === 0) {
      d += ` L ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`;
    } else {
      const startCornerX = curr.x - (d1x / len1) * r;
      const startCornerY = curr.y - (d1y / len1) * r;
      const endCornerX = curr.x + (d2x / len2) * r;
      const endCornerY = curr.y + (d2y / len2) * r;

      d += ` L ${startCornerX.toFixed(1)} ${startCornerY.toFixed(1)}`;
      d += ` Q ${curr.x.toFixed(1)} ${curr.y.toFixed(1)} ${endCornerX.toFixed(1)} ${endCornerY.toFixed(1)}`;
    }
  }

  const last = points[points.length - 1];
  d += ` L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;

  const midIdx = Math.floor(points.length / 2);
  const midpoint: Point = {
    x: (points[midIdx - 1].x + points[midIdx].x) / 2,
    y: (points[midIdx - 1].y + points[midIdx].y) / 2
  };

  return { path: d, midpoint };
}

export function getCurvedBezierPath(
  start: Point,
  end: Point,
  fromAnchor?: AnchorPosition,
  toAnchor?: AnchorPosition,
  fromShape?: ShapeNode,
  toShape?: ShapeNode
): { path: string; midpoint: Point } {
  const clearance = 28;

  // Detect if exiting fromAnchor would curve straight through fromShape body
  let needsFromWrap = false;
  let fromWaypoints: Point[] = [];

  if (fromShape && fromAnchor) {
    if (fromAnchor === 'top' && end.y > fromShape.y + 10) {
      needsFromWrap = true;
      const exitY = fromShape.y - clearance;
      const sideX = end.x >= fromShape.x + fromShape.width / 2
        ? fromShape.x + fromShape.width + clearance
        : fromShape.x - clearance;
      fromWaypoints = [
        { x: start.x, y: exitY },
        { x: sideX, y: exitY },
        { x: sideX, y: fromShape.y + fromShape.height * 0.75 }
      ];
    } else if (fromAnchor === 'bottom' && end.y < fromShape.y + fromShape.height - 10) {
      needsFromWrap = true;
      const exitY = fromShape.y + fromShape.height + clearance;
      const sideX = end.x >= fromShape.x + fromShape.width / 2
        ? fromShape.x + fromShape.width + clearance
        : fromShape.x - clearance;
      fromWaypoints = [
        { x: start.x, y: exitY },
        { x: sideX, y: exitY },
        { x: sideX, y: fromShape.y + fromShape.height * 0.25 }
      ];
    } else if (fromAnchor === 'right' && end.x < fromShape.x + fromShape.width - 10) {
      needsFromWrap = true;
      const exitX = fromShape.x + fromShape.width + clearance;
      const sideY = end.y >= fromShape.y + fromShape.height / 2
        ? fromShape.y + fromShape.height + clearance
        : fromShape.y - clearance;
      fromWaypoints = [
        { x: exitX, y: start.y },
        { x: exitX, y: sideY },
        { x: fromShape.x + fromShape.width * 0.75, y: sideY }
      ];
    } else if (fromAnchor === 'left' && end.x > fromShape.x + 10) {
      needsFromWrap = true;
      const exitX = fromShape.x - clearance;
      const sideY = end.y >= fromShape.y + fromShape.height / 2
        ? fromShape.y + fromShape.height + clearance
        : fromShape.y - clearance;
      fromWaypoints = [
        { x: exitX, y: start.y },
        { x: exitX, y: sideY },
        { x: fromShape.x + fromShape.width * 0.25, y: sideY }
      ];
    }
  }

  // Detect if entering toAnchor would curve straight through toShape body
  let needsToWrap = false;
  let toWaypoints: Point[] = [];
  const incomingPoint = fromWaypoints.length > 0 ? fromWaypoints[fromWaypoints.length - 1] : start;

  if (toShape && toAnchor) {
    if (toAnchor === 'top' && incomingPoint.y > toShape.y + toShape.height - 10) {
      needsToWrap = true;
      const enterY = toShape.y - clearance;
      const sideX = incomingPoint.x >= toShape.x + toShape.width / 2
        ? toShape.x + toShape.width + clearance
        : toShape.x - clearance;
      toWaypoints = [
        { x: sideX, y: toShape.y + toShape.height * 0.75 },
        { x: sideX, y: enterY },
        { x: end.x, y: enterY }
      ];
    } else if (toAnchor === 'bottom' && incomingPoint.y < toShape.y + 10) {
      needsToWrap = true;
      const enterY = toShape.y + toShape.height + clearance;
      const sideX = incomingPoint.x >= toShape.x + toShape.width / 2
        ? toShape.x + toShape.width + clearance
        : toShape.x - clearance;
      toWaypoints = [
        { x: sideX, y: toShape.y + toShape.height * 0.25 },
        { x: sideX, y: enterY },
        { x: end.x, y: enterY }
      ];
    } else if (toAnchor === 'right' && incomingPoint.x < toShape.x + 10) {
      needsToWrap = true;
      const enterX = toShape.x + toShape.width + clearance;
      const sideY = incomingPoint.y >= toShape.y + toShape.height / 2
        ? toShape.y + toShape.height + clearance
        : toShape.y - clearance;
      toWaypoints = [
        { x: toShape.x + toShape.width * 0.75, y: sideY },
        { x: enterX, y: sideY },
        { x: enterX, y: end.y }
      ];
    } else if (toAnchor === 'left' && incomingPoint.x > toShape.x + toShape.width - 10) {
      needsToWrap = true;
      const enterX = toShape.x - clearance;
      const sideY = incomingPoint.y >= toShape.y + toShape.height / 2
        ? toShape.y + toShape.height + clearance
        : toShape.y - clearance;
      toWaypoints = [
        { x: toShape.x + toShape.width * 0.25, y: sideY },
        { x: enterX, y: sideY },
        { x: enterX, y: end.y }
      ];
    }
  }

  // If obstacle avoidance is needed, construct multi-segment smooth curve around the shapes
  if (needsFromWrap || needsToWrap) {
    const fullPoints: Point[] = [start, ...fromWaypoints, ...toWaypoints, end];
    return pointsToSmoothCurvedPath(fullPoints, 24);
  }

  // Natural curve with direct cubic Bezier
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dist = Math.hypot(dx, dy);
  const curvature = Math.max(35, Math.min(dist * 0.45, 180));

  let n1 = getAnchorNormal(fromAnchor);
  let n2 = getAnchorNormal(toAnchor);

  if (n1.x === 0 && n1.y === 0) {
    if (Math.abs(dx) > Math.abs(dy)) {
      n1 = { x: dx > 0 ? 1 : -1, y: 0 };
    } else {
      n1 = { x: 0, y: dy > 0 ? 1 : -1 };
    }
  }

  if (n2.x === 0 && n2.y === 0) {
    if (Math.abs(dx) > Math.abs(dy)) {
      n2 = { x: dx > 0 ? -1 : 1, y: 0 };
    } else {
      n2 = { x: 0, y: dy > 0 ? -1 : 1 };
    }
  }

  const cp1: Point = {
    x: start.x + n1.x * curvature,
    y: start.y + n1.y * curvature
  };

  const cp2: Point = {
    x: end.x + n2.x * curvature,
    y: end.y + n2.y * curvature
  };

  const path = `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} C ${cp1.x.toFixed(1)} ${cp1.y.toFixed(1)}, ${cp2.x.toFixed(1)} ${cp2.y.toFixed(1)}, ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;

  // Evaluate cubic Bezier at t = 0.5
  const midpoint: Point = {
    x: 0.125 * start.x + 0.375 * cp1.x + 0.375 * cp2.x + 0.125 * end.x,
    y: 0.125 * start.y + 0.375 * cp1.y + 0.375 * cp2.y + 0.125 * end.y
  };

  return { path, midpoint };
}

export function getOrthogonalPath(
  start: Point,
  end: Point,
  fromAnchor?: AnchorPosition,
  toAnchor?: AnchorPosition,
  fromShape?: ShapeNode,
  toShape?: ShapeNode
): { path: string; midpoint: Point } {
  // Use pointsToSmoothCurvedPath with 12px rounded elbow corners
  const n1 = getAnchorNormal(fromAnchor);
  const n2 = getAnchorNormal(toAnchor);
  const clearance = 24;

  let points: Point[] = [start];

  if (fromShape && fromAnchor === 'top' && end.y > fromShape.y + 10) {
    const exitY = fromShape.y - clearance;
    const sideX = end.x >= fromShape.x + fromShape.width / 2 ? fromShape.x + fromShape.width + clearance : fromShape.x - clearance;
    points.push({ x: start.x, y: exitY }, { x: sideX, y: exitY }, { x: sideX, y: end.y }, end);
    return pointsToSmoothCurvedPath(points, 12);
  } else if (fromShape && fromAnchor === 'bottom' && end.y < fromShape.y + fromShape.height - 10) {
    const exitY = fromShape.y + fromShape.height + clearance;
    const sideX = end.x >= fromShape.x + fromShape.width / 2 ? fromShape.x + fromShape.width + clearance : fromShape.x - clearance;
    points.push({ x: start.x, y: exitY }, { x: sideX, y: exitY }, { x: sideX, y: end.y }, end);
    return pointsToSmoothCurvedPath(points, 12);
  }

  // Standard orthogonal elbow
  if (n1.x !== 0 || (n1.x === 0 && n1.y === 0 && Math.abs(end.x - start.x) >= Math.abs(end.y - start.y))) {
    const midX = (start.x + end.x) / 2;
    points.push({ x: midX, y: start.y }, { x: midX, y: end.y }, end);
  } else {
    const midY = (start.y + end.y) / 2;
    points.push({ x: start.x, y: midY }, { x: end.x, y: midY }, end);
  }

  return pointsToSmoothCurvedPath(points, 12);
}

export function getStraightPath(start: Point, end: Point): { path: string; midpoint: Point } {
  return {
    path: `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} L ${end.x.toFixed(1)} ${end.y.toFixed(1)}`,
    midpoint: {
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2
    }
  };
}

export function generateConnectorRoute(
  connector: ConnectorNode,
  shapes: ShapeNode[],
  fallbackEndPoint?: Point
): { path: string; midpoint: Point; start: Point; end: Point } | null {
  const endpoints = resolveConnectorEndpoints(connector, shapes, fallbackEndPoint);
  if (!endpoints) return null;

  const { start, end, fromAnchor, toAnchor, fromShape, toShape } = endpoints;
  const routing: ConnectorRouting = connector.routing || 'curved';

  let routeResult: { path: string; midpoint: Point };

  switch (routing) {
    case 'orthogonal':
      routeResult = getOrthogonalPath(start, end, fromAnchor, toAnchor, fromShape, toShape);
      break;
    case 'straight':
      routeResult = getStraightPath(start, end);
      break;
    case 'curved':
    default:
      routeResult = getCurvedBezierPath(start, end, fromAnchor, toAnchor, fromShape, toShape);
      break;
  }

  return {
    path: routeResult.path,
    midpoint: routeResult.midpoint,
    start,
    end
  };
}
