"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { Stage, Layer, Path, Transformer } from "react-konva";
import { getStroke } from "perfect-freehand";
import { v4 as uuidv4 } from "uuid";
import type { Stroke, ToolType } from "./CustomCanvas";

// Utility to convert perfect-freehand points to an SVG path string
function getSvgPathFromStroke(stroke: number[][]) {
  if (!stroke.length) return "";
  const d = stroke.reduce(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length];
      acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
      return acc;
    },
    ["M", ...stroke[0], "Q"]
  );
  d.push("Z");
  return d.join(" ");
}

interface SpatialCanvasProps {
  strokes: Stroke[];
  setStrokes: React.Dispatch<React.SetStateAction<Stroke[]>>;
  pan: { x: number; y: number };
  setPan: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  tool: ToolType;
  activeColor: string;
  activeSize: number;
  activePresetType?: 'pen' | 'highlighter';
  eraserType?: 'stroke' | 'point';
  eraserSize?: number;
  selectedIds?: string[];
  setSelectedIds?: React.Dispatch<React.SetStateAction<string[]>>;
  onCanvasClick?: (x: number, y: number) => void;
  onDragSelectionStart?: () => void;
  onDragSelectionMove?: (deltaX: number, deltaY: number) => void;
  onDragSelectionEnd?: () => void;
  onLassoComplete?: (minX: number, maxX: number, minY: number, maxY: number, path: number[][]) => void;
  annotateBlockId?: string | null;
  blockOffsetMap?: Record<string, {x: number, y: number}>;
}

export function SpatialCanvas({ 
  strokes, setStrokes, 
  pan, setPan, 
  zoom, setZoom, 
  tool, activeColor, activeSize, activePresetType, eraserType, eraserSize = 10,
  selectedIds = [], setSelectedIds,
  onCanvasClick, onLassoComplete,
  onDragSelectionStart, onDragSelectionMove, onDragSelectionEnd,
  annotateBlockId, blockOffsetMap
}: SpatialCanvasProps) {
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
  const [lassoPath, setLassoPath] = useState<number[][]>([]);

  const stageRef = useRef<any>(null);
  const transformerRef = useRef<any>(null);
  const selectedNodeRef = useRef<any>(null);

  useEffect(() => {
    if (selectedIds.length > 0 && transformerRef.current && stageRef.current) {
      const selectedNodes = selectedIds
        .map(id => stageRef.current.findOne('#' + id))
        .filter(Boolean);
      transformerRef.current.nodes(selectedNodes);
      transformerRef.current.getLayer()?.batchDraw();
    } else if (transformerRef.current) {
      transformerRef.current.nodes([]);
    }
  }, [selectedIds, strokes]);

  const getPointerPos = (e?: any) => {
    const stage = stageRef.current;
    if (!stage) return { x: 0, y: 0, pressure: 0.5 };
    
    let pointer = stage.getPointerPosition();
    
    // Fallback if Konva's pointer is null (happens sometimes on synthetic events like dblclick)
    if (!pointer) {
      if (e && e.evt) {
        // Try to get from raw event
        const rect = stage.container().getBoundingClientRect();
        pointer = {
          x: e.evt.clientX - rect.left,
          y: e.evt.clientY - rect.top
        };
      } else {
        return { x: 0, y: 0, pressure: 0.5 };
      }
    }
    
    return {
      x: (pointer.x - pan.x) / zoom,
      y: (pointer.y - pan.y) / zoom,
      pressure: 0.5 // Default pressure since Konva doesn't provide it natively easily
    };
  };

  const eraseStrokesAtPoint = (x: number, y: number, radius: number) => {
    setStrokes(prev => prev.filter(stroke => {
      for (const p of stroke.points) {
        const dx = p[0] - x;
        const dy = p[1] - y;
        if (Math.sqrt(dx*dx + dy*dy) <= radius + (stroke.size/2)) {
          return false; // Erase this stroke
        }
      }
      return true; // Keep
    }));
  };

  // Multi-touch gesture tracking for 2-finger pan and pinch-to-zoom
  const touchStateRef = useRef<{
    lastCenter: { x: number; y: number } | null;
    lastDist: number | null;
    isPinching: boolean;
  }>({
    lastCenter: null,
    lastDist: null,
    isPinching: false,
  });

  const handleTouchStart = (e: any) => {
    if (e.evt.touches && e.evt.touches.length >= 2) {
      // Abort single-finger stroke immediately when a second finger touches
      setIsDrawing(false);
      setCurrentStroke(null);

      const t1 = e.evt.touches[0];
      const t2 = e.evt.touches[1];
      const center = {
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2,
      };
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      touchStateRef.current = {
        lastCenter: center,
        lastDist: dist,
        isPinching: true,
      };
    }
  };

  const handleTouchMove = (e: any) => {
    if (e.evt.touches && e.evt.touches.length >= 2) {
      e.evt.preventDefault();

      const t1 = e.evt.touches[0];
      const t2 = e.evt.touches[1];
      const newCenter = {
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2,
      };
      const newDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);

      const { lastCenter, lastDist } = touchStateRef.current;
      if (lastCenter && lastDist && lastDist > 0) {
        const deltaX = newCenter.x - lastCenter.x;
        const deltaY = newCenter.y - lastCenter.y;
        const scaleFactor = newDist / lastDist;

        const oldScale = zoom;
        let newScale = oldScale;

        // Smooth pinch-zoom when distance changes significantly
        if (Math.abs(newDist - lastDist) > 1.5) {
          newScale = Math.max(0.1, Math.min(oldScale * scaleFactor, 5));
        }

        const pointTo = {
          x: (newCenter.x - pan.x) / oldScale,
          y: (newCenter.y - pan.y) / oldScale,
        };

        setZoom(newScale);
        setPan({
          x: newCenter.x - pointTo.x * newScale + deltaX,
          y: newCenter.y - pointTo.y * newScale + deltaY,
        });

        touchStateRef.current = {
          lastCenter: newCenter,
          lastDist: newDist,
          isPinching: true,
        };
      } else {
        touchStateRef.current = {
          lastCenter: newCenter,
          lastDist: newDist,
          isPinching: true,
        };
      }
    }
  };

  const handleTouchEnd = (e: any) => {
    if (!e.evt.touches || e.evt.touches.length < 2) {
      touchStateRef.current = {
        lastCenter: null,
        lastDist: null,
        isPinching: false,
      };
    }
  };

  const handlePointerDown = (e: any) => {
    if (e.evt.button === 1 || tool === "pan") {
      // Middle click or pan tool
      return;
    }

    if (touchStateRef.current.isPinching || (e.evt.touches && e.evt.touches.length >= 2)) {
      return;
    }
    
    if (tool === "home") {
      // If we clicked on empty space, deselect
      if (e.target === stageRef.current) {
        setSelectedIds?.([]);
      }
      return;
    }
    
    if (setSelectedIds) setSelectedIds([]);
    setIsDrawing(true);
    const rawPos = getPointerPos(e);
    
    const offsetX = annotateBlockId && blockOffsetMap && blockOffsetMap[annotateBlockId] ? blockOffsetMap[annotateBlockId].x : 0;
    const offsetY = annotateBlockId && blockOffsetMap && blockOffsetMap[annotateBlockId] ? blockOffsetMap[annotateBlockId].y : 0;
    const pos = { x: rawPos.x - offsetX, y: rawPos.y - offsetY, pressure: rawPos.pressure };
    
    if (tool === "lasso") {
      setLassoPath([[rawPos.x, rawPos.y]]);
      return;
    }

    if (tool === "eraser") {
      if (eraserType === 'stroke') {
        eraseStrokesAtPoint(pos.x, pos.y, 10);
      } else {
        setCurrentStroke({
          id: uuidv4(),
          points: [[pos.x, pos.y, pos.pressure]],
          color: "white", // Or match background if dark mode
          size: eraserSize,
          type: 'eraser'
        });
      }
      return;
    }

    setCurrentStroke({
      id: uuidv4(),
      points: [[pos.x, pos.y, pos.pressure]],
      color: activeColor,
      size: activeSize,
      type: activePresetType,
      blockId: annotateBlockId || undefined
    });
  };

  const handlePointerMove = (e: any) => {
    if (!isDrawing || touchStateRef.current.isPinching || (e.evt.touches && e.evt.touches.length >= 2)) return;
    const rawPos = getPointerPos(e);
    
    const offsetX = annotateBlockId && blockOffsetMap && blockOffsetMap[annotateBlockId] ? blockOffsetMap[annotateBlockId].x : 0;
    const offsetY = annotateBlockId && blockOffsetMap && blockOffsetMap[annotateBlockId] ? blockOffsetMap[annotateBlockId].y : 0;
    const pos = { x: rawPos.x - offsetX, y: rawPos.y - offsetY, pressure: rawPos.pressure };

    if (tool === 'lasso') {
      setLassoPath(prev => [...prev, [rawPos.x, rawPos.y]]);
      return;
    }

    if (tool === 'eraser' && eraserType === 'stroke') {
      eraseStrokesAtPoint(rawPos.x, rawPos.y, eraserSize);
      return;
    }

    if (!currentStroke) return;
    
    setCurrentStroke(prev => {
      if (!prev) return null;
      return {
        ...prev,
        points: [...prev.points, [pos.x, pos.y, pos.pressure]]
      };
    });
  };

  const handlePointerUp = () => {
    if (isDrawing) {
      if (tool === 'lasso') {
        if (lassoPath.length > 2) {
          let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
          for (const p of lassoPath) {
            if (p[0] < minX) minX = p[0];
            if (p[0] > maxX) maxX = p[0];
            if (p[1] < minY) minY = p[1];
            if (p[1] > maxY) maxY = p[1];
          }
          
          onLassoComplete?.(minX, maxX, minY, maxY, lassoPath);
        }
        setLassoPath([]);
      } else if (currentStroke) {
        setStrokes(prev => [...prev, currentStroke]);
      }
    }
    setIsDrawing(false);
    setCurrentStroke(null);
  };

  // Handle Zoom & Pan via Trackpad / Mouse Wheel
  const handleWheel = (e: any) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;

    // Trackpad Pinch-to-Zoom (or Ctrl/Meta + Mouse Wheel)
    if (e.evt.ctrlKey || e.evt.metaKey) {
      const oldScale = zoom;
      const pointer = stage.getPointerPosition() || {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      };

      const mousePointTo = {
        x: (pointer.x - pan.x) / oldScale,
        y: (pointer.y - pan.y) / oldScale,
      };

      // Smooth zoom factor for trackpad pinch
      const factor = Math.exp(-e.evt.deltaY * 0.01);
      let newScale = Math.max(0.1, Math.min(oldScale * factor, 5));

      setZoom(newScale);
      setPan({
        x: pointer.x - mousePointTo.x * newScale,
        y: pointer.y - mousePointTo.y * newScale,
      });
    } else {
      // Two-finger Trackpad Pan / Mouse Wheel Scroll (Pans the canvas)
      const dx = e.evt.shiftKey ? e.evt.deltaY : e.evt.deltaX;
      const dy = e.evt.shiftKey ? 0 : e.evt.deltaY;

      setPan(prev => ({
        x: prev.x - dx,
        y: prev.y - dy,
      }));
    }
  };

  return (
    <div className={`absolute inset-0 touch-none ${tool === 'pen' ? 'cursor-crosshair' : tool === 'home' ? 'cursor-text' : tool === 'pan' ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}>
      <Stage
        width={typeof window !== 'undefined' ? window.innerWidth : 1000}
        height={typeof window !== 'undefined' ? window.innerHeight : 800}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={(e) => {
          if (tool === 'home' && e.target === stageRef.current) {
            const pos = getPointerPos(e);
            onCanvasClick?.(pos.x, pos.y);
          }
        }}
        onWheel={handleWheel}
        draggable={tool === 'pan' || tool === 'home'}
        onDragStart={() => {
          if (tool === 'pan' || tool === 'home') {
            document.body.style.cursor = 'grabbing';
          }
        }}
        onDragMove={(e) => {
          if (e.target === stageRef.current) {
            setPan({ x: e.target.x(), y: e.target.y() });
          }
        }}
        onDragEnd={(e) => {
          if (tool === 'pan' || tool === 'home') {
            document.body.style.cursor = tool === 'pan' ? 'grab' : 'text';
          }
          if (e.target === stageRef.current) {
            setPan({ x: e.target.x(), y: e.target.y() });
          }
        }}
        x={pan.x}
        y={pan.y}
        ref={stageRef}
      >
        <Layer scaleX={zoom} scaleY={zoom}>
          {strokes.map((stroke) => {
            const strokeData = getStroke(stroke.points, {
              size: stroke.size,
              thinning: 0.5,
              smoothing: 0.5,
              streamline: 0.5,
            });
            const pathData = getSvgPathFromStroke(strokeData);
            const offsetX = stroke.blockId && blockOffsetMap && blockOffsetMap[stroke.blockId] ? blockOffsetMap[stroke.blockId].x : 0;
            const offsetY = stroke.blockId && blockOffsetMap && blockOffsetMap[stroke.blockId] ? blockOffsetMap[stroke.blockId].y : 0;
            const isFirstSelected = selectedIds.length > 0 && stroke.id === selectedIds.find(id => strokes.some(s => s.id === id));
            return (
              <Path
                key={stroke.id}
                id={stroke.id}
                ref={isFirstSelected ? selectedNodeRef : undefined}
                data={pathData}
                fill={stroke.type === 'eraser' ? 'white' : stroke.color}
                opacity={stroke.type === 'highlighter' ? 0.4 : 1}
                globalCompositeOperation={stroke.type === 'eraser' ? 'destination-out' : stroke.type === 'highlighter' ? 'multiply' : 'source-over'}
                x={(stroke.x || 0) + offsetX}
                y={(stroke.y || 0) + offsetY}
                scaleX={stroke.scaleX || 1}
                scaleY={stroke.scaleY || 1}
                hitStrokeWidth={tool === 'home' ? Math.max(20, stroke.size + 10) : stroke.size}
                draggable={tool === 'home'}
                onPointerDown={(e) => {
                  if (tool === 'home') {
                    e.cancelBubble = true;
                    if (!selectedIds.includes(stroke.id)) {
                      setSelectedIds?.([stroke.id]);
                    }
                  }
                }}
                onDragStart={(e) => {
                  e.cancelBubble = true;
                }}
                onDragMove={(e) => {
                  if (selectedIds.includes(stroke.id) && selectedIds.length > 1) {
                    const node = e.target;
                    const deltaX = node.x() - ((stroke.x || 0) + offsetX);
                    const deltaY = node.y() - ((stroke.y || 0) + offsetY);
                    
                    selectedIds.forEach(id => {
                      if (id !== stroke.id) {
                        const otherNode = stageRef.current?.findOne('#' + id);
                        if (otherNode) {
                          const origStroke = strokes.find(s => s.id === id);
                          if (origStroke) {
                            const otherOffsetX = origStroke.blockId && blockOffsetMap && blockOffsetMap[origStroke.blockId] ? blockOffsetMap[origStroke.blockId].x : 0;
                            const otherOffsetY = origStroke.blockId && blockOffsetMap && blockOffsetMap[origStroke.blockId] ? blockOffsetMap[origStroke.blockId].y : 0;
                            otherNode.x((origStroke.x || 0) + otherOffsetX + deltaX);
                            otherNode.y((origStroke.y || 0) + otherOffsetY + deltaY);
                          }
                        }
                      }
                    });
                  }
                }}
                onDragEnd={(e) => {
                  e.cancelBubble = true;
                  if (selectedIds.includes(stroke.id) && selectedIds.length > 1) {
                    const node = e.target;
                    const deltaX = node.x() - ((stroke.x || 0) + offsetX);
                    const deltaY = node.y() - ((stroke.y || 0) + offsetY);
                    
                    setStrokes(prev => prev.map(s => {
                      if (selectedIds.includes(s.id)) {
                        return { ...s, x: (s.x || 0) + deltaX, y: (s.y || 0) + deltaY };
                      }
                      return s;
                    }));
                  } else {
                    const newX = e.target.x() - offsetX;
                    const newY = e.target.y() - offsetY;
                    setStrokes(prev => prev.map(s => 
                      s.id === stroke.id ? { ...s, x: newX, y: newY } : s
                    ));
                  }
                }}
                onTransformEnd={(e) => {
                  const node = e.target;
                  const scaleX = node.scaleX();
                  const scaleY = node.scaleY();
                  const x = node.x() - offsetX;
                  const y = node.y() - offsetY;

                  setStrokes(prev => prev.map(s => 
                    s.id === stroke.id ? { ...s, x, y, scaleX, scaleY } : s
                  ));
                }}
                onMouseEnter={(e) => {
                  if (tool === 'home') {
                    const container = e.target.getStage()?.container();
                    if (container) container.style.cursor = 'move';
                  }
                }}
                onMouseLeave={(e) => {
                  if (tool === 'home') {
                    const container = e.target.getStage()?.container();
                    if (container) container.style.cursor = 'default';
                  }
                }}
              />
            );
          })}
          
          {currentStroke && (
            <Path
              data={getSvgPathFromStroke(
                getStroke(currentStroke.points, {
                  size: currentStroke.size,
                  thinning: 0.5,
                  smoothing: 0.5,
                  streamline: 0.5,
                })
              )}
              fill={currentStroke.type === 'eraser' ? 'white' : currentStroke.color}
              opacity={currentStroke.type === 'highlighter' ? 0.4 : 1}
              globalCompositeOperation={currentStroke.type === 'eraser' ? 'destination-out' : currentStroke.type === 'highlighter' ? 'multiply' : 'source-over'}
            />
          )}

          {lassoPath.length > 0 && (
            <Path
              data={"M " + lassoPath.map(p => `${p[0]} ${p[1]}`).join(" L ")}
              stroke="#3b82f6"
              strokeWidth={2 / zoom}
              dash={[10 / zoom, 5 / zoom]}
              fill="rgba(59, 130, 246, 0.1)"
            />
          )}

          {/* Attach Transformer for selected node */}
          {tool === 'home' && selectedIds.length > 0 && strokes.some(s => selectedIds.includes(s.id)) && (
            <Transformer
              ref={transformerRef}
              boundBoxFunc={(oldBox, newBox) => {
                // limit resize
                if (Math.abs(newBox.width) < 5 || Math.abs(newBox.height) < 5) {
                  return oldBox;
                }
                return newBox;
              }}
            />
          )}
        </Layer>
      </Stage>
    </div>
  );
}
