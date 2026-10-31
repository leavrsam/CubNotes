"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  Mic, Square, Sparkles, Bot, Send, User, Copy, Check, Download, 
  ArrowLeft, FileText, CheckSquare, Clock, Search, HelpCircle, 
  Compass, ExternalLink, RefreshCw, Layers, ChevronRight, MessageSquare, Flag, Bookmark,
  PanelRightClose, PanelRight, X
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { format } from "date-fns";
import toast from "react-hot-toast";
import type { AudioNode } from "./CustomCanvas";
import { TranscriptionTableOfContents, extractMarkdownTOC, extractTranscriptTOC, slugify } from "./TranscriptionTableOfContents";
import { copyFormattedMeetingNotes } from "@/lib/clipboard";
import { AudioPlayer } from "./AudioPlayer";

interface MeetingWorkspaceProps {
  isOpen: boolean;
  onClose: () => void;
  activeAudioNode: AudioNode | null;
  updateAudioField: (id: string, field: keyof AudioNode, value: any) => void;
  isLiveRecording: boolean;
  recordingDuration: number;
  isRecordingPaused: boolean;
  onPauseRecording?: () => void;
  onResumeRecording?: () => void;
  onStopRecording?: () => void;
  onStartRecording?: () => void;
  onExplodeToCanvas?: (notes: string, summary: string) => void;
  pageTitle: string;
  audios?: AudioNode[];
  onSelectAudioNode?: (id: string) => void;
  canvasNotesText?: string;
  topOffset?: number;
}

type MainTab = "summary" | "transcript" | "enhanced" | "chat";

export function MeetingWorkspace({
  isOpen,
  onClose,
  activeAudioNode,
  updateAudioField,
  isLiveRecording,
  recordingDuration,
  isRecordingPaused,
  onPauseRecording,
  onResumeRecording,
  onStopRecording,
  onStartRecording,
  onExplodeToCanvas,
  pageTitle,
  audios = [],
  onSelectAudioNode,
  canvasNotesText = "",
  topOffset = 88
}: MeetingWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<MainTab>(
    isLiveRecording ? "transcript" : (activeAudioNode?.enhancedNotes ? "enhanced" : (activeAudioNode?.summary ? "summary" : "summary"))
  );
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [synthesisTemplate, setSynthesisTemplate] = useState<'standard' | 'one_on_one' | 'technical' | 'client'>('standard');
  
  // Interactive Chat / Q&A state
  const [chatInput, setChatInput] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'assistant'; text: string }[]>(
    activeAudioNode?.chatHistory || []
  );
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Knowledge Radar state (Related Notes retrieved via semantic search)
  const [relatedNotes, setRelatedNotes] = useState<any[]>([]);
  const [isLoadingRadar, setIsLoadingRadar] = useState(false);
  const [showRadar, setShowRadar] = useState(false);

  // Transcript search
  const [transcriptSearch, setTranscriptSearch] = useState("");
  const summaryPaneRef = useRef<HTMLDivElement>(null);
  const transcriptPaneRef = useRef<HTMLDivElement>(null);
  const enhancedPaneRef = useRef<HTMLDivElement>(null);

  const summaryTOC = React.useMemo(() => extractMarkdownTOC(activeAudioNode?.summary || ""), [activeAudioNode?.summary]);
  const transcriptTOC = React.useMemo(() => extractTranscriptTOC(activeAudioNode?.transcript || ""), [activeAudioNode?.transcript]);
  const enhancedTOC = React.useMemo(() => extractMarkdownTOC(activeAudioNode?.enhancedNotes || ""), [activeAudioNode?.enhancedNotes]);

  const markdownComponents = React.useMemo(() => {
    const seenIds = new Map<string, number>();
    const getId = (text: string) => {
      const raw = String(text).replace(/[*_`#]/g, '').trim();
      let base = slugify(raw);
      if (!base) base = 'heading';
      const count = seenIds.get(base) || 0;
      seenIds.set(base, count + 1);
      return count > 0 ? `${base}-${count}` : base;
    };

    return {
      h1: ({ children, ...props }: any) => {
        const text = Array.isArray(children) ? children.join('') : String(children);
        const id = getId(text);
        return <h1 id={id} className="scroll-mt-4 font-bold text-lg mt-4 mb-2 text-zinc-900 dark:text-zinc-100" {...props}>{children}</h1>;
      },
      h2: ({ children, ...props }: any) => {
        const text = Array.isArray(children) ? children.join('') : String(children);
        const id = getId(text);
        return <h2 id={id} className="scroll-mt-4 font-bold text-base mt-3 mb-1.5 text-zinc-900 dark:text-zinc-100" {...props}>{children}</h2>;
      },
      h3: ({ children, ...props }: any) => {
        const text = Array.isArray(children) ? children.join('') : String(children);
        const id = getId(text);
        return <h3 id={id} className="scroll-mt-4 font-semibold text-sm mt-2.5 mb-1 text-zinc-800 dark:text-zinc-200" {...props}>{children}</h3>;
      },
      h4: ({ children, ...props }: any) => {
        const text = Array.isArray(children) ? children.join('') : String(children);
        const id = getId(text);
        return <h4 id={id} className="scroll-mt-4 font-semibold text-xs mt-2 mb-1 text-zinc-800 dark:text-zinc-200" {...props}>{children}</h4>;
      },
    };
  }, [activeAudioNode?.summary, activeAudioNode?.enhancedNotes]);

  // Keep chat history in sync
  useEffect(() => {
    if (activeAudioNode?.chatHistory) {
      setChatHistory(activeAudioNode.chatHistory);
    }
  }, [activeAudioNode?.chatHistory]);

  // Sync live real-time speech transcription when actively recording
  useEffect(() => {
    if (!isOpen || !isLiveRecording || !activeAudioNode?.id) return;
    const handleBroadcast = (e: Event) => {
      const customEvent = e as CustomEvent<{ transcript: string; interim: string; status: string; statusMessage: string }>;
      const { transcript } = customEvent.detail;
      if (transcript !== undefined) {
        updateAudioField(activeAudioNode.id, 'transcript', transcript);
      }
    };
    window.addEventListener('live-transcript-broadcast', handleBroadcast);
    return () => window.removeEventListener('live-transcript-broadcast', handleBroadcast);
  }, [isOpen, isLiveRecording, activeAudioNode?.id, updateAudioField]);

  // Format timer
  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Run Knowledge Radar (semantic search over other notes)
  useEffect(() => {
    if (!isOpen) return;
    const query = activeAudioNode?.title || pageTitle || "meeting strategy decisions";
    setIsLoadingRadar(true);
    fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: query.slice(0, 100) })
    })
      .then(res => res.json())
      .then(data => {
        setRelatedNotes(data.matches || []);
      })
      .catch(err => console.warn("Knowledge Radar search error:", err))
      .finally(() => setIsLoadingRadar(false));
  }, [isOpen, activeAudioNode?.title, pageTitle]);

  // Scroll chat
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatHistory, isAsking]);

  // Enhance notes from Canvas + Audio Transcript
  const handleEnhanceNotes = async () => {
    const transcript = activeAudioNode?.transcript || "";
    const notesToEnhance = activeAudioNode?.notes?.trim() || canvasNotesText?.trim() || "";
    if (!notesToEnhance && !transcript) {
      toast.error("Please add notes on the canvas or record audio first.");
      return;
    }

    setIsEnhancing(true);
    const toastId = toast.loading("Synthesizing canvas notes with audio transcript via Gemini 3.8 Flash...");

    try {
      const customKey = typeof window !== 'undefined' ? (localStorage.getItem('motif_gemini_api_key') || localStorage.getItem('cubnotes_gemini_api_key')) : null;
      const res = await fetch('/api/enhance-notes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(customKey ? { 'x-gemini-api-key': customKey } : {}),
        },
        body: JSON.stringify({
          notes: notesToEnhance,
          transcript,
          meetingTitle: activeAudioNode?.title || pageTitle,
          template: synthesisTemplate,
          apiKey: customKey || undefined,
        })
      });

      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Enhancement failed");

      if (activeAudioNode?.id) {
        updateAudioField(activeAudioNode.id, 'enhancedNotes', data.enhancedNotes);
      }
      setActiveTab("enhanced");
      toast.success("Notes synthesized with canvas diagrams & transcript!", { id: toastId });
    } catch (err: any) {
      console.error(err);
      const rawMsg = err?.message || String(err);
      let cleanMsg = rawMsg;
      if (rawMsg.includes('503') || rawMsg.includes('high demand') || rawMsg.includes('UNAVAILABLE')) {
        cleanMsg = "Google Gemini is currently experiencing a temporary demand spike. Please try again in a few moments.";
      }
      toast.error(cleanMsg || "Failed to enhance notes", { id: toastId });
    } finally {
      setIsEnhancing(false);
    }
  };

  // Interactive Q&A ("Ask Meeting AI")
  const handleAskQuestion = async (presetQuestion?: string) => {
    const question = (presetQuestion || chatInput).trim();
    if (!question || isAsking) return;

    setChatInput("");
    setIsAsking(true);

    const newHistory = [...chatHistory, { role: 'user' as const, text: question }];
    setChatHistory(newHistory);
    if (activeAudioNode?.id) {
      updateAudioField(activeAudioNode.id, 'chatHistory', newHistory);
    }

    try {
      const customKey = typeof window !== 'undefined' ? (localStorage.getItem('motif_gemini_api_key') || localStorage.getItem('cubnotes_gemini_api_key')) : null;
      const res = await fetch('/api/meeting-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(customKey ? { 'x-gemini-api-key': customKey } : {}),
        },
        body: JSON.stringify({
          question,
          transcript: activeAudioNode?.transcript || "",
          summary: activeAudioNode?.summary || "",
          notes: activeAudioNode?.notes || canvasNotesText || "",
          history: newHistory,
          apiKey: customKey || undefined,
        })
      });

      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed to get answer");

      const finalHistory = [...newHistory, { role: 'assistant' as const, text: data.answer }];
      setChatHistory(finalHistory);
      if (activeAudioNode?.id) {
        updateAudioField(activeAudioNode.id, 'chatHistory', finalHistory);
      }
    } catch (err: any) {
      console.error(err);
      const rawMsg = err?.message || String(err);
      let cleanMsg = rawMsg;
      if (rawMsg.includes('503') || rawMsg.includes('high demand') || rawMsg.includes('UNAVAILABLE')) {
        cleanMsg = "Google Gemini is currently experiencing a temporary demand spike. Please try again in a few moments.";
      }
      const errHistory = [...newHistory, { role: 'assistant' as const, text: `Error: ${cleanMsg || "Unable to answer question."}` }];
      setChatHistory(errHistory);
    } finally {
      setIsAsking(false);
    }
  };

  // Copy clean formatted summary to clipboard (Slack, Email, Docs ready)
  const handleCopySummary = async () => {
    const textToCopy = activeAudioNode?.enhancedNotes || activeAudioNode?.summary || canvasNotesText || activeAudioNode?.notes;
    if (!textToCopy) {
      toast.error("Nothing to copy yet.");
      return;
    }
    const title = activeAudioNode?.title || pageTitle || "Meeting Takeaways";
    const success = await copyFormattedMeetingNotes(textToCopy, title);
    if (success) {
      toast.success("Formatted takeaways copied! Ready to paste into Slack, Email, or Docs.");
    } else {
      toast.error("Failed to copy takeaways.");
    }
  };

  // Export full meeting report as Markdown
  const handleExportMarkdown = () => {
    const title = activeAudioNode?.title || pageTitle || "Meeting Notes";
    const dateStr = format(new Date(activeAudioNode?.audioCreatedAt || Date.now()), "PPpp");
    const content = [
      `# ${title}`,
      `**Recorded:** ${dateStr}`,
      activeAudioNode?.url ? `**Audio Recording:** ${activeAudioNode.url}` : "",
      "",
      "---",
      "",
      "## Executive Summary",
      activeAudioNode?.summary || "No executive summary generated.",
      "",
      "---",
      "",
      "## Enhanced Notes (Canvas & Transcript)",
      activeAudioNode?.enhancedNotes || canvasNotesText || activeAudioNode?.notes || "No notes taken.",
      "",
      "---",
      "",
      "## Verbatim Transcript",
      activeAudioNode?.transcript || "No transcript available.",
    ].filter(Boolean).join("\n\n");

    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^a-zA-Z0-9_-]/g, "_")}_meeting_report.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Meeting exported as Markdown!");
  };

  if (!isOpen) return null;

  const currentEnhanced = activeAudioNode?.enhancedNotes || "";
  const currentSummary = activeAudioNode?.summary || "";
  const currentTranscript = activeAudioNode?.transcript || "";

  return (
    <aside 
      className="fixed right-0 bottom-0 z-40 w-[420px] max-w-[100vw] bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border-l border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col overflow-hidden text-zinc-900 dark:text-zinc-100 font-sans pointer-events-auto transition-all"
      style={{ top: topOffset || 88 }}
    >
      {/* Top Header Bar of the Side Panel */}
      <header className="h-12 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-950/50 backdrop-blur px-3 flex items-center justify-between shrink-0 select-none">
        <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
          <div className="w-6 h-6 rounded-lg bg-primary-100 dark:bg-primary-950/50 flex items-center justify-center text-primary-600 dark:text-primary-400 shrink-0">
            <Mic size={13} />
          </div>
          <input 
            type="text"
            value={activeAudioNode?.title || pageTitle}
            onChange={(e) => {
              if (activeAudioNode?.id) {
                updateAudioField(activeAudioNode.id, 'title', e.target.value);
              }
            }}
            className="text-xs font-bold bg-transparent border-none outline-none text-zinc-900 dark:text-zinc-100 px-1 hover:bg-black/5 dark:hover:bg-white/5 rounded flex-1 min-w-0 truncate tracking-tight"
            placeholder="Meeting Title..."
          />
          {audios.length > 1 && onSelectAudioNode && (
            <select
              value={activeAudioNode?.id || ""}
              onChange={(e) => onSelectAudioNode(e.target.value)}
              className="text-[11px] bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 rounded-md px-1.5 py-0.5 outline-none max-w-[110px] truncate"
              title="Switch between recordings on this page"
            >
              {audios.map((a, idx) => (
                <option key={a.id} value={a.id}>
                  {a.title || `Recording #${idx + 1}`}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Quick Action Buttons & Close Panel */}
        <div className="flex items-center gap-1 shrink-0">
          {onExplodeToCanvas && (
            <button
              onClick={() => onExplodeToCanvas(currentEnhanced || canvasNotesText || activeAudioNode?.notes || "", currentSummary)}
              className="p-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
              title="Explode takeaways & tasks onto canvas"
            >
              <Layers size={14} />
            </button>
          )}

          <button
            onClick={handleCopySummary}
            className="p-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
            title="Copy clean formatted takeaways (Slack, Email, Docs)"
          >
            <Copy size={14} />
          </button>

          <button
            onClick={handleExportMarkdown}
            className="p-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
            title="Download Markdown Report"
          >
            <Download size={14} />
          </button>

          <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-0.5" />

          {/* Close Panel Toggle (symmetric with left sidebar toggle) */}
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors flex items-center justify-center shrink-0"
            title="Collapse Meeting Panel (Cmd+M)"
          >
            <PanelRightClose size={16} />
          </button>
        </div>
      </header>

      {/* Recording HUD / Audio Player Bar */}
      <div className="px-3 py-2 border-b border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900 shrink-0">
        {isLiveRecording ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between px-3 py-1.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 rounded-xl">
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full bg-red-500 ${!isRecordingPaused ? 'animate-ping' : ''}`} />
                <span className="text-xs font-bold text-red-600 dark:text-red-400">
                  {isRecordingPaused ? 'Paused' : 'Recording Live'}
                </span>
                <span className="text-xs font-mono font-bold text-red-600 dark:text-red-400 ml-1">
                  {formatTimer(recordingDuration)}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {isRecordingPaused ? (
                  <button 
                    onClick={onResumeRecording} 
                    className="px-2 py-0.5 text-[11px] font-semibold text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/50 rounded transition-colors"
                  >
                    Resume
                  </button>
                ) : (
                  <button 
                    onClick={onPauseRecording} 
                    className="px-2 py-0.5 text-[11px] font-semibold text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/50 rounded transition-colors"
                  >
                    Pause
                  </button>
                )}
                {onStopRecording && (
                  <button 
                    onClick={onStopRecording}
                    className="px-2.5 py-0.5 bg-red-600 hover:bg-red-700 text-white rounded-md text-[11px] font-bold shadow-2xs"
                  >
                    Stop & Process
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : activeAudioNode?.url ? (
          <AudioPlayer 
            url={activeAudioNode.url}
            audioBlockId={activeAudioNode.id}
            initialDurationMs={activeAudioNode.durationMs}
            className="w-full"
          />
        ) : (
          onStartRecording && (
            <div className="flex items-center justify-between py-0.5">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Live canvas strokes are audio-synced.
              </span>
              <button
                onClick={onStartRecording}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-transform active:scale-95"
              >
                <Mic size={13} />
                <span>Record Meeting</span>
              </button>
            </div>
          )
        )}
      </div>

      {/* Segmented Tab Navigation Bar */}
      <div className="flex items-center px-2 pt-1 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-950/40 shrink-0 text-xs font-semibold">
        <button
          onClick={() => setActiveTab("summary")}
          className={`flex-1 py-2 px-2 text-center border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
            activeTab === "summary"
              ? "border-primary-600 text-primary-600 dark:text-primary-400"
              : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          }`}
        >
          <CheckSquare size={13} />
          <span>Summary</span>
        </button>

        <button
          onClick={() => setActiveTab("transcript")}
          className={`flex-1 py-2 px-2 text-center border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
            activeTab === "transcript"
              ? "border-primary-600 text-primary-600 dark:text-primary-400"
              : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          }`}
        >
          <Clock size={13} />
          <span>Transcript</span>
        </button>

        <button
          onClick={() => setActiveTab("enhanced")}
          className={`flex-1 py-2 px-2 text-center border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
            activeTab === "enhanced"
              ? "border-primary-600 text-primary-600 dark:text-primary-400"
              : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          }`}
        >
          <Sparkles size={13} className={currentEnhanced ? "text-amber-500" : ""} />
          <span>Enhanced</span>
        </button>

        <button
          onClick={() => setActiveTab("chat")}
          className={`flex-1 py-2 px-2 text-center border-b-2 transition-colors flex items-center justify-center gap-1.5 ${
            activeTab === "chat"
              ? "border-primary-600 text-primary-600 dark:text-primary-400"
              : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          }`}
        >
          <Bot size={13} />
          <span>Ask AI</span>
        </button>
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {/* 1. Summary Tab */}
        {activeTab === "summary" && (
          <div ref={summaryPaneRef} className="space-y-4">
            {currentSummary ? (
              <div className="prose dark:prose-invert max-w-none text-xs space-y-3">
                <TranscriptionTableOfContents items={summaryTOC} containerRef={summaryPaneRef} />
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {currentSummary}
                </ReactMarkdown>

                <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 not-prose flex items-center justify-between text-[11px] text-zinc-400">
                  <span>Synthesized with Gemini 3.8 Flash</span>
                  <button
                    type="button"
                    onClick={async () => {
                      const reason = window.prompt("Report inaccurate AI output:\n(e.g., Inaccurate summary, hallucinations)");
                      if (!reason) return;
                      try {
                        await fetch("/api/report-ai", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            content: currentSummary,
                            reason,
                            context: "MeetingWorkspace summary",
                            noteId: activeAudioNode?.id
                          })
                        });
                        toast.success("Thank you. Your report has been submitted.");
                      } catch {
                        toast.error("Failed to submit report.");
                      }
                    }}
                    className="inline-flex items-center gap-1 hover:text-red-500 transition-colors cursor-pointer"
                    title="Report inaccurate AI output"
                  >
                    <Flag size={11} />
                    <span>Report AI Output</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="py-16 text-center text-zinc-400 space-y-2">
                <CheckSquare size={28} className="mx-auto text-zinc-300 dark:text-zinc-600" />
                <p className="text-xs font-medium">No executive summary yet.</p>
                <p className="text-[11px] text-zinc-500 max-w-xs mx-auto">
                  Record or upload a meeting to generate key takeaways, decisions, and action items.
                </p>
              </div>
            )}
          </div>
        )}

        {/* 2. Transcript Tab */}
        {activeTab === "transcript" && (
          <div ref={transcriptPaneRef} className="space-y-3">
            <div className="relative flex items-center">
              <Search size={13} className="absolute left-2.5 text-zinc-400" />
              <input
                type="text"
                value={transcriptSearch}
                onChange={(e) => setTranscriptSearch(e.target.value)}
                placeholder="Search spoken words in transcript..."
                className="w-full pl-8 pr-3 py-1.5 bg-zinc-100 dark:bg-zinc-800/60 rounded-lg text-xs border border-transparent focus:border-primary-500 outline-none"
              />
            </div>

            {currentTranscript ? (
              <>
                <TranscriptionTableOfContents items={transcriptTOC} containerRef={transcriptPaneRef} title="Topics & Speakers" />
                <div 
                  className="text-xs leading-relaxed text-zinc-700 dark:text-zinc-300 font-mono p-3 bg-zinc-50 dark:bg-zinc-950/60 rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 space-y-1 select-text"
                >
                  {currentTranscript.split('\n').map((line, idx) => {
                    if (transcriptSearch && !line.toLowerCase().includes(transcriptSearch.toLowerCase())) {
                      return null;
                    }
                    const trimmed = line.trim();
                    if (!trimmed) {
                      return <div key={idx} className="h-1.5" />;
                    }

                    // Topic Heading
                    const headingMatch = trimmed.match(/^#{2,4}\s+(.+)$/);
                    if (headingMatch) {
                      const rawHeading = headingMatch[1].trim();
                      const tsMatch = rawHeading.match(/\[(\d{1,2}:\d{2})\]/);
                      const cleanTitle = rawHeading.replace(/\[\d{1,2}:\d{2}\]/, '').replace(/[*_`#]/g, '').trim();

                      return (
                        <div 
                          key={idx}
                          id={`transcript-line-${idx}`}
                          className="pt-3 pb-1 mb-1 border-b border-zinc-200/80 dark:border-zinc-800 flex items-center justify-between scroll-mt-3 select-none"
                        >
                          <div className="flex items-center gap-1.5">
                            <Bookmark size={12} className="text-primary-600 dark:text-primary-400 shrink-0" />
                            <span className="font-sans font-semibold text-xs tracking-tight text-zinc-900 dark:text-zinc-100">
                              {cleanTitle}
                            </span>
                          </div>
                          {tsMatch && (
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-primary-100/60 dark:bg-primary-950/40 text-primary-700 dark:text-primary-300 font-medium">
                              {tsMatch[1]}
                            </span>
                          )}
                        </div>
                      );
                    }

                    const speakerMatch = trimmed.match(/^(\[?\d{1,2}:\d{2}\]?\s*)?([A-Za-z0-9\s]+?):/);
                    return (
                      <div 
                        key={idx} 
                        id={`transcript-line-${idx}`} 
                        className={`scroll-mt-4 rounded px-1.5 py-0.5 transition-colors ${speakerMatch ? 'font-semibold text-zinc-900 dark:text-zinc-100 mt-2 bg-zinc-100/60 dark:bg-zinc-800/40 border-l-2 border-primary-500/50' : ''}`}
                      >
                        {line}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="py-16 text-center text-zinc-400 space-y-2">
                <Clock size={28} className="mx-auto text-zinc-300 dark:text-zinc-600" />
                <p className="text-xs font-medium">No transcript available.</p>
                <p className="text-[11px] text-zinc-500">Record a meeting to capture live transcription.</p>
              </div>
            )}
          </div>
        )}

        {/* 3. Enhanced Notes Tab */}
        {activeTab === "enhanced" && (
          <div ref={enhancedPaneRef} className="space-y-3">
            {/* Template Selector & Trigger Button */}
            <div className="p-3 bg-zinc-50 dark:bg-zinc-800/40 rounded-xl border border-zinc-200/70 dark:border-zinc-700/60 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">
                  Synthesis Style:
                </span>
                <select
                  value={synthesisTemplate}
                  onChange={(e) => setSynthesisTemplate(e.target.value as any)}
                  className="text-[11px] bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-0.5 outline-none font-medium cursor-pointer"
                >
                  <option value="standard">Standard Meeting</option>
                  <option value="one_on_one">1-on-1 Catch-up</option>
                  <option value="technical">Technical / Spec</option>
                  <option value="client">Client / Sales</option>
                </select>
              </div>

              <button
                onClick={handleEnhanceNotes}
                disabled={isEnhancing}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-gradient-to-r from-amber-500 to-primary-600 hover:from-amber-600 hover:to-primary-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-xs transition-transform active:scale-95"
              >
                <Sparkles size={13} className={isEnhancing ? "animate-spin" : ""} />
                <span>{isEnhancing ? "Synthesizing with Gemini 3.8 Flash..." : (currentEnhanced ? "Re-Enhance from Canvas & Audio" : "Enhance from Canvas & Audio")}</span>
              </button>
            </div>

            {currentEnhanced ? (
              <div className="prose dark:prose-invert max-w-none text-xs space-y-3">
                <TranscriptionTableOfContents items={enhancedTOC} containerRef={enhancedPaneRef} title="Sections" />
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {currentEnhanced}
                </ReactMarkdown>
              </div>
            ) : (
              <div className="py-12 text-center text-zinc-400 space-y-2">
                <Sparkles size={28} className="mx-auto text-amber-500/50" />
                <p className="text-xs font-medium">No enhanced notes yet.</p>
                <p className="text-[11px] text-zinc-500 max-w-xs mx-auto">
                  Take notes or draw diagrams on the canvas, then tap <strong>Enhance from Canvas & Audio</strong> to weave your notes with the audio transcript.
                </p>
              </div>
            )}
          </div>
        )}

        {/* 4. Ask AI Tab */}
        {activeTab === "chat" && (
          <div className="h-full flex flex-col space-y-3">
            {/* Quick Prompt Chips */}
            <div className="flex flex-wrap gap-1.5">
              {[
                "Key decisions made?",
                "List action items",
                "Draft email recap",
                "Pricing discussed?"
              ].map(chip => (
                <button
                  key={chip}
                  onClick={() => handleAskQuestion(chip)}
                  disabled={isAsking}
                  className="px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-[11px] font-medium text-zinc-600 dark:text-zinc-300 hover:border-primary-500 transition-colors shadow-2xs"
                >
                  {chip}
                </button>
              ))}
            </div>

            {/* Chat History */}
            <div 
              ref={chatScrollRef}
              className="flex-1 overflow-y-auto space-y-2.5 pr-1 text-xs min-h-[220px]"
            >
              {chatHistory.length === 0 ? (
                <div className="py-10 text-center text-zinc-400 space-y-1.5">
                  <MessageSquare size={24} className="mx-auto text-zinc-300 dark:text-zinc-600" />
                  <p className="font-medium text-xs">Hands-off meeting copilot</p>
                  <p className="text-[11px] text-zinc-500 max-w-xs mx-auto">
                    Ask questions after the call to retrieve quotes, dates, assignments, and agreements.
                  </p>
                </div>
              ) : (
                chatHistory.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[92%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-primary-600 text-white rounded-br-none'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700/80 rounded-bl-none shadow-2xs'
                      }`}
                    >
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.text}
                      </ReactMarkdown>
                    </div>
                  </div>
                ))
              )}

              {isAsking && (
                <div className="flex items-center gap-2 text-zinc-400 text-xs italic">
                  <Bot size={13} className="animate-spin text-primary-500" />
                  <span>Thinking with Gemini 3.8 Flash...</span>
                </div>
              )}
            </div>

            {/* Chat Input */}
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                handleAskQuestion();
              }}
              className="relative flex items-center pt-1"
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask anything about this meeting..."
                className="w-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-xl py-2 pl-3 pr-10 text-xs outline-none focus:ring-1 focus:ring-primary-500 text-zinc-800 dark:text-zinc-200"
              />
              <button
                type="submit"
                disabled={!chatInput.trim() || isAsking}
                className="absolute right-1.5 p-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-40 text-white transition-colors"
              >
                <Send size={12} />
              </button>
            </form>

            {/* Collapsible Knowledge Radar Toggle */}
            <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setShowRadar(!showRadar)}
                className="w-full flex items-center justify-between text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 py-1"
              >
                <div className="flex items-center gap-1.5">
                  <Compass size={13} className="text-amber-500" />
                  <span>Knowledge Radar (Past Context)</span>
                </div>
                <div className="flex items-center gap-1">
                  {isLoadingRadar && <RefreshCw size={10} className="animate-spin text-zinc-400" />}
                  <span>{showRadar ? "Hide" : `View (${relatedNotes.length})`}</span>
                </div>
              </button>

              {showRadar && (
                <div className="space-y-1.5 pt-2 max-h-40 overflow-y-auto">
                  {relatedNotes.length === 0 ? (
                    <p className="text-[11px] text-zinc-400 text-center py-2">
                      No related notes found in other pages.
                    </p>
                  ) : (
                    relatedNotes.slice(0, 3).map((note, idx) => (
                      <div 
                        key={idx}
                        className="p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 text-xs space-y-0.5"
                      >
                        <div className="font-semibold text-zinc-800 dark:text-zinc-200 truncate flex items-center justify-between">
                          <span className="truncate">{note.pageTitle || "Related Note"}</span>
                          <span className="text-[10px] text-zinc-400 font-normal shrink-0">{(note.similarity * 100).toFixed(0)}% match</span>
                        </div>
                        <p className="text-[11px] text-zinc-500 line-clamp-2">
                          {note.snippet || "Relevant discussion found in notebook."}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
