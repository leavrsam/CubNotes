"use client";

import React, { useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import type { TextNode, ToolType } from "./CustomCanvas";
import { TipTapEditor } from "./TipTapEditor";
import { GripVertical } from "lucide-react";

interface RichTextOverlayProps {
  texts: TextNode[];
  setTexts: React.Dispatch<React.SetStateAction<TextNode[]>>;
  pan: { x: number; y: number };
  zoom: number;
  onDoubleClick: (x: number, y: number) => void;
  tool: ToolType;
}

export function RichTextOverlay({ texts, setTexts, pan, zoom, onDoubleClick, tool }: RichTextOverlayProps) {
  // Dragging state
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const dragStartRef = React.useRef<{ x: number, y: number, nodeX: number, nodeY: number } | null>(null);
  
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    // Only trigger if clicking directly on the overlay background, not on an existing text box
    if (e.target !== e.currentTarget) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;
    
    // Convert screen coordinates to world coordinates
    const worldX = (clientX - pan.x) / zoom;
    const worldY = (clientY - pan.y) / zoom;
    
    onDoubleClick(worldX, worldY);
  }, [pan, zoom, onDoubleClick]);

  const updateTextNode = useCallback((id: string, newContent: string) => {
    setTexts(prev => prev.map(t => t.id === id ? { ...t, content: newContent } : t));
  }, [setTexts]);

  const deleteTextNode = useCallback((id: string) => {
    setTexts(prev => prev.filter(t => t.id !== id));
  }, [setTexts]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingId || !dragStartRef.current) return;
    
    // We calculate the delta in screen pixels, then divide by zoom to get world pixels
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
  }, [draggingId, setTexts, zoom]);

  const handlePointerUp = useCallback(() => {
    setDraggingId(null);
    dragStartRef.current = null;
  }, []);

  return (
    <div 
      className="absolute inset-0 z-10"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      {/* Background capture for double clicks in text mode */}
      <div 
        className="absolute inset-0 cursor-text" 
        onDoubleClick={handleDoubleClick} 
      />
      
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          transformOrigin: '0 0',
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`
        }}
      >
        {texts.map(node => (
          <div 
            key={node.id}
            className={`absolute pointer-events-auto group ${tool === 'select' ? 'ring-1 ring-dashed ring-zinc-400 hover:ring-indigo-400' : ''}`}
            style={{
              left: node.x,
              top: node.y,
              width: node.width,
            }}
          >
            {tool === 'select' && (
              <div 
                className="absolute -left-6 top-0 p-1 cursor-grab active:cursor-grabbing text-zinc-400 hover:text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity"
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
                <GripVertical size={16} />
              </div>
            )}
            <TipTapEditor 
              content={node.content} 
              onChange={(content) => updateTextNode(node.id, content)}
              onDelete={() => deleteTextNode(node.id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
