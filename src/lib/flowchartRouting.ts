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
  shapes: ShapeNode[]
): { start: Point; end: Point; fromAnchor?: AnchorPosition; toAnchor?: AnchorPosition } | null {
  const shapeMap = new Map<string, ShapeNode>();
  shapes.forEach(s => shapeMap.set(s.id, s));

  let start: Point | null = null;
  let end: Point | null = null;

  if (connector.fromShapeId && shapeMap.has(connector.fromShapeId)) {
    const shape = shapeMap.get(connector.fromShapeId)!;
    start = getAnchorPoint(shape, connector.fromAnchor || 'right');
  } else if (connector.fromPoint) {
    start = connector.fromPoint;
  }

  if (connector.toShapeId && shapeMap.has(connector.toShapeId)) {
    const shape = shapeMap.get(connector.toShapeId)!;
    end = getAnchorPoint(shape, connector.toAnchor || 'left');
  } else if (connector.toPoint) {
    end = connector.toPoint;
  }

  if (!start || !end) return null;

  return {
    start,
    end,
    fromAnchor: connector.fromAnchor,
    toAnchor: connector.toAnchor
  };
}

export function getCurvedBezierPath(
  start: Point,
  end: Point,
  fromAnchor?: AnchorPosition,
  toAnchor?: AnchorPosition
): { path: string; midpoint: Point } {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dist = Math.hypot(dx, dy);
  const curvature = Math.max(40, Math.min(dist * 0.45, 180));

  let n1 = getAnchorNormal(fromAnchor);
  let n2 = getAnchorNormal(toAnchor);

  // If anchor normals are not defined, deduce tangent direction
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
  // B(0.5) = 0.125 * P0 + 0.375 * P1 + 0.375 * P2 + 0.125 * P3
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
  toAnchor?: AnchorPosition
): { path: string; midpoint: Point } {
  const points: Point[] = [start];

  const n1 = getAnchorNormal(fromAnchor);
  const n2 = getAnchorNormal(toAnchor);

  // If exit is horizontal
  if (n1.x !== 0 || (n1.x === 0 && n1.y === 0 && Math.abs(end.x - start.x) >= Math.abs(end.y - start.y))) {
    const midX = (start.x + end.x) / 2;
    points.push({ x: midX, y: start.y });
    points.push({ x: midX, y: end.y });
    points.push(end);
  } else {
    // Exit is vertical
    const midY = (start.y + end.y) / 2;
    points.push({ x: start.x, y: midY });
    points.push({ x: end.x, y: midY });
    points.push(end);
  }

  const path = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)} ` +
    points.slice(1).map(p => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

  const midIdx = Math.floor(points.length / 2);
  const midpoint: Point = {
    x: (points[midIdx - 1].x + points[midIdx].x) / 2,
    y: (points[midIdx - 1].y + points[midIdx].y) / 2
  };

  return { path, midpoint };
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
  shapes: ShapeNode[]
): { path: string; midpoint: Point; start: Point; end: Point } | null {
  const endpoints = resolveConnectorEndpoints(connector, shapes);
  if (!endpoints) return null;

  const { start, end, fromAnchor, toAnchor } = endpoints;
  const routing: ConnectorRouting = connector.routing || 'curved'; // Default to curved Bezier as requested

  let routeResult: { path: string; midpoint: Point };

  switch (routing) {
    case 'orthogonal':
      routeResult = getOrthogonalPath(start, end, fromAnchor, toAnchor);
      break;
    case 'straight':
      routeResult = getStraightPath(start, end);
      break;
    case 'curved':
    default:
      routeResult = getCurvedBezierPath(start, end, fromAnchor, toAnchor);
      break;
  }

  return {
    path: routeResult.path,
    midpoint: routeResult.midpoint,
    start,
    end
  };
}
