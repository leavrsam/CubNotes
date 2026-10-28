"use client";

import React, { useState, useMemo } from "react";
import { ListCollapse, ChevronDown, ChevronRight, Bookmark, Clock, User, Hash, MessageSquare } from "lucide-react";

export interface TOCItem {
  id: string;
  title: string;
  level: number;
  type?: 'topic' | 'speaker' | 'heading';
  timestamp?: string;
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

      items.push({ id, title: rawTitle, level, type: 'heading' });
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

    // 1. Topic Headings: "### [01:23] Topic Name" or "### Topic Name" or "## Topic Name"
    const headingMatch = trimmed.match(/^#{2,4}\s+(.+)$/);
    if (headingMatch) {
      const rawHeading = headingMatch[1].trim();
      const tsMatch = rawHeading.match(/\[(\d{1,2}:\d{2})\]/);
      const cleanTitle = rawHeading.replace(/\[\d{1,2}:\d{2}\]/, '').replace(/[*_`#]/g, '').trim();

      if (cleanTitle) {
        items.push({
          id: `transcript-line-${idx}`,
          title: cleanTitle,
          level: 2,
          type: 'topic',
          timestamp: tsMatch ? tsMatch[1] : undefined,
        });
        return;
      }
    }

    // 2. Explicit Topic Markers: "**Topic:** Topic Name" or "Topic: Topic Name"
    const explicitTopicMatch = trimmed.match(/^(\*{0,2}(?:Topic|Subject|Agenda):\*{0,2})\s*(.+)$/i);
    if (explicitTopicMatch) {
      const topicText = explicitTopicMatch[2].replace(/[*_`#]/g, '').trim();
      if (topicText) {
        items.push({
          id: `transcript-line-${idx}`,
          title: topicText,
          level: 2,
          type: 'topic',
        });
        return;
      }
    }

    // 3. Speaker Turns: "[00:00] Speaker 1:" or "Speaker 1:" or "[00:00]" or "Drew:"
    const speakerMatch = trimmed.match(/^(\[?\d{1,2}:\d{2}\]?\s*)?([A-Za-z0-9\s]+?):/);
    const timestampMatch = trimmed.match(/^\[(\d{1,2}:\d{2})\]/);

    if (speakerMatch) {
      const fullSpeaker = speakerMatch[0].replace(/:$/, '').trim();
      const speakerName = speakerMatch[2]?.trim() || fullSpeaker;
      const tsInSpeaker = speakerMatch[1]?.match(/\d{1,2}:\d{2}/);
      
      // Add distinct speaker turn or when speaker switches
      if (speakerName !== lastSpeaker || items.length === 0) {
        lastSpeaker = speakerName;
        items.push({
          id: `transcript-line-${idx}`,
          title: speakerName,
          level: 2,
          type: 'speaker',
          timestamp: tsInSpeaker ? tsInSpeaker[0] : (timestampMatch ? timestampMatch[1] : undefined),
        });
      }
    } else if (timestampMatch && items.length === 0) {
      items.push({
        id: `transcript-line-${idx}`,
        title: timestampMatch[0],
        level: 2,
        type: 'speaker',
        timestamp: timestampMatch[1],
      });
    }
  });

  return items.slice(0, 50);
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

  // Group items by topic vs speaker
  const topicItems = useMemo(() => items.filter(i => i.type === 'topic'), [items]);
  const speakerItems = useMemo(() => items.filter(i => i.type === 'speaker'), [items]);
  const hasBoth = topicItems.length > 0 && speakerItems.length > 0;

  // Default active filter: prefer Topics if available
  const [activeFilter, setActiveFilter] = useState<'topics' | 'speakers' | 'all'>(() => {
    if (topicItems.length > 0) return 'topics';
    if (speakerItems.length > 0) return 'speakers';
    return 'all';
  });

  const displayedItems = useMemo(() => {
    if (!hasBoth) return items;
    if (activeFilter === 'topics') return topicItems;
    if (activeFilter === 'speakers') return speakerItems;
    return items;
  }, [items, hasBoth, activeFilter, topicItems, speakerItems]);

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
      const container = containerRef?.current;
      if (container) {
        // Calculate relative position within the scrollable container
        // to avoid scrolling the parent canvas or entire browser window
        const containerRect = container.getBoundingClientRect();
        const targetRect = targetEl.getBoundingClientRect();
        const relativeTop = targetRect.top - containerRect.top + container.scrollTop;
        
        container.scrollTo({
          top: Math.max(0, relativeTop - 12),
          behavior: 'smooth'
        });
      } else {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      // Temporary pulsing highlight animation
      targetEl.classList.add(
        'transition-all',
        'duration-300',
        'ring-2',
        'ring-primary-500',
        'ring-offset-2',
        'dark:ring-offset-zinc-900',
        'bg-primary-500/10',
        'rounded-lg'
      );
      setTimeout(() => {
        targetEl?.classList.remove(
          'ring-2',
          'ring-primary-500',
          'ring-offset-2',
          'dark:ring-offset-zinc-900',
          'bg-primary-500/10'
        );
      }, 1800);
    }
  };

  return (
    <div className={`mb-4 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/50 backdrop-blur-xs overflow-hidden transition-all text-xs ${className}`}>
      {/* Header bar */}
      <div className="w-full flex items-center justify-between px-3 py-2 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100/60 dark:hover:bg-zinc-800/60 transition-colors select-none">
        <button
          type="button"
          onClick={() => setIsExpanded(prev => !prev)}
          className="flex items-center gap-2 font-semibold text-left flex-1"
        >
          <ListCollapse size={14} className="text-primary-600 dark:text-primary-400 shrink-0" />
          <span className="truncate">{title}</span>
          <span className="text-[10px] font-normal px-1.5 py-0.2 rounded-full bg-zinc-200/70 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
            {displayedItems.length} {displayedItems.length === 1 ? 'item' : 'items'}
          </span>
        </button>

        <div className="flex items-center gap-2">
          {/* Segmented Filter Pills when both topics and speakers exist */}
          {hasBoth && isExpanded && (
            <div className="flex items-center bg-zinc-200/60 dark:bg-zinc-800/80 p-0.5 rounded-lg text-[10px]">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setActiveFilter('topics'); }}
                className={`px-2 py-0.5 rounded-md font-medium transition-colors ${activeFilter === 'topics' ? 'bg-white dark:bg-zinc-700 text-primary-600 dark:text-primary-400 shadow-2xs' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'}`}
              >
                Topics ({topicItems.length})
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setActiveFilter('speakers'); }}
                className={`px-2 py-0.5 rounded-md font-medium transition-colors ${activeFilter === 'speakers' ? 'bg-white dark:bg-zinc-700 text-primary-600 dark:text-primary-400 shadow-2xs' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'}`}
              >
                Speakers ({speakerItems.length})
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setIsExpanded(prev => !prev)}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-0.5"
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        </div>
      </div>

      {/* Collapsible list of items */}
      {isExpanded && (
        <div className="px-3 pb-2.5 pt-1 border-t border-zinc-200/60 dark:border-zinc-800/60 flex flex-wrap gap-1.5 max-h-48 overflow-y-auto custom-scrollbar">
          {displayedItems.map((item) => {
            const isTopic = item.type === 'topic';
            const isSpeaker = item.type === 'speaker';

            return (
              <button
                key={item.id}
                type="button"
                onClick={(e) => handleScrollTo(item.id, e)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-left font-medium transition-all shadow-2xs text-[11px] hover:scale-[1.02] active:scale-[0.98] ${
                  isTopic
                    ? 'bg-primary-50/50 dark:bg-primary-950/20 border-primary-200/80 dark:border-primary-800/50 text-primary-900 dark:text-primary-200 hover:border-primary-400'
                    : 'bg-white dark:bg-zinc-800/80 border-zinc-200 dark:border-zinc-700/60 text-zinc-700 dark:text-zinc-300 hover:border-primary-400 dark:hover:border-primary-500 hover:text-primary-600 dark:hover:text-primary-400'
                }`}
                title={`Jump to ${item.title}`}
              >
                {isTopic ? (
                  <Bookmark size={11} className="text-primary-600 dark:text-primary-400 shrink-0" />
                ) : isSpeaker ? (
                  <User size={11} className="text-zinc-500 shrink-0" />
                ) : (
                  <Hash size={11} className="text-primary-500 shrink-0" />
                )}

                {item.timestamp && (
                  <span className="font-mono text-[9px] px-1 py-0.2 rounded bg-zinc-200/60 dark:bg-zinc-700/60 text-zinc-600 dark:text-zinc-400 shrink-0">
                    {item.timestamp}
                  </span>
                )}

                <span className="truncate max-w-[200px]">{item.title}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
