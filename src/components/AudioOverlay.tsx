"use client";

import React, { useCallback, useRef, useState } from "react";
import type { AudioNode, ToolType } from "./CustomCanvas";
import { Trash2, GripVertical, Sparkles, Send, Bot, User, Edit3, MessageSquare, AlignLeft, FileText, Clock, Bookmark, Check } from "lucide-react";
import ReactMarkdown from 'react-markdown';
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

interface AudioOverlayProps {
  audios: AudioNode[];
  setAudios: React.Dispatch<React.SetStateAction<AudioNode[]>>;
  pan: { x: number; y: number };
  zoom: number;
  tool: ToolType;
  selectedIds?: string[];
  setSelectedIds?: React.Dispatch<React.SetStateAction<string[]>>;
  onDragSelectionStart?: (id: string) => void;
  onDragSelectionMove?: (deltaX: number, deltaY: number) => void;
  onDragSelectionEnd?: () => void;
  onAnnotate?: (id: string) => void;
  activeRecordingDuration?: number;
  isActiveRecordingPaused?: boolean;
  onPauseRecording?: () => void;
  onResumeRecording?: () => void;
  onStopRecording?: () => void;
}

type TabType = 'notes' | 'enhanced' | 'transcript' | 'summary' | 'chat';

function AudioNodeCard({ 
  node, 
  tool, 
  isSelected, 
  updateAudioTitle, 
  updateAudioField, 
  deleteAudioNode,
  setDraggingId,
  dragStartRef,
  setResizingId,
  resizeStartRef,
  onDragSelectionStart,
  onAnnotate,
  activeRecordingDuration = 0,
  isActiveRecordingPaused = false,
  onPauseRecording,
  onResumeRecording,
  onStopRecording
}: {
  node: AudioNode;
  tool: ToolType;
  isSelected: boolean;
  updateAudioTitle: (id: string, title: string) => void;
  updateAudioField: (id: string, field: keyof AudioNode, value: any) => void;
  deleteAudioNode: (id: string) => void;
  setDraggingId: (id: string | null) => void;
  dragStartRef: React.MutableRefObject<{ x: number, y: number, nodeX: number, nodeY: number } | null>;
  setResizingId: (id: string | null) => void;
  resizeStartRef: React.MutableRefObject<{ x: number, nodeWidth: number } | null>;
  onDragSelectionStart?: (id: string) => void;
  onAnnotate?: (id: string) => void;
  activeRecordingDuration?: number;
  isActiveRecordingPaused?: boolean;
  onPauseRecording?: () => void;
  onResumeRecording?: () => void;
  onStopRecording?: () => void;
}) {
  const [activeTab, setActiveTab] = useState<TabType>(node.isLiveRecording ? 'notes' : 'summary');
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isChatting, setIsChatting] = useState(false);
  const [chatInput, setChatInput] = useState("");

  // Sync with global timer for active recording
  const elapsedSeconds = node.isLiveRecording ? activeRecordingDuration : 0;

  React.useEffect(() => {
    if (node.isLiveRecording) {
      setActiveTab('notes');
    }
  }, [node.isLiveRecording]);

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
    <div 
      className={`absolute pointer-events-auto group transition-colors rounded-xl`}
      style={{
        left: node.x,
        top: node.y,
        width: node.width || 500, // increased default width for notes/chat
      }}
    >
      {tool === 'home' && (
        <>
          {/* Drag Handle (Move) */}
          <div 
            className="absolute -top-5 left-[1px] right-[1px] h-5 cursor-grab active:cursor-grabbing bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 rounded-t-2xl opacity-0 group-hover:opacity-100 transition-opacity z-20 flex items-center justify-between px-2 border border-transparent border-b-0 group-hover:border-zinc-300 dark:group-hover:border-zinc-700"
            onPointerDown={(e) => {
              e.stopPropagation();
              onDragSelectionStart?.(node.id);
              setDraggingId(node.id);
              dragStartRef.current = { x: e.clientX, y: e.clientY, nodeX: node.x, nodeY: node.y };
            }}
          >
            <button
              className="flex gap-[1px] text-[10px] text-zinc-500 dark:text-zinc-400 items-center justify-center h-full hover:text-primary-500 transition-colors pointer-events-auto"
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onAnnotate?.(node.id);
              }}
              title="Annotate this block"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"></path><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path><path d="M2 2l7.586 7.586"></path><circle cx="11" cy="11" r="2"></circle></svg>
            </button>
            <div className="flex gap-1 absolute left-1/2 -translate-x-1/2">
              <div className="w-1 h-1 bg-zinc-500 rounded-full" />
              <div className="w-1 h-1 bg-zinc-500 rounded-full" />
              <div className="w-1 h-1 bg-zinc-500 rounded-full" />
              <div className="w-1 h-1 bg-zinc-500 rounded-full" />
            </div>
            <div className="w-2" />
          </div>

          {/* Resize Handle (Right edge) */}
          <div 
            className="absolute -right-2 top-0 bottom-0 w-4 cursor-col-resize flex items-center justify-center group/resize z-20 opacity-0 group-hover:opacity-100 transition-opacity"
            onPointerDown={(e) => {
              e.stopPropagation();
              setResizingId(node.id);
              resizeStartRef.current = { x: e.clientX, nodeWidth: node.width || 500 };
            }}
          >
            <div className="w-1.5 h-6 bg-zinc-300 dark:bg-zinc-600 group-hover/resize:bg-zinc-500 rounded-full" />
          </div>
        </>
      )}

      <div className="w-full flex flex-col bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-zinc-200/50 dark:border-zinc-700/50 overflow-hidden">
        
        {/* Header / Audio Player / Recording Status */}
        <div className="bg-white/95 dark:bg-zinc-900/95 pt-5 pb-3 px-5 border-b border-zinc-200/50 dark:border-zinc-700/50 flex-shrink-0">
          <div className="flex justify-between items-center mb-1">
            <input 
              type="text"
              value={node.title || "Meeting Notes"}
              onChange={(e) => updateAudioTitle(node.id, e.target.value)}
              className={`text-lg font-bold text-zinc-900 dark:text-white bg-transparent border-none outline-none hover:bg-black/5 dark:hover:bg-white/5 px-2 py-1 -ml-2 rounded-lg transition-colors w-full tracking-tight`}
              placeholder="Recording Name..."
            />
            <button 
              onClick={() => deleteAudioNode(node.id)}
              className={`text-red-500 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity p-1 ml-2 flex-shrink-0`}
              title="Delete Recording"
            >
              <Trash2 size={16} />
            </button>
          </div>

          <div className="flex items-center gap-1.5 px-0.5 mb-3 text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
            <Clock size={11} className="text-zinc-400" />
            <span>{format(new Date(node.audioCreatedAt || node.recordingStartedAt || Date.now()), "h:mm a")}</span>
            {node.isAudioSavedPermanently && (
              <span className="ml-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.2 rounded border border-emerald-200 dark:border-emerald-800/50">
                Saved Permanently
              </span>
            )}
          </div>
          
          {node.isLiveRecording ? (
            <div className="flex items-center justify-between px-4 py-2 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 rounded-xl">
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full bg-red-500 ${!isActiveRecordingPaused ? 'animate-ping' : ''}`} />
                <span className="text-xs font-bold text-red-600 dark:text-red-400">
                  {isActiveRecordingPaused ? 'Recording Paused' : 'Recording live meeting...'}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono font-bold text-red-600 dark:text-red-400">
                  {formatTimer(elapsedSeconds)}
                </span>
                {onStopRecording && (
                  <div className="flex items-center gap-1 border-l border-red-200 dark:border-red-800/60 pl-3">
                    {isActiveRecordingPaused ? (
                      <button onClick={onResumeRecording} className="p-1 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/40 rounded transition-colors" title="Resume">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                      </button>
                    ) : (
                      <button onClick={onPauseRecording} className="p-1 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/40 rounded transition-colors" title="Pause">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
                      </button>
                    )}
                    <button onClick={onStopRecording} className="p-1 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/40 rounded transition-colors" title="Stop">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : node.isTranscribing ? (
            <div className="flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl">
              <Sparkles size={16} className="text-amber-600 dark:text-amber-400 animate-spin" />
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
        <div 
          className="h-[400px] flex flex-col"
          onWheel={(e) => e.stopPropagation()}
        >
          {/* Notes Tab */}
          {activeTab === 'notes' && (
            <div className="flex flex-col h-full bg-zinc-50/30 dark:bg-zinc-900/30">
              <textarea 
                value={node.notes || ""}
                onChange={(e) => updateAudioField(node.id, 'notes', e.target.value)}
                placeholder="Type your shorthand notes here during the meeting..."
                className="flex-1 w-full p-5 text-sm text-zinc-800 dark:text-zinc-200 bg-transparent border-none outline-none resize-none custom-scrollbar leading-relaxed"
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
            <div className="p-5 overflow-y-auto h-full custom-scrollbar">
              {!node.enhancedNotes && !isEnhancing ? (
                <div className="flex flex-col items-center justify-center h-full text-zinc-400 gap-3">
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
            <div className="p-5 overflow-y-auto h-full custom-scrollbar">
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
            <div className="p-5 overflow-y-auto h-full custom-scrollbar prose prose-sm dark:prose-invert max-w-none">
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
              <div className="p-4 border-t border-zinc-200/50 dark:border-zinc-700/50 bg-white/50 dark:bg-zinc-800/50">
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


export function AudioOverlay({ 
  audios, setAudios, 
  pan, zoom, tool,
  selectedIds = [], setSelectedIds,
  onDragSelectionStart, onDragSelectionMove, onDragSelectionEnd,
  onAnnotate
}: AudioOverlayProps) {
  
  // Dragging state
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragStartRef = useRef<{ x: number, y: number, nodeX: number, nodeY: number } | null>(null);
  
  // Resizing state
  const [resizingId, setResizingId] = useState<string | null>(null);
  const resizeStartRef = useRef<{ x: number, nodeWidth: number } | null>(null);

  const deleteAudioNode = useCallback((id: string) => {
    setAudios(prev => prev.filter(a => a.id !== id));
  }, [setAudios]);

  const updateAudioTitle = useCallback((id: string, newTitle: string) => {
    setAudios(prev => prev.map(a => a.id === id ? { ...a, title: newTitle } : a));
  }, [setAudios]);

  const updateAudioField = useCallback((id: string, field: keyof AudioNode, value: any) => {
    setAudios(prev => prev.map(a => a.id === id ? { ...a, [field]: value } : a));
  }, [setAudios]);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (draggingId && dragStartRef.current) {
      const deltaX = (e.clientX - dragStartRef.current.x) / zoom;
      const deltaY = (e.clientY - dragStartRef.current.y) / zoom;
      onDragSelectionMove?.(deltaX, deltaY);
    } else if (resizingId && resizeStartRef.current) {
      const deltaX = (e.clientX - resizeStartRef.current.x) / zoom;
      setAudios(prev => prev.map(a => {
        if (a.id === resizingId && resizeStartRef.current) {
          return {
            ...a,
            width: Math.max(400, resizeStartRef.current.nodeWidth + deltaX)
          };
        }
        return a;
      }));
    }
  }, [draggingId, resizingId, setAudios, zoom]);

  const handlePointerUp = useCallback(() => {
    if (draggingId) {
      onDragSelectionEnd?.();
    }
    setDraggingId(null);
    dragStartRef.current = null;
    setResizingId(null);
    resizeStartRef.current = null;
  }, [draggingId, onDragSelectionEnd]);

  React.useEffect(() => {
    if (draggingId || resizingId) {
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      return () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
      };
    }
  }, [draggingId, resizingId, handlePointerMove, handlePointerUp]);

  return (
    <div className="absolute inset-0 z-20 pointer-events-none">
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          transformOrigin: '0 0',
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`
        }}
      >
        {audios.map(node => (
          <AudioNodeCard
            key={node.id}
            node={node}
            tool={tool}
            isSelected={selectedIds.includes(node.id)}
            updateAudioTitle={updateAudioTitle}
            updateAudioField={updateAudioField}
            deleteAudioNode={deleteAudioNode}
            setDraggingId={setDraggingId}
            dragStartRef={dragStartRef}
            setResizingId={setResizingId}
            resizeStartRef={resizeStartRef}
            onAnnotate={onAnnotate}
            activeRecordingDuration={activeRecordingDuration}
            isActiveRecordingPaused={isActiveRecordingPaused}
            onPauseRecording={onPauseRecording}
            onResumeRecording={onResumeRecording}
            onStopRecording={onStopRecording}
            onDragSelectionStart={(id) => {
              if (tool === 'home') {
                setSelectedIds?.([id]);
              }
              onDragSelectionStart?.(id);
            }}
          />
        ))}
      </div>
    </div>
  );
}
