"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  Sparkles, X, Send, Bot, User, Book, Folder, FileText, 
  ArrowRight, Copy, Check, RefreshCw, MessageSquare, Compass,
  ChevronDown, Flame
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import toast from "react-hot-toast";
import { Notebook } from "@/hooks/useNotebooks";

export interface AskAISource {
  pageId: string;
  pageTitle: string;
  notebookTitle: string;
  sectionTitle: string;
  snippet?: string;
}

export interface AskAIMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources?: AskAISource[];
  timestamp: number;
}

interface AskAIModalProps {
  isOpen: boolean;
  onClose: () => void;
  notebooks: Notebook[];
  onSelectPage: (pageId: string) => void;
  initialQuery?: string;
}

const PRESET_QUERIES = [
  "Where are my notes on osteoporosis?",
  "What has been the main topic of all the meetings in the Jellyfish notebook?",
  "What are all action items across my recent meetings?",
  "Summarize key decisions made this month",
];

export function AskAIModal({
  isOpen,
  onClose,
  notebooks,
  onSelectPage,
  initialQuery = "",
}: AskAIModalProps) {
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<AskAIMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedNotebookId, setSelectedNotebookId] = useState<string>("all");
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-focus input on open and handle initialQuery
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 60);
      if (initialQuery && initialQuery.trim()) {
        setQuery(initialQuery);
        // Automatically ask if not asked yet
        handleAsk(initialQuery);
      }
    }
  }, [isOpen]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Global Escape key listener
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const handleAsk = async (textToSubmit?: string) => {
    const q = (textToSubmit || query).trim();
    if (!q || isLoading) return;

    const userMessage: AskAIMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text: q,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setQuery("");
    setIsLoading(true);

    // Format chat history
    const historyPayload = messages.map((m) => ({
      role: m.role,
      text: m.text,
    }));

    try {
      const res = await fetch("/api/ask-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          history: historyPayload,
          notebookFilter: selectedNotebookId === "all" ? null : selectedNotebookId,
          clientNotebooks: notebooks,
        }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to get AI response.");
      }

      const assistantMessage: AskAIMessage = {
        id: `ai-${Date.now()}`,
        role: "assistant",
        text: data.answer || "I could not find an answer in your notes.",
        sources: data.sources || [],
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: any) {
      console.error("Ask AI error:", err);
      toast.error(err.message || "Failed to reach Ask AI");
      setMessages((prev) => [
        ...prev,
        {
          id: `ai-err-${Date.now()}`,
          role: "assistant",
          text: `**Error**: ${err.message || "Could not analyze notes. Please check your internet connection or Gemini API key in Settings."}`,
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMessageId(id);
    toast.success("Answer copied to clipboard!", { id: "copy-answer", duration: 1500 });
    setTimeout(() => setCopiedMessageId(null), 2000);
  };

  const handleSourceClick = (pageId: string) => {
    onSelectPage(pageId);
    onClose();
    toast.success("Opened referenced note", { id: "opened-note", duration: 1500 });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-2xl h-[88vh] max-h-[780px] bg-zinc-900 border border-zinc-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-zinc-100 animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ask-ai-title"
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-zinc-800 bg-zinc-950/60 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-primary-600 via-indigo-500 to-purple-500 p-0.5 flex items-center justify-center shadow-md shadow-primary-900/30">
              <div className="w-full h-full bg-zinc-950 rounded-[10px] flex items-center justify-center">
                <Sparkles size={18} className="text-primary-400 animate-pulse" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="ask-ai-title" className="text-sm sm:text-base font-bold text-white tracking-tight">
                  Ask Motif AI
                </h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary-500/20 text-primary-300 font-semibold border border-primary-500/30">
                  Workspace AI
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">
                Ask questions across all notes, meetings, and transcripts
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Notebook scope selector */}
            <div className="relative">
              <select
                value={selectedNotebookId}
                onChange={(e) => setSelectedNotebookId(e.target.value)}
                className="appearance-none bg-zinc-800 hover:bg-zinc-750 text-zinc-200 border border-zinc-700/80 rounded-xl px-2.5 py-1.5 pr-7 text-xs font-medium outline-none cursor-pointer max-w-[150px] sm:max-w-[200px] truncate"
                title="Filter by notebook"
              >
                <option value="all">All Notebooks</option>
                {notebooks.map((nb) => (
                  <option key={nb.id} value={nb.id}>
                    {nb.is_journal ? "[Journal] " : ""}{nb.title || "Untitled"}
                  </option>
                ))}
              </select>
              <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
            </div>

            <button
              type="button"
              onClick={onClose}
              className="text-zinc-400 hover:text-white p-1.5 rounded-xl hover:bg-zinc-800 transition-colors"
              title="Close (Esc)"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Messages Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 select-text">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-4">
              <div className="w-14 h-14 rounded-2xl bg-zinc-800/80 border border-zinc-700/70 flex items-center justify-center mb-4 text-primary-400 shadow-inner">
                <Compass size={28} />
              </div>
              <h3 className="text-base font-semibold text-white mb-1.5">
                What would you like to know?
              </h3>
              <p className="text-xs text-zinc-400 max-w-md mb-6 leading-relaxed">
                Motif AI synthesizes information across all your notes, voice recordings, and meeting transcripts. Try asking:
              </p>

              {/* Preset Chips */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg text-left">
                {PRESET_QUERIES.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleAsk(preset)}
                    className="p-3 rounded-xl bg-zinc-950/60 hover:bg-zinc-800/80 border border-zinc-800 hover:border-zinc-700 text-xs text-zinc-300 hover:text-white transition-all text-left flex items-start gap-2.5 group active:scale-[0.98]"
                  >
                    <Sparkles size={14} className="text-primary-400 mt-0.5 shrink-0 group-hover:scale-110 transition-transform" />
                    <span className="leading-snug">{preset}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col gap-2 ${
                    msg.role === "user" ? "items-end" : "items-start"
                  }`}
                >
                  {/* Message bubble */}
                  <div
                    className={`max-w-[90%] sm:max-w-[85%] rounded-2xl p-4 text-xs sm:text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-primary-600 text-white shadow-md shadow-primary-900/20"
                        : "bg-zinc-950/80 border border-zinc-800 text-zinc-200 shadow-lg"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      <div className="prose prose-invert prose-xs sm:prose-sm max-w-none space-y-2">
                        <ReactMarkdown>{msg.text}</ReactMarkdown>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.text}</p>
                    )}
                  </div>

                  {/* Sources / Referenced Notes Cards */}
                  {msg.role === "assistant" && msg.sources && msg.sources.length > 0 && (
                    <div className="w-full max-w-[90%] sm:max-w-[85%] mt-1 flex flex-col gap-1.5">
                      <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5 px-1">
                        <Book size={13} className="text-primary-400" />
                        <span>Referenced Notes & Meetings ({msg.sources.length}):</span>
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {msg.sources.map((src, sIdx) => (
                          <button
                            key={sIdx}
                            type="button"
                            onClick={() => handleSourceClick(src.pageId)}
                            className="p-2.5 rounded-xl bg-zinc-950/50 hover:bg-zinc-800/80 border border-zinc-800 hover:border-primary-500/50 text-left transition-all group flex flex-col justify-between gap-1.5"
                            title={`Jump to "${src.pageTitle}"`}
                          >
                            <div className="flex items-start justify-between gap-2 w-full">
                              <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 font-medium truncate">
                                <Folder size={11} className="text-amber-400 shrink-0" />
                                <span className="truncate">{src.notebookTitle}</span>
                                <span>&gt;</span>
                                <span className="truncate">{src.sectionTitle}</span>
                              </div>
                              <ArrowRight size={13} className="text-zinc-500 group-hover:text-primary-400 group-hover:translate-x-0.5 transition-all shrink-0 mt-0.5" />
                            </div>

                            <p className="text-xs font-semibold text-zinc-100 group-hover:text-primary-300 truncate">
                              {src.pageTitle || "Untitled Note"}
                            </p>

                            {src.snippet && (
                              <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed italic">
                                "{src.snippet}"
                              </p>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Assistant Message Actions */}
                  {msg.role === "assistant" && (
                    <div className="flex items-center gap-2 px-1 text-[11px] text-zinc-400">
                      <button
                        type="button"
                        onClick={() => handleCopy(msg.id, msg.text)}
                        className="hover:text-white flex items-center gap-1 p-1 rounded hover:bg-zinc-800 transition-colors"
                        title="Copy answer"
                      >
                        {copiedMessageId === msg.id ? (
                          <>
                            <Check size={12} className="text-emerald-400" />
                            <span className="text-emerald-400">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy size={12} />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {/* Loading Indicator */}
              {isLoading && (
                <div className="flex items-start gap-3 p-4 rounded-2xl bg-zinc-950/60 border border-zinc-800 max-w-[85%] text-zinc-300 animate-in fade-in">
                  <RefreshCw size={16} className="text-primary-400 animate-spin mt-0.5 shrink-0" />
                  <div className="flex flex-col gap-1">
                    <p className="text-xs font-semibold text-primary-300">
                      Searching notes, meetings, and transcripts...
                    </p>
                    <p className="text-[11px] text-zinc-400">
                      Scanning through all notebooks and synthesizing exact answer...
                    </p>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input Bar */}
        <div className="p-3 sm:p-4 border-t border-zinc-800 bg-zinc-950/80 shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAsk();
            }}
            className="flex items-end gap-2 bg-zinc-900 border border-zinc-700/80 rounded-2xl p-2 focus-within:ring-2 focus-within:ring-primary-500/50 transition-all shadow-inner"
          >
            <textarea
              ref={inputRef}
              rows={1}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleAsk();
                }
              }}
              placeholder="Ask anything about your notes or meetings... (Enter to send)"
              className="flex-1 bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 border-none outline-none resize-none max-h-32 min-h-[36px] py-1.5 px-2 leading-relaxed"
            />

            <button
              type="submit"
              disabled={isLoading || !query.trim()}
              className="w-9 h-9 rounded-xl bg-primary-600 hover:bg-primary-500 disabled:opacity-40 text-white flex items-center justify-center shrink-0 transition-all active:scale-95 shadow-md shadow-primary-900/30"
              title="Send question"
            >
              {isLoading ? (
                <RefreshCw size={16} className="animate-spin" />
              ) : (
                <Send size={16} />
              )}
            </button>
          </form>

          <div className="flex items-center justify-between mt-2 px-1 text-[11px] text-zinc-500">
            <span>Powered by Gemini 3.8 Flash</span>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={() => setMessages([])}
                className="hover:text-zinc-300 underline"
              >
                Clear conversation
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
