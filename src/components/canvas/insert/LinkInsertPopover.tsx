"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { Link2, Globe, FileText, Search, ExternalLink, Check, X } from "lucide-react";

export interface NotebookPageItem {
  id: string;
  title: string;
  notebookTitle?: string;
  updatedAt?: string;
}

interface LinkInsertPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  availablePages?: NotebookPageItem[];
  hasSelectedText?: boolean;
  onInsertWebLink: (url: string, displayText: string) => void;
  onInsertPageLink: (pageId: string, pageTitle: string) => void;
}

export function LinkInsertPopover({
  isOpen,
  onClose,
  availablePages = [],
  hasSelectedText = false,
  onInsertWebLink,
  onInsertPageLink,
}: LinkInsertPopoverProps) {
  const [activeTab, setActiveTab] = useState<'web' | 'page'>('web');
  const [url, setUrl] = useState<string>("");
  const [displayText, setDisplayText] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Focus input on open
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);

    const handlePointerDownOutside = (e: MouseEvent | TouchEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("mousedown", handlePointerDownOutside);
    window.addEventListener("touchstart", handlePointerDownOutside);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDownOutside);
      window.removeEventListener("touchstart", handlePointerDownOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  const filteredPages = useMemo(() => {
    if (!searchQuery.trim()) return availablePages.slice(0, 15);
    const q = searchQuery.toLowerCase();
    return availablePages
      .filter((p) => p.title.toLowerCase().includes(q) || (p.notebookTitle && p.notebookTitle.toLowerCase().includes(q)))
      .slice(0, 15);
  }, [availablePages, searchQuery]);

  const handleWebSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let finalUrl = url.trim();
    if (!finalUrl) return;
    if (!/^https?:\/\//i.test(finalUrl) && !finalUrl.startsWith('/')) {
      finalUrl = 'https://' + finalUrl;
    }
    onInsertWebLink(finalUrl, displayText.trim() || finalUrl);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      ref={popoverRef}
      className="absolute top-[52px] left-28 z-50 w-80 bg-white dark:bg-zinc-900 rounded-xl shadow-2xl border border-zinc-200 dark:border-zinc-800 p-3 select-none animate-in fade-in zoom-in-95 duration-100"
      style={{ filter: "drop-shadow(0 12px 24px rgba(0,0,0,0.18))" }}
    >
      {/* Tabs */}
      <div className="flex items-center gap-1 p-0.5 bg-zinc-100 dark:bg-zinc-850 rounded-lg mb-3">
        <button
          type="button"
          onClick={() => setActiveTab('web')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1 text-xs font-semibold rounded-md transition-colors ${
            activeTab === 'web'
              ? 'bg-white dark:bg-zinc-750 text-zinc-900 dark:text-zinc-100 shadow-2xs'
              : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
          }`}
        >
          <Globe size={13} />
          <span>Web Link</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('page')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1 text-xs font-semibold rounded-md transition-colors ${
            activeTab === 'page'
              ? 'bg-white dark:bg-zinc-750 text-zinc-900 dark:text-zinc-100 shadow-2xs'
              : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
          }`}
        >
          <FileText size={13} />
          <span>Note Link</span>
          {availablePages.length > 0 && (
            <span className="text-[10px] px-1 py-0.2 rounded-full bg-zinc-200 dark:bg-zinc-700 font-bold text-zinc-600 dark:text-zinc-400">
              {availablePages.length}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'web' ? (
        <form onSubmit={handleWebSubmit} className="space-y-2.5">
          <div>
            <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 dark:text-zinc-500 block mb-1">
              Destination URL
            </label>
            <input
              ref={inputRef}
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              className="w-full text-xs px-2.5 py-1.5 bg-white dark:bg-zinc-850 rounded-md border border-zinc-200 dark:border-zinc-750 text-zinc-800 dark:text-zinc-200 focus:outline-hidden focus:ring-1 focus:ring-primary-500"
            />
          </div>

          <div>
            <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 dark:text-zinc-500 block mb-1">
              Display Text {hasSelectedText && "(optional)"}
            </label>
            <input
              type="text"
              value={displayText}
              onChange={(e) => setDisplayText(e.target.value)}
              placeholder={hasSelectedText ? "Uses highlighted text" : "e.g. My Website Link"}
              className="w-full text-xs px-2.5 py-1.5 bg-white dark:bg-zinc-850 rounded-md border border-zinc-200 dark:border-zinc-750 text-zinc-800 dark:text-zinc-200 focus:outline-hidden focus:ring-1 focus:ring-primary-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-1 border-t border-zinc-100 dark:border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-2.5 py-1.5 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!url.trim()}
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-primary-600 hover:bg-primary-500 text-white rounded-lg font-semibold shadow-xs transition-colors disabled:opacity-40"
            >
              <Check size={13} strokeWidth={2.5} />
              <span>Insert Link</span>
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-2">
          {/* Note Search Input */}
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-2 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search notebook notes..."
              className="w-full text-xs pl-8 pr-2.5 py-1.5 bg-white dark:bg-zinc-850 rounded-md border border-zinc-200 dark:border-zinc-750 text-zinc-800 dark:text-zinc-200 focus:outline-hidden focus:ring-1 focus:ring-primary-500"
            />
          </div>

          {/* List of Notes */}
          <div className="max-h-52 overflow-y-auto no-scrollbar space-y-1 pt-1">
            {filteredPages.length > 0 ? (
              filteredPages.map((page) => (
                <button
                  key={page.id}
                  type="button"
                  onClick={() => {
                    onInsertPageLink(page.id, page.title || "Untitled Note");
                    onClose();
                  }}
                  className="w-full flex items-center justify-between p-2 rounded-lg text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors group"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText size={14} className="text-zinc-400 group-hover:text-primary-500 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate group-hover:text-primary-600 dark:group-hover:text-primary-400">
                        {page.title || "Untitled Note"}
                      </div>
                      {page.notebookTitle && (
                        <div className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate">
                          {page.notebookTitle}
                        </div>
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] text-primary-500 font-semibold opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    Insert
                  </span>
                </button>
              ))
            ) : (
              <div className="py-6 text-center text-xs text-zinc-400">
                No matching notes found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
