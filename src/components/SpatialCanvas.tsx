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
  selectedNodeId?: string | null;
  setSelectedNodeId?: React.Dispatch<React.SetStateAction<string | null>>;
}

export function SpatialCanvas({ 
  strokes, setStrokes, 
  pan, setPan, 
  zoom, setZoom, 
  tool, activeColor, activeSize,
  selectedNodeId, setSelectedNodeId
}: SpatialCanvasProps) {
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);

  const stageRef = useRef<any>(null);
  const transformerRef = useRef<any>(null);
  const selectedNodeRef = useRef<any>(null);

  useEffect(() => {
    if (selectedNodeId && transformerRef.current && selectedNodeRef.current) {
      // Check if the selected node is actually a stroke in this canvas
      if (strokes.some(s => s.id === selectedNodeId)) {
        transformerRef.current.nodes([selectedNodeRef.current]);
        transformerRef.current.getLayer().batchDraw();
      } else {
        transformerRef.current.nodes([]);
      }
    } else if (transformerRef.current) {
      transformerRef.current.nodes([]);
    }
  }, [selectedNodeId, strokes]);

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

  const handlePointerDown = (e: any) => {
    if (e.evt.button === 1 || tool === "pan") {
      // Middle click or pan tool
      return;
    }
    
    if (tool === "home") {
      // If we clicked on empty space, deselect
      if (e.target === stageRef.current) {
        setSelectedNodeId?.(null);
      }
      return;
    }
    
    if (setSelectedNodeId) setSelectedNodeId(null);
    setIsDrawing(true);
    const pos = getPointerPos(e);
    
    setCurrentStroke({
      id: uuidv4(),
      points: [[pos.x, pos.y, pos.pressure]],
      color: activeColor,
      size: activeSize
    });
  };

  const handlePointerMove = (e: any) => {
    if (!isDrawing || !currentStroke) return;
    
    const pos = getPointerPos(e);
    setCurrentStroke(prev => {
      if (!prev) return null;
      return {
        ...prev,
        points: [...prev.points, [pos.x, pos.y, pos.pressure]]
      };
    });
  };

  const handlePointerUp = () => {
    if (isDrawing && currentStroke) {
      setStrokes(prev => [...prev, currentStroke]);
    }
    setIsDrawing(false);
    setCurrentStroke(null);
  };

  // Handle Zoom (Wheel)
  const handleWheel = (e: any) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    
    const scaleBy = 1.05;
    const oldScale = zoom;
    const pointer = stage.getPointerPosition();

    const mousePointTo = {
      x: (pointer.x - pan.x) / oldScale,
      y: (pointer.y - pan.y) / oldScale,
    };

    let newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
    newScale = Math.max(0.1, Math.min(newScale, 5)); // Clamp zoom between 10% and 500%

    setZoom(newScale);
    setPan({
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
  };

  return (
    <div className={`absolute inset-0 ${tool === 'pen' ? 'cursor-crosshair' : tool === 'pan' ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}>
      <Stage
        width={typeof window !== 'undefined' ? window.innerWidth : 1000}
        height={typeof window !== 'undefined' ? window.innerHeight : 800}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
        draggable={tool !== 'pen'}
        onDragStart={() => {
          if (tool !== 'pen') {
            document.body.style.cursor = 'grabbing';
          }
        }}
        onDragMove={(e) => {
          if (e.target === stageRef.current) {
            setPan({ x: e.target.x(), y: e.target.y() });
          }
        }}
        onDragEnd={(e) => {
          if (tool !== 'pen') {
            document.body.style.cursor = 'default';
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
            const isSelected = stroke.id === selectedNodeId;
            return (
              <Path
                key={stroke.id}
                ref={isSelected ? selectedNodeRef : undefined}
                data={pathData}
                fill={stroke.color}
                x={stroke.x || 0}
                y={stroke.y || 0}
                scaleX={stroke.scaleX || 1}
                scaleY={stroke.scaleY || 1}
                draggable={tool === 'home'}
                onPointerDown={(e) => {
                  if (tool === 'home') {
                    e.cancelBubble = true;
                    setSelectedNodeId?.(stroke.id);
                  }
                }}
                onDragStart={(e) => {
                  e.cancelBubble = true;
                }}
                onDragEnd={(e) => {
                  e.cancelBubble = true;
                  const newX = e.target.x();
                  const newY = e.target.y();
                  setStrokes(prev => prev.map(s => 
                    s.id === stroke.id ? { ...s, x: newX, y: newY } : s
                  ));
                }}
                onTransformEnd={(e) => {
                  const node = e.target;
                  const scaleX = node.scaleX();
                  const scaleY = node.scaleY();
                  const x = node.x();
                  const y = node.y();

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
              data={getSvgPathFromStroke(getStroke(currentStroke.points, {
                size: currentStroke.size,
                thinning: 0.5,
                smoothing: 0.5,
                streamline: 0.5,
              }))}
              fill={currentStroke.color}
            />
          )}

          {/* Attach Transformer for selected node */}
          {tool === 'home' && selectedNodeId && strokes.some(s => s.id === selectedNodeId) && (
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
