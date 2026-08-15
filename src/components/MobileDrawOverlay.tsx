"use client";

import React, { useEffect, useState, useRef } from 'react';
import { SpatialCanvas } from './SpatialCanvas';
import { PenTool, Eraser, Highlighter, Check, File, Image as ImageIcon, Music, Video, FileText } from 'lucide-react';
import { useTheme } from 'next-themes';
import type { Stroke } from './CustomCanvas';

interface MobileDrawOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  annotateBlockId: string | null;
  blockType?: string | null;
  targetBlock?: any;
  strokes: Stroke[];
  setStrokes: React.Dispatch<React.SetStateAction<Stroke[]>>;
  initialBlockY?: number;
}

const COLOR_PRESETS = [
  { label: 'White', value: '#FFFFFF' },
  { label: 'Black', value: '#000000' },
  { label: 'Blue', value: '#3B82F6' },
  { label: 'Red', value: '#EF4444' },
  { label: 'Green', value: '#22C55E' },
  { label: 'Yellow', value: '#EAB308' },
];

const SIZE_PRESETS = [
  { label: 'Fine', size: 2, iconSize: 4 },
  { label: 'Medium', size: 4, iconSize: 8 },
  { label: 'Thick', size: 8, iconSize: 12 },
];

export function MobileDrawOverlay({ 
  isOpen, 
  onClose, 
  annotateBlockId, 
  blockType, 
  targetBlock,
  strokes, 
  setStrokes, 
  initialBlockY 
}: MobileDrawOverlayProps) {
  const { resolvedTheme } = useTheme();
  const [tool, setTool] = useState<'pen' | 'highlighter' | 'eraser'>('pen');
  const [color, setColor] = useState('#FFFFFF');
  const [size, setSize] = useState(4);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);

  const cardRef = useRef<HTMLDivElement>(null);
  const [cardDims, setCardDims] = useState<{ width: number; height: number }>({ width: 360, height: 300 });

  const isContentBlockAnnotation = !!(annotateBlockId && blockType && blockType !== 'drawing' && targetBlock);

  const getContextLabel = () => {
    if (!annotateBlockId) return '🎨 New Sketch Block';
    if (blockType === 'drawing') return '🎨 Editing Sketch';
    if (blockType === 'image') return '🖼️ Annotating Image';
    if (blockType === 'audio') return '🎙️ Annotating Voice Note';
    if (blockType === 'video') return '🎬 Annotating Video';
    if (blockType === 'file') return '📎 Annotating File';
    if (blockType === 'text') return '📝 Annotating Text';
    return '✏️ Annotating Block';
  };

function getStrokeBoundingBox(stroke: Stroke) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of stroke.points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const sX = stroke.scaleX || 1;
  const sY = stroke.scaleY || 1;
  const tX = stroke.x || 0;
  const tY = stroke.y || 0;
  
  return {
    minX: minX * sX + tX,
    minY: minY * sY + tY,
    maxX: maxX * sX + tX,
    maxY: maxY * sY + tY,
  };
}

  // Set default drawing color based on current theme and auto-center existing strokes for sketch blocks
  useEffect(() => {
    if (isOpen) {
      if (resolvedTheme === 'dark') {
        setColor('#FFFFFF');
      } else {
        setColor('#000000');
      }

      if (!isContentBlockAnnotation && annotateBlockId) {
        // Find existing strokes for this sketch block
        const blockStrokes = strokes.filter(s => 
          s.blockId === annotateBlockId || 
          s.id === annotateBlockId || 
          ('sketch-' + s.id) === annotateBlockId
        );

        if (blockStrokes.length > 0) {
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          blockStrokes.forEach(s => {
            if (!s.points || s.points.length === 0) return;
            const box = getStrokeBoundingBox(s);
            minX = Math.min(minX, box.minX);
            minY = Math.min(minY, box.minY);
            maxX = Math.max(maxX, box.maxX);
            maxY = Math.max(maxY, box.maxY);
          });

          if (isFinite(minX) && minX !== Infinity) {
            const centerX = (minX + maxX) / 2;
            const centerY = (minY + maxY) / 2;
            const screenW = typeof window !== 'undefined' ? window.innerWidth : 390;
            const screenH = typeof window !== 'undefined' ? window.innerHeight : 844;
            setPan({
              x: Math.round(screenW / 2 - centerX),
              y: Math.round(screenH / 2 - centerY),
            });
            setZoom(1);
            return;
          }
        }
      }

      // Default for new sketch
      setPan({ x: 0, y: 0 });
      setZoom(1);
    }
  }, [isOpen, annotateBlockId, isContentBlockAnnotation, resolvedTheme, strokes]);

  // Measure card dimensions when annotating a content block
  useEffect(() => {
    if (isOpen && isContentBlockAnnotation) {
      const updateDimensions = () => {
        if (cardRef.current) {
          const rect = cardRef.current.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            setCardDims({
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            });
          }
        }
      };

      updateDimensions();
      const timer = setTimeout(updateDimensions, 60);
      window.addEventListener('resize', updateDimensions);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('resize', updateDimensions);
      };
    }
  }, [isOpen, isContentBlockAnnotation, targetBlock]);

  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 z-[2000] flex flex-col select-none overflow-hidden touch-none ${
      isContentBlockAnnotation 
        ? 'bg-black/75 dark:bg-black/85 backdrop-blur-md' 
        : 'bg-zinc-50 dark:bg-zinc-950'
    } animate-in fade-in duration-150`}>
      
      {/* Top Header Bar */}
      <div 
        className="absolute top-0 left-0 right-0 px-4 py-3 flex items-center justify-between z-[2200] pointer-events-auto"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 14px)' }}
      >
        <div className="flex items-center gap-2 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md px-3.5 py-1.5 rounded-full shadow-md border border-zinc-200/60 dark:border-zinc-800 text-xs font-semibold text-zinc-800 dark:text-zinc-200">
          <span className="w-2 h-2 rounded-full bg-primary-500 animate-pulse" />
          <span>{getContextLabel()}</span>
        </div>
        
        <button 
          onClick={onClose}
          className="flex items-center gap-1 px-4 py-1.5 bg-zinc-900 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-100 text-white dark:text-zinc-900 rounded-full font-semibold text-xs shadow-md active:scale-95 transition-transform"
        >
          <Check size={14} />
          <span>Done</span>
        </button>
      </div>

      {/* Main Center Area */}
      {isContentBlockAnnotation ? (
        /* Focused Content Block with Canvas Overlay */
        <div className="flex-1 w-full h-full flex items-center justify-center p-4 pt-16 pb-28 relative z-[2050] overflow-hidden">
          <div 
            ref={cardRef}
            className="relative w-full max-w-[420px] max-h-[62vh] rounded-2xl overflow-hidden shadow-2xl border border-zinc-200/60 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col justify-center"
          >
            {/* Underlying Block Content */}
            <div className="w-full h-full overflow-hidden select-none pointer-events-none">
              {blockType === 'image' && (
                <img 
                  src={targetBlock.url} 
                  alt="Annotating" 
                  onLoad={() => {
                    if (cardRef.current) {
                      const rect = cardRef.current.getBoundingClientRect();
                      setCardDims({ width: Math.round(rect.width), height: Math.round(rect.height) });
                    }
                  }}
                  className="w-full h-auto max-h-[58vh] object-contain bg-black" 
                />
              )}

              {blockType === 'text' && (
                <div 
                  className="p-5 max-h-[58vh] overflow-y-auto text-sm leading-relaxed text-zinc-900 dark:text-zinc-100 prose dark:prose-invert"
                  dangerouslySetInnerHTML={{ __html: targetBlock.content || '<p class="text-zinc-400 italic">Empty text note...</p>' }}
                />
              )}

              {blockType === 'file' && (
                <div className="p-5 flex items-center gap-3 bg-white dark:bg-zinc-900">
                  <File size={26} className="text-primary-500 flex-shrink-0" />
                  <span className="font-semibold text-sm text-zinc-800 dark:text-zinc-200 truncate">{targetBlock.filename || 'File Document'}</span>
                </div>
              )}

              {blockType === 'video' && (
                <div className="w-full aspect-video bg-black flex items-center justify-center">
                  {(() => {
                    let videoId = "";
                    if (targetBlock.url?.includes("youtube.com/watch")) {
                      videoId = new URL(targetBlock.url).searchParams.get("v") || "";
                    } else if (targetBlock.url?.includes("youtu.be/")) {
                      videoId = targetBlock.url.split("youtu.be/")[1]?.split("?")[0];
                    }
                    const embedUrl = videoId ? `https://www.youtube.com/embed/${videoId}` : targetBlock.url;
                    return (
                      <iframe 
                        src={embedUrl} 
                        title="Video Player" 
                        frameBorder="0" 
                        className="w-full h-full pointer-events-none"
                      />
                    );
                  })()}
                </div>
              )}

              {blockType === 'audio' && (
                <div className="p-5 bg-white dark:bg-zinc-900">
                  <div className="font-bold text-sm text-zinc-800 dark:text-zinc-200 mb-1">{targetBlock.title || 'Voice Note'}</div>
                  {targetBlock.summary ? (
                    <div className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-3">{targetBlock.summary}</div>
                  ) : (
                    <div className="text-xs text-zinc-400 italic">Meeting audio attachment</div>
                  )}
                </div>
              )}
            </div>

            {/* Direct Drawing Canvas Layer Mounted Directly on the Content Card */}
            <div className="absolute inset-0 z-30 touch-none">
              <SpatialCanvas 
                strokes={strokes}
                setStrokes={setStrokes}
                pan={{ x: 0, y: 0 }}
                setPan={() => {}}
                zoom={1}
                setZoom={() => {}}
                width={cardDims.width}
                height={cardDims.height}
                tool={tool}
                activeColor={color}
                activeSize={size}
                activePresetType={tool === 'highlighter' ? 'highlighter' : 'pen'}
                eraserType="stroke"
                annotateBlockId={annotateBlockId}
                initialBlockY={initialBlockY}
              />
            </div>
          </div>
        </div>
      ) : (
        /* Standalone Clean Canvas Layer for Sketch Blocks */
        <div className="absolute inset-0 z-[2050]">
          <SpatialCanvas 
            strokes={strokes}
            setStrokes={setStrokes}
            pan={pan}
            setPan={setPan}
            zoom={zoom}
            setZoom={setZoom}
            tool={tool}
            activeColor={color}
            activeSize={size}
            activePresetType={tool === 'highlighter' ? 'highlighter' : 'pen'}
            eraserType="stroke"
            annotateBlockId={annotateBlockId}
            initialBlockY={initialBlockY}
          />
        </div>
      )}

      {/* Bottom Floating Drawing Toolbar */}
      <div 
        className="absolute bottom-0 left-0 right-0 p-3 z-[2200] pointer-events-auto flex flex-col items-center gap-2"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 18px)' }}
      >
        {/* Tool Size Sub-bar (if pen or highlighter) */}
        {tool !== 'eraser' && (
          <div className="bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md px-3 py-1 rounded-full shadow-md border border-zinc-200/80 dark:border-zinc-800 flex items-center gap-3">
            {SIZE_PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => setSize(p.size)}
                className={`w-6 h-6 flex items-center justify-center rounded-full transition-all ${
                  size === p.size 
                    ? 'bg-zinc-200 dark:bg-zinc-700 ring-2 ring-primary-500' 
                    : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200'
                }`}
                title={p.label}
              >
                <div 
                  className="rounded-full bg-current" 
                  style={{ width: p.iconSize, height: p.iconSize }}
                />
              </button>
            ))}
          </div>
        )}

        {/* Main Tool & Color Bar */}
        <div className="w-full max-w-[360px] bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-zinc-200/90 dark:border-zinc-800 px-3 py-2 flex items-center justify-between gap-1.5">
          
          {/* Tool Switchers */}
          <div className="flex items-center gap-1">
            <button 
              onClick={() => setTool('pen')}
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                tool === 'pen' 
                  ? 'bg-primary-50 text-primary-600 dark:bg-primary-950/60 dark:text-primary-400 ring-1.5 ring-primary-500' 
                  : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
              title="Pen"
            >
              <PenTool size={18} />
            </button>
            
            <button 
              onClick={() => setTool('highlighter')}
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                tool === 'highlighter' 
                  ? 'bg-yellow-50 text-yellow-600 dark:bg-yellow-950/60 dark:text-yellow-400 ring-1.5 ring-yellow-500' 
                  : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
              title="Highlighter"
            >
              <Highlighter size={18} />
            </button>

            <button 
              onClick={() => setTool('eraser')}
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                tool === 'eraser' 
                  ? 'bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-400 ring-1.5 ring-red-500' 
                  : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
              title="Eraser"
            >
              <Eraser size={18} />
            </button>
          </div>

          <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-800 flex-shrink-0" />

          {/* Color Palettes (When not erasing) */}
          {tool !== 'eraser' ? (
            <div className="flex items-center gap-1.5">
              {COLOR_PRESETS.map((c) => {
                const isSelected = color.toLowerCase() === c.value.toLowerCase();
                return (
                  <button
                    key={c.value}
                    onClick={() => setColor(c.value)}
                    className={`w-6 h-6 rounded-full border border-zinc-300 dark:border-zinc-600 transition-transform flex items-center justify-center ${
                      isSelected 
                        ? 'scale-110 ring-2 ring-offset-2 ring-primary-500 dark:ring-offset-zinc-900 shadow-sm' 
                        : 'opacity-80 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: c.value }}
                    title={c.label}
                  />
                );
              })}
            </div>
          ) : (
            <div className="text-xs text-zinc-400 font-medium px-2">
              Tap strokes to erase
            </div>
          )}

          <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-800 flex-shrink-0" />

          {/* Done Check Icon */}
          <button 
            onClick={onClose}
            className="w-9 h-9 bg-primary-600 hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600 text-white rounded-xl flex items-center justify-center shadow-sm active:scale-95 transition-all flex-shrink-0"
            title="Done Drawing"
          >
            <Check size={18} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  );
}
