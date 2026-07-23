"use client";

import React, { useState, useRef, useCallback } from "react";
import { Stage, Layer, Path } from "react-konva";
import { getStroke } from "perfect-freehand";
import { v4 as uuidv4 } from "uuid";
import type { Stroke } from "./CustomCanvas";

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
}

export function SpatialCanvas({ strokes, setStrokes, pan, setPan, zoom, setZoom }: SpatialCanvasProps) {
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
  
  // Hardcoded tools for now
  const activeColor = "#f4f4f5"; // zinc-100
  const activeSize = 4;
  const [tool, setTool] = useState<"pen" | "pan">("pen");

  const stageRef = useRef<any>(null);

  const getPointerPos = () => {
    const stage = stageRef.current;
    if (!stage) return { x: 0, y: 0, pressure: 0.5 };
    const pointer = stage.getPointerPosition();
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
    
    setIsDrawing(true);
    const pos = getPointerPos();
    
    setCurrentStroke({
      id: uuidv4(),
      points: [[pos.x, pos.y, pos.pressure]],
      color: activeColor,
      size: activeSize
    });
  };

  const handlePointerMove = (e: any) => {
    if (!isDrawing || !currentStroke) return;
    
    const pos = getPointerPos();
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
    <div className="absolute inset-0 cursor-crosshair">
      <Stage
        width={typeof window !== 'undefined' ? window.innerWidth : 1000}
        height={typeof window !== 'undefined' ? window.innerHeight : 800}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
        ref={stageRef}
      >
        <Layer x={pan.x} y={pan.y} scaleX={zoom} scaleY={zoom}>
          {strokes.map((stroke) => {
            const strokeData = getStroke(stroke.points, {
              size: stroke.size,
              thinning: 0.5,
              smoothing: 0.5,
              streamline: 0.5,
            });
            const pathData = getSvgPathFromStroke(strokeData);
            return (
              <Path
                key={stroke.id}
                data={pathData}
                fill={stroke.color}
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
        </Layer>
      </Stage>
    </div>
  );
}
