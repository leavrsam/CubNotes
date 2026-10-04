"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { 
  Search, FileText, Folder, Book, Mic, Square, Plus, 
  Settings, Maximize, PanelLeft, Sparkles, Grid, X, ArrowRight, CornerDownLeft
} from "lucide-react";
import { Notebook, Page, Section } from "@/hooks/useNotebooks";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  notebooks: Notebook[];
  selectedPageId: string | null;
  onSelectPage: (pageId: string) => void;
  onAddPage?: () => void;
  onAddSection?: () => void;
  onAddNotebook?: () => void;
  onToggleMeeting?: () => void;
  isRecording?: boolean;
  onToggleFullscreen?: () => void;
  onToggleSidebar?: () => void;
  onOpenSettings?: () => void;
}

interface PaletteItem {
  id: string;
  type: 'page' | 'action';
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  action: () => void;
  badge?: string;
}

export function CommandPalette({
  isOpen,
  onClose,
  notebooks,
  selectedPageId,
  onSelectPage,
  onAddPage,
  onAddSection,
  onAddNotebook,
  onToggleMeeting,
  isRecording,
  onToggleFullscreen,
  onToggleSidebar,
  onOpenSettings,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus input on open and reset state
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Global keyboard listener for Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Build searchable items
  const items = useMemo(() => {
    const pageItems: PaletteItem[] = [];
    
    // 1. All Pages across Notebooks & Sections
    notebooks.forEach(nb => {
      (nb.sections || []).forEach(sec => {
        (sec.pages || []).forEach(p => {
          pageItems.push({
            id: `page-${p.id}`,
            type: 'page',
            title: p.title || "Untitled Page",
            subtitle: `${nb.title} > ${sec.title}`,
            icon: <FileText size={16} className="text-primary-500" />,
            action: () => {
              onSelectPage(p.id);
              onClose();
            },
            badge: p.is_journal_entry ? (p.date || 'Journal') : undefined,
          });
        });
      });
    });

    // 2. Action Commands
    const actionItems: PaletteItem[] = [
      {
        id: 'action-new-page',
        type: 'action',
        title: 'New Page',
        subtitle: 'Create a new blank note in the current section',
        icon: <Plus size={16} className="text-emerald-500" />,
        action: () => {
          onAddPage?.();
          onClose();
        },
      },
      {
        id: 'action-new-section',
        type: 'action',
        title: 'New Section',
        subtitle: 'Create a new colored section tab',
        icon: <Folder size={16} className="text-amber-500" />,
        action: () => {
          onAddSection?.();
          onClose();
        },
      },
      {
        id: 'action-new-notebook',
        type: 'action',
        title: 'New Notebook',
        subtitle: 'Create a brand new notebook container',
        icon: <Book size={16} className="text-blue-500" />,
        action: () => {
          onAddNotebook?.();
          onClose();
        },
      },
      {
        id: 'action-meeting',
        type: 'action',
        title: isRecording ? 'Stop Meeting Recording' : 'Start Meeting Recording',
        subtitle: isRecording ? 'Stop and generate AI summary and transcription' : 'Record audio with live speech recognition',
        icon: isRecording ? <Square size={16} className="text-red-500 fill-current" /> : <Mic size={16} className="text-red-500" />,
        action: () => {
          onToggleMeeting?.();
          onClose();
        },
        badge: isRecording ? 'Recording Active' : undefined,
      },
      {
        id: 'action-fullscreen',
        type: 'action',
        title: 'Toggle Fullscreen Mode',
        subtitle: 'Maximize canvas view for distraction-free writing',
        icon: <Maximize size={16} className="text-purple-500" />,
        action: () => {
          onToggleFullscreen?.();
          onClose();
        },
      },
      {
        id: 'action-sidebar',
        type: 'action',
        title: 'Toggle Sidebar',
        subtitle: 'Show or hide the notebook sidebar (Cmd+B)',
        icon: <PanelLeft size={16} className="text-zinc-400" />,
        action: () => {
          onToggleSidebar?.();
          onClose();
        },
      },
      {
        id: 'action-settings',
        type: 'action',
        title: 'Settings & Cloud Storage',
        subtitle: 'Configure S3 sync, Gemini API key, and appearance',
        icon: <Settings size={16} className="text-zinc-400" />,
        action: () => {
          onOpenSettings?.();
          onClose();
        },
      },
    ];

    // Filter items based on query
    const q = query.trim().toLowerCase();
    if (!q) {
      return [...actionItems, ...pageItems];
    }

    const filteredPages = pageItems.filter(p => 
      p.title.toLowerCase().includes(q) || (p.subtitle && p.subtitle.toLowerCase().includes(q))
    );
    const filteredActions = actionItems.filter(a => 
      a.title.toLowerCase().includes(q) || (a.subtitle && a.subtitle.toLowerCase().includes(q))
    );

    return [...filteredActions, ...filteredPages];
  }, [notebooks, query, isRecording, onSelectPage, onAddPage, onAddSection, onAddNotebook, onToggleMeeting, onToggleFullscreen, onToggleSidebar, onOpenSettings, onClose]);

  // Ensure selectedIndex is within range
  useEffect(() => {
    setSelectedIndex(0);
  }, [items.length, query]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % Math.max(1, items.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + items.length) % Math.max(1, items.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (items[selectedIndex]) {
        items[selectedIndex].action();
      }
    }
  };

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const activeEl = listRef.current.children[selectedIndex] as HTMLElement;
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-start justify-center pt-24 sm:pt-32 px-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-xl bg-zinc-900 border border-zinc-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-zinc-100 animate-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-zinc-800 gap-3 bg-zinc-900/90">
          <Search size={18} className="text-zinc-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search pages or type a command... (e.g. 'Meeting', 'New Page')"
            className="flex-1 bg-transparent border-none outline-none text-base text-zinc-100 placeholder:text-zinc-500"
          />
          <kbd className="hidden sm:inline-flex items-center gap-0.5 px-2 py-0.5 text-[11px] font-mono text-zinc-400 bg-zinc-800 border border-zinc-700 rounded">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div 
          ref={listRef}
          className="max-h-80 overflow-y-auto p-2 space-y-1 divide-y divide-zinc-800/40"
        >
          {items.length === 0 ? (
            <div className="py-12 text-center text-sm text-zinc-500">
              No pages or actions matching &ldquo;{query}&rdquo;
            </div>
          ) : (
            items.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={item.action}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-colors ${
                    isSelected 
                      ? 'bg-primary-600/20 text-white border border-primary-500/30' 
                      : 'hover:bg-zinc-800/60 text-zinc-200 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`p-2 rounded-lg ${isSelected ? 'bg-primary-500/20 text-primary-400' : 'bg-zinc-800 text-zinc-400'}`}>
                      {item.icon}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="font-medium text-sm truncate">{item.title}</span>
                      {item.subtitle && (
                        <span className="text-xs text-zinc-400 truncate">{item.subtitle}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {item.badge && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700 font-medium">
                        {item.badge}
                      </span>
                    )}
                    {isSelected && (
                      <CornerDownLeft size={14} className="text-primary-400" />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Bottom Helper Bar */}
        <div className="px-4 py-2 bg-zinc-950/80 border-t border-zinc-800 flex items-center justify-between text-[11px] text-zinc-500 font-sans">
          <div className="flex items-center gap-3">
            <span><kbd className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded font-mono">↑</kbd> <kbd className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded font-mono">↓</kbd> Navigate</span>
            <span><kbd className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded font-mono">↵</kbd> Select</span>
          </div>
          <span>CubNotes Quick Switcher</span>
        </div>
      </div>
    </div>
  );
}
