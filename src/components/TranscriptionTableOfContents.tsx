"use client";

import React, { useState } from "react";
import { ListCollapse, ChevronDown, ChevronRight, Bookmark, Clock, User } from "lucide-react";

export interface TOCItem {
  id: string;
  title: string;
  level: number;
}

export function slugify(text: string): string {
  return String(text)
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

export function extractMarkdownTOC(markdown: string): TOCItem[] {
  if (!markdown) return [];
  const lines = markdown.split('\n');
  const items: TOCItem[] = [];
  const seenIds = new Map<string, number>();

  for (const line of lines) {
    const match = line.match(/^(#{1,4})\s+(.+)$/);
    if (match) {
      const level = match[1].length;
      const rawTitle = match[2].trim().replace(/[*_`#]/g, '');
      if (!rawTitle) continue;

      let baseId = slugify(rawTitle);
      if (!baseId) baseId = `heading-${items.length}`;

      const count = seenIds.get(baseId) || 0;
      seenIds.set(baseId, count + 1);
      const id = count > 0 ? `${baseId}-${count}` : baseId;

      items.push({ id, title: rawTitle, level });
    }
  }
  return items;
}

export function extractTranscriptTOC(transcript: string): TOCItem[] {
  if (!transcript) return [];
  const lines = transcript.split('\n');
  const items: TOCItem[] = [];
  let lastSpeaker = '';

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    // Matches "[00:00] Speaker 1:" or "Speaker 1:" or "[00:00]" or "Drew:"
    const speakerMatch = trimmed.match(/^(\[?\d{1,2}:\d{2}\]?\s*)?([A-Za-z0-9\s]+?):/);
    const timestampMatch = trimmed.match(/^\[(\d{1,2}:\d{2})\]/);

    if (speakerMatch) {
      const fullSpeaker = speakerMatch[0].replace(/:$/, '').trim();
      const speakerName = speakerMatch[2]?.trim() || fullSpeaker;
      
      // Keep when speaker switches or if first
      if (speakerName !== lastSpeaker || items.length === 0) {
        lastSpeaker = speakerName;
        items.push({
          id: `transcript-line-${idx}`,
          title: fullSpeaker,
          level: 2
        });
      }
    } else if (timestampMatch) {
      items.push({
        id: `transcript-line-${idx}`,
        title: timestampMatch[0],
        level: 2
      });
    }
  });

  return items.slice(0, 30);
}

interface TranscriptionTableOfContentsProps {
  items: TOCItem[];
  containerRef?: React.RefObject<HTMLElement | null>;
  title?: string;
  className?: string;
  defaultExpanded?: boolean;
}

export function TranscriptionTableOfContents({
  items,
  containerRef,
  title = "Table of Contents",
  className = "",
  defaultExpanded = true,
}: TranscriptionTableOfContentsProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  if (!items || items.length === 0) return null;

  const handleScrollTo = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    let targetEl: HTMLElement | null = null;
    if (containerRef?.current) {
      targetEl = containerRef.current.querySelector(`#${id}`) as HTMLElement;
    }
    if (!targetEl) {
      targetEl = document.getElementById(id);
    }

    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });

      // Highlight target temporarily
      targetEl.classList.add('transition-all', 'duration-300', 'ring-2', 'ring-primary-500', 'ring-offset-2', 'dark:ring-offset-zinc-900', 'bg-primary-500/10', 'rounded-lg');
      setTimeout(() => {
        targetEl?.classList.remove('ring-2', 'ring-primary-500', 'ring-offset-2', 'dark:ring-offset-zinc-900', 'bg-primary-500/10');
      }, 1800);
    }
  };

  return (
    <div className={`mb-4 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/50 backdrop-blur-xs overflow-hidden transition-all text-xs ${className}`}>
      {/* Header bar */}
      <button
        type="button"
        onClick={() => setIsExpanded(prev => !prev)}
        className="w-full flex items-center justify-between px-3 py-2 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100/60 dark:hover:bg-zinc-800/60 transition-colors select-none font-semibold text-left"
      >
        <div className="flex items-center gap-2">
          <ListCollapse size={14} className="text-primary-600 dark:text-primary-400" />
          <span>{title}</span>
          <span className="text-[10px] font-normal px-1.5 py-0.2 rounded-full bg-zinc-200/70 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
            {items.length} {items.length === 1 ? 'section' : 'sections'}
          </span>
        </div>
        <div className="text-zinc-400">
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
      </button>

      {/* Collapsible list of items */}
      {isExpanded && (
        <div className="px-3 pb-2.5 pt-1 border-t border-zinc-200/60 dark:border-zinc-800/60 flex flex-wrap gap-1.5 max-h-48 overflow-y-auto custom-scrollbar">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={(e) => handleScrollTo(item.id, e)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/60 hover:border-primary-400 dark:hover:border-primary-500 text-zinc-700 dark:text-zinc-300 hover:text-primary-600 dark:hover:text-primary-400 font-medium transition-all shadow-2xs text-[11px] hover:scale-[1.02] active:scale-[0.98]"
              title={`Jump to ${item.title}`}
            >
              {item.id.startsWith('transcript') ? (
                <User size={10} className="text-primary-500 shrink-0" />
              ) : (
                <Bookmark size={10} className="text-primary-500 shrink-0" />
              )}
              <span className="truncate max-w-[200px]">{item.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
