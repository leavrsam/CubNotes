"use client";

import React, { useState } from "react";
import { Trash2, Sparkles, Send, Bot, User, Edit3, MessageSquare, AlignLeft, FileText, Clock, Bookmark, Check } from "lucide-react";
import ReactMarkdown from 'react-markdown';
import { createClient } from "@/lib/supabase/client";
import type { AudioNode } from "./CustomCanvas";

const supabase = createClient();

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
  const [activeTab, setActiveTab] = useState<TabType>(node.isLiveRecording ? 'notes' : 'summary');
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isChatting, setIsChatting] = useState(false);
  const [chatInput, setChatInput] = useState("");

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
      <div className="w-full flex flex-col">
        
        {/* Header / Audio Player / Recording Status */}
        <div className="bg-white/95 dark:bg-zinc-900/95 pt-4 pb-3 px-4 border-b border-zinc-200/50 dark:border-zinc-700/50 flex-shrink-0">
          <div className="flex justify-between items-center mb-2.5">
            <input 
              type="text"
              value={node.title || "Meeting Recording"}
              onChange={(e) => updateAudioTitle(node.id, e.target.value)}
              className="text-lg font-bold text-zinc-900 dark:text-white bg-transparent border-none outline-none hover:bg-black/5 dark:hover:bg-white/5 px-2 py-1 -ml-2 rounded-lg transition-colors w-full tracking-tight"
              placeholder="Recording Name..."
            />
            <div className="flex items-center gap-1 ml-2">
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

          {node.isLiveRecording ? (
            <div className="flex items-center justify-between px-3.5 py-2 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 rounded-xl animate-pulse">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
                <span className="text-xs font-bold text-red-600 dark:text-red-400">Recording live meeting...</span>
              </div>
              <span className="text-xs font-mono font-bold text-red-600 dark:text-red-400">
                {formatTimer(elapsedSeconds)}
              </span>
            </div>
          ) : node.isTranscribing ? (
            <div className="flex items-center justify-center gap-2 px-3.5 py-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl">
              <Sparkles size={15} className="text-amber-600 dark:text-amber-400 animate-spin" />
              <span className="text-xs font-bold text-amber-700 dark:text-amber-300">Transcribing & summarizing with Gemini...</span>
            </div>
          ) : node.url && !(!node.isAudioSavedPermanently && node.audioExpiresAt && Date.now() > node.audioExpiresAt) ? (
            <div className="flex flex-col gap-2">
              <audio controls className="w-full outline-none h-9">
                <source src={node.url} type="audio/webm" />
                Your browser does not support the audio element.
              </audio>
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
            </div>
          ) : (
            <div className="flex items-center justify-between px-3.5 py-2 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/50 dark:border-zinc-700/50 rounded-xl text-xs text-zinc-500 dark:text-zinc-400">
              <span className="flex items-center gap-1.5 font-medium">
                <Clock size={13} className="text-zinc-400" />
                <span>Audio recording expired (7-day policy) — Transcript & AI Notes preserved</span>
              </span>
            </div>
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
          <button onClick={() => setActiveTab('enhanced')} className={`flex-1 flex flex-col items-center justify-center py-1.5 px-1 text-[10px] font-medium rounded-md gap-1 transition-colors ${activeTab === 'enhanced' ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}>
            <Sparkles size={14} className={activeTab === 'enhanced' ? 'text-amber-500' : ''} /> <span>Enhanced Notes</span>
          </button>
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
              {node.transcript ? (
                <div className="text-[13px] font-mono leading-loose text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap">
                  {node.transcript}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-zinc-400 text-sm">
                  {node.summary?.includes('Transcribing') ? 'Transcribing audio...' : 'No transcript available.'}
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
    </div>
  );
}
