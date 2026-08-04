"use client";

import React, { useState, useEffect, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import { createClient } from "@/lib/supabase/client";
import debounce from "lodash/debounce";
import { format } from "date-fns";
import { Pen, Type, Hand, MousePointer2 } from "lucide-react";
import { SpatialCanvas } from "./SpatialCanvas";
import { RichTextOverlay } from "./RichTextOverlay";
import { AudioOverlay } from "./AudioOverlay";

interface CustomCanvasProps {
  pageId: string;
  pageTitle: string;
  pageCreatedAt: string;
  onUpdatePageTitle: (title: string) => void;
}

export type Stroke = {
  id: string;
  points: number[][]; // [x, y, pressure][]
  color: string;
  size: number;
  x?: number;
  y?: number;
  scaleX?: number;
  scaleY?: number;
};

export type TextNode = {
  id: string;
  x: number;
  y: number;
  content: string;
  width: number;
};

export type AudioNode = {
  id: string;
  x: number;
  y: number;
  width?: number;
  url: string;
  title?: string;
  summary?: string;
  transcript?: string;
};

export type ToolType = "home" | "pen" | "pan";
export type RibbonTab = "Home" | "Insert" | "Draw" | "View";

export type DocumentState = {
  strokes: Stroke[];
  texts: TextNode[];
  audios?: AudioNode[];
};

import { useCanvasData } from "@/hooks/useCanvasData";
import { Mic } from "lucide-react";
import toast from "react-hot-toast";

export function CustomCanvas({ pageId, pageTitle, pageCreatedAt, onUpdatePageTitle }: CustomCanvasProps) {
  const { loading, strokes, setStrokes, texts, setTexts, audios, setAudios } = useCanvasData(pageId);

  // Drawing state
  const [activeColor, setActiveColor] = useState("#3f3f46"); // zinc-700
  const [activeSize, setActiveSize] = useState(4);

  // Selection state
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Active Tool and Ribbon
  const [tool, setTool] = useState<ToolType>("home");
  const [activeTab, setActiveTab] = useState<RibbonTab>("Home");

  // Viewport state
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);

  const handleCanvasClick = useCallback((x: number, y: number) => {
    // In 'home' mode, clicking the canvas creates a text block
    if (tool === "home") {
      const newNode: TextNode = {
        id: uuidv4(),
        x,
        y,
        width: 600,
        content: "<p></p>"
      };
      setTexts(prev => [...prev, newNode]);
    }
  }, [tool, setTexts]);

  useEffect(() => {
    const handleInjectSummary = (e: Event) => {
      const customEvent = e as CustomEvent<{ id: string, summary: string, transcript: string }>;
      const { id, summary, transcript } = customEvent.detail;
      
      setAudios(prev => prev.map(audio => {
        if (audio.id === id) {
          return { ...audio, summary, transcript };
        }
        return audio;
      }));
    };

    const handleInjectAudio = (e: Event) => {
      const customEvent = e as CustomEvent<{ id: string, url: string }>;
      const { id, url } = customEvent.detail;
      
      // Calculate center of screen for the audio node
      const screenCenterX = window.innerWidth / 2;
      const screenCenterY = window.innerHeight / 2;
      
      // Offset by half the width of the audio player (approx 160px) to truly center it
      const worldX = (screenCenterX - 160 - pan.x) / zoom;
      const worldY = (screenCenterY - pan.y) / zoom;

      const newAudio: AudioNode = {
        id: id || uuidv4(),
        x: worldX,
        y: worldY,
        width: 400,
        url,
        title: "Meeting Recording"
      };
      
      setAudios(prev => [...prev, newAudio]);
    };

    window.addEventListener('inject-summary', handleInjectSummary);
    window.addEventListener('inject-audio', handleInjectAudio);
    
    return () => {
      window.removeEventListener('inject-summary', handleInjectSummary);
      window.removeEventListener('inject-audio', handleInjectAudio);
    };
  }, [pan, zoom, setAudios]);

  if (loading) {
    return <div className="w-full h-full flex items-center justify-center text-zinc-500">Loading canvas...</div>;
  }

  return (
    <div className="w-full h-full relative overflow-hidden bg-[#fafafa] dark:bg-zinc-900" style={{ touchAction: 'none' }}>
      
      {/* Top Ribbon Container */}
      <div className="absolute top-0 left-0 w-full bg-[#f3f2f1] dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 z-50 flex flex-col pointer-events-auto">
        {/* Tab Headers */}
        <div className="flex px-2 pt-2 gap-1">
          {(["Home", "Insert", "Draw", "View"] as RibbonTab[]).map(tab => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                if (tab === "Home") setTool("home");
                if (tab === "Draw") setTool("pen");
              }}
              className={`px-4 py-1.5 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === tab 
                  ? 'bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 border-t border-l border-r border-zinc-200 dark:border-zinc-800' 
                  : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        
        {/* Ribbon Content */}
        <div className="h-20 bg-white dark:bg-zinc-900 flex items-center px-4 gap-6 shadow-sm">
          {activeTab === "Home" && (
            <div className="flex items-center gap-4">
              <button
                onClick={() => setTool("home")}
                className={`flex flex-col items-center gap-1 p-2 rounded ${tool === "home" ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300'}`}
              >
                <MousePointer2 size={24} strokeWidth={1.5} />
                <span className="text-[11px] font-medium">Select / Type</span>
              </button>
            </div>
          )}
          
          {activeTab === "Insert" && (
            <div className="flex items-center gap-4">
              <button
                onClick={() => {
                  toast.success("To record audio, use the mic icon in the main sidebar.", { icon: '🎙️' });
                }}
                className={`flex flex-col items-center gap-1 p-2 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300`}
              >
                <Mic size={24} strokeWidth={1.5} />
                <span className="text-[11px] font-medium">Audio</span>
              </button>
            </div>
          )}

          {activeTab === "Draw" && (
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setTool("pen")}
                  className={`flex flex-col items-center gap-1 p-2 rounded ${tool === "pen" ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300'}`}
                >
                  <Pen size={24} strokeWidth={1.5} />
                  <span className="text-[11px] font-medium">Pen</span>
                </button>
                <button
                  onClick={() => setTool("pan")}
                  className={`flex flex-col items-center gap-1 p-2 rounded ${tool === "pan" ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300'}`}
                >
                  <Hand size={24} strokeWidth={1.5} />
                  <span className="text-[11px] font-medium">Pan</span>
                </button>
              </div>

              <div className="w-px h-10 bg-zinc-200 dark:bg-zinc-700" />

              <div className="flex flex-col gap-2">
                <span className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider">Color</span>
                <div className="flex items-center gap-1">
                  {['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7', '#3f3f46', '#ffffff'].map(color => (
                    <button
                      key={color}
                      onClick={() => { setActiveColor(color); setTool("pen"); }}
                      className={`w-6 h-6 rounded-full border-2 transition-transform ${activeColor === color && tool === "pen" ? 'scale-125 border-zinc-400 shadow-sm' : 'border-transparent hover:scale-110'}`}
                      style={{ backgroundColor: color }}
                      title={`Color: ${color}`}
                    />
                  ))}
                </div>
              </div>
              
              <div className="w-px h-10 bg-zinc-200 dark:bg-zinc-700" />

              <div className="flex flex-col gap-2">
                <span className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider">Thickness</span>
                <div className="flex items-center gap-2">
                  {[2, 4, 8, 12].map(size => (
                    <button
                      key={size}
                      onClick={() => { setActiveSize(size); setTool("pen"); }}
                      className={`w-8 h-8 flex items-center justify-center rounded transition-colors ${activeSize === size && tool === "pen" ? 'bg-zinc-200 dark:bg-zinc-700' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                      title={`Thickness: ${size}`}
                    >
                      <div 
                        className="rounded-full bg-current text-zinc-900 dark:text-zinc-100" 
                        style={{ width: size, height: size }} 
                      />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Page Title overlay */}
      <div className="absolute top-48 left-16 z-40 pointer-events-none">
        <input
          type="text"
          value={pageTitle}
          onChange={(e) => onUpdatePageTitle(e.target.value)}
          placeholder="Page Title"
          className="bg-transparent text-4xl font-bold text-zinc-900 dark:text-zinc-100 border-none outline-none focus:ring-0 placeholder:text-zinc-300 dark:placeholder:text-zinc-700 w-[500px] pointer-events-auto"
        />
        {/* Decorative OneNote-style underline */}
        <div className="w-[500px] h-[1px] bg-gradient-to-r from-zinc-300 to-transparent dark:from-zinc-700 mt-2"></div>
        {pageCreatedAt && (
          <div className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 whitespace-pre">
            {format(new Date(pageCreatedAt), "EEEE, MMMM d, yyyy     h:mm a")}
          </div>
        )}
      </div>

      <div className="absolute inset-0" style={{ zIndex: tool === "pen" || tool === "pan" ? 30 : 10, pointerEvents: tool === "pen" || tool === "pan" || tool === "select" ? "auto" : "none" }}>
        <SpatialCanvas 
          strokes={strokes}
          setStrokes={setStrokes}
          pan={pan}
          setPan={setPan}
          zoom={zoom}
          setZoom={setZoom}
          tool={tool}
          activeColor={activeColor}
          activeSize={activeSize}
          selectedNodeId={selectedNodeId}
          setSelectedNodeId={setSelectedNodeId}
        />
      </div>

      <div className="absolute inset-0 z-20 pointer-events-none">
        <RichTextOverlay 
          texts={texts}
          setTexts={setTexts}
          pan={pan}
          zoom={zoom}
          onCanvasClick={handleCanvasClick}
          tool={tool}
          selectedNodeId={selectedNodeId}
          setSelectedNodeId={setSelectedNodeId}
        />
      </div>

      <div className="absolute inset-0 z-40 pointer-events-none">
        <AudioOverlay 
          audios={audios}
          setAudios={setAudios}
          pan={pan}
          zoom={zoom}
          tool={tool}
          selectedNodeId={selectedNodeId}
          setSelectedNodeId={setSelectedNodeId}
        />
      </div>
    </div>
  );
}
