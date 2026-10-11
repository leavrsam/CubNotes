"use client";

import React, { useState, useRef, useEffect } from "react";
import { Trash2, Sparkles, Send, Bot, User, Edit3, MessageSquare, AlignLeft, FileText, Clock, Bookmark, Check, Download, FileDown, ChevronDown, Minimize2, Maximize2, Play, Pause, Mic } from "lucide-react";
import ReactMarkdown from 'react-markdown';
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";
import { processAudioTranscription } from "@/lib/transcribe";
import type { AudioNode } from "./CustomCanvas";
import { AudioPlayer } from "./AudioPlayer";

const supabase = createClient();

function MiniAudioPlayButton({ url }: { url: string }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }
  };

  return (
    <div className="flex items-center">
      <audio 
        ref={audioRef} 
        src={url} 
        preload="none" 
        onEnded={() => setIsPlaying(false)} 
        onPause={() => setIsPlaying(false)} 
      />
      <button
        type="button"
        onClick={togglePlay}
        className="w-6 h-6 rounded-full bg-primary-50 dark:bg-primary-950/50 hover:bg-primary-100 dark:hover:bg-primary-900/60 text-primary-600 dark:text-primary-400 flex items-center justify-center transition-colors border border-primary-200 dark:border-primary-800/60 shrink-0"
        title={isPlaying ? "Pause audio" : "Play audio"}
      >
        {isPlaying ? <Pause size={10} fill="currentColor" /> : <Play size={10} fill="currentColor" className="ml-0.5" />}
      </button>
    </div>
  );
}

type TabType = 'notes' | 'enhanced' | 'transcript' | 'summary' | 'chat';

export function MobileAudioCard({ 
  node, 
  updateAudioTitle, 
  updateAudioField, 
  deleteAudioNode,
  onAnnotate
}: {
  node: AudioNode;
  updateAudioTitle: (id: string, title: string) => void;
  updateAudioField: (id: string, field: keyof AudioNode, value: any) => void;
  deleteAudioNode: (id: string) => void;
  onAnnotate?: (id: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<TabType>(node.isLiveRecording ? 'transcript' : 'summary');
  const [liveStatus, setLiveStatus] = useState<string>(node.isLiveRecording ? 'listening' : 'idle');
  const [liveStatusMsg, setLiveStatusMsg] = useState<string>('');
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isChatting, setIsChatting] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [liveTranscript, setLiveTranscript] = useState(node.transcript || "");
  const [isRetryingTranscription, setIsRetryingTranscription] = useState(false);

  // Sync with prop when not live recording
  useEffect(() => {
    if (node.transcript && !node.isLiveRecording) {
      setLiveTranscript(node.transcript);
    }
  }, [node.transcript, node.isLiveRecording]);

  // When live recording is active, ensure we show the transcript tab and listen for streaming updates
  useEffect(() => {
    if (!node.isLiveRecording) return;
    setActiveTab('transcript');

    const handleBroadcast = (e: Event) => {
      const customEvent = e as CustomEvent<{ transcript: string; interim: string; status: string; statusMessage: string }>;
      const { transcript, status, statusMessage } = customEvent.detail;
      if (status) setLiveStatus(status);
      if (statusMessage) setLiveStatusMsg(statusMessage);
      if (transcript !== undefined) {
        setLiveTranscript(transcript);
        updateAudioField(node.id, 'transcript', transcript);
      }
    };

    window.addEventListener('live-transcript-broadcast', handleBroadcast);
    return () => window.removeEventListener('live-transcript-broadcast', handleBroadcast);
  }, [node.isLiveRecording, node.id, updateAudioField]);

  const handleRetryTranscription = async () => {
    if (!node.url || isRetryingTranscription) return;
    setIsRetryingTranscription(true);
    const toastId = toast.loading("Transcribing...");
    try {
      const res = await processAudioTranscription({
        audioUrl: node.url,
        mimeType: 'audio/webm',
        isJournal: true,
      });
      updateAudioField(node.id, 'transcript', res.transcript);
      updateAudioField(node.id, 'summary', res.summary);
      toast.success("Transcript & summary generated!", { id: toastId });
      setActiveTab('summary');
    } catch (err: any) {
      console.error("Transcription error:", err);
      toast.error(`Transcription failed: ${err.message || 'Unknown error'}`, { id: toastId });
    } finally {
      setIsRetryingTranscription(false);
    }
  };

  const needsTranscription = Boolean(
    node.url &&
    (!node.transcript ||
     !node.summary ||
     node.summary.includes('could not be completed') ||
     node.summary.includes('AI Processing failed') ||
     node.summary.includes('Audio Saved'))
  );

  const handleDownloadAudio = async () => {
    if (!node.url) return;
    try {
      toast.loading("Preparing audio download...", { id: `dl-${node.id}` });
      const response = await fetch(node.url);
      if (!response.ok) throw new Error("Could not fetch audio file");
      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      const cleanTitle = (node.title || "recording").replace(/[^a-zA-Z0-9_-]/g, "_");
      const ext = node.url.includes(".wav") ? "wav" : node.url.includes(".mp4") ? "mp4" : "webm";
      a.download = `${cleanTitle}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(objectUrl);
      toast.success("Audio downloaded!", { id: `dl-${node.id}` });
    } catch {
      window.open(node.url, "_blank");
      toast.dismiss(`dl-${node.id}`);
    }
  };

  const handleExportNotes = () => {
    const title = node.title || "Meeting Recording";
    const dateStr = format(new Date(node.audioCreatedAt || node.recordingStartedAt || Date.now()), "PPpp");
    const content = [
      `# ${title}`,
      `**Recorded:** ${dateStr}`,
      node.url ? `**Audio File:** ${node.url}` : "",
      "",
      "---",
      "",
      "## Summary",
      node.summary || "No summary available.",
      "",
      "---",
      "",
      "## My Notes",
      node.notes || "No manual notes taken.",
      "",
      "---",
      "",
      "## Full Transcript",
      node.transcript || "No transcript available.",
    ].filter(Boolean).join("\n\n");

    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const objectUrl = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    const cleanTitle = title.replace(/[^a-zA-Z0-9_-]/g, "_");
    a.download = `${cleanTitle}_summary_and_transcript.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(objectUrl);
    toast.success("Meeting notes exported as Markdown!");
  };

  // Live timer for active recording
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  React.useEffect(() => {
    if (node.isLiveRecording) {
      setActiveTab('notes');
      const start = node.recordingStartedAt || Date.now();
      const interval = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - start) / 1000));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [node.isLiveRecording, node.recordingStartedAt]);

  const liveScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (node.isLiveRecording && liveScrollRef.current) {
      liveScrollRef.current.scrollTop = liveScrollRef.current.scrollHeight;
    }
  }, [node.transcript, node.isLiveRecording]);

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleEnhance = async () => {
    if (!node.notes || !node.transcript) return;
    setIsEnhancing(true);
    setActiveTab('enhanced');
    
    try {
      const { data, error } = await supabase.functions.invoke('enhance-notes', {
        body: { notes: node.notes, transcript: node.transcript }
      });
      if (error) throw error;
      if (data?.success) {
        updateAudioField(node.id, 'enhancedNotes', data.enhancedNotes);
      }
    } catch (e) {
      console.error("Enhance failed:", e);
      updateAudioField(node.id, 'enhancedNotes', "Failed to enhance notes. Please try again.");
    } finally {
      setIsEnhancing(false);
    }
  };

  const handleChat = async () => {
    if (!chatInput.trim() || !node.transcript) return;
    const userMsg = chatInput;
    setChatInput("");
    setIsChatting(true);
    
    const newHistory = [...(node.chatHistory || []), { role: 'user' as const, text: userMsg }];
    updateAudioField(node.id, 'chatHistory', newHistory);

    try {
      const { data, error } = await supabase.functions.invoke('chat-with-transcript', {
        body: { transcript: node.transcript, question: userMsg, history: newHistory }
      });
      if (error) throw error;
      if (data?.success) {
        updateAudioField(node.id, 'chatHistory', [...newHistory, { role: 'assistant' as const, text: data.answer }]);
      }
    } catch (e) {
      console.error("Chat failed:", e);
      updateAudioField(node.id, 'chatHistory', [...newHistory, { role: 'assistant' as const, text: "Sorry, I couldn't process that question." }]);
    } finally {
      setIsChatting(false);
    }
  };

  return (
    <div className="w-full relative bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 z-10 overflow-hidden mb-4">
      {node.isCollapsed ? (
        <div 
          onClick={() => updateAudioField(node.id, 'isCollapsed', false)}
          className="w-full flex items-center justify-between p-3.5 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors select-none"
        >
          <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-3">
            {node.isLiveRecording ? (
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 text-[11px] font-bold shrink-0">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                <span>{formatTimer(elapsedSeconds)}</span>
              </span>
            ) : node.isTranscribing ? (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-amber-600 dark:text-amber-400 text-[11px] font-semibold shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                <span>Transcribing</span>
              </span>
            ) : (
              <div className="w-6 h-6 rounded-lg bg-primary-50 dark:bg-primary-950/50 flex items-center justify-center text-primary-600 dark:text-primary-400 shrink-0">
                <Mic size={13} />
              </div>
            )}

            <span className="font-bold text-sm text-zinc-900 dark:text-white truncate">
              {node.title || "Meeting Recording"}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {node.url && (
              <MiniAudioPlayButton url={node.url} />
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                updateAudioField(node.id, 'isCollapsed', false);
              }}
              className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
              title="Expand"
            >
              <Maximize2 size={16} />
            </button>
          </div>
        </div>
      ) : (
        <div className="w-full flex flex-col">
          {/* Header / Audio Player / Recording Status */}
          <div className="bg-white/95 dark:bg-zinc-900/95 pt-4 pb-3 px-4 border-b border-zinc-200/50 dark:border-zinc-700/50 flex-shrink-0">
            <div className="flex justify-between items-center mb-1">
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <button
                  type="button"
                  onClick={() => updateAudioField(node.id, 'isCollapsed', true)}
                  className="p-1 -ml-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-md transition-colors shrink-0"
                  title="Collapse card"
                >
                  <ChevronDown size={17} />
                </button>
                <input 
                  type="text"
                  value={node.title || "Meeting Recording"}
                  onChange={(e) => updateAudioTitle(node.id, e.target.value)}
                  className="text-lg font-bold text-zinc-900 dark:text-white bg-transparent border-none outline-none hover:bg-black/5 dark:hover:bg-white/5 px-2 py-1 rounded-lg transition-colors w-full tracking-tight"
                  placeholder="Recording Name..."
                />
              </div>
              <div className="flex items-center gap-1 ml-2">
                <button
                  type="button"
                  onClick={() => updateAudioField(node.id, 'isCollapsed', true)}
                  className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 flex-shrink-0"
                  title="Collapse card"
                >
                  <Minimize2 size={15} />
                </button>
              {node.url && (
                <button 
                  onClick={handleDownloadAudio}
                  className="text-zinc-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 flex-shrink-0"
                  title="Download Audio File"
                >
                  <Download size={15} />
                </button>
              )}
              <button 
                onClick={handleExportNotes}
                className="text-zinc-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 flex-shrink-0"
                title="Export Notes & Transcript (.md)"
              >
                <FileDown size={15} />
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); onAnnotate?.(node.id); }}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 flex-shrink-0"
                title="Annotate Audio"
              >
                <Edit3 size={15} />
              </button>
              <button 
                onClick={() => deleteAudioNode(node.id)}
                className="text-zinc-400 hover:text-red-500 transition-colors p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 flex-shrink-0"
                title="Delete Recording"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1.5 px-0.5 mb-2 text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
            <Clock size={11} className="text-zinc-400" />
            <span>{format(new Date(node.audioCreatedAt || node.recordingStartedAt || Date.now()), "h:mm a")}</span>
            {node.isAudioSavedPermanently && (
              <span className="ml-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.2 rounded border border-emerald-200 dark:border-emerald-800/50">
                Saved Permanently
              </span>
            )}
          </div>

          {node.isLiveRecording ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between px-3.5 py-2 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 rounded-xl">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
                  <span className="text-xs font-bold text-red-600 dark:text-red-400">Recording live meeting...</span>
                </div>
                <span className="text-xs font-mono font-bold text-red-600 dark:text-red-400">
                  {formatTimer(elapsedSeconds)}
                </span>
              </div>

              {/* Live Real-Time Speech Stream Box */}
              <div className="p-3 rounded-xl bg-zinc-50/90 dark:bg-zinc-800/60 border border-zinc-200/80 dark:border-zinc-700/60 shadow-inner">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-[11px] font-bold text-red-600 dark:text-red-400 tracking-wide uppercase">
                      Live Transcription
                    </span>
                  </div>
                  <span className="text-[10px] text-zinc-400 font-medium">Free • On-Device</span>
                </div>
                <div 
                  ref={liveScrollRef}
                  className="text-xs text-zinc-700 dark:text-zinc-300 font-mono max-h-32 min-h-[44px] overflow-y-auto leading-relaxed whitespace-pre-wrap select-text custom-scrollbar"
                >
                  {node.transcript ? (
                    <span className="text-zinc-800 dark:text-zinc-200">
                      {node.transcript}
                      <span className="inline-block w-1.5 h-3.5 ml-1 bg-red-500 animate-pulse align-middle" />
                    </span>
                  ) : liveStatus === 'mic_busy' || liveStatus === 'unsupported' ? (
                    <span className="italic text-zinc-400 text-[11px] leading-relaxed">
                      Microphone is actively recording audio. Gemini 3.8 Flash will transcribe and summarize the full conversation as soon as you tap Stop.
                    </span>
                  ) : (
                    <span className="italic text-zinc-400 text-[11px] leading-relaxed">
                      {liveStatusMsg || "Listening for speech... Start speaking into the microphone to see real-time words appear here."}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : node.isTranscribing ? (
            <div className="relative overflow-hidden flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500/10 dark:bg-amber-500/20 border border-amber-400/30 rounded-xl">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-400/25 dark:via-amber-300/25 to-transparent animate-glow-sweep pointer-events-none" />
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span className="relative z-10 text-xs font-bold text-amber-700 dark:text-amber-300 tracking-wide">
                Transcribing
              </span>
            </div>
          ) : node.url && !(!node.isAudioSavedPermanently && node.audioExpiresAt && Date.now() > node.audioExpiresAt) ? (
            <div className="flex flex-col gap-2">
              <AudioPlayer 
                url={node.url} 
                initialDurationMs={node.durationMs} 
                className="w-full" 
              />
              <div className="flex items-center justify-between px-1 pt-0.5">
                {node.isAudioSavedPermanently ? (
                  <button 
                    onClick={() => updateAudioField(node.id, 'isAudioSavedPermanently', false)}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-lg hover:bg-emerald-100 transition-colors"
                    title="Audio will be kept permanently. Click to allow 7-day auto-expiration."
                  >
                    <Check size={12} className="text-emerald-500" />
                    <span>Saved Permanently</span>
                  </button>
                ) : (
                  <div className="flex items-center justify-between w-full">
                    <span className="text-[11px] text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
                      <Clock size={12} className="text-amber-500" />
                      <span>
                        Expires in {node.audioExpiresAt ? Math.max(1, Math.ceil((node.audioExpiresAt - Date.now()) / (1000 * 60 * 60 * 24))) : 7} days
                      </span>
                    </span>
                    <button 
                      onClick={() => updateAudioField(node.id, 'isAudioSavedPermanently', true)}
                      className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-950/40 hover:bg-primary-100 dark:hover:bg-primary-900/50 border border-primary-200 dark:border-primary-800/60 rounded-lg transition-colors"
                      title="Save this audio recording permanently so it never expires"
                    >
                      <Bookmark size={11} />
                      <span>Save Audio Permanently</span>
                    </button>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 pt-1 border-t border-zinc-100 dark:border-zinc-800/80 mt-1">
                {node.url && (
                  <button
                    onClick={handleDownloadAudio}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 bg-zinc-100 dark:bg-zinc-800/80 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg text-[11px] font-medium transition-colors"
                  >
                    <Download size={12} />
                    <span>Download Audio</span>
                  </button>
                )}
                <button
                  onClick={handleExportNotes}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 bg-zinc-100 dark:bg-zinc-800/80 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg text-[11px] font-medium transition-colors"
                >
                  <FileDown size={12} />
                  <span>Export Notes (.md)</span>
                </button>
              </div>
              {needsTranscription && (
                <button 
                  onClick={handleRetryTranscription}
                  disabled={isRetryingTranscription}
                  className={`relative overflow-hidden mt-2.5 w-full flex items-center justify-center py-2.5 px-4 text-xs font-semibold rounded-xl transition-all shadow-sm ${
                    isRetryingTranscription 
                      ? "bg-amber-600 text-white cursor-wait" 
                      : "bg-amber-500 hover:bg-amber-600 active:scale-[0.99] text-white"
                  }`}
                  title="Retry Transcription & Summary"
                >
                  {isRetryingTranscription && (
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-glow-sweep pointer-events-none" />
                  )}
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    {isRetryingTranscription ? (
                      <>
                        <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                        <span>Transcribing</span>
                      </>
                    ) : (
                      <span>Retry Transcription & Summary</span>
                    )}
                  </span>
                </button>
              )}
            </div>
          ) : (
            null
          )}
        </div>

        {/* Tab Navigation */}
        <div className="flex justify-around items-center px-1 py-1 border-b border-zinc-200/50 dark:border-zinc-700/50 bg-zinc-50/50 dark:bg-zinc-800/50 overflow-x-auto custom-scrollbar flex-shrink-0">
          <button onClick={() => setActiveTab('summary')} className={`flex-1 flex flex-col items-center justify-center py-1.5 px-1 text-[10px] font-medium rounded-md gap-1 transition-colors ${activeTab === 'summary' ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}>
            <FileText size={14} /> <span>Summary</span>
          </button>
          <button onClick={() => setActiveTab('notes')} className={`flex-1 flex flex-col items-center justify-center py-1.5 px-1 text-[10px] font-medium rounded-md gap-1 transition-colors ${activeTab === 'notes' ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}>
            <Edit3 size={14} /> <span>My Notes</span>
          </button>
          {(node.enhancedNotes || isEnhancing) && (
            <button onClick={() => setActiveTab('enhanced')} className={`flex-1 flex flex-col items-center justify-center py-1.5 px-1 text-[10px] font-medium rounded-md gap-1 transition-colors ${activeTab === 'enhanced' ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}>
              <Sparkles size={14} className={activeTab === 'enhanced' ? 'text-amber-500' : ''} /> <span>Enhanced Notes</span>
            </button>
          )}
          <button onClick={() => setActiveTab('transcript')} className={`flex-1 flex flex-col items-center justify-center py-1.5 px-1 text-[10px] font-medium rounded-md gap-1 transition-colors ${activeTab === 'transcript' ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}>
            <AlignLeft size={14} /> <span>Transcript</span>
          </button>
          <button onClick={() => setActiveTab('chat')} className={`flex-1 flex flex-col items-center justify-center py-1.5 px-1 text-[10px] font-medium rounded-md gap-1 transition-colors ${activeTab === 'chat' ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}>
            <MessageSquare size={14} /> <span>Chat</span>
          </button>
        </div>

        {/* Tab Content Area */}
        <div className="h-[350px] flex flex-col">
          {/* Notes Tab */}
          {activeTab === 'notes' && (
            <div className="flex flex-col h-full bg-zinc-50/30 dark:bg-zinc-900/30">
              <textarea 
                value={node.notes || ""}
                onChange={(e) => updateAudioField(node.id, 'notes', e.target.value)}
                placeholder="Type your shorthand notes here during the meeting..."
                className="flex-1 w-full p-4 text-sm text-zinc-800 dark:text-zinc-200 bg-transparent border-none outline-none resize-none custom-scrollbar leading-relaxed"
              />
              <div className="p-3 border-t border-zinc-200/50 dark:border-zinc-700/50 bg-white/50 dark:bg-zinc-800/50 flex justify-end">
                <button 
                  onClick={handleEnhance}
                  disabled={!node.notes || !node.transcript || isEnhancing}
                  className="px-4 py-2 bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/30 dark:hover:bg-amber-900/50 text-amber-700 dark:text-amber-400 text-xs font-bold rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isEnhancing ? <span className="animate-pulse">Enhancing...</span> : <>Enhance Notes <Sparkles size={14} /></>}
                </button>
              </div>
            </div>
          )}

          {/* Enhanced Notes Tab */}
          {activeTab === 'enhanced' && (
            <div className="p-4 overflow-y-auto h-full custom-scrollbar">
              {!node.enhancedNotes && !isEnhancing ? (
                <div className="flex flex-col items-center justify-center h-full text-zinc-400 gap-3 text-center px-4">
                  <Sparkles size={32} className="opacity-20" />
                  <p className="text-sm">Write notes in the "My Notes" tab and click Enhance.</p>
                </div>
              ) : isEnhancing ? (
                <div className="flex flex-col items-center justify-center h-full text-amber-500 gap-3 animate-pulse">
                  <Sparkles size={32} />
                  <p className="text-sm font-medium">AI is polishing your notes...</p>
                </div>
              ) : (
                <div className="prose prose-sm dark:prose-invert max-w-none text-zinc-800 dark:text-zinc-200">
                  <ReactMarkdown>{node.enhancedNotes || ""}</ReactMarkdown>
                </div>
              )}
            </div>
          )}

          {/* Transcript Tab */}
          {activeTab === 'transcript' && (
            <div className="p-4 overflow-y-auto h-full custom-scrollbar">
              {node.isLiveRecording && (
                <div className="flex items-center justify-between mb-3 px-2.5 py-1.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/50 rounded-lg text-xs font-semibold text-red-600 dark:text-red-400">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <span>Live Transcript</span>
                  </div>
                  <span className="text-[10px] text-zinc-400 font-normal">Streaming</span>
                </div>
              )}
              {(node.isLiveRecording ? (liveTranscript || node.transcript) : (node.transcript || liveTranscript)) ? (
                <div className="text-[13px] font-mono leading-loose text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap">
                  {node.isLiveRecording ? (liveTranscript || node.transcript) : (node.transcript || liveTranscript)}
                  {node.isLiveRecording && (
                    <span className="inline-block w-1.5 h-4 ml-1 bg-red-500 animate-pulse align-middle" />
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-zinc-400 text-sm py-8 text-center px-4">
                  {node.isLiveRecording ? (
                    liveStatus === 'mic_busy' || liveStatus === 'unsupported' ? (
                      <div className="space-y-1">
                        <p className="font-semibold text-zinc-600 dark:text-zinc-300">Recording audio</p>
                        <p className="text-xs text-zinc-400 max-w-[280px]">
                          Microphone is recording. Full transcript & summary will be generated as soon as you tap Stop.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse inline-block mb-1" />
                        <p className="font-semibold text-zinc-600 dark:text-zinc-300">Listening for speech...</p>
                        <p className="text-xs text-zinc-400">Speak into your microphone to see live words appear here.</p>
                      </div>
                    )
                  ) : node.summary?.includes('Transcribing') ? (
                    'Transcribing audio...'
                  ) : (
                    'No transcript available.'
                  )}
                </div>
              )}
            </div>
          )}

          {/* Summary Tab */}
          {activeTab === 'summary' && (
            <div className="p-4 overflow-y-auto h-full custom-scrollbar prose prose-sm dark:prose-invert max-w-none">
              {node.summary ? (
                <ReactMarkdown>{node.summary}</ReactMarkdown>
              ) : (
                <div className="flex items-center justify-center h-full text-zinc-400 text-sm">
                  No summary available.
                </div>
              )}
            </div>
          )}

          {/* Chat Tab */}
          {activeTab === 'chat' && (
            <div className="flex flex-col h-full bg-zinc-50/50 dark:bg-zinc-900/50">
              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-4">
                {(!node.chatHistory || node.chatHistory.length === 0) && (
                  <div className="flex items-center justify-center h-full text-zinc-400 text-sm text-center px-4">
                    Ask me anything about this meeting!<br/>I can find action items, summarize decisions, or locate details.
                  </div>
                )}
                {node.chatHistory?.map((msg, idx) => (
                  <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${msg.role === 'user' ? 'bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400' : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300'}`}>
                      {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                    </div>
                    <div className={`p-3 rounded-2xl max-w-[85%] text-sm ${msg.role === 'user' ? 'bg-primary-500 text-white rounded-tr-sm' : 'bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-200/50 dark:border-zinc-700/50 rounded-tl-sm'}`}>
                      {msg.role === 'user' ? msg.text : <div className="prose prose-sm dark:prose-invert prose-p:my-1 max-w-none"><ReactMarkdown>{msg.text}</ReactMarkdown></div>}
                    </div>
                  </div>
                ))}
                {isChatting && (
                  <div className="flex gap-3 flex-row">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                      <Bot size={16} />
                    </div>
                    <div className="p-3 rounded-2xl bg-white dark:bg-zinc-800 border border-zinc-200/50 dark:border-zinc-700/50 rounded-tl-sm flex items-center gap-1">
                      <div className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                )}
              </div>
              <div className="p-3 border-t border-zinc-200/50 dark:border-zinc-700/50 bg-white/50 dark:bg-zinc-800/50">
                <form 
                  onSubmit={(e) => { e.preventDefault(); handleChat(); }}
                  className="flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Ask about the transcript..."
                    className="flex-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-full px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500/50"
                  />
                  <button 
                    type="submit"
                    disabled={!chatInput.trim() || isChatting || !node.transcript}
                    className="w-9 h-9 flex items-center justify-center bg-primary-500 hover:bg-primary-600 text-white rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                  >
                    <Send size={14} className="-ml-0.5" />
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
