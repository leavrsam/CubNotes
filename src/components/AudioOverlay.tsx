"use client";

import React, { useCallback, useRef, useState } from "react";
import type { AudioNode, ToolType } from "./CustomCanvas";
import { Trash2, Edit2, Check, GripVertical } from "lucide-react";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'react-markdown';

interface AudioOverlayProps {
  audios: AudioNode[];
  setAudios: React.Dispatch<React.SetStateAction<AudioNode[]>>;
  pan: { x: number; y: number };
  zoom: number;
  tool: ToolType;
  selectedIds?: string[];
  setSelectedIds?: React.Dispatch<React.SetStateAction<string[]>>;
  onDragSelectionStart?: (id: string) => void;
  onDragSelectionMove?: (deltaX: number, deltaY: number) => void;
  onDragSelectionEnd?: () => void;
}

export function AudioOverlay({ 
  audios, setAudios, 
  pan, zoom, tool,
  selectedIds = [], setSelectedIds,
  onDragSelectionStart, onDragSelectionMove, onDragSelectionEnd
}: AudioOverlayProps) {
  
  const [editingId, setEditingId] = useState<{ id: string, field: 'summary' | 'transcript' } | null>(null);

  // Dragging state
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragStartRef = useRef<{ x: number, y: number, nodeX: number, nodeY: number } | null>(null);
  
  // Resizing state
  const [resizingId, setResizingId] = useState<string | null>(null);
  const resizeStartRef = useRef<{ x: number, nodeWidth: number } | null>(null);

  const deleteAudioNode = useCallback((id: string) => {
    setAudios(prev => prev.filter(a => a.id !== id));
  }, [setAudios]);

  const updateAudioTitle = useCallback((id: string, newTitle: string) => {
    setAudios(prev => prev.map(a => a.id === id ? { ...a, title: newTitle } : a));
  }, [setAudios]);

  const updateAudioField = useCallback((id: string, field: 'summary' | 'transcript', value: string) => {
    setAudios(prev => prev.map(a => a.id === id ? { ...a, [field]: value } : a));
  }, [setAudios]);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (draggingId && dragStartRef.current) {
      const deltaX = (e.clientX - dragStartRef.current.x) / zoom;
      const deltaY = (e.clientY - dragStartRef.current.y) / zoom;
      onDragSelectionMove?.(deltaX, deltaY);
    } else if (resizingId && resizeStartRef.current) {
      const deltaX = (e.clientX - resizeStartRef.current.x) / zoom;
      setAudios(prev => prev.map(a => {
        if (a.id === resizingId && resizeStartRef.current) {
          return {
            ...a,
            width: Math.max(300, resizeStartRef.current.nodeWidth + deltaX) // Min width 300 for audio player
          };
        }
        return a;
      }));
    }
  }, [draggingId, resizingId, setAudios, zoom]);

  const handlePointerUp = useCallback(() => {
    if (draggingId) {
      onDragSelectionEnd?.();
    }
    setDraggingId(null);
    dragStartRef.current = null;
    setResizingId(null);
    resizeStartRef.current = null;
  }, [draggingId, onDragSelectionEnd]);

  React.useEffect(() => {
    if (draggingId || resizingId) {
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      return () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
      };
    }
  }, [draggingId, resizingId, handlePointerMove, handlePointerUp]);

  return (
    <div className="absolute inset-0 z-20 pointer-events-none">
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          transformOrigin: '0 0',
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`
        }}
      >
        {audios.map(node => {
          const isSelected = selectedIds.includes(node.id);
          return (
            <div 
              key={node.id}
              onPointerDown={(e) => {
                if (tool === 'home') {
                  e.stopPropagation();
                  setSelectedIds?.([node.id]);
                }
              }}
              className={`absolute pointer-events-auto group transition-colors rounded-xl`}
              style={{
                left: node.x,
                top: node.y,
                width: node.width || 400,
              }}
            >
              {tool === 'home' && (
                <>
                  {/* Drag Handle (Move) */}
                  <div 
                    className="absolute -top-5 left-[1px] right-[1px] h-5 cursor-grab active:cursor-grabbing bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 rounded-t-2xl opacity-0 group-hover:opacity-100 transition-opacity z-20 flex items-center justify-center border border-transparent border-b-0 group-hover:border-zinc-300 dark:group-hover:border-zinc-700"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      onDragSelectionStart?.(node.id);
                      setDraggingId(node.id);
                      dragStartRef.current = {
                        x: e.clientX,
                        y: e.clientY,
                        nodeX: node.x,
                        nodeY: node.y
                      };
                    }}
                  >
                    <div className="flex gap-1">
                      <div className="w-1 h-1 bg-zinc-500 rounded-full" />
                      <div className="w-1 h-1 bg-zinc-500 rounded-full" />
                      <div className="w-1 h-1 bg-zinc-500 rounded-full" />
                      <div className="w-1 h-1 bg-zinc-500 rounded-full" />
                    </div>
                  </div>

                  {/* Resize Handle (Right edge) */}
                  <div 
                    className="absolute -right-2 top-0 bottom-0 w-4 cursor-col-resize flex items-center justify-center group/resize z-20 opacity-0 group-hover:opacity-100 transition-opacity"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setResizingId(node.id);
                      resizeStartRef.current = {
                        x: e.clientX,
                        nodeWidth: node.width || 400
                      };
                    }}
                  >
                    <div className="w-1.5 h-6 bg-zinc-300 dark:bg-zinc-600 group-hover/resize:bg-zinc-500 rounded-full" />
                  </div>
                </>
              )}

                <div className="w-full flex flex-col bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-zinc-200/50 dark:border-zinc-700/50 max-h-[85vh] overflow-y-auto overflow-x-hidden">
                  
                  {/* Sticky Header Section */}
                  <div className="sticky top-0 z-10 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border-b border-zinc-200/50 dark:border-zinc-700/50 pt-5 pb-3 px-5">
                    <div className="flex justify-between items-center mb-3">
                      <input 
                        type="text"
                        value={node.title || "Audio File"}
                        onChange={(e) => updateAudioTitle(node.id, e.target.value)}
                        className={`text-lg font-bold text-zinc-900 dark:text-white bg-transparent border-none outline-none hover:bg-black/5 dark:hover:bg-white/5 px-2 py-1 -ml-2 rounded-lg transition-colors w-full tracking-tight`}
                        placeholder="Recording Name..."
                      />
                      <button 
                        onClick={() => deleteAudioNode(node.id)}
                        className={`text-red-500 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity p-1 ml-2 flex-shrink-0`}
                        title="Delete Recording"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    
                    <audio controls className={`w-full outline-none`}>
                      <source src={node.url} type="audio/webm" />
                      Your browser does not support the audio element.
                    </audio>
                  </div>

                  {/* Scrollable Content Section */}
                  <div 
                    className="p-5 pt-2 flex flex-col gap-3"
                    onWheel={(e) => e.stopPropagation()}
                  >

                {node.summary && (
                  <details open className="mt-2 group/details">
                    <summary className="text-xs font-semibold text-zinc-500 uppercase tracking-wider cursor-pointer hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors list-none flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="transform transition-transform group-open/details:rotate-90">▶</span>
                        View Summary
                      </div>
                      <button 
                        onClick={(e) => {
                          e.preventDefault();
                          if (editingId?.id === node.id && editingId?.field === 'summary') {
                            setEditingId(null);
                          } else {
                            setEditingId({ id: node.id, field: 'summary' });
                          }
                        }}
                        className={`p-1 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors`}
                      >
                        {editingId?.id === node.id && editingId?.field === 'summary' ? <Check size={14} /> : <Edit2 size={14} />}
                      </button>
                    </summary>
                    <div className={`mt-3`}>
                      {editingId?.id === node.id && editingId?.field === 'summary' ? (
                        <textarea 
                          value={node.summary}
                          onChange={(e) => updateAudioField(node.id, 'summary', e.target.value)}
                          className="w-full h-40 p-3 text-sm text-zinc-700 dark:text-zinc-300 bg-zinc-50/50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/50 resize-y transition-shadow"
                        />
                      ) : (
                        <div className={`text-sm text-zinc-700 dark:text-zinc-300 prose prose-sm dark:prose-invert prose-p:leading-relaxed prose-pre:bg-zinc-100 dark:prose-pre:bg-zinc-900 overflow-hidden ${node.summary?.includes('Transcribing and summarizing') ? 'animate-pulse text-indigo-500 dark:text-indigo-400 font-medium flex items-center gap-2' : ''}`}>
                          {node.summary?.includes('Transcribing and summarizing') && (
                            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          )}
                          <ReactMarkdown>{node.summary || ""}</ReactMarkdown>
                        </div>
                      )}
                    </div>
                  </details>
                )}

                {node.transcript && (
                  <details className="mt-2 border-t border-zinc-200 dark:border-zinc-700 pt-2 group/details">
                    <summary className="text-xs font-semibold text-zinc-500 uppercase tracking-wider cursor-pointer hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors list-none flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="transform transition-transform group-open/details:rotate-90">▶</span>
                        View Transcript
                      </div>
                      <button 
                        onClick={(e) => {
                          e.preventDefault();
                          if (editingId?.id === node.id && editingId?.field === 'transcript') {
                            setEditingId(null);
                          } else {
                            setEditingId({ id: node.id, field: 'transcript' });
                          }
                        }}
                        className={`p-1 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors`}
                      >
                        {editingId?.id === node.id && editingId?.field === 'transcript' ? <Check size={14} /> : <Edit2 size={14} />}
                      </button>
                    </summary>
                    <div className={`mt-3`}>
                      {editingId?.id === node.id && editingId?.field === 'transcript' ? (
                        <textarea 
                          value={node.transcript}
                          onChange={(e) => updateAudioField(node.id, 'transcript', e.target.value)}
                          className="w-full h-64 p-3 text-sm text-zinc-700 dark:text-zinc-300 bg-zinc-50/50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/50 resize-y transition-shadow"
                        />
                      ) : (
                        <div className="text-sm text-zinc-600 dark:text-zinc-400 max-h-[300px] overflow-y-auto pr-3 custom-scrollbar whitespace-pre-wrap leading-loose font-mono text-[13px] bg-black/5 dark:bg-white/5 p-4 rounded-xl border border-zinc-200/50 dark:border-zinc-700/50">
                          {node.transcript}
                        </div>
                      )}
                    </div>
                  </details>
                )}
                  </div>
                </div>
              </div>
          );
        })}
      </div>
    </div>
  );
}
