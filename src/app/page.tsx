"use client";

import React, { useState, useEffect, useRef } from "react";
import { Sidebar } from "@/components/Sidebar";
import { MobileNavigation } from "@/components/MobileNavigation";
import dynamic from 'next/dynamic';
import { useNotebooks } from "@/hooks/useNotebooks";

const CustomCanvas = dynamic(() => import('@/components/CustomCanvas').then(mod => mod.CustomCanvas), {
  ssr: false,
  loading: () => <div className="w-full h-full flex items-center justify-center text-zinc-500">Loading spatial canvas...</div>
});
const MobilePage = dynamic(() => import('@/components/MobilePage').then(mod => mod.MobilePage), {
  ssr: false,
  loading: () => <div className="w-full h-full flex items-center justify-center text-zinc-500">Loading mobile page...</div>
});
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useWebAudio } from "@/hooks/useWebAudio";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Mic, Square, Menu, X, PanelLeftClose, PanelLeft, Minimize, Maximize, WifiOff } from "lucide-react";
import { toast } from "react-hot-toast";
import { v4 as uuidv4 } from "uuid";
import { SettingsModal } from "@/components/SettingsModal";
import { uploadMediaFile } from "@/lib/storage";
import { processAudioTranscription } from "@/lib/transcribe";
import { liveSpeechRecognizer } from "@/lib/liveSpeech";

export default function Home() {
  const { 
    notebooks, loading, isOffline, 
    addNotebook, updateNotebook, deleteNotebook, toggleJournalMode, togglePageJournalMode,
    addSection, updateSection, deleteSection, moveSection,
    addPage, updatePage, deletePage, movePage
  } = useNotebooks();
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [userEmail, setUserEmail] = useState<string>("");
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  // Meeting Recording State
  const [isDesktopRecording, setIsDesktopRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const { isRecording: isWebRecording, startRecording: startWeb, stopRecording: stopWeb } = useWebAudio();
  
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  
  // Mobile navigation state
  const [mobileView, setMobileView] = useState<'folders' | 'notes'>('folders');
  const [mobileSectionId, setMobileSectionId] = useState<string | null>(null);
  
  // State tracking refs for popstate and backButton handlers
  const selectedPageIdRef = useRef<string | null>(null);
  selectedPageIdRef.current = selectedPageId;

  const mobileViewRef = useRef<'folders' | 'notes'>('folders');
  mobileViewRef.current = mobileView;

  const isSettingsOpenRef = useRef(false);
  isSettingsOpenRef.current = isSettingsOpen;

  // History state navigation to support phone swipe-to-go-back gesture
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Ensure baseline history entry exists
    if (!window.history.state || !window.history.state.cubType) {
      window.history.replaceState({ cubType: 'root' }, '');
    }

    const handlePopState = () => {
      // 1. Settings modal open? Close it.
      if (isSettingsOpenRef.current) {
        setIsSettingsOpen(false);
        return;
      }

      // 2. Page / Note open? Close it and return to notes list!
      if (selectedPageIdRef.current) {
        setSelectedPageId(null);
        return;
      }

      // 3. In notes list inside folder? Return to folders root list!
      if (mobileViewRef.current === 'notes') {
        setMobileView('folders');
        setMobileSectionId(null);
        return;
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Native Android hardware/gesture back button listener via Capacitor
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let cleanupListener: (() => void) | null = null;

    import('@capacitor/app').then(({ App }) => {
      const listenerPromise = App.addListener('backButton', () => {
        if (isSettingsOpenRef.current) {
          if (window.history.state?.cubType === 'settings') {
            window.history.back();
          } else {
            setIsSettingsOpen(false);
          }
        } else if (selectedPageIdRef.current) {
          if (window.history.state?.cubType === 'page') {
            window.history.back();
          } else {
            setSelectedPageId(null);
          }
        } else if (mobileViewRef.current === 'notes') {
          if (window.history.state?.cubType === 'section') {
            window.history.back();
          } else {
            setMobileView('folders');
            setMobileSectionId(null);
          }
        } else {
          // At root folders view — exit app
          App.exitApp();
        }
      });

      cleanupListener = () => {
        listenerPromise.then(h => h.remove());
      };
    }).catch(() => {});

    return () => {
      if (cleanupListener) cleanupListener();
    };
  }, []);

  const handleOpenSettings = () => {
    setIsSettingsOpen(true);
    if (typeof window !== 'undefined') {
      window.history.pushState({ cubType: 'settings' }, '');
    }
  };

  const handleCloseSettings = () => {
    if (typeof window !== 'undefined' && window.history.state?.cubType === 'settings') {
      window.history.back();
    } else {
      setIsSettingsOpen(false);
    }
  };

  const handleSelectSection = (id: string) => {
    setMobileSectionId(id);
    setMobileView('notes');
    if (typeof window !== 'undefined') {
      window.history.pushState({ cubType: 'section', id }, '');
    }
  };

  const handleSelectPage = (id: string) => {
    setSelectedPageId(id);
    if (typeof window !== 'undefined') {
      window.history.pushState({ cubType: 'page', id }, '');
    }
  };

  const handleBackFromPage = () => {
    if (typeof window !== 'undefined' && window.history.state?.cubType === 'page') {
      window.history.back();
    } else {
      setSelectedPageId(null);
    }
  };

  const handleBackFromNotes = () => {
    if (typeof window !== 'undefined' && window.history.state?.cubType === 'section') {
      window.history.back();
    } else {
      setMobileView('folders');
      setMobileSectionId(null);
    }
  };

  // Fullscreen & Keyboard shortcuts
  useEffect(() => {
    const handleFullscreenChange = () => {
      const doc = document as any;
      setIsFullscreen(!!(document.fullscreenElement || doc.webkitFullscreenElement));
    };
    
    const handleKeyDown = (e: KeyboardEvent) => {
      // Toggle sidebar on Cmd+B / Ctrl+B
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setIsSidebarOpen(prev => !prev);
      }
    };
    
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Responsive state
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const checkMobile = () => {
        setIsMobile(window.innerWidth < 768);
      };
      checkMobile();
      window.addEventListener('resize', checkMobile);
      return () => window.removeEventListener('resize', checkMobile);
    }
  }, []);

  // Auto-close sidebar on mobile initially
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  }, []);

  // Ensure window scroll is always reset on mobile navigation
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo(0, 0);
    }
  }, [selectedPageId, mobileView]);

  useEffect(() => {
    // Client-side auth check
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
      } else {
        setUserEmail(session.user.email || "");
        setCurrentUser(session.user);
        setAuthChecking(false);
      }
    };
    
    checkAuth();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.push("/login");
      } else {
        setUserEmail(session.user.email || "");
        setCurrentUser(session.user);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router, supabase]);

  // Save selected page to localStorage
  useEffect(() => {
    if (selectedPageId) {
      localStorage.setItem('lastSelectedPageId', selectedPageId);
    }
  }, [selectedPageId]);

  // Auto-select the last available page or first available page only on initial load
  const hasAutoSelected = React.useRef(false);
  useEffect(() => {
    if (hasAutoSelected.current) return;
    if (!selectedPageId && notebooks.length > 0) {
      const lastSelectedId = localStorage.getItem('lastSelectedPageId');
      let targetPageId: string | null = null;
      
      if (lastSelectedId) {
        // Verify it still exists in the loaded notebooks
        const exists = notebooks.some(nb => nb.sections.some(sec => sec.pages.some(p => p.id === lastSelectedId)));
        if (exists) {
          targetPageId = lastSelectedId;
        }
      }

      if (!targetPageId) {
        // Fallback to first available
        for (const nb of notebooks) {
          for (const sec of nb.sections) {
            if (sec.pages.length > 0) {
              targetPageId = sec.pages[0].id;
              break;
            }
          }
          if (targetPageId) break;
        }
      }

      if (targetPageId) {
        setSelectedPageId(targetPageId);
      }
      hasAutoSelected.current = true;
    }
  }, [notebooks, selectedPageId]);

  const activeRecordingAudioIdRef = useRef<string | null>(null);

  const handleToggleMeeting = async () => {
    const isDesktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
    
    const processAudio = async (
      audioData: { base64?: string; blob?: Blob; mimeType?: string; fileExt?: string; liveTranscript?: string },
      targetAudioId: string
    ) => {
      let audioUrl = "";
      let isCurrentJournal = false;

      if (selectedPageId) {
        for (const nb of notebooks) {
          for (const sec of nb.sections) {
            const p = sec.pages.find(page => page.id === selectedPageId);
            if (p && (nb.is_journal || p.is_journal_entry)) isCurrentJournal = true;
          }
        }
      }

      try {
        if (!selectedPageId) {
          toast.error("No page selected to save audio.");
          return;
        }

        const audioId = targetAudioId;
        const cleanMimeType = (audioData.mimeType || (isDesktop ? 'audio/wav' : 'audio/webm')).split(';')[0].trim();
        const fileExt = audioData.fileExt || (cleanMimeType.includes('mp4') ? 'mp4' : cleanMimeType.includes('wav') ? 'wav' : 'webm');

        toast.loading("Uploading audio and generating summary with Gemini 3.8 Flash...", { id: "audio-process" });
        
        // 1. Prepare Blob
        let audioBlob = audioData.blob;
        if (!audioBlob && audioData.base64) {
          const byteCharacters = atob(audioData.base64);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          audioBlob = new Blob([byteArray], { type: cleanMimeType });
        }

        if (!audioBlob || audioBlob.size === 0) {
          throw new Error("No audio data was captured. Please check microphone permissions and try again.");
        }

        const audioFile = new File([audioBlob], `meeting_${Date.now()}.${fileExt}`, { type: cleanMimeType });

        // 2. Upload audio to Cloudflare R2 or Supabase Storage
        try {
          const uploadResult = await uploadMediaFile(audioFile, selectedPageId);
          audioUrl = uploadResult.url;
        } catch (uploadErr: any) {
          console.warn("Audio upload warning:", uploadErr);
        }

        // 3. Transcribe with Gemini 3.8 Flash (dual failover: /api/transcribe -> Supabase Edge Function)
        const transcriptionResult = await processAudioTranscription({
          audioBase64: (audioBlob.size < 4 * 1024 * 1024 && audioData.base64) ? audioData.base64 : undefined,
          audioUrl: audioUrl || undefined,
          mimeType: cleanMimeType,
          isJournal: isCurrentJournal,
          liveTranscript: audioData.liveTranscript,
        });

        const audioCreatedAt = Date.now();
        const audioExpiresAt = isCurrentJournal ? undefined : audioCreatedAt + 7 * 24 * 60 * 60 * 1000;
        const isAudioSavedPermanently = isCurrentJournal;

        window.dispatchEvent(new CustomEvent('inject-summary', { 
          detail: { 
            id: audioId, 
            summary: transcriptionResult.summary || "Summary completed.", 
            transcript: transcriptionResult.transcript || audioData.liveTranscript || "",
            url: audioUrl,
            audioCreatedAt,
            audioExpiresAt,
            isAudioSavedPermanently,
          } 
        }));

        toast.success(isCurrentJournal ? 'Journal entry recorded & summarized!' : 'Meeting summary added to canvas!', { id: "audio-process" });

      } catch (err: any) {
        console.error("Failed to process audio:", err);
        const errMsg = err?.message || 'Failed to process meeting recording.';
        toast.error(errMsg, { id: "audio-process", duration: 7000 });

        // Release the audio card from loading spinner state so user can still see and play the recording
        window.dispatchEvent(new CustomEvent('inject-summary', { 
          detail: { 
            id: targetAudioId, 
            summary: `### Audio Saved\n\nAI Transcription could not be completed: ${errMsg}\n\nYou can still play back your audio recording above.`,
            transcript: "",
            url: audioUrl,
            audioCreatedAt: Date.now(),
            audioExpiresAt: isCurrentJournal ? undefined : Date.now() + 7 * 24 * 60 * 60 * 1000,
            isAudioSavedPermanently: isCurrentJournal,
          } 
        }));
      }
    };

    if (isDesktop) {
      if (isDesktopRecording) {
        setIsProcessing(true);
        const targetId = activeRecordingAudioIdRef.current || uuidv4();
        window.dispatchEvent(new CustomEvent('inject-transcribing', { detail: { id: targetId } }));
        try {
          const audioBase64 = await invoke<string>("stop_recording");
          console.log("Captured Desktop Audio (Base64 length):", audioBase64?.length);
          await processAudio({ base64: audioBase64, mimeType: 'audio/wav', fileExt: 'wav' }, targetId);
          setIsDesktopRecording(false);
        } catch (e) {
          console.error("Failed to stop desktop recording:", e);
        } finally {
          setIsProcessing(false);
        }
      } else {
        try {
          const newAudioId = uuidv4();
          activeRecordingAudioIdRef.current = newAudioId;
          window.dispatchEvent(new CustomEvent('start-recording-node', { detail: { id: newAudioId } }));
          await invoke("start_recording");
          setIsDesktopRecording(true);
        } catch (e) {
          console.error("Failed to start desktop recording, attempting web mic fallback:", e);
          try {
            await startWeb();
          } catch (webErr) {
            toast.error("Could not access microphone.");
          }
        }
      }
    } else {
      // Web / Mobile
      if (isWebRecording) {
        setIsProcessing(true);
        const targetId = activeRecordingAudioIdRef.current || uuidv4();
        window.dispatchEvent(new CustomEvent('inject-transcribing', { detail: { id: targetId } }));
        try {
          const result = await stopWeb();
          console.log("Captured Web Audio:", result.mimeType, "Size:", result.blob.size, "Duration:", result.durationMs);
          await processAudio(result, targetId);
        } catch (e: any) {
          console.error("Failed to stop web recording:", e);
          toast.error(e?.message || "Failed to stop recording.", { id: "audio-process" });
          window.dispatchEvent(new CustomEvent('inject-summary', { 
            detail: { 
              id: targetId, 
              summary: `### Recording Error\n\n${e?.message || 'Recording stopped unexpectedly.'}`,
              transcript: "",
              audioCreatedAt: Date.now(),
            } 
          }));
        } finally {
          setIsProcessing(false);
        }
      } else {
        const newAudioId = uuidv4();
        activeRecordingAudioIdRef.current = newAudioId;
        try {
          liveSpeechRecognizer.start();
          await startWeb();
          window.dispatchEvent(new CustomEvent('start-recording-node', { detail: { id: newAudioId } }));
        } catch (err: any) {
          liveSpeechRecognizer.stop();
          toast.error(err?.message || "Could not access microphone.");
        }
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

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const isAnyRecording = isDesktopRecording || isWebRecording;

  let activePageTitle = "Untitled Page";
  let activePageCreatedAt = "";
  let activeNotebookTitle = "";
  let activeNotebookId = "";
  let isActiveJournal = false;
  if (selectedPageId) {
    for (const nb of notebooks) {
      for (const sec of (nb.sections || [])) {
        const page = (sec.pages || []).find(p => p.id === selectedPageId);
        if (page) {
          activePageTitle = page.title;
          activePageCreatedAt = page.created_at;
          activeNotebookTitle = nb.title;
          activeNotebookId = nb.id;
          isActiveJournal = Boolean(nb.is_journal || page.is_journal_entry);
        }
      }
    }
  }

  return (
    <main className="flex w-full h-full relative overflow-hidden bg-zinc-50 dark:bg-zinc-950">
      {isOffline && (
        <div 
          className="fixed top-3 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-1.5 px-3 py-1 bg-amber-500/90 text-white text-xs font-semibold rounded-full shadow-lg backdrop-blur pointer-events-none"
          title="Internet disconnected. Your notes are stored and saved locally on this device."
        >
          <WifiOff size={13} />
          <span>Offline — Saved locally</span>
        </div>
      )}
      
      {/* --- DESKTOP LAYOUT --- */}
      {!isMobile && (
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
            onToggleJournalMode={toggleJournalMode}
            onAddSection={(nbId) => addSection(nbId, "New Section")}
            onUpdateSection={updateSection}
            onDeleteSection={deleteSection}
            onAddPage={(secId) => addPage(secId, "New Page")}
            onUpdatePage={updatePage}
            onDeletePage={deletePage}
            onClose={() => setIsSidebarOpen(false)}
            onOpenSettings={() => {
              setIsSidebarOpen(false);
              handleOpenSettings();
            }}
            user={currentUser}
          />
        </div>
      )}
      
      {/* Desktop Main Content */}
      {!isMobile && (
        <div className="flex-1 h-full relative bg-zinc-900 transition-all duration-300">
          
          {/* Floating Meeting Toggle (Only show if no page selected, else it's in ribbon) */}
          {!selectedPageId && (
            <div 
              className="absolute right-4 z-50"
              style={{ top: 'calc(env(safe-area-inset-top, 0px) + 16px)' }}
            >
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
                  <span>Processing...</span>
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
          )}

          {selectedPageId ? (
            <CustomCanvas 
              key={selectedPageId}
              pageId={selectedPageId} 
              pageTitle={activePageTitle}
              pageCreatedAt={activePageCreatedAt}
              onUpdatePageTitle={(title) => updatePage(selectedPageId, title)}
              headerControls={
                <>
                  <button
                    onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                    className="p-1.5 bg-transparent hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded text-zinc-600 dark:text-zinc-400 transition-colors flex items-center justify-center"
                    title="Toggle Sidebar (Cmd+B)"
                  >
                    {isSidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
                  </button>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      const isDesktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
                      try {
                        if (isDesktop) {
                          // Tauri uses async API, but we don't await the parent onClick
                          const appWindow = getCurrentWindow();
                          appWindow.isFullscreen().then(isFs => {
                            appWindow.setFullscreen(!isFs).then(() => {
                              setIsFullscreen(!isFs);
                            });
                          });
                        } else {
                          const docEl = document.documentElement as any;
                          const doc = document as any;
                          
                          if (!document.fullscreenElement && !doc.webkitFullscreenElement) {
                            if (docEl.requestFullscreen) {
                              docEl.requestFullscreen().catch((err: any) => {
                                toast.error("Fullscreen error: " + err.message);
                              });
                            } else if (docEl.webkitRequestFullscreen) {
                              docEl.webkitRequestFullscreen();
                            } else if (docEl.msRequestFullscreen) {
                              docEl.msRequestFullscreen();
                            } else {
                              toast.error("No fullscreen API found");
                            }
                          } else {
                            if (document.exitFullscreen) {
                              document.exitFullscreen();
                            } else if (doc.webkitExitFullscreen) {
                              doc.webkitExitFullscreen();
                            } else if (doc.msExitFullscreen) {
                              doc.msExitFullscreen();
                            }
                          }
                        }
                      } catch (err: any) {
                        console.error('Fullscreen error:', err);
                        toast.error("Catch: " + (err.message || 'Fullscreen not supported'));
                      }
                    }}
                    className="p-1.5 bg-transparent hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded text-zinc-600 dark:text-zinc-400 transition-colors flex items-center justify-center"
                    title={isFullscreen ? "Exit Fullscreen (Esc)" : "Fullscreen"}
                  >
                    {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
                  </button>
                </>
              }
            />
          ) : (
            <div className="flex flex-col gap-4 items-center justify-center w-full h-full text-zinc-500">
              <p>Select or create a page to begin.</p>
              {notebooks.length === 0 && (
                <button 
                  onClick={() => addNotebook("My First Notebook", false)}
                  className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors"
                >
                  Create Notebook
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* --- MOBILE LAYOUT --- */}
      {isMobile && (
        <div className="w-full h-full relative overflow-hidden bg-white dark:bg-black">
          {!selectedPageId ? (
            <MobileNavigation
              notebooks={notebooks}
              view={mobileView}
              sectionId={mobileSectionId}
              onSelectSection={handleSelectSection}
              onSelectPage={handleSelectPage}
              onBackToFolders={handleBackFromNotes}
              onAddNotebook={async (title, isJournal) => {
                const res = await addNotebook(title || "New Notebook", isJournal);
                return res;
              }}
              onAddSection={async (nbId, title) => {
                const res = await addSection(nbId, title || "New Folder");
                return res;
              }}
              onAddPage={async (secId, title) => {
                const page = await addPage(secId, title || "Untitled Note");
                if (page?.id) {
                  handleSelectPage(page.id);
                }
                return page;
              }}
              onDeletePage={deletePage}
              onDeleteSection={deleteSection}
              onDeleteNotebook={deleteNotebook}
              onUpdatePage={updatePage}
              onUpdateSection={updateSection}
              onUpdateNotebook={updateNotebook}
              onToggleJournalMode={toggleJournalMode}
              onMovePage={movePage}
              onMoveSection={moveSection}
              onOpenSettings={handleOpenSettings}
            />
          ) : (
            <div className="w-full h-full flex flex-col relative">
              <MobilePage 
                key={selectedPageId}
                pageId={selectedPageId} 
                pageTitle={activePageTitle}
                pageCreatedAt={activePageCreatedAt}
                onUpdatePageTitle={(title) => updatePage(selectedPageId, title)}
                onBack={handleBackFromPage}
                isRecording={isAnyRecording}
                isProcessing={isProcessing}
                onToggleMeeting={handleToggleMeeting}
                onOpenSettings={handleOpenSettings}
                isJournal={isActiveJournal}
              />
            </div>
          )}
        </div>
      )}

      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={handleCloseSettings} 
        userEmail={userEmail}
        user={currentUser}
        onSignOut={handleSignOut}
        activePageId={selectedPageId || undefined}
        activePageTitle={selectedPageId ? activePageTitle : undefined}
        isJournal={isActiveJournal}
        onToggleJournalMode={async (newIsJournal) => {
          if (selectedPageId) {
            await togglePageJournalMode(selectedPageId, newIsJournal);
          } else if (activeNotebookId) {
            await toggleJournalMode(activeNotebookId, newIsJournal);
          }
        }}
        activeNotebookTitle={activeNotebookTitle}
        onUpdatePageTitle={(title) => selectedPageId && updatePage(selectedPageId, title)}
        onDeletePage={async (id) => {
          await deletePage(id);
          setSelectedPageId(null);
        }}
      />
    </main>
  );
}
