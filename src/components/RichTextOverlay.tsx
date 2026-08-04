"use client";

import React, { useCallback, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import type { TextNode, ToolType } from "./CustomCanvas";
import { TipTapEditor } from "./TipTapEditor";
import { GripVertical } from "lucide-react";
import { Editor } from '@tiptap/react';

interface RichTextOverlayProps {
  texts: TextNode[];
  setTexts: React.Dispatch<React.SetStateAction<TextNode[]>>;
  pan: { x: number; y: number };
  zoom: number;
  onCanvasClick: (x: number, y: number) => void;
  tool: ToolType;
  selectedNodeId?: string | null;
  setSelectedNodeId?: React.Dispatch<React.SetStateAction<string | null>>;
  setActiveEditor?: (editor: Editor | null) => void;
  onEditorUpdate?: () => void;
}

export function RichTextOverlay({ 
  texts, setTexts, 
  pan, zoom, onCanvasClick, tool,
  selectedNodeId, setSelectedNodeId,
  setActiveEditor, onEditorUpdate
}: RichTextOverlayProps) {
  // Dragging state
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragStartRef = useRef<{ x: number, y: number, nodeX: number, nodeY: number } | null>(null);
  
  // Resizing state
  const [resizingId, setResizingId] = useState<string | null>(null);
  const resizeStartRef = useRef<{ x: number, nodeWidth: number } | null>(null);
  
  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if (e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;
    const worldX = (clientX - pan.x) / zoom;
    const worldY = (clientY - pan.y) / zoom;
    onCanvasClick(worldX, worldY);
  }, [pan, zoom, onCanvasClick]);

  const updateTextNode = useCallback((id: string, newContent: string) => {
    setTexts(prev => prev.map(t => t.id === id ? { ...t, content: newContent } : t));
  }, [setTexts]);

  const deleteTextNode = useCallback((id: string) => {
    setTexts(prev => prev.filter(t => t.id !== id));
  }, [setTexts]);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (draggingId && dragStartRef.current) {
      const deltaX = (e.clientX - dragStartRef.current.x) / zoom;
      const deltaY = (e.clientY - dragStartRef.current.y) / zoom;
      setTexts(prev => prev.map(t => {
        if (t.id === draggingId && dragStartRef.current) {
          return {
            ...t,
            x: dragStartRef.current.nodeX + deltaX,
            y: dragStartRef.current.nodeY + deltaY
          };
        }
        return t;
      }));
    } else if (resizingId && resizeStartRef.current) {
      const deltaX = (e.clientX - resizeStartRef.current.x) / zoom;
      setTexts(prev => prev.map(t => {
        if (t.id === resizingId && resizeStartRef.current) {
          return {
            ...t,
            width: Math.max(100, resizeStartRef.current.nodeWidth + deltaX)
          };
        }
        return t;
      }));
    }
  }, [draggingId, resizingId, setTexts, zoom]);

  const handlePointerUp = useCallback(() => {
    setDraggingId(null);
    dragStartRef.current = null;
    setResizingId(null);
    resizeStartRef.current = null;
  }, []);

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
    <div className="absolute inset-0 z-10 pointer-events-none">
      <div 
        className={`absolute inset-0 ${tool === 'home' ? 'cursor-text pointer-events-auto' : 'pointer-events-none'}`} 
        onClick={handleCanvasClick} 
      />
      
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          transformOrigin: '0 0',
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`
        }}
      >
        {texts.map(node => {
          const isSelected = selectedNodeId === node.id;
          return (
            <div 
              key={node.id}
              onPointerDown={(e) => {
                if (tool === 'home') {
                  e.stopPropagation();
                  setSelectedNodeId?.(node.id);
                }
              }}
              // Stop canvas click from firing when clicking inside the text box container
              onClick={(e) => e.stopPropagation()}
              className={`absolute pointer-events-auto group bg-transparent transition-colors border ${
                (tool === 'home' && node.content !== '<p></p>') 
                  ? ((draggingId === node.id || resizingId === node.id)
                      ? 'border-zinc-300 dark:border-zinc-700'
                      : 'border-transparent hover:border-zinc-300 dark:hover:border-zinc-700 focus-within:border-zinc-300 dark:focus-within:border-zinc-700')
                  : 'border-transparent'
              }`}
              style={{
                left: node.x,
                top: node.y,
                width: node.width,
              }}
            >
              {tool === 'home' && node.content !== '<p></p>' && (
                <>
                  {/* Drag Handle (Top Bar) */}
                  <div 
                    className={`absolute -top-[10px] left-[-1px] right-[-1px] h-[10px] cursor-grab active:cursor-grabbing bg-zinc-200 dark:bg-[#2b2b2b] transition-opacity z-20 flex items-center justify-between pl-1 border border-b-0 ${
                      (draggingId === node.id || resizingId === node.id)
                        ? 'opacity-100 border-zinc-300 dark:border-zinc-700'
                        : 'opacity-0 border-transparent group-hover:opacity-100 focus-within:opacity-100 group-focus-within:opacity-100 group-hover:border-zinc-300 dark:group-hover:border-zinc-700 group-focus-within:border-zinc-300 dark:group-focus-within:border-zinc-700'
                    }`}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDraggingId(node.id);
                      dragStartRef.current = {
                        x: e.clientX,
                        y: e.clientY,
                        nodeX: node.x,
                        nodeY: node.y
                      };
                    }}
                  >
                    <div className="w-4" /> {/* Spacer to center the dots */}
                    
                    <div className="flex gap-[2px] text-zinc-500 dark:text-zinc-400">
                      <div className="w-[1.5px] h-[1.5px] bg-current rounded-full" />
                      <div className="w-[1.5px] h-[1.5px] bg-current rounded-full" />
                      <div className="w-[1.5px] h-[1.5px] bg-current rounded-full" />
                      <div className="w-[1.5px] h-[1.5px] bg-current rounded-full" />
                    </div>

                    <div 
                      className="flex gap-[1px] text-[7px] text-zinc-500 dark:text-zinc-400 items-center justify-center h-full px-1 cursor-col-resize hover:text-zinc-300 transition-colors"
                      onPointerDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setResizingId(node.id);
                        resizeStartRef.current = {
                          x: e.clientX,
                          nodeWidth: node.width
                        };
                      }}
                    >
                      <span>◀</span>
                      <span>▶</span>
                    </div>
                  </div>

                  {/* Resize Handle (Right edge) */}
                  <div 
                    className="absolute -right-2 top-0 bottom-0 w-4 cursor-col-resize flex items-center justify-center z-20"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setResizingId(node.id);
                      resizeStartRef.current = {
                        x: e.clientX,
                        nodeWidth: node.width
                      };
                    }}
                  >
                    {/* Invisible hit area for resizing */}
                  </div>
                </>
              )}
              
              <TipTapEditor 
                content={node.content} 
                onChange={(content) => updateTextNode(node.id, content)}
                onDelete={() => deleteTextNode(node.id)}
                setActiveEditor={setActiveEditor}
                onEditorUpdate={onEditorUpdate}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
