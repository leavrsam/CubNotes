"use client";

import React, { useState, useEffect } from "react";
import { Tldraw, useEditor, createTLStore, defaultShapeUtils, TLStore, loadSnapshot, getSnapshot, toRichText } from "tldraw";
import "tldraw/tldraw.css";
import { createClient } from "@/lib/supabase/client";
import debounce from "lodash/debounce";

interface TldrawCanvasProps {
  pageId: string;
}

export function TldrawCanvas({ pageId }: TldrawCanvasProps) {
  const [store, setStore] = useState<TLStore | null>(null);
  const [loading, setLoading] = useState(true);
  const [supabase] = useState(() => createClient());

  // Fetch initial canvas state and initialize store
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
        const newStore = createTLStore({ shapeUtils: defaultShapeUtils });
        
        // If there's valid snapshot data, load it
        if (data?.document_state && Object.keys(data.document_state).length > 0) {
          try {
            loadSnapshot(newStore, data.document_state);
          } catch (e) {
            console.error("Failed to load snapshot:", e);
          }
        }
        
        setStore(newStore);
        setLoading(false);
      }
    }
    
    loadData();
    
    return () => {
      isMounted = false;
    };
  }, [pageId, supabase]);

  if (loading || !store) {
    return <div className="w-full h-full flex items-center justify-center text-zinc-500">Loading canvas...</div>;
  }

  return (
    <div className="w-full h-full relative" style={{ isolation: 'isolate' }}>
      <Tldraw
        key={pageId}
        store={store}
      >
        <SyncLogic pageId={pageId} />
      </Tldraw>
    </div>
  );
}

// Sub-component to access the editor instance context and listen to store changes
function SyncLogic({ pageId }: { pageId: string }) {
  const editor = useEditor();
  const [supabase] = useState(() => createClient());

  useEffect(() => {
    if (!editor) return;

    const saveToSupabase = debounce(async () => {
      const snapshot = getSnapshot(editor.store);
      await supabase
        .from('pages')
        .update({ document_state: snapshot })
        .eq('id', pageId);
    }, 1500); // 1.5 seconds debounce

    // Listen to all changes in the editor's store
    const unsubscribe = editor.store.listen(
      (update) => {
        saveToSupabase();
      },
      { source: 'user', scope: 'document' }
    );

    // Listen for Gemini summary injection events
    const handleInjectSummary = (e: CustomEvent<{ summary: string }>) => {
      if (!editor) return;
      const { summary } = e.detail;
      const screenCenter = editor.getViewportScreenCenter();
      const center = editor.screenToPage(screenCenter);
      
      editor.createShape({
        type: 'note',
        x: center.x,
        y: center.y,
        props: {
          richText: toRichText(summary)
        },
      });
    };

    window.addEventListener('inject-summary', handleInjectSummary as EventListener);

    return () => {
      unsubscribe();
      saveToSupabase.cancel();
      window.removeEventListener('inject-summary', handleInjectSummary as EventListener);
    };
  }, [editor, pageId, supabase]);

  return null;
}
