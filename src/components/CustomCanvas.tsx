"use client";

import React, { useState, useEffect, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import { createClient } from "@/lib/supabase/client";
import debounce from "lodash/debounce";
import { Pen, Type, Hand } from "lucide-react";
import { SpatialCanvas } from "./SpatialCanvas";
import { RichTextOverlay } from "./RichTextOverlay";
import { AudioOverlay } from "./AudioOverlay";

interface CustomCanvasProps {
  pageId: string;
}

export type Stroke = {
  id: string;
  points: number[][]; // [x, y, pressure][]
  color: string;
  size: number;
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
  url: string;
};

export type ToolType = "pen" | "text" | "pan";

export type DocumentState = {
  strokes: Stroke[];
  texts: TextNode[];
  audios?: AudioNode[];
};

export function CustomCanvas({ pageId }: CustomCanvasProps) {
  const [loading, setLoading] = useState(true);
  const [supabase] = useState(() => createClient());

  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [texts, setTexts] = useState<TextNode[]>([]);
  const [audios, setAudios] = useState<AudioNode[]>([]);

  // Active Tool
  const [tool, setTool] = useState<ToolType>("pen");

  // Viewport state
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);

  // Load state from DB
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      setLoading(true);
      const { data, error } = await supabase
        .from("pages")
        .select("document_state")
        .eq("id", pageId)
        .single();
        
      if (error) {
        console.error("Failed to load canvas state:", error);
      } 
      
      if (isMounted) {
        if (data?.document_state) {
          const state = data.document_state as DocumentState;
          if (state.strokes) setStrokes(state.strokes);
          if (state.texts) setTexts(state.texts);
          if (state.audios) setAudios(state.audios);
        } else {
          setStrokes([]);
          setTexts([]);
          setAudios([]);
        }
        setLoading(false);
      }
    }
    
    loadData();
    
    return () => {
      isMounted = false;
    };
  }, [pageId, supabase]);

  // Save state to DB
  const saveToSupabase = useCallback(
    debounce(async (newStrokes: Stroke[], newTexts: TextNode[], newAudios: AudioNode[]) => {
      const state: DocumentState = { strokes: newStrokes, texts: newTexts, audios: newAudios };
      await supabase
        .from('pages')
        .update({ document_state: state })
        .eq('id', pageId);
    }, 1500),
    [pageId, supabase]
  );

  useEffect(() => {
    if (!loading) {
      saveToSupabase(strokes, texts, audios);
    }
  }, [strokes, texts, audios, loading, saveToSupabase]);

  const handleDoubleClick = useCallback((x: number, y: number) => {
    const newNode: TextNode = {
      id: uuidv4(),
      x,
      y,
      width: 400,
      content: "<p></p>"
    };
    setTexts(prev => [...prev, newNode]);
  }, []);

  useEffect(() => {
    const handleInjectSummary = (e: Event) => {
      const customEvent = e as CustomEvent<{ summary: string }>;
      const { summary } = customEvent.detail;
      
      // Calculate center of screen
      const screenCenterX = window.innerWidth / 2;
      const screenCenterY = window.innerHeight / 2;
      
      const worldX = (screenCenterX - pan.x) / zoom;
      const worldY = (screenCenterY - pan.y) / zoom;

      const newNode: TextNode = {
        id: uuidv4(),
        x: worldX,
        y: worldY,
        width: 500,
        // Convert basic markdown to HTML for TipTap
        content: summary.replace(/\n/g, '<br/>')
      };
      
      setTexts(prev => [...prev, newNode]);
    };

    const handleInjectAudio = (e: Event) => {
      const customEvent = e as CustomEvent<{ url: string }>;
      const { url } = customEvent.detail;
      
      // Calculate top right corner roughly
      const worldX = (window.innerWidth - 350 - pan.x) / zoom;
      const worldY = (40 - pan.y) / zoom;

      const newAudio: AudioNode = {
        id: uuidv4(),
        x: worldX,
        y: worldY,
        url
      };
      
      setAudios(prev => [...prev, newAudio]);
    };

    window.addEventListener('inject-summary', handleInjectSummary);
    window.addEventListener('inject-audio', handleInjectAudio);
    
    return () => {
      window.removeEventListener('inject-summary', handleInjectSummary);
      window.removeEventListener('inject-audio', handleInjectAudio);
    };
  }, [pan, zoom]);

  if (loading) {
    return <div className="w-full h-full flex items-center justify-center text-zinc-500">Loading canvas...</div>;
  }

  return (
    <div className="w-full h-full relative overflow-hidden bg-[#fafafa] dark:bg-zinc-900" style={{ touchAction: 'none' }}>
      
      {/* Tool Bar */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-white dark:bg-zinc-800 p-2 rounded-xl shadow-lg border border-zinc-200 dark:border-zinc-700">
        <button
          onClick={() => setTool("pen")}
          className={`p-2 rounded-lg transition-colors ${tool === "pen" ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-700'}`}
          title="Pen Tool (Draw anywhere)"
        >
          <Pen size={20} />
        </button>
        <button
          onClick={() => setTool("text")}
          className={`p-2 rounded-lg transition-colors ${tool === "text" ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-700'}`}
          title="Text Tool (Double-click to type)"
        >
          <Type size={20} />
        </button>
        <button
          onClick={() => setTool("pan")}
          className={`p-2 rounded-lg transition-colors ${tool === "pan" ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-700'}`}
          title="Pan Tool (Move canvas)"
        >
          <Hand size={20} />
        </button>
      </div>

      <div className="absolute inset-0" style={{ zIndex: tool === "pen" || tool === "pan" ? 30 : 10, pointerEvents: tool === "pen" || tool === "pan" ? "auto" : "none" }}>
        <SpatialCanvas 
          strokes={strokes}
          setStrokes={setStrokes}
          pan={pan}
          setPan={setPan}
          zoom={zoom}
          setZoom={setZoom}
          tool={tool}
        />
      </div>

      <div className="absolute inset-0" style={{ zIndex: 20, pointerEvents: tool === "text" ? "auto" : "none" }}>
        <RichTextOverlay 
          texts={texts}
          setTexts={setTexts}
          pan={pan}
          zoom={zoom}
          onDoubleClick={handleDoubleClick}
        />
      </div>

      <div className="absolute inset-0 z-40 pointer-events-none">
        <AudioOverlay 
          audios={audios}
          setAudios={setAudios}
          pan={pan}
          zoom={zoom}
        />
      </div>
    </div>
  );
}
