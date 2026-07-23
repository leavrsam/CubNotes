"use client";

import React, { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import debounce from "lodash/debounce";
import { SpatialCanvas } from "./SpatialCanvas";
import { RichTextOverlay } from "./RichTextOverlay";

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

export type DocumentState = {
  strokes: Stroke[];
  texts: TextNode[];
};

export function CustomCanvas({ pageId }: CustomCanvasProps) {
  const [loading, setLoading] = useState(true);
  const [supabase] = useState(() => createClient());

  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [texts, setTexts] = useState<TextNode[]>([]);

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
        } else {
          setStrokes([]);
          setTexts([]);
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
    debounce(async (newStrokes: Stroke[], newTexts: TextNode[]) => {
      const state: DocumentState = { strokes: newStrokes, texts: newTexts };
      await supabase
        .from('pages')
        .update({ document_state: state })
        .eq('id', pageId);
    }, 1500),
    [pageId, supabase]
  );

  useEffect(() => {
    if (!loading) {
      saveToSupabase(strokes, texts);
    }
  }, [strokes, texts, loading, saveToSupabase]);

  if (loading) {
    return <div className="w-full h-full flex items-center justify-center text-zinc-500">Loading canvas...</div>;
  }

  return (
    <div className="w-full h-full relative overflow-hidden bg-[#fafafa] dark:bg-zinc-900" style={{ touchAction: 'none' }}>
      <SpatialCanvas 
        strokes={strokes}
        setStrokes={setStrokes}
        pan={pan}
        setPan={setPan}
        zoom={zoom}
        setZoom={setZoom}
      />
      <RichTextOverlay 
        texts={texts}
        setTexts={setTexts}
        pan={pan}
        zoom={zoom}
      />
    </div>
  );
}
