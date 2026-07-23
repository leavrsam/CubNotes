"use client";

import React, { useState, useEffect } from "react";
import { Sidebar } from "@/components/Sidebar";
import dynamic from 'next/dynamic';
import { useNotebooks } from "@/hooks/useNotebooks";

const CustomCanvas = dynamic(() => import('@/components/CustomCanvas').then(mod => mod.CustomCanvas), {
  ssr: false,
  loading: () => <div className="w-full h-full flex items-center justify-center text-zinc-500">Loading spatial canvas...</div>
});
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useWebAudio } from "@/hooks/useWebAudio";
import { invoke } from "@tauri-apps/api/core";
import { Mic, Square, Menu, X } from "lucide-react";
import { toast } from "react-hot-toast";
import { v4 as uuidv4 } from "uuid";

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
  const [supabase] = useState(() => createClient());

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Auto-close sidebar on mobile initially
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  }, []);

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

  // Auto-select the first available page only on initial load
  const hasAutoSelected = React.useRef(false);
  useEffect(() => {
    if (hasAutoSelected.current) return;
    if (!selectedPageId && notebooks.length > 0) {
      for (const nb of notebooks) {
        for (const sec of nb.sections) {
          if (sec.pages.length > 0) {
            setSelectedPageId(sec.pages[0].id);
            hasAutoSelected.current = true;
            return;
          }
        }
      }
    }
  }, [notebooks, selectedPageId]);

  const handleToggleMeeting = async () => {
    const isDesktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
    
    const processAudio = async (audioBase64: string) => {
      try {
        if (!selectedPageId) {
          toast.error("No page selected to save audio.");
          return;
        }

        // 1. Upload audio to Supabase Storage
        toast.loading("Uploading audio and generating summary...", { id: "audio-process" });
        
        // Convert base64 to Blob
        const byteCharacters = atob(audioBase64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'audio/webm' });
        
        const fileName = `${selectedPageId}/${uuidv4()}.webm`;
        const { error: uploadError } = await supabase.storage
          .from('recordings')
          .upload(fileName, blob, { contentType: 'audio/webm' });
          
        if (uploadError) {
          console.error("Upload error:", uploadError);
          toast.error("Failed to upload audio.", { id: "audio-process" });
        } else {
          const { data: publicUrlData } = supabase.storage.from('recordings').getPublicUrl(fileName);
          window.dispatchEvent(new CustomEvent('inject-audio', { detail: { url: publicUrlData.publicUrl } }));
        }

        // 2. Call Edge Function for Transcription/Summary
        const { data, error } = await supabase.functions.invoke('summarize-meeting', {
          body: { audioBase64 }
        });
        
        if (error) {
          console.error("Edge function error:", error);
          const status = (error as any).status || (error as any).context?.status;
          const isRateLimit = status === 429 || error.message?.includes('429');
          
          if (isRateLimit) {
            toast.error('Our AI is resting! The daily transcription limit has been reached.', { id: "audio-process" });
          } else {
            toast.error('Failed to summarize meeting. Please try again.', { id: "audio-process" });
          }
          return;
        }
        
        if (data?.summary) {
          window.dispatchEvent(new CustomEvent('inject-summary', { detail: { summary: data.summary } }));
          toast.success('Meeting summary added to canvas!', { id: "audio-process" });
        } else {
          toast.dismiss("audio-process");
        }
      } catch (err) {
        console.error("Failed to process audio:", err);
        toast.error('Failed to process meeting recording.', { id: "audio-process" });
      }
    };

    if (isDesktop) {
      if (isDesktopRecording) {
        setIsProcessing(true);
        try {
          const audioBase64 = await invoke<string>("stop_recording");
          console.log("Captured Desktop Audio (Base64 length):", audioBase64.length);
          await processAudio(audioBase64);
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
          await processAudio(audioBase64);
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
    <main className="flex w-full h-full relative overflow-hidden">
      {/* Sidebar - Desktop (sliding) and Mobile (overlay) */}
      <div 
        className={`absolute md:relative z-50 h-full transition-transform duration-300 ease-in-out ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full md:hidden md:-translate-x-full md:w-0"
        }`}
      >
        <Sidebar 
          notebooks={notebooks} 
          selectedPageId={selectedPageId}
          onSelectPage={(id) => {
            setSelectedPageId(id);
            if (window.innerWidth < 768) setIsSidebarOpen(false);
          }} 
          onAddNotebook={() => addNotebook("New Notebook")}
          onUpdateNotebook={updateNotebook}
          onDeleteNotebook={deleteNotebook}
          onAddSection={(nbId) => addSection(nbId, "New Section")}
          onUpdateSection={updateSection}
          onDeleteSection={deleteSection}
          onAddPage={(secId) => addPage(secId, "Untitled Page")}
          onUpdatePage={updatePage}
          onDeletePage={deletePage}
          onClose={() => setIsSidebarOpen(false)}
        />
      </div>
      
      {/* Mobile backdrop */}
      {isSidebarOpen && (
        <div 
          className="absolute inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
      
      <div className="flex-1 h-full relative bg-zinc-900 transition-all duration-300">
        {/* Toggle Sidebar Button */}
        <div className="absolute top-4 left-4 z-50">
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 rounded-lg shadow-lg border border-zinc-700 transition-colors flex items-center justify-center"
            title="Toggle Sidebar"
          >
            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
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
          <CustomCanvas pageId={selectedPageId} />
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
