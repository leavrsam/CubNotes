"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Sparkles, X, ArrowUp, BookOpen, ChevronRight, Copy, Check,
  ChevronDown, RotateCcw, Loader2,
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

const GENERIC_SUGGESTIONS = [
  "What action items came out of my recent meetings?",
  "Summarize what I worked on this week",
  "What key decisions have I made this month?",
  "What follow-ups am I forgetting?",
];

const isUsableTitle = (t?: string | null) => {
  const title = (t || "").trim();
  return title.length > 0 && !/^untitled/i.test(title);
};

const shorten = (t: string, max = 40) => (t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t);

/**
 * Build suggestions from the user's own notebooks and pages, padded with
 * generic prompts so new users still get useful ideas.
 */
function buildSuggestions(notebooks: Notebook[], selectedNotebookId: string): string[] {
  const live = notebooks.filter((nb) => !nb.deleted_at);
  const scoped = selectedNotebookId === "all" ? live : live.filter((nb) => nb.id === selectedNotebookId);

  const pagesOf = (nb: Notebook) =>
    (nb.sections || []).filter((s) => !s.deleted_at).flatMap((s) => (s.pages || []).filter((p) => !p.deleted_at));

  const personal: string[] = [];

  // Most recent note with a real title
  const latestPage = scoped
    .flatMap(pagesOf)
    .filter((p) => isUsableTitle(p.title))
    .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))[0];
  if (latestPage) personal.push(`Summarize my note "${shorten(latestPage.title.trim())}"`);

  // Busiest (non-journal) notebook
  const topNotebook = scoped
    .filter((nb) => !nb.is_journal && isUsableTitle(nb.title))
    .map((nb) => ({ nb, count: pagesOf(nb).length }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count)[0]?.nb;
  if (topNotebook) personal.push(`What are the main topics in ${shorten(topNotebook.title.trim(), 30)}?`);

  const suggestions = [...personal];
  for (const g of GENERIC_SUGGESTIONS) {
    if (suggestions.length >= 4) break;
    suggestions.push(g);
  }
  return suggestions;
}

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
      // Only auto-focus with a mouse/trackpad. On phones this would pop the
      // keyboard immediately and squash the panel before the user reads it.
      const hasFinePointer = typeof window !== "undefined" && window.matchMedia?.("(pointer: fine)").matches;
      if (hasFinePointer) setTimeout(() => inputRef.current?.focus(), 60);
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

  // Grow the input with its content (up to a few lines)
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [query]);

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
          text: `**Error**: ${err.message || "Could not analyze notes. Please check your internet connection and try again."}`,
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

  const suggestions = useMemo(
    () => buildSuggestions(notebooks, selectedNotebookId),
    [notebooks, selectedNotebookId]
  );

  if (!isOpen) return null;

  const scopeLabel =
    selectedNotebookId === "all"
      ? "All notebooks"
      : notebooks.find((nb) => nb.id === selectedNotebookId)?.title || "Untitled";

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center sm:p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative w-full sm:max-w-2xl h-[100dvh] sm:h-[85vh] sm:max-h-[760px] bg-zinc-950 sm:bg-zinc-900 sm:border sm:border-zinc-800 sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden text-zinc-100 animate-in fade-in sm:zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ask-ai-title"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        {/* Header */}
        <div className="h-14 px-4 sm:px-5 border-b border-zinc-800/80 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-primary-500/15 ring-1 ring-primary-500/30 flex items-center justify-center shrink-0">
              <Sparkles size={16} className="text-primary-400" />
            </div>
            <h2 id="ask-ai-title" className="text-[15px] font-semibold text-white tracking-tight truncate">
              Ask Motif AI
            </h2>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {messages.length > 0 && (
              <button
                type="button"
                onClick={() => setMessages([])}
                className="w-9 h-9 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                title="New conversation"
                aria-label="New conversation"
              >
                <RotateCcw size={17} />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              title="Close (Esc)"
              aria-label="Close"
            >
              <X size={19} />
            </button>
          </div>
        </div>

        {/* Messages Body */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain select-text">
          {messages.length === 0 ? (
            <div className="min-h-full flex flex-col justify-center px-5 py-8 sm:px-8">
              <div className="w-full max-w-lg mx-auto">
                <h3 className="text-xl font-semibold text-white tracking-tight">
                  What would you like to know?
                </h3>
                <p className="mt-1.5 text-sm text-zinc-400 leading-relaxed">
                  Get answers from your notes, recordings, and meeting transcripts.
                </p>

                <p className="mt-7 mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  Suggestions
                </p>
                <div className="flex flex-col divide-y divide-zinc-800/80 rounded-xl border border-zinc-800 bg-zinc-900/60 overflow-hidden">
                  {suggestions.map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleAsk(preset)}
                      className="flex items-center gap-3 px-4 py-3 text-left text-sm text-zinc-300 hover:text-white hover:bg-zinc-800/70 active:bg-zinc-800 transition-colors group"
                    >
                      <span className="flex-1 leading-snug">{preset}</span>
                      <ChevronRight size={16} className="text-zinc-600 group-hover:text-zinc-400 shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="px-4 py-5 sm:px-6 space-y-6">
              {messages.map((msg) =>
                msg.role === "user" ? (
                  <div key={msg.id} className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-br-md bg-zinc-800 px-4 py-2.5 text-sm leading-relaxed text-zinc-100">
                      <p className="whitespace-pre-wrap">{msg.text}</p>
                    </div>
                  </div>
                ) : (
                  <div key={msg.id} className="flex gap-3">
                    <div className="w-7 h-7 rounded-lg bg-primary-500/15 ring-1 ring-primary-500/30 flex items-center justify-center shrink-0 mt-0.5">
                      <Sparkles size={14} className="text-primary-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="prose prose-invert prose-sm max-w-none text-zinc-200 prose-p:leading-relaxed prose-li:my-0.5 prose-headings:text-white prose-strong:text-white">
                        <ReactMarkdown>{msg.text}</ReactMarkdown>
                      </div>

                      {/* Sources */}
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="mt-4">
                          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                            <BookOpen size={12} />
                            Sources
                          </p>
                          <div className="flex flex-col gap-1.5">
                            {msg.sources.map((src, sIdx) => (
                              <button
                                key={sIdx}
                                type="button"
                                onClick={() => handleSourceClick(src.pageId)}
                                className="w-full flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800/70 hover:border-zinc-700 px-3 py-2.5 text-left transition-colors group"
                                title={`Open "${src.pageTitle}"`}
                              >
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-zinc-100 truncate">
                                    {src.pageTitle || "Untitled Note"}
                                  </p>
                                  <p className="mt-0.5 text-xs text-zinc-500 truncate">
                                    {[src.notebookTitle, src.sectionTitle].filter(Boolean).join(" · ")}
                                  </p>
                                </div>
                                <ChevronRight size={16} className="text-zinc-600 group-hover:text-zinc-400 shrink-0" />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="mt-2 -ml-1.5">
                        <button
                          type="button"
                          onClick={() => handleCopy(msg.id, msg.text)}
                          className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
                          title="Copy answer"
                        >
                          {copiedMessageId === msg.id ? (
                            <>
                              <Check size={13} className="text-emerald-400" />
                              <span className="text-emerald-400">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy size={13} />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )
              )}

              {/* Loading Indicator */}
              {isLoading && (
                <div className="flex gap-3 animate-in fade-in">
                  <div className="w-7 h-7 rounded-lg bg-primary-500/15 ring-1 ring-primary-500/30 flex items-center justify-center shrink-0">
                    <Loader2 size={14} className="text-primary-400 animate-spin" />
                  </div>
                  <p className="text-sm text-zinc-400 pt-1">Searching your notes…</p>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div
          className="px-3 pt-3 sm:px-4 border-t border-zinc-800/80 shrink-0"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAsk();
            }}
            className="rounded-2xl border border-zinc-700/80 bg-zinc-900 focus-within:border-primary-500/60 transition-colors"
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
              placeholder="Ask about your notes…"
              enterKeyHint="send"
              className="block w-full bg-transparent text-[15px] text-zinc-100 placeholder:text-zinc-500 border-none outline-none resize-none max-h-32 px-4 pt-3 pb-1 leading-relaxed"
            />

            <div className="flex items-center justify-between gap-2 px-2 pb-2">
              {/* Notebook scope */}
              <div className="relative min-w-0">
                <select
                  value={selectedNotebookId}
                  onChange={(e) => setSelectedNotebookId(e.target.value)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  title="Choose which notebooks to search"
                  aria-label="Notebooks to search"
                >
                  <option value="all">All notebooks</option>
                  {notebooks.map((nb) => (
                    <option key={nb.id} value={nb.id}>
                      {nb.is_journal ? "[Journal] " : ""}{nb.title || "Untitled"}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-zinc-400">
                  <BookOpen size={13} className="shrink-0" />
                  <span className="truncate max-w-[180px]">{scopeLabel}</span>
                  <ChevronDown size={13} className="shrink-0" />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading || !query.trim()}
                className="w-8 h-8 rounded-full bg-primary-500 hover:bg-primary-400 disabled:bg-zinc-800 disabled:text-zinc-500 text-white flex items-center justify-center shrink-0 transition-colors active:scale-95"
                title="Send"
                aria-label="Send"
              >
                {isLoading ? <Loader2 size={16} className="animate-spin" /> : <ArrowUp size={17} strokeWidth={2.25} />}
              </button>
            </div>
          </form>

          <p className="mt-2 text-center text-[11px] text-zinc-600">
            Answers can be wrong, so check the sources.
          </p>
        </div>
      </div>
    </div>
  );
}
