import React, { useEffect, useState, useRef } from 'react';
import { SpatialCanvas } from './SpatialCanvas';
import { PenTool, Eraser, Highlighter, Check, X } from 'lucide-react';
import type { Stroke } from './CustomCanvas';

interface MobileDrawOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  annotateBlockId: string | null;
  strokes: Stroke[];
  setStrokes: React.Dispatch<React.SetStateAction<Stroke[]>>;
}

export function MobileDrawOverlay({ isOpen, onClose, annotateBlockId, strokes, setStrokes }: MobileDrawOverlayProps) {
  const [tool, setTool] = useState<'pen' | 'highlighter' | 'eraser'>('pen');
  const [color, setColor] = useState('#000000');
  const [size, setSize] = useState(4);
  const [blockRect, setBlockRect] = useState<{ x: number, y: number, width: number, height: number } | null>(null);

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
        // Fallback if element not found somehow
        setBlockRect(null);
      }
    } else {
      setBlockRect(null);
    }
  }, [isOpen, annotateBlockId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col">
      {/* Background Mask */}
      {annotateBlockId && blockRect ? (
        <div 
          className="absolute inset-0 pointer-events-none bg-black/60 backdrop-blur-sm"
          style={{
            clipPath: `polygon(
              0% 0%, 0% 100%, 100% 100%, 100% 0%, 0% 0%,
              ${blockRect.x}px ${blockRect.y}px,
              ${blockRect.x + blockRect.width}px ${blockRect.y}px,
              ${blockRect.x + blockRect.width}px ${blockRect.y + blockRect.height}px,
              ${blockRect.x}px ${blockRect.y + blockRect.height}px,
              ${blockRect.x}px ${blockRect.y}px
            )`
          }}
        />
      ) : (
        <div className="absolute inset-0 pointer-events-none bg-white/90 dark:bg-black/90 backdrop-blur-md" />
      )}

      {/* Title / Header */}
      <div className="absolute top-safe left-0 right-0 p-4 flex items-center justify-between z-[110] pointer-events-auto">
        <div className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur px-4 py-2 rounded-full shadow-sm text-sm font-semibold">
          {annotateBlockId ? 'Annotating Block' : 'Global Sketch'}
        </div>
        <button 
          onClick={onClose}
          className="w-10 h-10 bg-white/80 dark:bg-zinc-900/80 backdrop-blur rounded-full flex items-center justify-center text-zinc-800 dark:text-zinc-200 shadow-sm"
        >
          <X size={20} />
        </button>
      </div>

      {/* Canvas Layer */}
      <div className="absolute inset-0 z-[105]">
        <SpatialCanvas 
          strokes={strokes}
          setStrokes={setStrokes}
          pan={{ x: 0, y: 0 }}
          setPan={() => {}} // No panning in mobile overlay
          zoom={1}
          setZoom={() => {}} // No zooming
          tool={tool}
          activeColor={color}
          activeSize={size}
          activePresetType={tool === 'highlighter' ? 'highlighter' : 'pen'}
          eraserType="stroke"
          annotateBlockId={annotateBlockId}
          blockOffsetMap={annotateBlockId && blockRect ? { [annotateBlockId]: { x: blockRect.x, y: blockRect.y } } : undefined}
        />
      </div>

      {/* Bottom Toolbar */}
      <div className="absolute bottom-safe left-0 right-0 p-4 pb-8 z-[110] pointer-events-auto flex items-end justify-center">
        <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800 p-2 flex items-center gap-2">
          
          <button 
            onClick={() => setTool('pen')}
            className={`p-3 rounded-xl transition-all ${tool === 'pen' ? 'bg-primary-100 text-primary-600 dark:bg-yellow-500/20 dark:text-yellow-500' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
          >
            <PenTool size={24} />
          </button>
          
          <button 
            onClick={() => setTool('highlighter')}
            className={`p-3 rounded-xl transition-all ${tool === 'highlighter' ? 'bg-primary-100 text-primary-600 dark:bg-yellow-500/20 dark:text-yellow-500' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
          >
            <Highlighter size={24} />
          </button>

          <button 
            onClick={() => setTool('eraser')}
            className={`p-3 rounded-xl transition-all ${tool === 'eraser' ? 'bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
          >
            <Eraser size={24} />
          </button>

          <div className="w-px h-8 bg-zinc-200 dark:bg-zinc-800 mx-1" />

          {/* Colors (only show if not erasing) */}
          {tool !== 'eraser' && (
            <div className="flex gap-1 px-1">
              {['#000000', '#EF4444', '#3B82F6', '#10B981', '#F59E0B'].map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full border-2 transition-transform ${color === c ? 'border-primary-500 scale-110' : 'border-transparent hover:scale-105'}`}
                  style={{ backgroundColor: c === '#000000' ? (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? '#FFFFFF' : '#000000') : c }}
                />
              ))}
            </div>
          )}

          <div className="w-px h-8 bg-zinc-200 dark:bg-zinc-800 mx-1" />

          <button 
            onClick={onClose}
            className="p-3 bg-primary-600 hover:bg-primary-700 dark:bg-yellow-500 dark:hover:bg-yellow-600 text-white dark:text-black rounded-xl font-bold transition-colors shadow-sm ml-1"
          >
            <Check size={24} />
          </button>
        </div>
      </div>
    </div>
  );
}
