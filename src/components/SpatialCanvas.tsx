"use client";

import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Stage, Layer, Path, Transformer, Rect } from "react-konva";
import { getStroke } from "perfect-freehand";
import { v4 as uuidv4 } from "uuid";
import type { Stroke, ToolType } from "./CustomCanvas";
import { ramerDouglasPeucker } from "@/lib/rdpDecimation";
import { activeRecordingManager } from "@/lib/activeRecordingManager";
import { audioPlaybackSyncBus, type PlaybackState } from "@/lib/audioPlaybackSync";

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

export function getStrokeRenderProps(stroke: { type?: string; size: number; color: string }) {
  const type = stroke.type || 'pen';

  switch (type) {
    case 'highlighter':
      return {
        options: {
          size: stroke.size,
          thinning: 0,
          smoothing: 0.7,
          streamline: 0.6,
          start: { cap: true, taper: 0 },
          end: { cap: true, taper: 0 },
        },
        opacity: 0.38,
        compositeOperation: 'multiply' as const,
        fill: stroke.color,
      };

    case 'pencil':
      return {
        options: {
          size: stroke.size,
          thinning: 0.45,
          smoothing: 0.35,
          streamline: 0.3,
          start: { cap: true, taper: stroke.size * 0.3 },
          end: { cap: true, taper: stroke.size * 0.3 },
        },
        opacity: 0.72,
        compositeOperation: 'source-over' as const,
        fill: stroke.color,
      };

    case 'marker':
      return {
        options: {
          size: stroke.size,
          thinning: 0.15,
          smoothing: 0.6,
          streamline: 0.5,
          start: { cap: true, taper: 0 },
          end: { cap: true, taper: 0 },
        },
        opacity: 0.88,
        compositeOperation: 'source-over' as const,
        fill: stroke.color,
      };

    case 'eraser':
      return {
        options: {
          size: stroke.size,
          thinning: 0.4,
          smoothing: 0.5,
          streamline: 0.5,
        },
        opacity: 1,
        compositeOperation: 'destination-out' as const,
        fill: 'white',
      };

    case 'pen':
    default:
      return {
        options: {
          size: stroke.size,
          thinning: 0.6,
          smoothing: 0.5,
          streamline: 0.45,
          start: { cap: true, taper: stroke.size * 0.5 },
          end: { cap: true, taper: stroke.size * 0.5 },
        },
        opacity: 1.0,
        compositeOperation: 'source-over' as const,
        fill: stroke.color,
      };
  }
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds) || seconds < 0) return '0:00';
  const totalSecs = Math.floor(seconds);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
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
  activePresetType?: 'pen' | 'pencil' | 'marker' | 'highlighter';
  eraserType?: 'stroke' | 'point';
  eraserSize?: number;
  selectedIds?: string[];
  setSelectedIds?: React.Dispatch<React.SetStateAction<string[]>>;
  onCanvasClick?: (x: number, y: number) => void;
  onDragSelectionStart?: (draggedId?: string) => void;
  onDragSelectionMove?: (deltaX: number, deltaY: number) => void;
  onDragSelectionEnd?: () => void;
  onLassoComplete?: (minX: number, maxX: number, minY: number, maxY: number, path: number[][]) => void;
  onSelectionBoxChange?: (minX: number, maxX: number, minY: number, maxY: number) => void;
  onSelectionBoxComplete?: (minX: number, maxX: number, minY: number, maxY: number) => void;
  annotateBlockId?: string | null;
  blockOffsetMap?: Record<string, {x: number, y: number}>;
  initialBlockY?: number;
  width?: number;
  height?: number;
}

export function SpatialCanvas({ 
  strokes, setStrokes, 
  pan, setPan, 
  zoom, setZoom, 
  tool, activeColor, activeSize, activePresetType, eraserType, eraserSize = 10,
  selectedIds = [], setSelectedIds,
  onCanvasClick, onLassoComplete,
  onSelectionBoxChange, onSelectionBoxComplete,
  onDragSelectionStart, onDragSelectionMove, onDragSelectionEnd,
  annotateBlockId, blockOffsetMap, initialBlockY,
  width, height
}: SpatialCanvasProps) {
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
  const [lassoPath, setLassoPath] = useState<number[][]>([]);
  const [marqueeBox, setMarqueeBox] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null);
  const [playbackState, setPlaybackState] = useState<PlaybackState>(() => audioPlaybackSyncBus.getState());
  const [hoveredStrokeInfo, setHoveredStrokeInfo] = useState<{ id: string; t: number; x: number; y: number } | null>(null);

  const stageRef = useRef<any>(null);
  const transformerRef = useRef<any>(null);
  const selectedNodeRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({
    width: width || (typeof window !== 'undefined' ? window.innerWidth : 1000),
    height: height || (typeof window !== 'undefined' ? window.innerHeight : 800),
  });

  // Dynamically adapt stage canvas buffer on window resize or frame adjustments (Tauri / desktop apps / split-screen)
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        if (clientWidth > 0 && clientHeight > 0) {
          setDimensions({ width: clientWidth, height: clientHeight });
          return;
        }
      }
      if (typeof window !== 'undefined') {
        setDimensions({ width: window.innerWidth, height: window.innerHeight });
      }
    };

    updateDimensions();

    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => {
      updateDimensions();
    }) : null;

    if (containerRef.current && observer) {
      observer.observe(containerRef.current);
    }

    window.addEventListener('resize', updateDimensions);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateDimensions);
    };
  }, []);

  useEffect(() => {
    return audioPlaybackSyncBus.subscribe(setPlaybackState);
  }, []);

  useEffect(() => {
    if (stageRef.current) {
      const container = stageRef.current.container();
      if (container) {
        container.style.touchAction = 'none';
        const canvases = container.querySelectorAll('canvas');
        canvases.forEach((canvas: HTMLCanvasElement) => {
          try {
            canvas.getContext('2d', { desynchronized: true });
          } catch {}
        });
      }
    }
  }, []);

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
    
    const rawPressure = e?.evt && typeof (e.evt as any).pressure === 'number'
      ? (e.evt as any).pressure
      : 0;
    let pressure = rawPressure > 0 ? rawPressure : 0.5;

    // Stylus tilt detection for graphite pencil shading
    const tiltX = e?.evt && typeof (e.evt as any).tiltX === 'number' ? (e.evt as any).tiltX : 0;
    const tiltY = e?.evt && typeof (e.evt as any).tiltY === 'number' ? (e.evt as any).tiltY : 0;
    const maxTilt = Math.max(Math.abs(tiltX), Math.abs(tiltY));
    if (activePresetType === 'pencil' && maxTilt > 35) {
      pressure = Math.min(1.0, pressure * (1 + (maxTilt - 35) / 45));
    }

    return {
      x: (pointer.x - pan.x) / zoom,
      y: (pointer.y - pan.y) / zoom,
      pressure
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
        const scaleFactor = newDist / lastDist;

        const oldScale = zoom;
        let newScale = oldScale;

        // Smooth pinch-zoom when distance changes
        if (Math.abs(newDist - lastDist) > 1) {
          newScale = Math.max(0.1, Math.min(oldScale * scaleFactor, 5));
        }

        // Anchor around lastCenter, transformed by new zoom to newCenter
        const anchorPoint = {
          x: (lastCenter.x - pan.x) / oldScale,
          y: (lastCenter.y - pan.y) / oldScale,
        };

        const newPanX = newCenter.x - anchorPoint.x * newScale;
        const newPanY = newCenter.y - anchorPoint.y * newScale;

        setZoom(newScale);
        setPan({
          x: newPanX,
          y: newPanY,
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

    // 1. Hardware digitizer classification & zero palm rejection false-triggers
    const pointerType = (e?.evt && (e.evt as any).pointerType) || 'mouse';

    // Touch events: Strictly bound to canvas viewport navigation (pan, pinch-to-zoom).
    // Intercept and preventDefault() any touch events that attempt to invoke drawing tools.
    if (pointerType === 'touch') {
      if (tool === 'pen' || tool === 'eraser' || tool === 'lasso') {
        e?.evt?.preventDefault?.();
        return;
      }
    }

    if (touchStateRef.current.isPinching || (e.evt.touches && e.evt.touches.length >= 2)) {
      return;
    }
    
    if (tool === "home") {
      // If we clicked on empty space, start marquee selection
      const isStage = e.target === stageRef.current || (e.target?.getStage && e.target === e.target.getStage()) || e.target?.nodeType === 'Stage';
      if (isStage) {
        if (typeof document !== 'undefined' && document.activeElement) {
          (document.activeElement as HTMLElement)?.blur?.();
        }
        const rawPos = getPointerPos(e);
        setMarqueeBox({
          startX: rawPos.x,
          startY: rawPos.y,
          currentX: rawPos.x,
          currentY: rawPos.y,
        });
      }
      return;
    }
    
    if (tool !== "pen" && tool !== "eraser" && tool !== "lasso") {
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

    const recState = activeRecordingManager.getState();
    const activeMeta = (recState.isRecording && recState.audioBlockId)
      ? { audioBlockId: recState.audioBlockId, t: activeRecordingManager.getActiveElapsedMs() }
      : undefined;

    if (tool === "eraser") {
      if (eraserType === 'stroke') {
        eraseStrokesAtPoint(pos.x, pos.y, 10);
      } else {
        setCurrentStroke({
          id: uuidv4(),
          points: [[pos.x, pos.y, pos.pressure]],
          color: "white", // Or match background if dark mode
          size: eraserSize,
          type: 'eraser',
          meta: activeMeta
        });
      }
      return;
    }

    if (tool === "pen") {
      setCurrentStroke({
        id: uuidv4(),
        points: [[pos.x, pos.y, pos.pressure]],
        color: activeColor,
        size: activeSize,
        type: activePresetType,
        blockId: annotateBlockId || undefined,
        blockY: initialBlockY,
        meta: activeMeta
      });
    }
  };

  const handlePointerMove = (e: any) => {
    const pointerType = (e?.evt && (e.evt as any).pointerType) || 'mouse';
    if (pointerType === 'touch' && (tool === 'pen' || tool === 'eraser' || tool === 'lasso')) {
      return;
    }

    if (tool === "home") {
      if (marqueeBox) {
        const rawPos = getPointerPos(e);
        const updated = {
          ...marqueeBox,
          currentX: rawPos.x,
          currentY: rawPos.y,
        };
        setMarqueeBox(updated);

        const minX = Math.min(updated.startX, updated.currentX);
        const maxX = Math.max(updated.startX, updated.currentX);
        const minY = Math.min(updated.startY, updated.currentY);
        const maxY = Math.max(updated.startY, updated.currentY);

        if (maxX - minX > 3 || maxY - minY > 3) {
          onSelectionBoxChange?.(minX, maxX, minY, maxY);
        }
      }
      return;
    }

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
    if (tool === "home") {
      if (marqueeBox) {
        const minX = Math.min(marqueeBox.startX, marqueeBox.currentX);
        const maxX = Math.max(marqueeBox.startX, marqueeBox.currentX);
        const minY = Math.min(marqueeBox.startY, marqueeBox.currentY);
        const maxY = Math.max(marqueeBox.startY, marqueeBox.currentY);

        if (maxX - minX > 5 || maxY - minY > 5) {
          onSelectionBoxComplete?.(minX, maxX, minY, maxY);
        } else {
          setSelectedIds?.([]);
          if (typeof document !== 'undefined' && document.activeElement) {
            (document.activeElement as HTMLElement)?.blur?.();
          }
          onCanvasClick?.(marqueeBox.startX, marqueeBox.startY);
        }
        setMarqueeBox(null);
      }
      return;
    }

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
      } else if (currentStroke && currentStroke.points.length > 0) {
        // Stroke point decimation using Ramer-Douglas-Peucker (RDP) algorithm
        const decimatedPoints = ramerDouglasPeucker(currentStroke.points, 0.65);
        const recState = activeRecordingManager.getState();
        const stampedStroke: Stroke = {
          ...currentStroke,
          points: decimatedPoints,
          meta: currentStroke.meta || ((recState.isRecording && recState.audioBlockId)
            ? { audioBlockId: recState.audioBlockId, t: activeRecordingManager.getActiveElapsedMs() }
            : undefined),
        };
        setStrokes(prev => [...prev, stampedStroke]);
      }
    }
    setIsDrawing(false);
    setCurrentStroke(null);
  };

  useEffect(() => {
    if (!marqueeBox) return;
    const handleWindowPointerUp = () => {
      if (marqueeBox) {
        const minX = Math.min(marqueeBox.startX, marqueeBox.currentX);
        const maxX = Math.max(marqueeBox.startX, marqueeBox.currentX);
        const minY = Math.min(marqueeBox.startY, marqueeBox.currentY);
        const maxY = Math.max(marqueeBox.startY, marqueeBox.currentY);

        if (maxX - minX > 5 || maxY - minY > 5) {
          onSelectionBoxComplete?.(minX, maxX, minY, maxY);
        }
        setMarqueeBox(null);
      }
    };
    window.addEventListener('pointerup', handleWindowPointerUp);
    return () => window.removeEventListener('pointerup', handleWindowPointerUp);
  }, [marqueeBox, onSelectionBoxComplete]);

  const visibleStrokes = useMemo(() => {
    if (annotateBlockId) {
      return strokes.filter(s => 
        s.blockId === annotateBlockId || 
        s.id === annotateBlockId || 
        ('sketch-' + s.id) === annotateBlockId
      );
    }
    return strokes;
  }, [strokes, annotateBlockId]);

  return (
    <div 
      ref={containerRef}
      className={`absolute inset-0 touch-none ${tool === 'pen' ? 'cursor-crosshair' : tool === 'home' ? 'cursor-text' : tool === 'pan' ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
    >
      <Stage
        width={width || dimensions.width}
        height={height || dimensions.height}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        draggable={tool === 'pan'}
        onDragStart={() => {
          if (tool === 'pan') {
            document.body.style.cursor = 'grabbing';
          }
        }}
        onDragMove={(e) => {
          if (tool === 'pan' && e.target === stageRef.current) {
            setPan({ x: e.target.x(), y: e.target.y() });
          }
        }}
        onDragEnd={(e) => {
          if (tool === 'pan') {
            document.body.style.cursor = 'grab';
          }
          if (tool === 'pan' && e.target === stageRef.current) {
            setPan({ x: e.target.x(), y: e.target.y() });
          }
        }}
        x={pan.x}
        y={pan.y}
        ref={stageRef}
      >
        <Layer scaleX={zoom} scaleY={zoom}>
          {visibleStrokes.map((stroke) => {
            const renderProps = getStrokeRenderProps(stroke);
            const strokeData = getStroke(stroke.points, renderProps.options);
            const pathData = getSvgPathFromStroke(strokeData);
            const offsetX = stroke.blockId && blockOffsetMap && blockOffsetMap[stroke.blockId] ? blockOffsetMap[stroke.blockId].x : 0;
            const offsetY = stroke.blockId && blockOffsetMap && blockOffsetMap[stroke.blockId] ? blockOffsetMap[stroke.blockId].y : 0;
            const isFirstSelected = selectedIds.length > 0 && stroke.id === selectedIds.find(id => strokes.some(s => s.id === id));
            const isEchoActive = Boolean(
              playbackState.activeAudioBlockId &&
              stroke.meta?.audioBlockId === playbackState.activeAudioBlockId &&
              stroke.meta?.t != null &&
              stroke.meta.t >= playbackState.currentTimeMs - 2000 &&
              stroke.meta.t <= playbackState.currentTimeMs + 4000
            );
            return (
              <Path
                key={stroke.id}
                id={stroke.id}
                ref={isFirstSelected ? selectedNodeRef : undefined}
                data={pathData}
                fill={renderProps.fill}
                opacity={renderProps.opacity}
                globalCompositeOperation={renderProps.compositeOperation}
                shadowColor={isEchoActive ? "#6366f1" : undefined}
                shadowBlur={isEchoActive ? 16 : 0}
                shadowOpacity={isEchoActive ? 0.95 : 0}
                x={(stroke.x || 0) + offsetX}
                y={(stroke.y || 0) + offsetY}
                scaleX={stroke.scaleX || 1}
                scaleY={stroke.scaleY || 1}
                hitStrokeWidth={tool === 'home' ? Math.max(20, stroke.size + 10) : stroke.size}
                draggable={tool === 'home'}
                onPointerEnter={() => {
                  if (stroke.meta?.audioBlockId && stroke.meta.t != null) {
                    const stage = stageRef.current;
                    const pointer = stage?.getPointerPosition();
                    if (pointer) {
                      setHoveredStrokeInfo({
                        id: stroke.id,
                        t: stroke.meta.t,
                        x: pointer.x,
                        y: pointer.y - 28,
                      });
                    }
                  }
                }}
                onPointerLeave={() => {
                  setHoveredStrokeInfo(prev => prev?.id === stroke.id ? null : prev);
                }}
                onClick={() => {
                  if (tool === 'home' && stroke.meta?.audioBlockId && stroke.meta.t != null) {
                    audioPlaybackSyncBus.seek(stroke.meta.audioBlockId, stroke.meta.t);
                  }
                }}
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
                  onDragSelectionStart?.(stroke.id);
                }}
                onDragMove={(e) => {
                  const node = e.target;
                  const deltaX = node.x() - ((stroke.x || 0) + offsetX);
                  const deltaY = node.y() - ((stroke.y || 0) + offsetY);

                  if (selectedIds.includes(stroke.id) && selectedIds.length > 1) {
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
                    onDragSelectionMove?.(deltaX, deltaY);
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
                  onDragSelectionEnd?.();
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
          
          {currentStroke && (() => {
            const renderProps = getStrokeRenderProps(currentStroke);
            const strokeData = getStroke(currentStroke.points, renderProps.options);
            const pathData = getSvgPathFromStroke(strokeData);
            return (
              <Path
                data={pathData}
                fill={renderProps.fill}
                opacity={renderProps.opacity}
                globalCompositeOperation={renderProps.compositeOperation}
              />
            );
          })()}

          {lassoPath.length > 0 && (
            <Path
              data={"M " + lassoPath.map(p => `${p[0]} ${p[1]}`).join(" L ")}
              stroke="#3b82f6"
              strokeWidth={2 / zoom}
              dash={[10 / zoom, 5 / zoom]}
              fill="rgba(59, 130, 246, 0.1)"
            />
          )}

          {/* Marquee selection box */}
          {marqueeBox && (Math.abs(marqueeBox.currentX - marqueeBox.startX) > 3 || Math.abs(marqueeBox.currentY - marqueeBox.startY) > 3) && (
            <Rect
              x={Math.min(marqueeBox.startX, marqueeBox.currentX)}
              y={Math.min(marqueeBox.startY, marqueeBox.currentY)}
              width={Math.abs(marqueeBox.currentX - marqueeBox.startX)}
              height={Math.abs(marqueeBox.currentY - marqueeBox.startY)}
              fill="rgba(59, 130, 246, 0.12)"
              stroke="#3b82f6"
              strokeWidth={1.5 / zoom}
              dash={[6 / zoom, 4 / zoom]}
              cornerRadius={2 / zoom}
              listening={false}
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
      {hoveredStrokeInfo && (
        <div 
          className="pointer-events-none absolute z-50 transform -translate-x-1/2 px-2 py-0.5 bg-zinc-900/90 text-indigo-300 text-[11px] font-mono rounded shadow border border-indigo-500/30 backdrop-blur-sm flex items-center gap-1.5 transition-all duration-75"
          style={{ left: hoveredStrokeInfo.x, top: hoveredStrokeInfo.y }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          {formatTime(hoveredStrokeInfo.t / 1000)}
        </div>
      )}
    </div>
  );
}
