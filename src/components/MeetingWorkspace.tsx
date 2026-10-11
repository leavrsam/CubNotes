"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  Mic, Square, Sparkles, Bot, Send, User, Copy, Check, Download, 
  ArrowLeft, FileText, CheckSquare, Clock, Search, HelpCircle, 
  Compass, ExternalLink, RefreshCw, Layers, ChevronRight, MessageSquare
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { format } from "date-fns";
import toast from "react-hot-toast";
import type { AudioNode } from "./CustomCanvas";

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
}

type MainTab = "notes" | "summary" | "transcript";

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
  onSelectAudioNode
}: MeetingWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<MainTab>(
    activeAudioNode?.notes ? "notes" : (activeAudioNode?.summary ? "summary" : "notes")
  );
  const [shorthandNotes, setShorthandNotes] = useState(activeAudioNode?.notes || "");
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [showEnhanced, setShowEnhanced] = useState(Boolean(activeAudioNode?.enhancedNotes));
  
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

  // Transcript search
  const [transcriptSearch, setTranscriptSearch] = useState("");

  // Keep notes in sync
  useEffect(() => {
    if (activeAudioNode?.notes !== undefined && activeAudioNode.notes !== shorthandNotes) {
      setShorthandNotes(activeAudioNode.notes);
    }
  }, [activeAudioNode?.notes]);

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

  // Enhance My Notes
  const handleEnhanceNotes = async () => {
    const transcript = activeAudioNode?.transcript || "";
    if (!shorthandNotes.trim() && !transcript.trim()) {
      toast.error("Please add some notes or record audio first.");
      return;
    }

    setIsEnhancing(true);
    const toastId = toast.loading("Enhancing notes with gemini-3.8-flash...");

    try {
      const customKey = typeof window !== 'undefined' ? localStorage.getItem('cubnotes_gemini_api_key') : null;
      const res = await fetch('/api/enhance-notes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(customKey ? { 'x-gemini-api-key': customKey } : {}),
        },
        body: JSON.stringify({
          notes: shorthandNotes,
          transcript,
          meetingTitle: activeAudioNode?.title || pageTitle,
          apiKey: customKey || undefined,
        })
      });

      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Enhancement failed");

      if (activeAudioNode?.id) {
        updateAudioField(activeAudioNode.id, 'enhancedNotes', data.enhancedNotes);
      }
      setShowEnhanced(true);
      toast.success("Notes enriched with transcript details!", { id: toastId });
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to enhance notes", { id: toastId });
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
      const customKey = typeof window !== 'undefined' ? localStorage.getItem('cubnotes_gemini_api_key') : null;
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
          notes: shorthandNotes,
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
      const errHistory = [...newHistory, { role: 'assistant' as const, text: `Error: ${err.message || "Unable to answer question."}` }];
      setChatHistory(errHistory);
    } finally {
      setIsAsking(false);
    }
  };

  // Copy summary to clipboard
  const handleCopySummary = () => {
    const textToCopy = activeAudioNode?.summary || activeAudioNode?.enhancedNotes || shorthandNotes;
    if (!textToCopy) {
      toast.error("Nothing to copy yet.");
      return;
    }
    navigator.clipboard.writeText(textToCopy);
    toast.success("Summary copied to clipboard!");
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
      "## Enhanced Notes",
      activeAudioNode?.enhancedNotes || shorthandNotes || "No notes taken.",
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
    <div className="fixed inset-0 z-50 bg-[#fafafa] dark:bg-zinc-950 flex flex-col overflow-hidden text-zinc-900 dark:text-zinc-100 font-sans">
      
      {/* Top Navigation Bar */}
      <header className="h-14 border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors text-xs font-medium"
            title="Return to Whiteboard Canvas"
          >
            <ArrowLeft size={16} />
            <span className="hidden sm:inline">Whiteboard Canvas</span>
          </button>

          <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-700 hidden sm:block" />

          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider font-semibold text-primary-600 dark:text-primary-400 flex items-center gap-1">
              <Sparkles size={13} />
              <span>Meeting Workspace</span>
            </span>
            <input 
              type="text"
              value={activeAudioNode?.title || pageTitle}
              onChange={(e) => {
                if (activeAudioNode?.id) {
                  updateAudioField(activeAudioNode.id, 'title', e.target.value);
                }
              }}
              className="text-sm font-bold bg-transparent border-none outline-none text-zinc-900 dark:text-zinc-100 px-1 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 rounded max-w-[200px] sm:max-w-xs truncate"
              placeholder="Meeting Title..."
            />
            {audios.length > 1 && onSelectAudioNode && (
              <select
                value={activeAudioNode?.id || ""}
                onChange={(e) => onSelectAudioNode(e.target.value)}
                className="text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 rounded-md px-1.5 py-0.5 outline-none max-w-[140px] truncate"
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
        </div>

        {/* Live Recording HUD & Actions */}
        <div className="flex items-center gap-2">
          {isLiveRecording ? (
            <div className="flex items-center gap-2 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 px-3 py-1 rounded-full text-red-600 dark:text-red-400 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
              <span>{formatTimer(recordingDuration)}</span>

              {isRecordingPaused ? (
                <button 
                  onClick={onResumeRecording}
                  className="ml-1 text-[11px] hover:underline"
                >
                  Resume
                </button>
              ) : (
                <button 
                  onClick={onPauseRecording}
                  className="ml-1 text-[11px] hover:underline"
                >
                  Pause
                </button>
              )}

              <button
                onClick={onStopRecording}
                className="ml-1 px-2 py-0.5 bg-red-600 hover:bg-red-700 text-white rounded-full text-[11px] font-bold"
              >
                End & Process
              </button>
            </div>
          ) : (
            onStartRecording && (
              <button
                onClick={onStartRecording}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white rounded-full text-xs font-semibold shadow-xs transition-transform active:scale-95"
              >
                <Mic size={14} />
                <span>Record Meeting</span>
              </button>
            )
          )}

          <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-700 hidden md:block" />

          {/* Canvas Explosion & Export */}
          {onExplodeToCanvas && (
            <button
              onClick={() => onExplodeToCanvas(currentEnhanced || shorthandNotes, currentSummary)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-medium transition-colors"
              title="Explode notes and tasks onto the infinite spatial canvas"
            >
              <Layers size={14} className="text-primary-500" />
              <span className="hidden lg:inline">Send to Canvas</span>
            </button>
          )}

          <button
            onClick={handleCopySummary}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            title="Copy summary to clipboard"
          >
            <Copy size={16} />
          </button>

          <button
            onClick={handleExportMarkdown}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            title="Download Markdown Report"
          >
            <Download size={16} />
          </button>
        </div>
      </header>

      {/* Main Two-Column Split Workspace */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* LEFT PANE: Note-taking & Summaries */}
        <div className="flex-1 flex flex-col border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 overflow-hidden">
          
          {/* Segmented Tab Controls */}
          <div className="flex items-center justify-between px-6 pt-3 border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/20">
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab("notes")}
                className={`pb-2.5 px-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-colors ${
                  activeTab === "notes"
                    ? "border-primary-600 text-primary-600 dark:text-primary-400"
                    : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                }`}
              >
                <FileText size={14} />
                <span>My Notes {currentEnhanced ? "(Enhanced)" : ""}</span>
              </button>

              <button
                onClick={() => setActiveTab("summary")}
                className={`pb-2.5 px-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-colors ${
                  activeTab === "summary"
                    ? "border-primary-600 text-primary-600 dark:text-primary-400"
                    : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                }`}
              >
                <CheckSquare size={14} />
                <span>Executive Summary</span>
              </button>

              <button
                onClick={() => setActiveTab("transcript")}
                className={`pb-2.5 px-3 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-colors ${
                  activeTab === "transcript"
                    ? "border-primary-600 text-primary-600 dark:text-primary-400"
                    : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                }`}
              >
                <Clock size={14} />
                <span>Transcript</span>
              </button>
            </div>

            {/* Note Enhancement CTA */}
            {activeTab === "notes" && (
              <div className="flex items-center gap-2 pb-2">
                {currentEnhanced && (
                  <button
                    onClick={() => setShowEnhanced(!showEnhanced)}
                    className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 underline"
                  >
                    {showEnhanced ? "View Raw Shorthand" : "View Enhanced Version"}
                  </button>
                )}
                <button
                  onClick={handleEnhanceNotes}
                  disabled={isEnhancing}
                  className="flex items-center gap-1.5 px-3 py-1 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-xs transition-all active:scale-95"
                  title="Enrich your shorthand notes with exact figures, dates, and action items from the audio"
                >
                  <Sparkles size={13} className={isEnhancing ? "animate-spin" : ""} />
                  <span>{isEnhancing ? "Enhancing..." : "Enhance Notes"}</span>
                </button>
              </div>
            )}
          </div>

          {/* Tab Content Panes */}
          <div className="flex-1 p-6 overflow-y-auto">
            {activeTab === "notes" && (
              <div className="max-w-2xl mx-auto h-full flex flex-col">
                {showEnhanced && currentEnhanced ? (
                  <div className="prose dark:prose-invert max-w-none text-sm">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {currentEnhanced}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col">
                    <textarea
                      value={shorthandNotes}
                      onChange={(e) => {
                        setShorthandNotes(e.target.value);
                        if (activeAudioNode?.id) {
                          updateAudioField(activeAudioNode.id, 'notes', e.target.value);
                        }
                      }}
                      placeholder="Type your notes or bullet points here..."
                      className="flex-1 w-full bg-transparent resize-none border-none outline-none text-base leading-relaxed text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 font-sans"
                    />
                  </div>
                )}
              </div>
            )}

            {activeTab === "summary" && (
              <div className="max-w-2xl mx-auto">
                {currentSummary ? (
                  <div className="prose dark:prose-invert max-w-none text-sm space-y-4">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {currentSummary}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <div className="py-24 text-center text-zinc-400 space-y-3">
                    <CheckSquare size={32} className="mx-auto text-zinc-300 dark:text-zinc-600" />
                    <p className="text-sm font-medium">No executive summary available yet.</p>
                    <p className="text-xs text-zinc-500 max-w-md mx-auto">
                      Record a meeting to generate an autonomous summary with decisions, action items, and takeaways.
                    </p>
                  </div>
                )}
              </div>
            )}

            {activeTab === "transcript" && (
              <div className="max-w-2xl mx-auto space-y-4">
                <div className="relative flex items-center">
                  <Search size={14} className="absolute left-3 text-zinc-400" />
                  <input
                    type="text"
                    value={transcriptSearch}
                    onChange={(e) => setTranscriptSearch(e.target.value)}
                    placeholder="Search spoken words in transcript..."
                    className="w-full pl-9 pr-4 py-2 bg-zinc-100 dark:bg-zinc-800/60 rounded-xl text-xs border border-transparent focus:border-primary-500 outline-none"
                  />
                </div>

                {currentTranscript ? (
                  <div className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap font-mono text-xs p-4 bg-zinc-50 dark:bg-zinc-900/60 rounded-xl border border-zinc-100 dark:border-zinc-800 max-h-[600px] overflow-y-auto">
                    {transcriptSearch ? (
                      currentTranscript.split('\n').filter(line => line.toLowerCase().includes(transcriptSearch.toLowerCase())).join('\n') || "No matches found."
                    ) : (
                      currentTranscript
                    )}
                  </div>
                ) : (
                  <div className="py-24 text-center text-zinc-400 space-y-2">
                    <Clock size={32} className="mx-auto text-zinc-300 dark:text-zinc-600" />
                    <p className="text-sm font-medium">No transcript available.</p>
                    <p className="text-xs text-zinc-500">Record a meeting to capture live transcription.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT PANE: Meeting HUD (Interactive Q&A + Knowledge Radar) */}
        <div className="w-80 md:w-96 flex flex-col bg-zinc-50/50 dark:bg-zinc-950/40 shrink-0 overflow-hidden border-l border-zinc-200 dark:border-zinc-800">
          
          {/* Section: Ask Meeting AI (Interactive Q&A) */}
          <div className="flex-1 flex flex-col overflow-hidden p-4">
            <div className="flex items-center gap-1.5 pb-2 mb-2 border-b border-zinc-200 dark:border-zinc-800 text-xs font-bold text-zinc-700 dark:text-zinc-300">
              <Bot size={15} className="text-primary-500" />
              <span>Ask Meeting AI (Interactive Q&A)</span>
            </div>

            {/* Quick Prompt Chips */}
            <div className="flex flex-wrap gap-1.5 mb-3">
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
                  className="px-2.5 py-1 rounded-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-[11px] font-medium text-zinc-600 dark:text-zinc-300 hover:border-primary-500 transition-colors shadow-2xs"
                >
                  {chip}
                </button>
              ))}
            </div>

            {/* Chat History */}
            <div 
              ref={chatScrollRef}
              className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs"
            >
              {chatHistory.length === 0 ? (
                <div className="py-8 text-center text-zinc-400 space-y-1.5">
                  <MessageSquare size={24} className="mx-auto text-zinc-300 dark:text-zinc-600" />
                  <p className="font-medium text-xs">Hands-off meeting copilot</p>
                  <p className="text-[11px] text-zinc-500">
                    Active in the discussion? Don&rsquo;t take notes—ask questions here after the call to retrieve quotes, dates, and agreements.
                  </p>
                </div>
              ) : (
                chatHistory.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[90%] rounded-2xl px-3.5 py-2.5 leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-primary-600 text-white rounded-br-none'
                          : 'bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700/80 rounded-bl-none shadow-2xs'
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
                  <span>Analyzing meeting with gemini-3.8-flash...</span>
                </div>
              )}
            </div>

            {/* Chat Input */}
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                handleAskQuestion();
              }}
              className="mt-3 relative flex items-center"
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask anything about this meeting..."
                className="w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-xl py-2 pl-3 pr-10 text-xs outline-none focus:ring-1 focus:ring-primary-500 text-zinc-800 dark:text-zinc-200"
              />
              <button
                type="submit"
                disabled={!chatInput.trim() || isAsking}
                className="absolute right-1.5 p-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-40 text-white transition-colors"
              >
                <Send size={12} />
              </button>
            </form>
          </div>

          {/* Section: Knowledge Radar (Grounding in past notes) */}
          <div className="h-48 border-t border-zinc-200 dark:border-zinc-800 p-3 flex flex-col overflow-hidden bg-white/50 dark:bg-zinc-900/30">
            <div className="flex items-center justify-between pb-1.5 text-xs font-bold text-zinc-700 dark:text-zinc-300">
              <div className="flex items-center gap-1.5">
                <Compass size={14} className="text-amber-500" />
                <span>Knowledge Radar (Past Context)</span>
              </div>
              {isLoadingRadar && <RefreshCw size={11} className="animate-spin text-zinc-400" />}
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {relatedNotes.length === 0 ? (
                <div className="text-[11px] text-zinc-400 py-3 text-center">
                  Scanning past notebooks for related project context...
                </div>
              ) : (
                relatedNotes.slice(0, 3).map((note, idx) => (
                  <div 
                    key={idx}
                    className="p-2 rounded-lg bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 text-xs space-y-1 hover:border-primary-400 transition-colors"
                  >
                    <div className="font-semibold text-zinc-800 dark:text-zinc-200 truncate flex items-center justify-between">
                      <span>{note.pageTitle || "Related Note"}</span>
                      <span className="text-[10px] text-zinc-400 font-normal">{(note.similarity * 100).toFixed(0)}% match</span>
                    </div>
                    <p className="text-[11px] text-zinc-500 line-clamp-2">
                      {note.snippet || "Relevant discussion found in notebook."}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
