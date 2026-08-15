import React, { useEffect, useState } from 'react';
import { SpatialCanvas } from './SpatialCanvas';
import { PenTool, Eraser, Highlighter, Check, X, Circle } from 'lucide-react';
import { useTheme } from 'next-themes';
import type { Stroke } from './CustomCanvas';

interface MobileDrawOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  annotateBlockId: string | null;
  blockType?: string | null;
  strokes: Stroke[];
  setStrokes: React.Dispatch<React.SetStateAction<Stroke[]>>;
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

export function MobileDrawOverlay({ isOpen, onClose, annotateBlockId, blockType, strokes, setStrokes }: MobileDrawOverlayProps) {
  const { resolvedTheme } = useTheme();
  const [tool, setTool] = useState<'pen' | 'highlighter' | 'eraser'>('pen');
  const [color, setColor] = useState('#FFFFFF');
  const [size, setSize] = useState(4);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [blockRect, setBlockRect] = useState<{ x: number, y: number, width: number, height: number } | null>(null);

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

  // Set default drawing color based on current theme and reset pan/zoom on open
  useEffect(() => {
    if (isOpen) {
      setPan({ x: 0, y: 0 });
      setZoom(1);
      if (resolvedTheme === 'dark') {
        setColor('#FFFFFF');
      } else {
        setColor('#000000');
      }
    }
  }, [isOpen, resolvedTheme]);

  useEffect(() => {
    if (isOpen && annotateBlockId) {
      const el = document.getElementById(`block-${annotateBlockId}`);
      if (el) {
        const rect = el.getBoundingClientRect();
        setBlockRect({
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height
        });
      } else {
        // Default centered focus box for new sketch block
        const defaultWidth = Math.min(typeof window !== 'undefined' ? window.innerWidth - 32 : 360, 500);
        const defaultHeight = 280;
        const defaultX = typeof window !== 'undefined' ? (window.innerWidth - defaultWidth) / 2 : 16;
        const defaultY = typeof window !== 'undefined' ? Math.max(80, (window.innerHeight - defaultHeight) / 2 - 40) : 100;
        setBlockRect({
          x: defaultX,
          y: defaultY,
          width: defaultWidth,
          height: defaultHeight
        });
      }
    } else {
      setBlockRect(null);
    }
  }, [isOpen, annotateBlockId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[2000] flex flex-col select-none overflow-hidden touch-none bg-zinc-50 dark:bg-zinc-950 animate-in fade-in duration-150">
      
      {/* Top Header Bar */}
      <div 
        className="absolute top-0 left-0 right-0 px-4 py-3 flex items-center justify-between z-[2100] pointer-events-auto"
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

      {/* Clean Dedicated Canvas Layer */}
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
          blockOffsetMap={annotateBlockId ? { [annotateBlockId]: { x: 0, y: 0 } } : undefined}
        />
      </div>

      {/* Bottom Floating Drawing Toolbar (Compact & Fits on all screens) */}
      <div 
        className="absolute bottom-0 left-0 right-0 p-3 z-[2100] pointer-events-auto flex flex-col items-center gap-2"
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
