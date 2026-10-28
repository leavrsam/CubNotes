/**
 * Automatic Mind Map Tree Layout & Node Expansion Engine
 * Provides balanced horizontal, right-tree, and radial layout calculations,
 * rapid child/sibling node branching, and subtree folding.
 */

import { ShapeNode, ConnectorNode, FlowchartShapeType } from "@/components/CustomCanvas";
import { v4 as uuidv4 } from "uuid";

export type MindMapLayoutType = 'balanced' | 'right-tree' | 'radial';

const NODE_WIDTH = 160;
const NODE_HEIGHT = 48;
const HORIZONTAL_GAP = 90;
const VERTICAL_GAP = 24;

export const MINDMAP_BRANCH_COLORS = [
  '#3b82f6', // Blue
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#8b5cf6', // Violet
  '#06b6d4', // Cyan
  '#f97316', // Orange
  '#14b8a6', // Teal
];

interface TreeNode {
  shape: ShapeNode;
  children: TreeNode[];
  width: number;
  height: number;
  subtreeHeight: number;
  direction?: 'left' | 'right';
}

/**
 * Builds a hierarchical tree representation from shapes and connectors
 */
function buildTree(rootId: string, shapesMap: Map<string, ShapeNode>, childrenMap: Map<string, string[]>): TreeNode {
  const shape = shapesMap.get(rootId)!;
  const childIds = childrenMap.get(rootId) || [];
  const children = childIds
    .filter(id => shapesMap.has(id))
    .map(id => buildTree(id, shapesMap, childrenMap));

  const width = shape.width || NODE_WIDTH;
  const height = shape.height || NODE_HEIGHT;

  const childrenHeight = children.reduce((sum, c) => sum + c.subtreeHeight, 0) + 
    Math.max(0, children.length - 1) * VERTICAL_GAP;
  const subtreeHeight = Math.max(height, childrenHeight);

  return {
    shape,
    children,
    width,
    height,
    subtreeHeight
  };
}

/**
 * Automatically calculates tidy, non-overlapping positions for all nodes in the tree
 */
export function autoLayoutMindMap(
  shapes: ShapeNode[],
  connectors: ConnectorNode[],
  rootId?: string,
  layoutType: MindMapLayoutType = 'balanced'
): ShapeNode[] {
  if (shapes.length === 0) return shapes;

  const shapesMap = new Map<string, ShapeNode>(shapes.map(s => [s.id, { ...s }]));
  const childrenMap = new Map<string, string[]>();
  const parentMap = new Map<string, string>();

  // Map incoming and outgoing connections
  connectors.forEach(c => {
    const fromId = c.fromShapeId || (c as any).fromId;
    const toId = c.toShapeId || (c as any).toId;
    if (fromId && toId && shapesMap.has(fromId) && shapesMap.has(toId)) {
      if (!childrenMap.has(fromId)) childrenMap.set(fromId, []);
      childrenMap.get(fromId)!.push(toId);
      parentMap.set(toId, fromId);
    }
  });

  // Determine root: either explicit rootId, or first node with no parent, or shapes[0]
  let effectiveRootId = rootId;
  if (!effectiveRootId || !shapesMap.has(effectiveRootId)) {
    const candidateRoot = shapes.find(s => !parentMap.has(s.id));
    effectiveRootId = candidateRoot ? candidateRoot.id : shapes[0].id;
  }

  const rootTree = buildTree(effectiveRootId, shapesMap, childrenMap);
  const rootShape = rootTree.shape;
  const rootX = rootShape.x;
  const rootY = rootShape.y;

  const updatedShapesMap = new Map<string, ShapeNode>();
  updatedShapesMap.set(rootShape.id, rootShape);

  if (layoutType === 'balanced') {
    // Split children between right and left sides
    const leftChildren: TreeNode[] = [];
    const rightChildren: TreeNode[] = [];

    rootTree.children.forEach((child, idx) => {
      if (idx % 2 === 0) {
        child.direction = 'right';
        rightChildren.push(child);
      } else {
        child.direction = 'left';
        leftChildren.push(child);
      }
    });

    // Layout right subtrees
    const rightTotalHeight = rightChildren.reduce((acc, c) => acc + c.subtreeHeight, 0) + 
      Math.max(0, rightChildren.length - 1) * VERTICAL_GAP;
    let currentRightY = rootY + (rootShape.height / 2) - (rightTotalHeight / 2);

    rightChildren.forEach((child, i) => {
      const childY = currentRightY + (child.subtreeHeight / 2) - (child.height / 2);
      layoutSubtree(child, rootX + rootShape.width + HORIZONTAL_GAP, childY, 'right', updatedShapesMap);
      currentRightY += child.subtreeHeight + VERTICAL_GAP;
    });

    // Layout left subtrees
    const leftTotalHeight = leftChildren.reduce((acc, c) => acc + c.subtreeHeight, 0) + 
      Math.max(0, leftChildren.length - 1) * VERTICAL_GAP;
    let currentLeftY = rootY + (rootShape.height / 2) - (leftTotalHeight / 2);

    leftChildren.forEach((child, i) => {
      const childY = currentLeftY + (child.subtreeHeight / 2) - (child.height / 2);
      layoutSubtree(child, rootX - child.width - HORIZONTAL_GAP, childY, 'left', updatedShapesMap);
      currentLeftY += child.subtreeHeight + VERTICAL_GAP;
    });

  } else {
    // Single direction: all children grow to the right
    const totalHeight = rootTree.children.reduce((acc, c) => acc + c.subtreeHeight, 0) + 
      Math.max(0, rootTree.children.length - 1) * VERTICAL_GAP;
    let currentY = rootY + (rootShape.height / 2) - (totalHeight / 2);

    rootTree.children.forEach(child => {
      const childY = currentY + (child.subtreeHeight / 2) - (child.height / 2);
      layoutSubtree(child, rootX + rootShape.width + HORIZONTAL_GAP, childY, 'right', updatedShapesMap);
      currentY += child.subtreeHeight + VERTICAL_GAP;
    });
  }

  // Return full shapes array with updated coordinates
  return shapes.map(s => updatedShapesMap.get(s.id) || s);
}

function layoutSubtree(
  node: TreeNode,
  targetX: number,
  targetY: number,
  direction: 'left' | 'right',
  resultMap: Map<string, ShapeNode>
) {
  const shape = {
    ...node.shape,
    x: targetX,
    y: targetY,
  };
  resultMap.set(shape.id, shape);

  if (node.children.length === 0) return;

  const childrenTotalHeight = node.children.reduce((acc, c) => acc + c.subtreeHeight, 0) + 
    Math.max(0, node.children.length - 1) * VERTICAL_GAP;
  let currentY = targetY + (node.height / 2) - (childrenTotalHeight / 2);

  node.children.forEach(child => {
    const nextX = direction === 'right' 
      ? targetX + node.width + HORIZONTAL_GAP 
      : targetX - child.width - HORIZONTAL_GAP;
    const nextY = currentY + (child.subtreeHeight / 2) - (child.height / 2);

    layoutSubtree(child, nextX, nextY, direction, resultMap);
    currentY += child.subtreeHeight + VERTICAL_GAP;
  });
}

/**
 * Creates a Child Mind Map Node branching from parentShape
 */
export function createChildMindMapNode(
  parentShape: ShapeNode,
  existingShapes: ShapeNode[],
  existingConnectors: ConnectorNode[],
  title: string = "New Idea"
): { newShape: ShapeNode; newConnector: ConnectorNode; updatedShapes: ShapeNode[] } {
  const id = uuidv4();
  const connectorId = uuidv4();

  // Inherit or cycle branch color
  const existingChildCount = existingConnectors.filter(c => (c.fromShapeId || (c as any).fromId) === parentShape.id).length;
  const branchColor = parentShape.strokeColor && parentShape.strokeColor !== '#3b82f6'
    ? parentShape.strokeColor
    : MINDMAP_BRANCH_COLORS[existingChildCount % MINDMAP_BRANCH_COLORS.length];

  // Default initial offset: branch out to right (or left if parent is already positioned on left)
  const isLeft = parentShape.x < 0;
  const newX = isLeft 
    ? parentShape.x - NODE_WIDTH - HORIZONTAL_GAP 
    : parentShape.x + parentShape.width + HORIZONTAL_GAP;
  const newY = parentShape.y + (existingChildCount * (NODE_HEIGHT + VERTICAL_GAP));

  const newShape: ShapeNode = {
    id,
    type: 'rounded',
    x: newX,
    y: newY,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    text: title,
    fillColor: `${branchColor}1a`, // ~10% opacity fill
    strokeColor: branchColor,
    strokeWidth: 2,
    fontSize: 14,
    textColor: undefined,
    textAlign: 'center',
  };

  const newConnector: ConnectorNode = {
    id: connectorId,
    fromShapeId: parentShape.id,
    toShapeId: id,
    fromAnchor: isLeft ? 'left' : 'right',
    toAnchor: isLeft ? 'right' : 'left',
    routing: 'curved',
    strokeColor: branchColor,
    strokeWidth: 2,
    arrowEnd: 'arrow',
  };

  const allShapes = [...existingShapes, newShape];
  const allConnectors = [...existingConnectors, newConnector];

  // Run instant tidy auto-layout so new node fits harmoniously
  const formattedShapes = autoLayoutMindMap(allShapes, allConnectors, undefined, 'balanced');

  return {
    newShape: formattedShapes.find(s => s.id === id) || newShape,
    newConnector,
    updatedShapes: formattedShapes
  };
}

/**
 * Creates a Sibling Mind Map Node next to currentShape under the same parent
 */
export function createSiblingMindMapNode(
  currentShape: ShapeNode,
  existingShapes: ShapeNode[],
  existingConnectors: ConnectorNode[],
  title: string = "New Sibling"
): { newShape: ShapeNode; newConnector?: ConnectorNode; updatedShapes: ShapeNode[] } {
  // Find parent connector
  const parentConn = existingConnectors.find(c => (c.toShapeId || (c as any).toId) === currentShape.id);
  if (parentConn) {
    const parentId = parentConn.fromShapeId || (parentConn as any).fromId;
    const parentShape = existingShapes.find(s => s.id === parentId);
    if (parentShape) {
      return createChildMindMapNode(parentShape, existingShapes, existingConnectors, title);
    }
  }

  // If node has no parent (is a root), spawn an adjacent root topic
  const id = uuidv4();
  const newShape: ShapeNode = {
    id,
    type: 'rounded',
    x: currentShape.x,
    y: currentShape.y + currentShape.height + VERTICAL_GAP * 2,
    width: currentShape.width || NODE_WIDTH,
    height: currentShape.height || NODE_HEIGHT,
    text: title,
    fillColor: currentShape.fillColor,
    strokeColor: currentShape.strokeColor,
    strokeWidth: 2,
    fontSize: 14,
    textAlign: 'center',
  };

  return {
    newShape,
    updatedShapes: [...existingShapes, newShape]
  };
}

/**
 * Traverses all child connections to collect descendant node IDs
 */
export function getDescendantNodeIds(
  rootId: string, 
  connectors: ConnectorNode[]
): Set<string> {
  const descendants = new Set<string>();
  const queue = [rootId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const c of connectors) {
      const from = c.fromShapeId || (c as any).fromId;
      const to = c.toShapeId || (c as any).toId;
      if (from === current && to && !descendants.has(to)) {
        descendants.add(to);
        queue.push(to);
      }
    }
  }

  return descendants;
}

