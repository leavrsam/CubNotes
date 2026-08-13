"use client";

import React, { useCallback, useRef, useState } from "react";
import type { AudioNode, ToolType } from "./CustomCanvas";
import { Trash2, GripVertical, Sparkles, Send, Bot, User, Edit3, MessageSquare, AlignLeft, FileText } from "lucide-react";
import ReactMarkdown from 'react-markdown';
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
  onAnnotate
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
}) {
  const [activeTab, setActiveTab] = useState<TabType>('summary');
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isChatting, setIsChatting] = useState(false);
  const [chatInput, setChatInput] = useState("");

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
              className="flex gap-[1px] text-[10px] text-zinc-500 dark:text-zinc-400 items-center justify-center h-full hover:text-indigo-500 transition-colors pointer-events-auto"
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
        
        {/* Header / Audio Player */}
        <div className="bg-white/95 dark:bg-zinc-900/95 pt-5 pb-3 px-5 border-b border-zinc-200/50 dark:border-zinc-700/50 flex-shrink-0">
          <div className="flex justify-between items-center mb-3">
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
          
          <audio controls className={`w-full outline-none h-10`}>
            <source src={node.url} type="audio/webm" />
            Your browser does not support the audio element.
          </audio>
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
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${msg.role === 'user' ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400' : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300'}`}>
                      {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                    </div>
                    <div className={`p-3 rounded-2xl max-w-[85%] text-sm ${msg.role === 'user' ? 'bg-indigo-500 text-white rounded-tr-sm' : 'bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-200/50 dark:border-zinc-700/50 rounded-tl-sm'}`}>
                      {msg.role === 'user' ? msg.text : <ReactMarkdown className="prose prose-sm dark:prose-invert prose-p:my-1 max-w-none">{msg.text}</ReactMarkdown>}
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
                    className="flex-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-full px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                  <button 
                    type="submit"
                    disabled={!chatInput.trim() || isChatting || !node.transcript}
                    className="w-9 h-9 flex items-center justify-center bg-indigo-500 hover:bg-indigo-600 text-white rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
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
  onDragSelectionStart, onDragSelectionMove, onDragSelectionEnd
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
