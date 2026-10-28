"use client";

import React, { useState, useEffect, useMemo } from "react";
import { 
  Hash, 
  Search, 
  Filter, 
  ArrowLeft, 
  X, 
  FileText, 
  Type, 
  Mic, 
  MapPin, 
  ChevronRight, 
  Layers, 
  ExternalLink, 
  Sparkles, 
  Clock, 
  Check, 
  Palette, 
  SlidersHorizontal,
  ArrowUpDown,
  PanelLeftClose,
  PanelLeft
} from "lucide-react";
import { Notebook, Page } from "@/hooks/useNotebooks";
import { getCachedPageState } from "@/lib/offlineStore";
import { 
  TaggedItem, 
  TagDefinition, 
  normalizeTagId, 
  formatTagName, 
  getTagColor, 
  extractInlineHashtags, 
  loadTagRegistry, 
  saveTagDefinition, 
  TAG_PALETTE 
} from "@/lib/tags";

interface TagHubViewProps {
  notebooks: Notebook[];
  onSelectPage: (pageId: string) => void;
  onJumpToCoordinates?: (pageId: string, x: number, y: number) => void;
  onClose: () => void;
  onOpenMindMap?: () => void;
  onToggleSidebar?: () => void;
  isSidebarOpen?: boolean;
}

export function TagHubView({
  notebooks,
  onSelectPage,
  onJumpToCoordinates,
  onClose,
  onOpenMindMap,
  onToggleSidebar,
  isSidebarOpen
}: TagHubViewProps) {
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [filterMode, setFilterMode] = useState<'AND' | 'OR'>('OR');
  const [multiOnly, setMultiOnly] = useState(false);
  const [typeFilter, setTypeFilter] = useState<'all' | 'page' | 'text' | 'audio' | 'pin'>('all');
  const [sortOption, setSortOption] = useState<'recent' | 'title' | 'tag_count'>('recent');
  const [searchQuery, setSearchQuery] = useState("");
  
  const [registry, setRegistry] = useState<Record<string, TagDefinition>>(loadTagRegistry());
  const [editingTag, setEditingTag] = useState<string | null>(null);

  // Indexed items state
  const [indexedItems, setIndexedItems] = useState<TaggedItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Scan notebooks & cached document states
  useEffect(() => {
    let isMounted = true;

    async function indexAllWorkspaceTags() {
      setIsLoading(true);
      const items: TaggedItem[] = [];

      for (const nb of notebooks) {
        for (const sec of nb.sections || []) {
          for (const page of sec.pages || []) {
            try {
              const state: any = await getCachedPageState(page.id);
              const pageTags: string[] = Array.isArray(state?.pageTags) ? state.pageTags : [];
              
              // 1. Page-level item (if page itself has tags)
              if (pageTags.length > 0) {
                items.push({
                  id: `page-${page.id}`,
                  type: 'page',
                  pageId: page.id,
                  pageTitle: page.title || 'Untitled Note',
                  notebookId: nb.id,
                  notebookTitle: nb.title,
                  sectionId: sec.id,
                  sectionTitle: sec.title,
                  tags: Array.from(new Set(pageTags.map(normalizeTagId))),
                  textPreview: `Entire Note: ${page.title || 'Untitled Note'}`,
                  createdAt: page.created_at
                });
              }

              // 2. Text Boxes
              if (Array.isArray(state?.texts)) {
                for (const textNode of state.texts) {
                  const inline = extractInlineHashtags(textNode.content || '');
                  const explicit = Array.isArray(textNode.tags) ? textNode.tags : [];
                  const combined = Array.from(new Set([...explicit, ...inline].map(normalizeTagId)));
                  
                  if (combined.length > 0) {
                    const cleanSnippet = (textNode.content || '')
                      .replace(/<[^>]+>/g, ' ')
                      .replace(/\s+/g, ' ')
                      .trim();
                    items.push({
                      id: `text-${textNode.id}`,
                      type: 'text',
                      pageId: page.id,
                      pageTitle: page.title || 'Untitled Note',
                      notebookId: nb.id,
                      notebookTitle: nb.title,
                      sectionId: sec.id,
                      sectionTitle: sec.title,
                      tags: combined,
                      textPreview: cleanSnippet.slice(0, 160) || 'Text block',
                      x: textNode.x,
                      y: textNode.y,
                      createdAt: page.created_at
                    });
                  }
                }
              }

              // 3. Audio & Meeting Cards
              if (Array.isArray(state?.audios)) {
                for (const audioNode of state.audios) {
                  const explicit = Array.isArray(audioNode.tags) ? audioNode.tags : [];
                  // Also check summary or notes for inline tags
                  const inlineNotes = extractInlineHashtags(audioNode.notes || '');
                  const combined = Array.from(new Set([...explicit, ...inlineNotes].map(normalizeTagId)));
                  
                  if (combined.length > 0) {
                    items.push({
                      id: `audio-${audioNode.id}`,
                      type: 'audio',
                      pageId: page.id,
                      pageTitle: page.title || 'Untitled Note',
                      notebookId: nb.id,
                      notebookTitle: nb.title,
                      sectionId: sec.id,
                      sectionTitle: sec.title,
                      tags: combined,
                      textPreview: audioNode.title || (audioNode.summary ? audioNode.summary.slice(0, 140) : 'Meeting Audio Recording'),
                      x: audioNode.x,
                      y: audioNode.y,
                      createdAt: audioNode.audioCreatedAt || page.created_at
                    });
                  }
                }
              }

              // 4. Canvas Tag Pins
              if (Array.isArray(state?.tagPins)) {
                for (const pin of state.tagPins) {
                  const pinTags = Array.isArray(pin.tags) ? pin.tags.map(normalizeTagId) : [];
                  if (pinTags.length > 0) {
                    items.push({
                      id: `pin-${pin.id}`,
                      type: 'pin',
                      pageId: page.id,
                      pageTitle: page.title || 'Untitled Note',
                      notebookId: nb.id,
                      notebookTitle: nb.title,
                      sectionId: sec.id,
                      sectionTitle: sec.title,
                      tags: pinTags,
                      textPreview: pin.label || `Canvas Pin at (${Math.round(pin.x)}, ${Math.round(pin.y)})`,
                      x: pin.x,
                      y: pin.y,
                      createdAt: pin.createdAt
                    });
                  }
                }
              }

            } catch (err) {
              console.warn(`Error scanning page ${page.id} for tags:`, err);
            }
          }
        }
      }

      if (isMounted) {
        setIndexedItems(items);
        setIsLoading(false);
      }
    }

    indexAllWorkspaceTags();

    return () => { isMounted = false; };
  }, [notebooks]);

  // Aggregate all unique tags with count of tagged items
  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    indexedItems.forEach(item => {
      item.tags.forEach(t => {
        counts.set(t, (counts.get(t) || 0) + 1);
      });
    });
    return Array.from(counts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  }, [indexedItems]);

  const toggleTagSelection = (tag: string) => {
    const id = normalizeTagId(tag);
    setSelectedTags(prev => 
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
  };

  // Filter and sort items
  const filteredItems = useMemo(() => {
    return indexedItems.filter(item => {
      // 1. Tag selection filter
      if (selectedTags.length > 0) {
        if (filterMode === 'AND') {
          // Must contain ALL selected tags
          const hasAll = selectedTags.every(t => item.tags.includes(t));
          if (!hasAll) return false;
        } else {
          // Must contain AT LEAST ONE selected tag
          const hasAny = selectedTags.some(t => item.tags.includes(t));
          if (!hasAny) return false;
        }
      }

      // 2. Multi-only filter (2+ tags)
      if (multiOnly && item.tags.length < 2) {
        return false;
      }

      // 3. Type filter
      if (typeFilter !== 'all' && item.type !== typeFilter) {
        return false;
      }

      // 4. Text Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesText = item.textPreview.toLowerCase().includes(q);
        const matchesPage = item.pageTitle.toLowerCase().includes(q);
        const matchesTag = item.tags.some(t => t.toLowerCase().includes(q));
        if (!matchesText && !matchesPage && !matchesTag) return false;
      }

      return true;
    }).sort((a, b) => {
      if (sortOption === 'title') {
        return a.pageTitle.localeCompare(b.pageTitle);
      } else if (sortOption === 'tag_count') {
        return b.tags.length - a.tags.length;
      } else {
        // Recent
        const timeA = typeof a.createdAt === 'number' ? a.createdAt : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
        const timeB = typeof b.createdAt === 'number' ? b.createdAt : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
        return timeB - timeA;
      }
    });
  }, [indexedItems, selectedTags, filterMode, multiOnly, typeFilter, sortOption, searchQuery]);

  const handleItemClick = (item: TaggedItem) => {
    if (item.x != null && item.y != null && onJumpToCoordinates) {
      onJumpToCoordinates(item.pageId, item.x, item.y);
    } else {
      onSelectPage(item.pageId);
    }
    onClose();
  };

  const handleUpdateTagColor = (tagId: string, color: string) => {
    saveTagDefinition({
      id: tagId,
      name: formatTagName(tagId),
      color
    });
    setRegistry(loadTagRegistry());
    setEditingTag(null);
  };

  return (
    <div className="w-full h-full flex flex-col bg-zinc-950 text-white selection:bg-primary-500/30 overflow-hidden">
      
      {/* Top Header Bar */}
      <header className="px-6 py-4 border-b border-zinc-800/80 bg-zinc-900/60 backdrop-blur-md flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-2">
          {onToggleSidebar && (
            <button
              type="button"
              onClick={onToggleSidebar}
              className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              title={isSidebarOpen ? "Collapse Sidebar (Cmd+B)" : "Expand Sidebar (Cmd+B)"}
            >
              {isSidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            title="Back to Notes"
          >
            <ArrowLeft size={18} />
          </button>
          
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary-500/15 text-primary-400 flex items-center justify-center font-bold">
              <Hash size={18} />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-white tracking-tight leading-tight">
                Tag Place
              </h1>
              <p className="text-xs text-zinc-400">
                {tagCounts.length} {tagCounts.length === 1 ? 'tag' : 'tags'} • {indexedItems.length} tagged elements across your notes
              </p>
            </div>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-2">
          {onOpenMindMap && (
            <button
              type="button"
              onClick={onOpenMindMap}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 text-xs font-semibold transition-all shadow-xs"
              title="Open Global Knowledge Graph Mind Map"
            >
              <Sparkles size={14} className="text-purple-400" />
              <span className="hidden sm:inline">Knowledge Graph</span>
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
            title="Close (Esc)"
          >
            <X size={18} />
          </button>
        </div>
      </header>

      {/* Main Two-Column Layout */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* LEFT COLUMN: Tag Cloud & Directory */}
        <aside className="w-72 sm:w-80 border-r border-zinc-800/80 bg-zinc-900/30 flex flex-col shrink-0 overflow-hidden">
          <div className="p-4 border-b border-zinc-800/60 space-y-3 shrink-0">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                <Filter size={13} className="text-primary-400" />
                Filter by Tags
              </span>
              {selectedTags.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedTags([])}
                  className="text-[11px] text-zinc-400 hover:text-primary-400 hover:underline"
                >
                  Clear ({selectedTags.length})
                </button>
              )}
            </div>

            {/* Filter Logic Toggle (AND vs OR) */}
            <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setFilterMode('OR')}
                className={`flex-1 py-1 text-xs font-semibold rounded-lg transition-all ${
                  filterMode === 'OR' 
                    ? 'bg-primary-600 text-white shadow-xs' 
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
                title="Match items that have at least one of the selected tags"
              >
                Match ANY (OR)
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('AND')}
                className={`flex-1 py-1 text-xs font-semibold rounded-lg transition-all ${
                  filterMode === 'AND' 
                    ? 'bg-primary-600 text-white shadow-xs' 
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
                title="Only match items that contain ALL selected tags"
              >
                Match ALL (AND)
              </button>
            </div>

            {/* Has Multiple Tags (2+) Quick Filter */}
            <button
              type="button"
              onClick={() => setMultiOnly(!multiOnly)}
              className={`w-full py-1.5 px-2.5 rounded-lg text-xs font-medium border flex items-center justify-between transition-colors ${
                multiOnly 
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-300' 
                  : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:border-zinc-700'
              }`}
            >
              <span>Items with 2+ tags</span>
              {multiOnly && <Check size={13} className="text-amber-400" />}
            </button>
          </div>

          {/* Tag List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar">
            {tagCounts.length === 0 ? (
              <div className="p-6 text-center text-xs text-zinc-500">
                No tags created yet. Type <span className="text-zinc-300 font-mono">#tag</span> in any note or click <span className="text-zinc-300 font-semibold">+ Tag</span> on a page to get started!
              </div>
            ) : (
              tagCounts.map(({ tag, count }) => {
                const isSelected = selectedTags.includes(tag);
                const tagStyle = getTagColor(tag, registry);

                return (
                  <div
                    key={tag}
                    className={`group flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                      isSelected 
                        ? 'bg-zinc-800 border border-zinc-700 text-white shadow-xs' 
                        : 'hover:bg-zinc-900/80 text-zinc-300 border border-transparent'
                    }`}
                    onClick={() => toggleTagSelection(tag)}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0 transition-transform group-hover:scale-110"
                        style={{ backgroundColor: tagStyle.color }}
                      />
                      <span className="truncate">#{formatTagName(tag)}</span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingTag(editingTag === tag ? null : tag);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-zinc-400 hover:text-white rounded transition-opacity"
                        title="Customize color"
                      >
                        <Palette size={12} />
                      </button>

                      <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-[11px] text-zinc-400 font-mono">
                        {count}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Color Picker Flyout for Editing Tag */}
          {editingTag && (
            <div className="p-3 border-t border-zinc-800 bg-zinc-900/90 space-y-2 animate-in fade-in">
              <div className="flex items-center justify-between text-xs text-zinc-300">
                <span>Color for <strong className="text-white">#{editingTag}</strong></span>
                <button type="button" onClick={() => setEditingTag(null)}><X size={13} /></button>
              </div>
              <div className="flex items-center justify-between gap-1">
                {TAG_PALETTE.map(p => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => handleUpdateTagColor(editingTag, p.color)}
                    style={{ backgroundColor: p.color }}
                    className="w-4 h-4 rounded-full hover:scale-125 transition-transform"
                    title={p.name}
                  />
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* RIGHT COLUMN: Search, Filters & Tagged Item Cards */}
        <main className="flex-1 flex flex-col overflow-hidden bg-zinc-950">
          
          {/* Filter Ribbon & Search Bar */}
          <div className="p-4 border-b border-zinc-800/80 bg-zinc-900/20 flex flex-wrap items-center justify-between gap-3 shrink-0">
            {/* Search input */}
            <div className="relative flex-1 min-w-[220px]">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tagged notes, audio transcripts, or snippets..."
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-2 pl-9 pr-4 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all"
              />
            </div>

            {/* Element Type Filters */}
            <div className="flex items-center gap-1 overflow-x-auto py-0.5 custom-scrollbar">
              {(['all', 'page', 'text', 'audio', 'pin'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setTypeFilter(type)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
                    typeFilter === type
                      ? 'bg-zinc-800 text-white border border-zinc-700'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                  }`}
                >
                  {type === 'all' ? 'All Types' : type === 'page' ? 'Pages' : type === 'text' ? 'Text' : type === 'audio' ? 'Audio' : 'Canvas Pins'}
                </button>
              ))}
            </div>

            {/* Sort Options */}
            <div className="flex items-center gap-1.5 text-xs text-zinc-400 shrink-0">
              <ArrowUpDown size={13} className="text-zinc-500" />
              <select
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value as any)}
                className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-zinc-700"
              >
                <option value="recent">Recently Updated</option>
                <option value="title">Page Title (A–Z)</option>
                <option value="tag_count">Most Tags</option>
              </select>
            </div>
          </div>

          {/* Results List */}
          <div className="flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar">
            {isLoading ? (
              <div className="py-24 text-center text-xs text-zinc-500">
                Indexing tags across notebooks...
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="py-24 text-center space-y-2">
                <Hash size={32} className="mx-auto text-zinc-700" />
                <p className="text-sm font-semibold text-zinc-400">No tagged items found</p>
                <p className="text-xs text-zinc-600 max-w-sm mx-auto">
                  {selectedTags.length > 0 
                    ? `No elements matched the current tag filter (${selectedTags.map(t => `#${t}`).join(', ')}). Try switching to "Match ANY" or clearing some tags.`
                    : "No tags match your search query."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {filteredItems.map((item) => {
                  const typeIcon = item.type === 'page' 
                    ? <FileText size={15} className="text-primary-400" />
                    : item.type === 'text' 
                    ? <Type size={15} className="text-blue-400" />
                    : item.type === 'audio' 
                    ? <Mic size={15} className="text-emerald-400" />
                    : <MapPin size={15} className="text-amber-400" />;

                  const typeLabel = item.type === 'page' ? 'Page' : item.type === 'text' ? 'Text Block' : item.type === 'audio' ? 'Audio Note' : 'Canvas Pin';

                  return (
                    <div
                      key={item.id}
                      onClick={() => handleItemClick(item)}
                      className="group p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 hover:border-primary-500/50 hover:bg-zinc-900 transition-all cursor-pointer flex flex-col justify-between space-y-3 shadow-xs"
                    >
                      <div className="space-y-2">
                        {/* Header: Type icon & Breadcrumb */}
                        <div className="flex items-center justify-between text-[11px] text-zinc-400">
                          <span className="flex items-center gap-1.5 font-semibold text-zinc-300">
                            {typeIcon}
                            <span>{typeLabel}</span>
                          </span>
                          <span className="truncate max-w-[140px] text-zinc-500" title={`${item.notebookTitle} > ${item.sectionTitle}`}>
                            {item.sectionTitle || item.notebookTitle}
                          </span>
                        </div>

                        {/* Title & Preview */}
                        <div>
                          <h3 className="text-sm font-bold text-white group-hover:text-primary-400 transition-colors line-clamp-1">
                            {item.pageTitle}
                          </h3>
                          <p className="text-xs text-zinc-400 line-clamp-2 mt-1 leading-relaxed">
                            {item.textPreview}
                          </p>
                        </div>
                      </div>

                      {/* Footer: Tags & Coordinate Indicator */}
                      <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1">
                          {item.tags.map((t) => {
                            const tagColor = getTagColor(t, registry);
                            return (
                              <span
                                key={t}
                                style={{
                                  backgroundColor: tagColor.bg,
                                  borderColor: tagColor.border,
                                  color: tagColor.text
                                }}
                                className="text-[10px] font-medium px-2 py-0.5 rounded-full border inline-flex items-center gap-0.5"
                              >
                                #{formatTagName(t)}
                              </span>
                            );
                          })}
                        </div>

                        <span className="text-zinc-500 group-hover:text-primary-400 transition-colors shrink-0">
                          <ExternalLink size={13} />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>

      </div>
    </div>
  );
}
