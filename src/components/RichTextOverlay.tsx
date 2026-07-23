"use client";

import React, { useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import type { TextNode } from "./CustomCanvas";
import { TipTapEditor } from "./TipTapEditor";

interface RichTextOverlayProps {
  texts: TextNode[];
  setTexts: React.Dispatch<React.SetStateAction<TextNode[]>>;
  pan: { x: number; y: number };
  zoom: number;
  onDoubleClick: (x: number, y: number) => void;
}

export function RichTextOverlay({ texts, setTexts, pan, zoom, onDoubleClick }: RichTextOverlayProps) {
  
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

  return (
    <div 
      className="absolute inset-0 z-10"
    >
      {/* Background capture for double clicks in text mode */}
      <div 
        className="absolute inset-0 cursor-text" 
        onDoubleClick={handleDoubleClick} 
      />
      
      {/* Text Node Layer */}
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
            className="absolute pointer-events-auto"
            style={{
              left: node.x,
              top: node.y,
              width: node.width,
            }}
          >
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
