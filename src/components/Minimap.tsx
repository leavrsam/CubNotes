import React, { useMemo, useRef, useEffect, useState } from 'react';
import { Stroke, TextNode, ImageNode, FileNode, VideoNode, AudioNode } from './CustomCanvas';
import { Stage, Layer, Rect, Group, Path } from 'react-konva';

interface MinimapProps {
  strokes: Stroke[];
  texts: TextNode[];
  images: ImageNode[];
  files: FileNode[];
  videos: VideoNode[];
  audios: AudioNode[];
  pan: { x: number; y: number };
  zoom: number;
  setPan: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
}

const MINIMAP_WIDTH = 200;
const MINIMAP_HEIGHT = 150;

export const Minimap: React.FC<MinimapProps> = ({
  strokes, texts, images, files, videos, audios, pan, zoom, setPan
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Calculate the bounding box of ALL content on the canvas
  const bounds = useMemo(() => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    const updateBounds = (x: number, y: number, w: number, h: number) => {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x + w > maxX) maxX = x + w;
      if (y + h > maxY) maxY = y + h;
    };

    strokes.forEach(s => {
      let sMinX = Infinity;
      let sMinY = Infinity;
      let sMaxX = -Infinity;
      let sMaxY = -Infinity;
      s.points.forEach(p => {
        if (p[0] < sMinX) sMinX = p[0];
        if (p[1] < sMinY) sMinY = p[1];
        if (p[0] > sMaxX) sMaxX = p[0];
        if (p[1] > sMaxY) sMaxY = p[1];
      });
      // Apply stroke offset
      updateBounds(sMinX + (s.x || 0), sMinY + (s.y || 0), sMaxX - sMinX, sMaxY - sMinY);
    });

    texts.forEach(t => updateBounds(t.x, t.y, t.width || 200, 100)); // Approx height
    images.forEach(i => updateBounds(i.x, i.y, i.width || 400, i.height || 300));
    files.forEach(f => updateBounds(f.x, f.y, 256, 100));
    audios.forEach(a => updateBounds(a.x, a.y, a.width || 400, 100));
    videos.forEach(v => updateBounds(v.x, v.y, v.width || 480, v.height || 270));

    // If canvas is empty, use a default viewport box
    if (minX === Infinity) {
      return { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
    }

    // Add padding around content
    const pad = 500;
    return {
      x: minX - pad,
      y: minY - pad,
      width: (maxX - minX) + pad * 2,
      height: (maxY - minY) + pad * 2
    };
  }, [strokes, texts, images, files, videos, audios]);

  // Calculate scale factor from virtual canvas to minimap
  const scaleX = MINIMAP_WIDTH / bounds.width;
  const scaleY = MINIMAP_HEIGHT / bounds.height;
  const scale = Math.min(scaleX, scaleY); // uniform scale

  // The centered actual size of the minimap content area
  const contentW = bounds.width * scale;
  const contentH = bounds.height * scale;
  const offsetX = (MINIMAP_WIDTH - contentW) / 2;
  const offsetY = (MINIMAP_HEIGHT - contentH) / 2;

  // Calculate the current viewport rectangle in canvas coordinates
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth / zoom : 1000;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight / zoom : 800;
  
  const viewportX = -pan.x / zoom;
  const viewportY = -pan.y / zoom;

  // Convert viewport to minimap coordinates
  const miniViewX = (viewportX - bounds.x) * scale + offsetX;
  const miniViewY = (viewportY - bounds.y) * scale + offsetY;
  const miniViewW = viewportWidth * scale;
  const miniViewH = viewportHeight * scale;

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Convert click on minimap back to canvas center
    const targetCanvasCenterX = ((clickX - offsetX) / scale) + bounds.x;
    const targetCanvasCenterY = ((clickY - offsetY) / scale) + bounds.y;

    // We want the clicked point to become the center of the viewport
    const newViewportX = targetCanvasCenterX - (viewportWidth / 2);
    const newViewportY = targetCanvasCenterY - (viewportHeight / 2);

    setPan({
      x: -newViewportX * zoom,
      y: -newViewportY * zoom
    });
  };

  return (
    <div 
      ref={containerRef}
      className="absolute bottom-6 right-6 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl overflow-hidden cursor-crosshair z-50 select-none transition-opacity opacity-50 hover:opacity-100"
      style={{ width: MINIMAP_WIDTH, height: MINIMAP_HEIGHT }}
      onPointerDown={handlePointerDown}
    >
      <Stage width={MINIMAP_WIDTH} height={MINIMAP_HEIGHT}>
        <Layer>
          {/* Render Strokes */}
          {strokes.map(stroke => (
            <Path
              key={stroke.id}
              data={"M " + stroke.points.map(p => `${(p[0] + (stroke.x || 0) - bounds.x) * scale + offsetX} ${(p[1] + (stroke.y || 0) - bounds.y) * scale + offsetY}`).join(" L ")}
              stroke={stroke.color}
              strokeWidth={Math.max(1, (stroke.size * scale))}
              opacity={stroke.type === 'highlighter' ? 0.3 : 0.8}
            />
          ))}
          
          {/* Render Texts (as generic blocks) */}
          {texts.map(t => (
            <Rect 
              key={t.id}
              x={(t.x - bounds.x) * scale + offsetX}
              y={(t.y - bounds.y) * scale + offsetY}
              width={(t.width || 200) * scale}
              height={100 * scale}
              fill="#e4e4e7" // zinc-200
              cornerRadius={4 * scale}
            />
          ))}

          {/* Render Media */}
          {[...images, ...files, ...audios, ...videos].map(m => (
            <Rect 
              key={m.id}
              x={(m.x - bounds.x) * scale + offsetX}
              y={(m.y - bounds.y) * scale + offsetY}
              width={(m.width || 300) * scale}
              height={(m.height || 200) * scale}
              fill="#d4d4d8" // zinc-300
              cornerRadius={6 * scale}
            />
          ))}

          {/* Viewport Indicator */}
          <Rect
            x={miniViewX}
            y={miniViewY}
            width={miniViewW}
            height={miniViewH}
            stroke="#3b82f6" // blue-500
            strokeWidth={2}
            fill="rgba(59, 130, 246, 0.1)"
            listening={false}
          />
        </Layer>
      </Stage>
    </div>
  );
};
