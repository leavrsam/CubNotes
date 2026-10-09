"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { 
  ShapeNode, 
  ConnectorNode, 
  FlowchartShapeType, 
  AnchorPosition, 
  ConnectorRouting, 
  ConnectorEnd, 
  ToolType 
} from "./CustomCanvas";
import { 
  generateConnectorRoute, 
  getAnchorPoint, 
  resolveConnectorEndpoints, 
  Point 
} from "@/lib/flowchartRouting";
import { 
  Plus, 
  Trash2, 
  Copy, 
  Square, 
  Circle as CircleIcon, 
  Diamond, 
  AlignLeft, 
  AlignCenter, 
  AlignRight, 
  Check, 
  Type, 
  ArrowRight,
  MoveRight,
  Split,
  Database,
  StickyNote
} from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import toast from "react-hot-toast";

interface FlowchartOverlayProps {
  shapes: ShapeNode[];
  setShapes: React.Dispatch<React.SetStateAction<ShapeNode[]>>;
  connectors: ConnectorNode[];
  setConnectors: React.Dispatch<React.SetStateAction<ConnectorNode[]>>;
  pan: { x: number; y: number };
  zoom: number;
  tool: ToolType;
  setTool: (tool: ToolType) => void;
  selectedShapeId: string | null;
  setSelectedShapeId: (id: string | null) => void;
  selectedConnectorId: string | null;
  setSelectedConnectorId: (id: string | null) => void;
  activeShapeType?: FlowchartShapeType;
  defaultRouting?: ConnectorRouting;
  onDragSelectionStart?: (id: string) => void;
  onDragSelectionMove?: (deltaX: number, deltaY: number) => void;
  onDragSelectionEnd?: () => void;
}

const SHAPE_PALETTE = [
  { name: 'Default', fill: 'rgba(59, 130, 246, 0.08)', stroke: '#3b82f6', preview: '#3b82f6' },
  { name: 'Blue', fill: 'rgba(56, 189, 248, 0.14)', stroke: '#38bdf8', preview: '#38bdf8' },
  { name: 'Green', fill: 'rgba(74, 222, 128, 0.14)', stroke: '#4ade80', preview: '#4ade80' },
  { name: 'Amber', fill: 'rgba(251, 191, 36, 0.14)', stroke: '#fbbf24', preview: '#fbbf24' },
  { name: 'Purple', fill: 'rgba(192, 132, 252, 0.14)', stroke: '#c084fc', preview: '#c084fc' },
  { name: 'Rose', fill: 'rgba(251, 113, 133, 0.14)', stroke: '#fb7185', preview: '#fb7185' },
];

function getShapeColors(shape: ShapeNode) {
  let stroke = shape.strokeColor || "#3b82f6";
  let fill = shape.fillColor || "rgba(59, 130, 246, 0.08)";

  // If the fill is solid white or light hex, make it semi-transparent so text is fully visible
  if (fill === "#ffffff" || fill === "#fff" || fill === "white") {
    fill = "rgba(59, 130, 246, 0.08)";
    if (!shape.strokeColor) stroke = "#3b82f6";
  } else if (fill.startsWith("#")) {
    const r = parseInt(fill.slice(1, 3), 16);
    const g = parseInt(fill.slice(3, 5), 16);
    const b = parseInt(fill.slice(5, 7), 16);
    if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
      fill = `rgba(${r}, ${g}, ${b}, 0.14)`;
    }
  }

  return { stroke, fill };
}

function getAutoFontSize(text: string, width: number, height: number, type?: FlowchartShapeType, baseSize = 14): number {
  if (!text || text.trim().length === 0) return baseSize;

  let widthFactor = 0.85;
  let heightFactor = 0.82;
  if (type === 'diamond') {
    widthFactor = 0.58;
    heightFactor = 0.58;
  } else if (type === 'circle') {
    widthFactor = 0.70;
    heightFactor = 0.70;
  } else if (type === 'cylinder') {
    widthFactor = 0.82;
    heightFactor = 0.65;
  }

  const usableWidth = Math.max(30, width * widthFactor);
  const usableHeight = Math.max(20, height * heightFactor);

  const lines = text.split('\n');
  let optimalSize = baseSize;

  for (let s = baseSize; s >= 8; s -= 0.5) {
    const charWidth = s * 0.54;
    const lineHeight = s * 1.32;
    const charsPerLine = Math.max(1, Math.floor(usableWidth / charWidth));

    let totalLinesNeeded = 0;
    for (const line of lines) {
      if (line.length === 0) {
        totalLinesNeeded += 1;
      } else {
        totalLinesNeeded += Math.max(1, Math.ceil(line.length / charsPerLine));
      }
    }

    if (totalLinesNeeded * lineHeight <= usableHeight) {
      optimalSize = s;
      break;
    }
    optimalSize = s;
  }

  return Math.max(8, optimalSize);
}

export type ResizeCorner = 'nw' | 'ne' | 'se' | 'sw';

export function FlowchartOverlay({
  shapes,
  setShapes,
  connectors,
  setConnectors,
  pan,
  zoom,
  tool,
  setTool,
  selectedShapeId,
  setSelectedShapeId,
  selectedConnectorId,
  setSelectedConnectorId,
  activeShapeType = 'rectangle',
  defaultRouting = 'curved',
  onDragSelectionStart,
  onDragSelectionMove,
  onDragSelectionEnd
}: FlowchartOverlayProps) {
  // Inline text editing state
  const [editingShapeId, setEditingShapeId] = useState<string | null>(null);
  const [editingConnectorId, setEditingConnectorId] = useState<string | null>(null);
  const [connectorLabelDraft, setConnectorLabelDraft] = useState("");

  // Dragging shape state
  const [draggingShapeId, setDraggingShapeId] = useState<string | null>(null);
  const dragStartPos = useRef<{ clientX: number; clientY: number; shapeX: number; shapeY: number } | null>(null);

  // Resizing shape state (supports all 4 corners)
  const [resizingState, setResizingState] = useState<{
    shapeId: string;
    corner: ResizeCorner;
  } | null>(null);
  const resizeStartPos = useRef<{
    clientX: number;
    clientY: number;
    shapeX: number;
    shapeY: number;
    w: number;
    h: number;
    corner: ResizeCorner;
  } | null>(null);

  // Connecting line interactive state
  const [connectingState, setConnectingState] = useState<{
    fromShapeId: string;
    fromAnchor: AnchorPosition;
    currentWorldPos: Point;
    hoverTarget?: { shapeId: string; anchor: AnchorPosition };
  } | null>(null);

  // Track hover anchor for magnetic snap
  const [hoverAnchor, setHoverAnchor] = useState<{ shapeId: string; anchor: AnchorPosition } | null>(null);

  // Handle shape dragging
  const handleShapePointerDown = (e: React.PointerEvent, shape: ShapeNode) => {
    if (tool !== "home" && tool !== "shape") return;
    e.stopPropagation();
    setSelectedShapeId(shape.id);
    setSelectedConnectorId(null);
    setDraggingShapeId(shape.id);
    onDragSelectionStart?.(shape.id);

    dragStartPos.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      shapeX: shape.x,
      shapeY: shape.y
    };
  };

  // Handle shape resizing from any corner
  const handleResizePointerDown = (e: React.PointerEvent, shape: ShapeNode, corner: ResizeCorner) => {
    e.stopPropagation();
    e.preventDefault();
    setResizingState({ shapeId: shape.id, corner });
    resizeStartPos.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      shapeX: shape.x,
      shapeY: shape.y,
      w: shape.width,
      h: shape.height,
      corner
    };
  };

  // Handle anchor pointer down (start drawing connector)
  const handleAnchorPointerDown = (e: React.PointerEvent, shapeId: string, anchor: AnchorPosition) => {
    e.stopPropagation();
    const shape = shapes.find(s => s.id === shapeId);
    if (!shape) return;

    const startPt = getAnchorPoint(shape, anchor);
    setConnectingState({
      fromShapeId: shapeId,
      fromAnchor: anchor,
      currentWorldPos: startPt
    });
  };

  // Global pointer move listener during drag/resize/connect
  useEffect(() => {
    const handleWindowPointerMove = (e: PointerEvent) => {
      // 1. Dragging shape
      if (draggingShapeId && dragStartPos.current) {
        const dx = (e.clientX - dragStartPos.current.clientX) / zoom;
        const dy = (e.clientY - dragStartPos.current.clientY) / zoom;
        setShapes(prev => prev.map(s => {
          if (s.id === draggingShapeId) {
            return {
              ...s,
              x: Math.round(dragStartPos.current!.shapeX + dx),
              y: Math.round(dragStartPos.current!.shapeY + dy)
            };
          }
          return s;
        }));
        onDragSelectionMove?.(dx, dy);
      }

      // 2. Resizing shape from any of the 4 corners
      if (resizingState && resizeStartPos.current) {
        const { clientX: startX, clientY: startY, shapeX, shapeY, w: startW, h: startH, corner } = resizeStartPos.current;
        const dx = (e.clientX - startX) / zoom;
        const dy = (e.clientY - startY) / zoom;

        setShapes(prev => prev.map(s => {
          if (s.id === resizingState.shapeId) {
            let newX = shapeX;
            let newY = shapeY;
            let newW = startW;
            let newH = startH;

            const minW = s.type === 'circle' ? 50 : 60;
            const minH = s.type === 'circle' ? 50 : 40;

            if (corner === 'se') {
              newW = Math.max(minW, Math.round(startW + dx));
              newH = Math.max(minH, Math.round(startH + dy));
            } else if (corner === 'sw') {
              newW = Math.max(minW, Math.round(startW - dx));
              newH = Math.max(minH, Math.round(startH + dy));
              newX = Math.round(shapeX + (startW - newW));
            } else if (corner === 'ne') {
              newW = Math.max(minW, Math.round(startW + dx));
              newH = Math.max(minH, Math.round(startH - dy));
              newY = Math.round(shapeY + (startH - newH));
            } else if (corner === 'nw') {
              newW = Math.max(minW, Math.round(startW - dx));
              newH = Math.max(minH, Math.round(startH - dy));
              newX = Math.round(shapeX + (startW - newW));
              newY = Math.round(shapeY + (startH - newH));
            }

            if (s.type === 'circle') {
              const maxDim = Math.max(newW, newH);
              newW = maxDim;
              newH = maxDim;
            }

            return {
              ...s,
              x: newX,
              y: newY,
              width: newW,
              height: newH
            };
          }
          return s;
        }));
      }

      // 3. Drawing connector
      if (connectingState) {
        const worldX = (e.clientX - pan.x) / zoom;
        const worldY = (e.clientY - pan.y) / zoom;
        setConnectingState(prev => prev ? { ...prev, currentWorldPos: { x: worldX, y: worldY } } : null);
      }
    };

    const handleWindowPointerUp = () => {
      if (draggingShapeId) {
        setDraggingShapeId(null);
        dragStartPos.current = null;
        onDragSelectionEnd?.();
      }

      if (resizingState) {
        setResizingState(null);
        resizeStartPos.current = null;
      }

      // Finalize connector if dropped onto target anchor
      if (connectingState) {
        if (hoverAnchor && hoverAnchor.shapeId !== connectingState.fromShapeId) {
          const newConnector: ConnectorNode = {
            id: uuidv4(),
            fromShapeId: connectingState.fromShapeId,
            fromAnchor: connectingState.fromAnchor,
            toShapeId: hoverAnchor.shapeId,
            toAnchor: hoverAnchor.anchor,
            routing: defaultRouting, // Curved Bezier by default!
            arrowEnd: 'arrow',
            strokeColor: '#3b82f6',
            strokeWidth: 2,
            strokeStyle: 'solid'
          };
          setConnectors(prev => [...prev, newConnector]);
          setSelectedConnectorId(newConnector.id);
          toast.success("Connector created!", { duration: 1200 });
        }
        setConnectingState(null);
        setHoverAnchor(null);
      }
    };

    window.addEventListener("pointermove", handleWindowPointerMove);
    window.addEventListener("pointerup", handleWindowPointerUp);

    return () => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handleWindowPointerUp);
    };
  }, [
    draggingShapeId, 
    resizingState, 
    connectingState, 
    hoverAnchor, 
    zoom, 
    pan, 
    defaultRouting, 
    setShapes, 
    setConnectors, 
    setSelectedConnectorId, 
    onDragSelectionMove, 
    onDragSelectionEnd
  ]);

  // Keyboard Shortcuts (Delete / Backspace / Escape)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput = activeEl && (
        activeEl.tagName === 'INPUT' || 
        activeEl.tagName === 'TEXTAREA' || 
        (activeEl as HTMLElement).isContentEditable
      );
      if (isInput) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedShapeId) {
          e.preventDefault();
          setShapes(prev => prev.filter(s => s.id !== selectedShapeId));
          setConnectors(prev => prev.filter(c => c.fromShapeId !== selectedShapeId && c.toShapeId !== selectedShapeId));
          setSelectedShapeId(null);
          toast.success("Shape deleted");
        } else if (selectedConnectorId) {
          e.preventDefault();
          setConnectors(prev => prev.filter(c => c.id !== selectedConnectorId));
          setSelectedConnectorId(null);
          toast.success("Connector deleted");
        }
      } else if (e.key === "Escape") {
        setSelectedShapeId(null);
        setSelectedConnectorId(null);
        setEditingShapeId(null);
        setEditingConnectorId(null);
        setConnectingState(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedShapeId, selectedConnectorId, setShapes, setConnectors, setSelectedShapeId, setSelectedConnectorId]);

  // Miro/FigJam Quick Add sibling shape in direction
  const handleQuickAdd = (sourceShape: ShapeNode, direction: AnchorPosition) => {
    const spacing = 100;
    let nextX = sourceShape.x;
    let nextY = sourceShape.y;
    let sourceAnchor: AnchorPosition = direction;
    let targetAnchor: AnchorPosition = 'left';

    switch (direction) {
      case 'right':
        nextX = sourceShape.x + sourceShape.width + spacing;
        sourceAnchor = 'right';
        targetAnchor = 'left';
        break;
      case 'bottom':
        nextY = sourceShape.y + sourceShape.height + spacing;
        sourceAnchor = 'bottom';
        targetAnchor = 'top';
        break;
      case 'left':
        nextX = sourceShape.x - sourceShape.width - spacing;
        sourceAnchor = 'left';
        targetAnchor = 'right';
        break;
      case 'top':
        nextY = sourceShape.y - sourceShape.height - spacing;
        sourceAnchor = 'top';
        targetAnchor = 'bottom';
        break;
    }

    const { stroke, fill } = getShapeColors(sourceShape);
    const newShapeId = uuidv4();
    const newShape: ShapeNode = {
      id: newShapeId,
      type: sourceShape.type,
      x: Math.round(nextX),
      y: Math.round(nextY),
      width: sourceShape.width,
      height: sourceShape.height,
      text: "",
      fillColor: fill,
      strokeColor: stroke,
      strokeWidth: sourceShape.strokeWidth || 2,
      strokeStyle: sourceShape.strokeStyle || 'solid',
      fontSize: sourceShape.fontSize || 14,
      textColor: sourceShape.textColor
    };

    const newConnector: ConnectorNode = {
      id: uuidv4(),
      fromShapeId: sourceShape.id,
      fromAnchor: sourceAnchor,
      toShapeId: newShapeId,
      toAnchor: targetAnchor,
      routing: defaultRouting, // Curved Bezier default!
      arrowEnd: 'arrow',
      strokeColor: '#3b82f6',
      strokeWidth: 2,
      strokeStyle: 'solid'
    };

    setShapes(prev => [...prev, newShape]);
    setConnectors(prev => [...prev, newConnector]);
    setSelectedShapeId(newShapeId);
    setEditingShapeId(newShapeId);
  };

  // Selected shape reference
  const selectedShape = useMemo(() => {
    return shapes.find(s => s.id === selectedShapeId) || null;
  }, [shapes, selectedShapeId]);

  // Selected connector reference
  const selectedConnector = useMemo(() => {
    return connectors.find(c => c.id === selectedConnectorId) || null;
  }, [connectors, selectedConnectorId]);

  // Render SVG Path/Geometry for Shape types
  const renderShapeGeometry = (shape: ShapeNode) => {
    const w = shape.width;
    const h = shape.height;
    const { stroke, fill } = getShapeColors(shape);
    const strokeWidth = shape.strokeWidth || 2;
    const strokeDash = shape.strokeStyle === 'dashed' ? '5,5' : undefined;

    switch (shape.type) {
      case 'rounded':
        return (
          <rect
            x={0}
            y={0}
            width={w}
            height={h}
            rx={Math.min(w, h) / 2}
            ry={Math.min(w, h) / 2}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeDasharray={strokeDash}
            className="transition-colors"
          />
        );
      case 'diamond': {
        const points = `${w / 2},0 ${w},${h / 2} ${w / 2},${h} 0,${h / 2}`;
        return (
          <polygon
            points={points}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeDasharray={strokeDash}
            className="transition-colors"
          />
        );
      }
      case 'circle':
        return (
          <ellipse
            cx={w / 2}
            cy={h / 2}
            rx={w / 2}
            ry={h / 2}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeDasharray={strokeDash}
            className="transition-colors"
          />
        );
      case 'parallelogram': {
        const offset = Math.min(24, w * 0.18);
        const points = `${offset},0 ${w},0 ${w - offset},${h} 0,${h}`;
        return (
          <polygon
            points={points}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeDasharray={strokeDash}
            className="transition-colors"
          />
        );
      }
      case 'cylinder': {
        const rx = w / 2;
        const ry = Math.min(16, h * 0.18);
        const topY = ry;
        const botY = h - ry;
        return (
          <g>
            <path
              d={`M 0 ${topY} A ${rx} ${ry} 0 0 0 ${w} ${topY} L ${w} ${botY} A ${rx} ${ry} 0 0 1 0 ${botY} Z`}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
              strokeDasharray={strokeDash}
            />
            <ellipse
              cx={rx}
              cy={topY}
              rx={rx}
              ry={ry}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
            />
          </g>
        );
      }
      case 'note': {
        const fold = 18;
        return (
          <g>
            <path
              d={`M 0 0 L ${w} 0 L ${w} ${h - fold} L ${w - fold} ${h} L 0 ${h} Z`}
              fill={fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
              strokeDasharray={strokeDash}
            />
            <polygon
              points={`${w - fold},${h} ${w - fold},${h - fold} ${w},${h - fold}`}
              fill="rgba(0,0,0,0.12)"
              stroke={stroke}
              strokeWidth={strokeWidth}
            />
          </g>
        );
      }
      case 'rectangle':
      default:
        return (
          <rect
            x={0}
            y={0}
            width={w}
            height={h}
            rx={8}
            ry={8}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeDasharray={strokeDash}
            className="transition-colors"
          />
        );
    }
  };

  return (
    <div className="absolute inset-0 pointer-events-none select-none" style={{ zIndex: 25 }}>
      {/* 1. SVG LAYER: CONNECTORS & ARROWHEADS */}
      <svg 
        className="absolute inset-0 w-full h-full pointer-events-none" 
        style={{ overflow: 'visible' }}
      >
        <defs>
          {/* Arrowhead End Marker */}
          <marker
            id="flowchart-arrowhead"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#3b82f6" />
          </marker>
          {/* Arrowhead Start Marker (Double arrow) */}
          <marker
            id="flowchart-arrowhead-start"
            viewBox="0 0 10 10"
            refX="1"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 9 1.5 L 0 5 L 9 8.5 z" fill="#3b82f6" />
          </marker>
          {/* Selection Halo Glow Filter */}
          <filter id="connector-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* Existing Connectors */}
          {connectors.map(connector => {
            const route = generateConnectorRoute(connector, shapes);
            if (!route) return null;

            const isSelected = selectedConnectorId === connector.id;
            const strokeColor = connector.strokeColor || "#3b82f6";
            const strokeWidth = connector.strokeWidth || 2;
            const hasArrowEnd = connector.arrowEnd !== 'none';
            const hasArrowStart = connector.arrowEnd === 'double-arrow';

            return (
              <g key={connector.id} className="group">
                {/* Thick invisible path for easy clicking / selecting */}
                <path
                  d={route.path}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={Math.max(16, 16 / zoom)}
                  style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedConnectorId(connector.id);
                    setSelectedShapeId(null);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setEditingConnectorId(connector.id);
                    setConnectorLabelDraft(connector.label || "");
                  }}
                />

                {/* Selection Halo */}
                {isSelected && (
                  <path
                    d={route.path}
                    fill="none"
                    stroke="#93c5fd"
                    strokeWidth={strokeWidth + 4}
                    strokeLinecap="round"
                    opacity={0.8}
                  />
                )}

                {/* Main Visible Connector Path */}
                <path
                  d={route.path}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  strokeDasharray={connector.strokeStyle === 'dashed' ? '5,5' : undefined}
                  markerEnd={hasArrowEnd ? "url(#flowchart-arrowhead)" : undefined}
                  markerStart={hasArrowStart ? "url(#flowchart-arrowhead-start)" : undefined}
                  className="transition-colors"
                />

                {/* Connector Text Label Badge */}
                {(connector.label || editingConnectorId === connector.id) && (
                  <foreignObject
                    x={route.midpoint.x - 60}
                    y={route.midpoint.y - 14}
                    width={120}
                    height={28}
                    style={{ pointerEvents: 'auto', overflow: 'visible' }}
                  >
                    {editingConnectorId === connector.id ? (
                      <div className="flex items-center justify-center">
                        <input
                          autoFocus
                          type="text"
                          value={connectorLabelDraft}
                          onChange={(e) => setConnectorLabelDraft(e.target.value)}
                          onBlur={() => {
                            setConnectors(prev => prev.map(c => c.id === connector.id ? { ...c, label: connectorLabelDraft.trim() || undefined } : c));
                            setEditingConnectorId(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              setConnectors(prev => prev.map(c => c.id === connector.id ? { ...c, label: connectorLabelDraft.trim() || undefined } : c));
                              setEditingConnectorId(null);
                            } else if (e.key === "Escape") {
                              setEditingConnectorId(null);
                            }
                          }}
                          placeholder="Label..."
                          className="px-2 py-0.5 text-xs text-center bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-full border border-blue-500 shadow-sm outline-none w-28"
                        />
                      </div>
                    ) : (
                      <div 
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedConnectorId(connector.id);
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          setEditingConnectorId(connector.id);
                          setConnectorLabelDraft(connector.label || "");
                        }}
                        className={`mx-auto w-max px-2.5 py-0.5 rounded-full text-xs font-medium cursor-pointer shadow-xs border transition-all ${
                          isSelected 
                            ? 'bg-blue-50 border-blue-400 text-blue-700 dark:bg-blue-950 dark:border-blue-600 dark:text-blue-300' 
                            : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:border-blue-400'
                        }`}
                      >
                        {connector.label}
                      </div>
                    )}
                  </foreignObject>
                )}
              </g>
            );
          })}

          {/* Active Connector In-Progress Line */}
          {connectingState && (
            <g>
              {(() => {
                const sourceShape = shapes.find(s => s.id === connectingState.fromShapeId);
                if (!sourceShape) return null;
                const startPt = getAnchorPoint(sourceShape, connectingState.fromAnchor);
                const endPt = connectingState.currentWorldPos;

                // Bezier preview
                const dx = endPt.x - startPt.x;
                const dy = endPt.y - startPt.y;
                const dist = Math.hypot(dx, dy);
                const curv = Math.max(30, dist * 0.4);

                let cp1 = { x: startPt.x, y: startPt.y };
                if (connectingState.fromAnchor === 'right') cp1.x += curv;
                if (connectingState.fromAnchor === 'left') cp1.x -= curv;
                if (connectingState.fromAnchor === 'bottom') cp1.y += curv;
                if (connectingState.fromAnchor === 'top') cp1.y -= curv;

                const pathD = `M ${startPt.x} ${startPt.y} Q ${cp1.x} ${cp1.y} ${endPt.x} ${endPt.y}`;

                return (
                  <path
                    d={pathD}
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    strokeDasharray="5,5"
                    markerEnd="url(#flowchart-arrowhead)"
                  />
                );
              })()}
            </g>
          )}
        </g>
      </svg>

      {/* 2. HTML SHAPES LAYER */}
      {shapes.map(shape => {
        const isSelected = selectedShapeId === shape.id;
        const isEditing = editingShapeId === shape.id;
        const anchors: AnchorPosition[] = ['top', 'right', 'bottom', 'left'];

        const autoFontSize = getAutoFontSize(shape.text || "", shape.width, shape.height, shape.type, shape.fontSize || 14);

        return (
          <div
            key={shape.id}
            className={`absolute group transition-shadow ${isSelected ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-transparent' : ''}`}
            style={{
              transform: `translate(${shape.x * zoom + pan.x}px, ${shape.y * zoom + pan.y}px)`,
              width: shape.width * zoom,
              height: shape.height * zoom,
              pointerEvents: 'auto',
              cursor: tool === "home" ? (draggingShapeId === shape.id ? 'grabbing' : 'grab') : 'default'
            }}
            onPointerDown={(e) => handleShapePointerDown(e, shape)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              setEditingShapeId(shape.id);
            }}
          >
            {/* SVG Background Geometry */}
            <svg 
              width={shape.width * zoom} 
              height={shape.height * zoom} 
              viewBox={`0 0 ${shape.width} ${shape.height}`}
              className="absolute inset-0 pointer-events-none drop-shadow-xs"
            >
              {renderShapeGeometry(shape)}
            </svg>

            {/* Inner Content / Label Container */}
            <div 
              className="absolute inset-0 flex items-center justify-center p-2.5 overflow-hidden pointer-events-none"
              style={{
                textAlign: shape.textAlign || 'center',
                color: shape.textColor || 'inherit',
              }}
            >
              {isEditing ? (
                <textarea
                  autoFocus
                  defaultValue={shape.text || ""}
                  onBlur={(e) => {
                    const text = e.target.value;
                    setShapes(prev => prev.map(s => s.id === shape.id ? { ...s, text } : s));
                    setEditingShapeId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      const text = (e.target as HTMLTextAreaElement).value;
                      setShapes(prev => prev.map(s => s.id === shape.id ? { ...s, text } : s));
                      setEditingShapeId(null);
                    } else if (e.key === "Escape") {
                      setEditingShapeId(null);
                    }
                  }}
                  className="w-full h-full bg-transparent resize-none border-none outline-none font-semibold text-center focus:ring-0 text-zinc-900 dark:text-zinc-50 pointer-events-auto leading-snug"
                  style={{
                    fontSize: `${autoFontSize * zoom}px`,
                    textAlign: shape.textAlign || 'center'
                  }}
                />
              ) : (
                <span 
                  className="font-semibold text-zinc-900 dark:text-zinc-50 select-none break-words leading-snug max-w-full text-center"
                  style={{
                    fontSize: `${autoFontSize * zoom}px`,
                    textAlign: shape.textAlign || 'center'
                  }}
                >
                  {shape.text || (isSelected ? "Double-click to type" : "")}
                </span>
              )}
            </div>

            {/* Magnetic Snap Anchor Dots (shown when connecting, or when unselected on hover) */}
            {(!isSelected || connectingState) && anchors.map(anchor => {
              let posClasses = "";
              switch (anchor) {
                case 'top': posClasses = "top-0 left-1/2 -translate-x-1/2 -translate-y-1/2"; break;
                case 'right': posClasses = "top-1/2 right-0 translate-x-1/2 -translate-y-1/2"; break;
                case 'bottom': posClasses = "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2"; break;
                case 'left': posClasses = "top-1/2 left-0 -translate-x-1/2 -translate-y-1/2"; break;
              }

              const isAnchorHovered = hoverAnchor?.shapeId === shape.id && hoverAnchor?.anchor === anchor;

              return (
                <div
                  key={anchor}
                  className={`absolute ${posClasses} z-40 transition-all ${
                    connectingState ? 'opacity-100 scale-100' : 'opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100'
                  }`}
                  style={{ pointerEvents: 'auto' }}
                  onPointerDown={(e) => handleAnchorPointerDown(e, shape.id, anchor)}
                  onPointerEnter={() => {
                    if (connectingState && connectingState.fromShapeId !== shape.id) {
                      setHoverAnchor({ shapeId: shape.id, anchor });
                    }
                  }}
                  onPointerLeave={() => {
                    if (hoverAnchor?.shapeId === shape.id && hoverAnchor?.anchor === anchor) {
                      setHoverAnchor(null);
                    }
                  }}
                  title={`Connect from ${anchor}`}
                >
                  <div className={`w-3.5 h-3.5 rounded-full border-2 border-white dark:border-zinc-900 shadow-sm cursor-crosshair transition-transform ${
                    isAnchorHovered 
                      ? 'bg-blue-500 scale-125 ring-4 ring-blue-400/40' 
                      : 'bg-zinc-400 hover:bg-blue-500 hover:scale-125'
                  }`} />
                </div>
              );
            })}

            {/* Quick Add directional '+' buttons when selected */}
            {isSelected && !connectingState && (
              <>
                {/* Right + */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleQuickAdd(shape, 'right'); }}
                  className="absolute right-0 top-1/2 translate-x-7 -translate-y-1/2 w-6 h-6 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-md flex items-center justify-center transition-transform hover:scale-110 pointer-events-auto z-40"
                  title="Add next step (Right)"
                >
                  <Plus size={14} />
                </button>
                {/* Bottom + */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleQuickAdd(shape, 'bottom'); }}
                  className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-7 w-6 h-6 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-md flex items-center justify-center transition-transform hover:scale-110 pointer-events-auto z-40"
                  title="Add next step (Bottom)"
                >
                  <Plus size={14} />
                </button>
                {/* Left + */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleQuickAdd(shape, 'left'); }}
                  className="absolute left-0 top-1/2 -translate-x-7 -translate-y-1/2 w-6 h-6 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-md flex items-center justify-center transition-transform hover:scale-110 pointer-events-auto z-40"
                  title="Add step (Left)"
                >
                  <Plus size={14} />
                </button>
                {/* Top + */}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleQuickAdd(shape, 'top'); }}
                  className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-7 w-6 h-6 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-md flex items-center justify-center transition-transform hover:scale-110 pointer-events-auto z-40"
                  title="Add step (Top)"
                >
                  <Plus size={14} />
                </button>
              </>
            )}

            {/* 4 Corner Resize Handles */}
            {isSelected && !connectingState && (
              <>
                {/* Top-Left */}
                <div
                  className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white dark:bg-zinc-800 border-2 border-blue-500 rounded-xs shadow-xs cursor-nwse-resize z-40 hover:scale-125 transition-transform"
                  style={{ pointerEvents: 'auto' }}
                  onPointerDown={(e) => handleResizePointerDown(e, shape, 'nw')}
                  title="Resize (NW)"
                />
                {/* Top-Right */}
                <div
                  className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white dark:bg-zinc-800 border-2 border-blue-500 rounded-xs shadow-xs cursor-nesw-resize z-40 hover:scale-125 transition-transform"
                  style={{ pointerEvents: 'auto' }}
                  onPointerDown={(e) => handleResizePointerDown(e, shape, 'ne')}
                  title="Resize (NE)"
                />
                {/* Bottom-Right */}
                <div
                  className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white dark:bg-zinc-800 border-2 border-blue-500 rounded-xs shadow-xs cursor-nwse-resize z-40 hover:scale-125 transition-transform"
                  style={{ pointerEvents: 'auto' }}
                  onPointerDown={(e) => handleResizePointerDown(e, shape, 'se')}
                  title="Resize (SE)"
                />
                {/* Bottom-Left */}
                <div
                  className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white dark:bg-zinc-800 border-2 border-blue-500 rounded-xs shadow-xs cursor-nesw-resize z-40 hover:scale-125 transition-transform"
                  style={{ pointerEvents: 'auto' }}
                  onPointerDown={(e) => handleResizePointerDown(e, shape, 'sw')}
                  title="Resize (SW)"
                />
              </>
            )}
          </div>
        );
      })}

      {/* 3. FLOATING TOOLBAR FOR SELECTED SHAPE */}
      {selectedShape && (
        <div 
          className="absolute z-50 pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-zinc-800 rounded-xl shadow-xl border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200"
          style={{
            transform: `translate(${selectedShape.x * zoom + pan.x}px, ${Math.max(10, (selectedShape.y - 50) * zoom + pan.y)}px)`,
            transformOrigin: '0 0'
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* Shape Type Selector */}
          <div className="flex items-center gap-1 pr-1.5 border-r border-zinc-200 dark:border-zinc-700">
            {[
              { type: 'rectangle', icon: <Square size={13} />, label: 'Process' },
              { type: 'rounded', icon: <div className="w-3.5 h-2 rounded-full border border-current" />, label: 'Start/End' },
              { type: 'diamond', icon: <Diamond size={13} />, label: 'Decision' },
              { type: 'circle', icon: <CircleIcon size={13} />, label: 'Event' },
              { type: 'cylinder', icon: <Database size={13} />, label: 'Database' },
              { type: 'note', icon: <StickyNote size={13} />, label: 'Note' }
            ].map(item => (
              <button
                key={item.type}
                onClick={() => {
                  setShapes(prev => prev.map(s => s.id === selectedShape.id ? { ...s, type: item.type as FlowchartShapeType } : s));
                }}
                className={`p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors ${selectedShape.type === item.type ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/30' : ''}`}
                title={item.label}
              >
                {item.icon}
              </button>
            ))}
          </div>

          {/* Color Palette Swatches */}
          <div className="flex items-center gap-1 pr-1.5 border-r border-zinc-200 dark:border-zinc-700">
            {SHAPE_PALETTE.map(item => (
              <button
                key={item.name}
                onClick={() => {
                  setShapes(prev => prev.map(s => s.id === selectedShape.id ? { 
                    ...s, 
                    fillColor: item.fill,
                    strokeColor: item.stroke
                  } : s));
                }}
                className="w-4 h-4 rounded-full border-2 border-white dark:border-zinc-800 shadow-xs hover:scale-125 transition-transform"
                style={{ backgroundColor: item.preview }}
                title={item.name}
              />
            ))}
          </div>

          {/* Font Size & Align */}
          <div className="flex items-center gap-1 pr-1.5 border-r border-zinc-200 dark:border-zinc-700">
            <button
              onClick={() => {
                const sizes = [12, 14, 16, 20];
                const currentIdx = sizes.indexOf(selectedShape.fontSize || 14);
                const nextSize = sizes[(currentIdx + 1) % sizes.length];
                setShapes(prev => prev.map(s => s.id === selectedShape.id ? { ...s, fontSize: nextSize } : s));
              }}
              className="px-1.5 py-1 text-xs font-semibold rounded hover:bg-zinc-100 dark:hover:bg-zinc-700"
              title="Font Size"
            >
              {selectedShape.fontSize || 14}px
            </button>
            <button
              onClick={() => {
                const aligns: ('left' | 'center' | 'right')[] = ['left', 'center', 'right'];
                const curIdx = aligns.indexOf(selectedShape.textAlign || 'center');
                const nextAlign = aligns[(curIdx + 1) % aligns.length];
                setShapes(prev => prev.map(s => s.id === selectedShape.id ? { ...s, textAlign: nextAlign } : s));
              }}
              className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700"
              title="Text Alignment"
            >
              {selectedShape.textAlign === 'left' ? <AlignLeft size={13} /> : selectedShape.textAlign === 'right' ? <AlignRight size={13} /> : <AlignCenter size={13} />}
            </button>
          </div>

          {/* Duplicate Button */}
          <button
            onClick={() => {
              const newShape: ShapeNode = {
                ...selectedShape,
                id: uuidv4(),
                x: selectedShape.x + 30,
                y: selectedShape.y + 30
              };
              setShapes(prev => [...prev, newShape]);
              setSelectedShapeId(newShape.id);
            }}
            className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300"
            title="Duplicate Shape"
          >
            <Copy size={13} />
          </button>

          {/* Delete Button */}
          <button
            onClick={() => {
              setShapes(prev => prev.filter(s => s.id !== selectedShape.id));
              setConnectors(prev => prev.filter(c => c.fromShapeId !== selectedShape.id && c.toShapeId !== selectedShape.id));
              setSelectedShapeId(null);
            }}
            className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 transition-colors"
            title="Delete Shape"
          >
            <Trash2 size={13} />
          </button>
        </div>
      )}

      {/* 4. FLOATING TOOLBAR FOR SELECTED CONNECTOR */}
      {selectedConnector && (
        <div 
          className="absolute z-50 pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-zinc-800 rounded-xl shadow-xl border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200"
          style={{
            top: 60,
            left: '50%',
            transform: 'translateX(-50%)'
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* Routing Style: Curved Bezier (default), Orthogonal, Straight */}
          <div className="flex items-center gap-1 pr-1.5 border-r border-zinc-200 dark:border-zinc-700">
            <button
              onClick={() => {
                setConnectors(prev => prev.map(c => c.id === selectedConnector.id ? { ...c, routing: 'curved' } : c));
              }}
              className={`px-2 py-1 text-xs font-medium rounded hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors ${selectedConnector.routing === 'curved' || !selectedConnector.routing ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300' : ''}`}
              title="Curved Bezier"
            >
              Curved
            </button>
            <button
              onClick={() => {
                setConnectors(prev => prev.map(c => c.id === selectedConnector.id ? { ...c, routing: 'orthogonal' } : c));
              }}
              className={`px-2 py-1 text-xs font-medium rounded hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors ${selectedConnector.routing === 'orthogonal' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300' : ''}`}
              title="Orthogonal Elbow"
            >
              Elbow
            </button>
            <button
              onClick={() => {
                setConnectors(prev => prev.map(c => c.id === selectedConnector.id ? { ...c, routing: 'straight' } : c));
              }}
              className={`px-2 py-1 text-xs font-medium rounded hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors ${selectedConnector.routing === 'straight' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300' : ''}`}
              title="Straight Line"
            >
              Straight
            </button>
          </div>

          {/* Stroke Style: Solid / Dashed */}
          <div className="flex items-center gap-1 pr-1.5 border-r border-zinc-200 dark:border-zinc-700">
            <button
              onClick={() => {
                const nextStyle = selectedConnector.strokeStyle === 'dashed' ? 'solid' : 'dashed';
                setConnectors(prev => prev.map(c => c.id === selectedConnector.id ? { ...c, strokeStyle: nextStyle } : c));
              }}
              className={`px-2 py-1 text-xs font-medium rounded hover:bg-zinc-100 dark:hover:bg-zinc-700 ${selectedConnector.strokeStyle === 'dashed' ? 'text-blue-600' : ''}`}
            >
              {selectedConnector.strokeStyle === 'dashed' ? 'Dashed' : 'Solid'}
            </button>
          </div>

          {/* Arrowhead Type: Single / Double / None */}
          <div className="flex items-center gap-1 pr-1.5 border-r border-zinc-200 dark:border-zinc-700">
            <button
              onClick={() => {
                const modes: ConnectorEnd[] = ['arrow', 'double-arrow', 'none'];
                const curIdx = modes.indexOf(selectedConnector.arrowEnd || 'arrow');
                const nextEnd = modes[(curIdx + 1) % modes.length];
                setConnectors(prev => prev.map(c => c.id === selectedConnector.id ? { ...c, arrowEnd: nextEnd } : c));
              }}
              className="px-2 py-1 text-xs font-medium rounded hover:bg-zinc-100 dark:hover:bg-zinc-700"
              title="Arrowhead Style"
            >
              {selectedConnector.arrowEnd === 'double-arrow' ? 'Double' : selectedConnector.arrowEnd === 'none' ? 'None' : 'Arrow'}
            </button>
          </div>

          {/* Add / Edit Label Button */}
          <button
            onClick={() => {
              setEditingConnectorId(selectedConnector.id);
              setConnectorLabelDraft(selectedConnector.label || "");
            }}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded hover:bg-zinc-100 dark:hover:bg-zinc-700"
            title="Edit Label (e.g. Yes / No)"
          >
            <Type size={12} />
            <span>Label</span>
          </button>

          {/* Delete Connector */}
          <button
            onClick={() => {
              setConnectors(prev => prev.filter(c => c.id !== selectedConnector.id));
              setSelectedConnectorId(null);
            }}
            className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 transition-colors"
            title="Delete Connector"
          >
            <Trash2 size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
