"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "@/components/Sidebar";
import { TldrawCanvas } from "@/components/TldrawCanvas";
import { useNotebooks } from "@/hooks/useNotebooks";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useWebAudio } from "@/hooks/useWebAudio";
import { invoke } from "@tauri-apps/api/core";
import { Mic, Square } from "lucide-react";
import { toast } from "react-hot-toast";

export default function Home() {
  const { 
    notebooks, loading, 
    addNotebook, updateNotebook, deleteNotebook,
    addSection, updateSection, deleteSection,
    addPage, updatePage, deletePage
  } = useNotebooks();
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  
  // Meeting Recording State
  const [isDesktopRecording, setIsDesktopRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const { isRecording: isWebRecording, startRecording: startWeb, stopRecording: stopWeb } = useWebAudio();
  
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    // Client-side auth check
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
      } else {
        setAuthChecking(false);
      }
    };
    
    checkAuth();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.push("/login");
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router, supabase]);

  useEffect(() => {
    // Auto-select the first available page if none selected
    if (!selectedPageId && notebooks.length > 0) {
      for (const nb of notebooks) {
        for (const sec of nb.sections) {
          if (sec.pages.length > 0) {
            setSelectedPageId(sec.pages[0].id);
            return;
          }
        }
      }
    }
  }, [notebooks, selectedPageId]);

  const handleToggleMeeting = async () => {
    const isDesktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
    
    const callGemini = async (audioBase64: string) => {
      try {
        const { data, error } = await supabase.functions.invoke('summarize-meeting', {
          body: { audioBase64 }
        });
        
        if (error) {
          console.error("Edge function error:", error);
          // Supabase FunctionsHttpError may contain the status, or we can parse the error message.
          // Depending on the exact shape, we check for 429 or the message we sent.
          const status = (error as any).status || (error as any).context?.status;
          const isRateLimit = status === 429 || error.message?.includes('429');
          
          if (isRateLimit) {
            toast.error('Our AI is resting! The daily transcription limit has been reached.');
          } else {
            toast.error('Failed to summarize meeting. Please try again.');
          }
          return;
        }
        
        if (data?.summary) {
          window.dispatchEvent(new CustomEvent('inject-summary', { detail: { summary: data.summary } }));
          toast.success('Meeting summary added to canvas!');
        }
      } catch (err) {
        console.error("Failed to invoke edge function:", err);
        toast.error('Failed to invoke meeting summarizer.');
      }
    };

    if (isDesktop) {
      if (isDesktopRecording) {
        setIsProcessing(true);
        try {
          const audioBase64 = await invoke<string>("stop_recording");
          console.log("Captured Desktop Audio (Base64 length):", audioBase64.length);
          await callGemini(audioBase64);
          setIsDesktopRecording(false);
        } catch (e) {
          console.error("Failed to stop desktop recording:", e);
        } finally {
          setIsProcessing(false);
        }
      } else {
        try {
          await invoke("start_recording");
          setIsDesktopRecording(true);
        } catch (e) {
          console.error("Failed to start desktop recording:", e);
        }
      }
    } else {
      // Web fallback
      if (isWebRecording) {
        setIsProcessing(true);
        try {
          const audioBase64 = await stopWeb();
          console.log("Captured Web Audio (Base64 length):", audioBase64.length);
          await callGemini(audioBase64);
        } catch (e) {
          console.error("Failed to stop web recording:", e);
        } finally {
          setIsProcessing(false);
        }
      } else {
        await startWeb();
      }
    }
  };

  if (loading || authChecking) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-zinc-950 text-zinc-500">
        Loading workspace...
      </div>
    );
  }

  const isAnyRecording = isDesktopRecording || isWebRecording;

  return (
    <main className="flex w-full h-full relative">
      <Sidebar 
        notebooks={notebooks} 
        selectedPageId={selectedPageId}
        onSelectPage={setSelectedPageId} 
        onAddNotebook={() => addNotebook("New Notebook")}
        onUpdateNotebook={updateNotebook}
        onDeleteNotebook={deleteNotebook}
        onAddSection={(nbId) => addSection(nbId, "New Section")}
        onUpdateSection={updateSection}
        onDeleteSection={deleteSection}
        onAddPage={(secId) => addPage(secId, "Untitled Page")}
        onUpdatePage={updatePage}
        onDeletePage={deletePage}
      />
      
      <div className="flex-1 h-full relative bg-zinc-900">
        {/* Floating Meeting Toggle */}
        <div className="absolute top-4 right-4 z-50">
          <button
            onClick={handleToggleMeeting}
            disabled={isProcessing}
            className={`flex items-center gap-2 px-4 py-2 rounded-full shadow-lg text-sm font-medium transition-all ${
              isAnyRecording 
                ? 'bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20 animate-pulse' 
                : 'bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700'
            }`}
          >
            {isProcessing ? (
              <span>Processing Audio...</span>
            ) : isAnyRecording ? (
              <>
                <Square size={16} fill="currentColor" />
                Stop Meeting
              </>
            ) : (
              <>
                <Mic size={16} />
                Start Meeting
              </>
            )}
          </button>
        </div>

        {selectedPageId ? (
          <TldrawCanvas pageId={selectedPageId} />
        ) : (
          <div className="flex flex-col gap-4 items-center justify-center w-full h-full text-zinc-500">
            <p>Select or create a page to begin.</p>
            {notebooks.length === 0 && (
              <button 
                onClick={() => addNotebook("My First Notebook", false)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
              >
                Create Notebook
              </button>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
