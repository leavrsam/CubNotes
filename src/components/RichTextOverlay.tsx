"use client";

import React, { useCallback, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import type { TextNode, ToolType } from "./CustomCanvas";
import { TipTapEditor } from "./TipTapEditor";
import { GripVertical } from "lucide-react";

interface RichTextOverlayProps {
  texts: TextNode[];
  setTexts: React.Dispatch<React.SetStateAction<TextNode[]>>;
  pan: { x: number; y: number };
  zoom: number;
  onCanvasClick: (x: number, y: number) => void;
  tool: ToolType;
  selectedNodeId?: string | null;
  setSelectedNodeId?: React.Dispatch<React.SetStateAction<string | null>>;
}

export function RichTextOverlay({ 
  texts, setTexts, 
  pan, zoom, onCanvasClick, tool,
  selectedNodeId, setSelectedNodeId
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
        className={`absolute inset-0 ${tool === 'text' ? 'cursor-text pointer-events-auto' : 'pointer-events-none'}`} 
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
                if (tool === 'select') {
                  e.stopPropagation();
                  setSelectedNodeId?.(node.id);
                }
              }}
              className={`absolute pointer-events-auto group border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700 transition-colors ${isSelected && tool === 'select' ? 'ring-2 ring-indigo-500 rounded-b-md' : 'rounded-b-md'}`}
              style={{
                left: node.x,
                top: node.y,
                width: node.width,
              }}
            >
              {isSelected && tool === 'select' && (
                <>
                  {/* Drag Handle (Move) */}
                  <div 
                    className="absolute -top-4 left-[-1px] right-[-1px] h-4 cursor-grab active:cursor-grabbing bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 rounded-t-md opacity-0 group-hover:opacity-100 transition-opacity z-20 flex items-center justify-center"
                    onPointerDown={(e) => {
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
                    <div className="w-8 h-1 bg-zinc-400 dark:bg-zinc-500 rounded-full" />
                  </div>

                  {/* Resize Handle (Right edge) */}
                  <div 
                    className="absolute -right-2 top-0 bottom-0 w-4 cursor-col-resize flex items-center justify-center group/resize z-20"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setResizingId(node.id);
                      resizeStartRef.current = {
                        x: e.clientX,
                        nodeWidth: node.width
                      };
                    }}
                  >
                    <div className="w-1 h-8 bg-indigo-300 group-hover/resize:bg-indigo-500 rounded-full" />
                  </div>
                </>
              )}
              <TipTapEditor 
                content={node.content} 
                onChange={(content) => updateTextNode(node.id, content)}
                onDelete={() => deleteTextNode(node.id)}
              />
              {/* Invisible overlay to capture clicks when in select mode */}
              {tool === 'select' && (
                <div className="absolute inset-0 z-10 cursor-pointer" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
