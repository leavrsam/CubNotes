"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { Book, BookOpen, Folder, FileText, ChevronRight, ChevronDown, Plus, MoreVertical, Edit2, Trash2, Settings, Search, Loader2, PanelLeftClose, Palette, Command, Share2, Users, Download, Monitor, Smartphone, Sparkles, Hash, Network, X } from "lucide-react";
import { Notebook, Section, Page } from "@/hooks/useNotebooks";
import { DeleteConfirmModal } from "./DeleteConfirmModal";
import { isNativeApp } from "@/lib/nativeAudio";
import { getCachedPageState } from "@/lib/offlineStore";
import { audioPlaybackSyncBus } from "@/lib/audioPlaybackSync";

interface SidebarProps {
  notebooks: Notebook[];
  selectedPageId: string | null;
  onSelectPage: (pageId: string) => void;
  onAddNotebook: () => void;
  onUpdateNotebook: (id: string, title: string) => void;
  onDeleteNotebook: (id: string) => void;
  onToggleJournalMode?: (id: string, is_journal: boolean) => void;
  onAddSection: (notebookId: string) => void;
  onUpdateSection: (id: string, title: string) => void;
  onDeleteSection: (id: string) => void;
  onAddPage: (sectionId: string) => void;
  onUpdatePage: (id: string, title: string) => void;
  onDeletePage: (id: string) => void;
  onClose?: () => void;
  onOpenSettings?: () => void;
  onOpenTrash?: () => void;
  trashCount?: number;
  onOpenCommandPalette?: () => void;
  onOpenAskAI?: (initialQuery?: string) => void;
  onOpenTagHub?: () => void;
  onOpenMindMap?: () => void;
  onJumpToCoordinates?: (pageId: string, x: number, y: number) => void;
  onShareItem?: (type: 'notebook' | 'section' | 'page', id: string, title: string) => void;
  user?: any;
}

interface SearchItemResult {
  id: string;
  pageId: string;
  title: string;
  notebookTitle: string;
  sectionTitle: string;
  snippet?: string;
  x?: number;
  y?: number;
  audioBlockId?: string;
  timestampMs?: number;
  source: 'title' | 'content' | 'section' | 'notebook' | 'vector';
}

export function Sidebar(props: SidebarProps) {
  const { 
    notebooks, selectedPageId, onSelectPage,
    onAddNotebook, onUpdateNotebook, onDeleteNotebook, onToggleJournalMode,
    onAddSection, onUpdateSection, onDeleteSection,
    onAddPage, onUpdatePage, onDeletePage,
    onClose, onOpenSettings, onJumpToCoordinates, user
  } = props;
  const [searchQuery, setSearchQuery] = useState("");
  const [searchScope, setSearchScope] = useState<'global' | 'local'>('global');
  const [isSearching, setIsSearching] = useState(false);
  const [contentResults, setContentResults] = useState<SearchItemResult[]>([]);

  // Platform download link detection (only shown when not running in native downloaded app)
  const [isNative, setIsNative] = useState(false);
  const [deviceDownloadInfo, setDeviceDownloadInfo] = useState<{
    label: string;
    badge: string;
    href: string;
    isDirectDownload: boolean;
  }>({
    label: "Download App",
    badge: "Get App",
    href: "/download",
    isDirectDownload: false,
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsNative(isNativeApp());
    const ua = window.navigator.userAgent.toLowerCase();
    const isAndroid = /android/i.test(ua);
    const isMac = /macintosh|mac os x/i.test(ua);
    const isWindows = /windows/i.test(ua);

    if (isAndroid) {
      setDeviceDownloadInfo({
        label: "Download App",
        badge: "Android APK",
        href: "/Motif.apk",
        isDirectDownload: true,
      });
    } else if (isMac) {
      setDeviceDownloadInfo({
        label: "Download App",
        badge: "macOS",
        href: "/download",
        isDirectDownload: false,
      });
    } else if (isWindows) {
      setDeviceDownloadInfo({
        label: "Download App",
        badge: "Windows",
        href: "/download",
        isDirectDownload: false,
      });
    } else {
      setDeviceDownloadInfo({
        label: "Download App",
        badge: "Desktop / APK",
        href: "/download",
        isDirectDownload: false,
      });
    }
  }, []);

  // 1. Instant client-side matches (synchronous, 0ms latency)
  const instantMatches = useMemo<SearchItemResult[]>(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const results: SearchItemResult[] = [];

    for (const nb of notebooks) {
      const nbMatch = (nb.title || '').toLowerCase().includes(q);
      for (const sec of nb.sections || []) {
        const secMatch = (sec.title || '').toLowerCase().includes(q);
        for (const page of sec.pages || []) {
          if (searchScope === 'local' && selectedPageId && page.id !== selectedPageId) {
            continue;
          }
          const pageTitle = page.title || 'Untitled Note';
          const pLower = pageTitle.toLowerCase();

          if (pLower.includes(q)) {
            results.push({
              id: `p-${page.id}`,
              pageId: page.id,
              title: pageTitle,
              notebookTitle: nb.title,
              sectionTitle: sec.title,
              source: 'title'
            });
          } else if (secMatch) {
            results.push({
              id: `s-${page.id}`,
              pageId: page.id,
              title: pageTitle,
              notebookTitle: nb.title,
              sectionTitle: sec.title,
              source: 'section'
            });
          } else if (nbMatch) {
            results.push({
              id: `nb-${page.id}`,
              pageId: page.id,
              title: pageTitle,
              notebookTitle: nb.title,
              sectionTitle: sec.title,
              source: 'notebook'
            });
          }
        }
      }
    }
    return results;
  }, [notebooks, searchQuery, searchScope, selectedPageId]);

  // 2. Debounced deep content search across cached page contents & vector search
  useEffect(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || q.length < 2) {
      setContentResults([]);
      setIsSearching(false);
      return;
    }

    let isCancelled = false;
    setIsSearching(true);

    const timer = setTimeout(async () => {
      try {
        const found: SearchItemResult[] = [];
        const seenPageIds = new Set(instantMatches.map(m => m.pageId));

        // Scan local IndexedDB cached document states
        for (const nb of notebooks) {
          for (const sec of nb.sections || []) {
            for (const page of sec.pages || []) {
              if (isCancelled) return;
              if (searchScope === 'local' && selectedPageId && page.id !== selectedPageId) {
                continue;
              }
              if (seenPageIds.has(page.id)) continue;

              const state: any = await getCachedPageState(page.id);
              if (!state) continue;

              // Check text blocks
              const texts = Array.isArray(state.texts) ? state.texts : (Array.isArray(state.textBlocks) ? state.textBlocks : []);
              let matchedBlock: any = null;
              for (const b of texts) {
                const textContent = (b.content || "").replace(/<[^>]*>/g, ' ');
                if (textContent.toLowerCase().includes(q)) {
                  matchedBlock = {
                    text: textContent,
                    x: b.x,
                    y: b.y
                  };
                  break;
                }
              }

              // Check audio transcripts (Audio-Anchored Search)
              if (!matchedBlock && Array.isArray(state.audios)) {
                for (const a of state.audios) {
                  if (a.transcript && a.transcript.toLowerCase().includes(q)) {
                    let tsMs: number | undefined;
                    const lines = a.transcript.split('\n');
                    const bestLine = lines.find((l: string) => l.toLowerCase().includes(q)) || a.transcript;
                    const tsMatch = bestLine.match(/\[(\d{1,2}:\d{2})\]/);
                    if (tsMatch) {
                      const [m, s] = tsMatch[1].split(':').map(Number);
                      tsMs = (m * 60 + s) * 1000;
                    }
                    matchedBlock = {
                      text: bestLine,
                      x: a.x,
                      y: a.y,
                      audioBlockId: a.id,
                      timestampMs: tsMs
                    };
                    break;
                  }
                }
              }

              if (matchedBlock) {
                const lower = matchedBlock.text.toLowerCase();
                const idx = lower.indexOf(q);
                const start = Math.max(0, idx - 20);
                const end = Math.min(matchedBlock.text.length, idx + q.length + 35);
                const snippet = (start > 0 ? '...' : '') + matchedBlock.text.slice(start, end).trim() + (end < matchedBlock.text.length ? '...' : '');

                found.push({
                  id: `cnt-${page.id}`,
                  pageId: page.id,
                  title: page.title || 'Untitled Note',
                  notebookTitle: nb.title,
                  sectionTitle: sec.title,
                  snippet,
                  x: matchedBlock.x,
                  y: matchedBlock.y,
                  audioBlockId: matchedBlock.audioBlockId,
                  timestampMs: matchedBlock.timestampMs,
                  source: 'content'
                });
                seenPageIds.add(page.id);
              }
            }
          }
        }

        // Try API search in parallel (if online and Supabase user configured)
        try {
          const res = await fetch('/api/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              query: q,
              pageId: searchScope === 'local' ? selectedPageId : undefined
            })
          });
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data.matches)) {
              for (const m of data.matches) {
                const pid = m.metadata?.pageId;
                if (pid && !seenPageIds.has(pid)) {
                  const preview = (m.content || '').replace(/<[^>]+>/g, ' ').slice(0, 50) + '...';
                  found.push({
                    id: `vec-${m.id || pid}`,
                    pageId: pid,
                    title: m.metadata?.title || 'Matching Note',
                    notebookTitle: m.metadata?.notebookTitle || '',
                    sectionTitle: m.metadata?.sectionTitle || '',
                    snippet: preview,
                    x: m.metadata?.x,
                    y: m.metadata?.y,
                    source: 'vector'
                  });
                  seenPageIds.add(pid);
                }
              }
            }
          }
        } catch {
          // Gracefully ignore network/auth errors for vector search fallback
        }

        if (!isCancelled) {
          setContentResults(found);
        }
      } catch (err) {
        console.error("Content search error:", err);
      } finally {
        if (!isCancelled) {
          setIsSearching(false);
        }
      }
    }, 200);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, notebooks, searchScope, selectedPageId, instantMatches]);

  const allSearchResults = useMemo(() => {
    return [...instantMatches, ...contentResults];
  }, [instantMatches, contentResults]);

  // Confirmation state for deleting notebooks, folders, or notes
  const [confirmDelete, setConfirmDelete] = useState<{
    type: 'notebook' | 'folder' | 'page';
    id: string;
    name: string;
    details?: string;
  } | null>(null);

  const handlePromptDeleteNotebook = (nb: Notebook) => {
    const folderCount = (nb.sections || []).length;
    const noteCount = (nb.sections || []).reduce((acc: number, s: any) => acc + (s.pages || []).length, 0);
    setConfirmDelete({
      type: 'notebook',
      id: nb.id,
      name: nb.title,
      details: folderCount > 0 || noteCount > 0 ? `Contains ${folderCount} folder(s) and ${noteCount} note(s).` : undefined
    });
  };

  const handlePromptDeleteSection = (sec: Section) => {
    const noteCount = (sec.pages || []).length;
    setConfirmDelete({
      type: 'folder',
      id: sec.id,
      name: sec.title,
      details: noteCount > 0 ? `Contains ${noteCount} note(s).` : undefined
    });
  };

  const handlePromptDeletePage = (p: Page) => {
    setConfirmDelete({
      type: 'page',
      id: p.id,
      name: p.title || 'Untitled Note'
    });
  };

  return (
    <aside 
      className="w-64 bg-zinc-950 text-zinc-300 h-screen flex flex-col border-r border-zinc-800 flex-shrink-0"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="p-4 border-b border-zinc-800 flex items-center justify-between group">
        <h1 className="text-lg font-bold text-zinc-100 tracking-tight flex items-center gap-2.5">
          <img src="/logo.png" alt="Motif" className="w-6 h-6 object-contain" />
          <span>Motif</span>
        </h1>
        <div className="flex items-center gap-1">
          <button 
            onClick={onAddNotebook}
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors"
            title="New Notebook"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      <div className="p-3 border-b border-zinc-800">
        <div className="relative flex items-center">
          <Search size={14} className="absolute left-2.5 text-zinc-500" />
          <input
            type="text"
            placeholder="Search notes & content..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setSearchQuery('');
              if (e.key === 'Enter' && allSearchResults.length > 0) {
                const first = allSearchResults[0];
                onSelectPage(first.pageId);
                if (first.x != null && first.y != null) {
                  onJumpToCoordinates?.(first.pageId, first.x, first.y);
                }
                if (first.audioBlockId && first.timestampMs != null) {
                  audioPlaybackSyncBus.seek(first.audioBlockId, first.timestampMs);
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('motif-focus-time-ink', {
                      detail: { audioBlockId: first.audioBlockId, timestampMs: first.timestampMs }
                    }));
                  }
                }
              }
            }}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-md py-1.5 pl-8 pr-16 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500 text-zinc-200 placeholder:text-zinc-600"
          />
          <div className="absolute right-1 flex items-center gap-1">
            {isSearching && (
              <Loader2 size={12} className="text-zinc-500 animate-spin" />
            )}
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="p-1 rounded text-zinc-500 hover:text-zinc-300 transition-colors"
                title="Clear search"
              >
                <X size={12} />
              </button>
            )}
            <button
              onClick={() => setSearchScope(prev => prev === 'global' ? 'local' : 'global')}
              className={`p-1 rounded flex items-center justify-center transition-colors ${searchScope === 'local' ? 'bg-primary-500/20 text-primary-400' : 'text-zinc-500 hover:text-zinc-300'}`}
              title={searchScope === 'global' ? "Searching all notes (Click to search current note)" : "Searching current note (Click to search all notes)"}
            >
              {searchScope === 'global' ? <Folder size={12} /> : <FileText size={12} />}
            </button>
          </div>
        </div>

        {props.onOpenAskAI && (
          <button
            onClick={() => props.onOpenAskAI?.()}
            className="flex items-center justify-between w-full mt-2.5 px-3 py-2 rounded-xl bg-gradient-to-r from-primary-600/20 via-indigo-600/20 to-purple-600/20 hover:from-primary-600/30 hover:to-purple-600/30 border border-primary-500/30 text-xs font-semibold text-primary-300 transition-all shadow-xs group active:scale-[0.98]"
            title="Ask AI across notes & meetings (Cmd+J)"
          >
            <span className="flex items-center gap-2">
              <Sparkles size={14} className="text-primary-400 group-hover:scale-110 transition-transform animate-pulse" />
              <span>Ask Motif AI</span>
            </span>
            <kbd className="px-1.5 py-0.5 rounded text-[10px] bg-primary-500/20 border border-primary-500/40 text-primary-300 font-mono">
              ⌘J
            </kbd>
          </button>
        )}

        {props.onOpenCommandPalette && (
          <button
            onClick={props.onOpenCommandPalette}
            className="flex items-center justify-between w-full mt-2 px-2.5 py-1.5 rounded-md bg-zinc-900/60 hover:bg-zinc-850 border border-zinc-800 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
            title="Command Palette (Cmd+K)"
          >
            <span className="flex items-center gap-1.5">
              <Command size={12} className="text-zinc-500" />
              <span>Command Palette</span>
            </span>
            <kbd className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-800 border border-zinc-700 text-zinc-400 font-mono">
              ⌘K
            </kbd>
          </button>
        )}

        {/* Tag Place & Knowledge Graph Mind Map Nav */}
        <div className="grid grid-cols-2 gap-1.5 mt-2">
          {props.onOpenTagHub && (
            <button
              onClick={props.onOpenTagHub}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-zinc-900/60 hover:bg-zinc-850 border border-zinc-800 text-xs font-semibold text-zinc-300 hover:text-white transition-colors group"
              title="Open Tag Place (All tagged notes, blocks & pins)"
            >
              <Hash size={13} className="text-purple-400 group-hover:scale-110 transition-transform" />
              <span>Tags</span>
            </button>
          )}

          {props.onOpenMindMap && (
            <button
              onClick={props.onOpenMindMap}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-zinc-900/60 hover:bg-zinc-850 border border-zinc-800 text-xs font-semibold text-zinc-300 hover:text-white transition-colors group"
              title="Open Knowledge Graph Mind Map"
            >
              <Network size={13} className="text-blue-400 group-hover:scale-110 transition-transform" />
              <span>Mind Map</span>
            </button>
          )}
        </div>
      </div>

      {searchQuery.trim().length > 0 && (
        <div className="max-h-64 overflow-y-auto border-b border-zinc-800 p-2 space-y-1 bg-zinc-900/60 divide-y divide-zinc-800/40">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
              <span>Results</span>
              <span className="px-1.5 py-0.2 bg-zinc-800 text-zinc-300 rounded text-[10px]">
                {allSearchResults.length}
              </span>
            </span>
            <button 
              onClick={() => setSearchQuery('')} 
              className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Clear
            </button>
          </div>

          {allSearchResults.length > 0 ? (
            <div className="pt-1 space-y-0.5">
              {allSearchResults.map((res) => (
                <div 
                  key={res.id} 
                  className="px-2 py-1.5 rounded-md hover:bg-zinc-800/80 cursor-pointer transition-colors group flex items-start gap-2"
                  onClick={() => {
                    onSelectPage(res.pageId);
                    if (res.x != null && res.y != null) {
                      onJumpToCoordinates?.(res.pageId, res.x, res.y);
                    }
                    if (res.audioBlockId && res.timestampMs != null) {
                      audioPlaybackSyncBus.seek(res.audioBlockId, res.timestampMs);
                      if (typeof window !== 'undefined') {
                        window.dispatchEvent(new CustomEvent('motif-focus-time-ink', {
                          detail: { audioBlockId: res.audioBlockId, timestampMs: res.timestampMs }
                        }));
                      }
                    }
                  }}
                >
                  <FileText size={14} className="text-primary-400 shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-zinc-200 group-hover:text-white truncate flex items-center justify-between">
                      <span className="truncate">{res.title}</span>
                      {res.timestampMs != null && (
                        <span className="text-[10px] font-mono text-indigo-400 bg-indigo-950/60 border border-indigo-800/60 px-1 py-0.2 rounded shrink-0 ml-1">
                          {Math.floor(res.timestampMs / 60000)}:{String(Math.floor((res.timestampMs % 60000) / 1000)).padStart(2, '0')}
                        </span>
                      )}
                    </div>
                    {(res.notebookTitle || res.sectionTitle) && (
                      <div className="text-[10px] text-zinc-500 truncate">
                        {res.notebookTitle}{res.notebookTitle && res.sectionTitle ? ' › ' : ''}{res.sectionTitle}
                      </div>
                    )}
                    {res.snippet && (
                      <div className="text-[11px] text-zinc-400 italic truncate mt-0.5 bg-zinc-950/40 px-1 py-0.5 rounded border border-zinc-800/60">
                        {res.snippet}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : !isSearching ? (
            <div className="p-3 text-center text-xs text-zinc-500 italic">
              No notes found matching &quot;{searchQuery}&quot;
            </div>
          ) : null}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {notebooks.map((nb) => (
          <NotebookItem
            key={nb.id}
            notebook={nb}
            selectedPageId={selectedPageId}
            onSelectPage={onSelectPage}
            onAddSection={() => onAddSection(nb.id)}
            onUpdate={(title: string) => onUpdateNotebook(nb.id, title)}
            onDelete={() => handlePromptDeleteNotebook(nb)}
            onToggleJournalMode={onToggleJournalMode}
            onUpdateSection={onUpdateSection}
            onDeleteSection={(secId: string) => {
              const sec = (nb.sections || []).find((s: any) => s.id === secId);
              if (sec) handlePromptDeleteSection(sec);
              else onDeleteSection(secId);
            }}
            onAddPage={onAddPage}
            onUpdatePage={onUpdatePage}
            onDeletePage={(pageId: string) => {
              let foundPage: any = null;
              for (const sec of nb.sections || []) {
                foundPage = (sec.pages || []).find((p: any) => p.id === pageId);
                if (foundPage) break;
              }
              if (foundPage) handlePromptDeletePage(foundPage);
              else onDeletePage(pageId);
            }}
            onShare={() => props.onShareItem?.('notebook', nb.id, nb.title)}
            onShareSection={(sec: any) => props.onShareItem?.('section', sec.id, sec.title)}
            onSharePage={(page: any) => props.onShareItem?.('page', page.id, page.title)}
          />
        ))}
        {notebooks.length === 0 && (
          <div className="p-4 text-center text-sm text-zinc-600 italic">
            No notebooks yet.
          </div>
        )}
      </div>
      
      {/* Settings & Trash Footer */}
      <div className="p-3 border-t border-zinc-800 space-y-1 mt-auto">
        {!isNative && (
          <div className="space-y-0.5">
            <a
              href={deviceDownloadInfo.href}
              download={deviceDownloadInfo.isDirectDownload ? "Motif.apk" : undefined}
              className="flex items-center justify-between text-xs text-zinc-400 hover:text-zinc-100 transition-colors w-full px-2.5 py-1.5 rounded-md hover:bg-zinc-800/50 text-left group"
              title={`Download Motif (${deviceDownloadInfo.badge})`}
            >
              <div className="flex items-center gap-2.5">
                <Download size={15} className="text-zinc-400 group-hover:text-primary-400 transition-colors" />
                <span>{deviceDownloadInfo.label}</span>
              </div>
              <span className="px-1.5 py-0.5 bg-zinc-800 text-zinc-400 border border-zinc-700/60 rounded text-[10px] font-medium group-hover:border-primary-500/40 group-hover:text-primary-300 transition-colors">
                {deviceDownloadInfo.badge}
              </span>
            </a>
          </div>
        )}

        {props.onOpenTrash && (
          <button 
            onClick={props.onOpenTrash}
            className="flex items-center justify-between text-xs text-zinc-400 hover:text-zinc-100 transition-colors w-full px-2.5 py-1.5 rounded-md hover:bg-zinc-800/50 text-left"
            title="Trash & Archive (30-day retention)"
          >
            <div className="flex items-center gap-2.5">
              <Trash2 size={15} className="text-zinc-400" />
              <span>Trash</span>
            </div>
            {props.trashCount != null && props.trashCount > 0 && (
              <span className="px-1.5 py-0.5 bg-zinc-800 text-zinc-300 border border-zinc-700 rounded-full text-[10px] font-semibold">
                {props.trashCount}
              </span>
            )}
          </button>
        )}

        <button 
          onClick={onOpenSettings}
          className="flex items-center gap-3 text-sm text-zinc-400 hover:text-zinc-100 transition-colors w-full p-2 rounded-md hover:bg-zinc-800/50 text-left"
        >
          {user?.user_metadata?.avatar_url ? (
             <img src={user.user_metadata.avatar_url} alt="Avatar" className="w-7 h-7 rounded-full object-cover bg-zinc-800" />
          ) : (
             <div className="w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center">
                <Settings size={16} />
             </div>
          )}
          <div className="flex flex-col flex-1 overflow-hidden">
             <span className="font-medium text-xs text-zinc-200 truncate">{user?.user_metadata?.full_name || "Settings"}</span>
             {user?.user_metadata?.full_name && <span className="text-[10px] text-zinc-500 truncate">Settings</span>}
          </div>
        </button>
      </div>

      {confirmDelete && (
        <DeleteConfirmModal
          isOpen={true}
          onClose={() => setConfirmDelete(null)}
          onConfirm={() => {
            const target = confirmDelete;
            setConfirmDelete(null);
            if (target.type === 'notebook') onDeleteNotebook(target.id);
            else if (target.type === 'folder') onDeleteSection(target.id);
            else if (target.type === 'page') onDeletePage(target.id);
          }}
          itemType={confirmDelete.type}
          itemName={confirmDelete.name}
          details={confirmDelete.details}
          isPermanent={false}
        />
      )}
    </aside>
  );
}

function EditableItem({ 
  icon: Icon, title, isEditing, onSave, onCancel, children, iconColor = "text-zinc-400"
}: { 
  icon: any, title: string, isEditing: boolean, onSave: (val: string) => void, onCancel: () => void, children?: React.ReactNode, iconColor?: string
}) {
  const [val, setVal] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      setVal(title);
      const timer = setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 10);
      return () => clearTimeout(timer);
    }
  }, [isEditing, title]);

  const handleSave = () => {
    const trimmed = val.trim();
    if (trimmed && trimmed !== title) {
      onSave(trimmed);
    } else {
      onCancel();
    }
  };

  if (isEditing) {
    return (
      <div 
        className="flex items-center gap-2 px-2 py-1.5 w-full bg-zinc-900/90 rounded-md"
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <Icon size={16} className={iconColor} />
        <input 
          ref={inputRef}
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleSave();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              setVal(title);
              onCancel();
            }
          }}
          onBlur={handleSave}
          className="flex-1 bg-zinc-900 border border-primary-500 rounded px-1.5 py-0.5 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-primary-500"
        />
      </div>
    );
  }

  return <>{children}</>;
}

function ItemActions({ 
  onEdit, onDelete, onAdd, addTitle, onToggleJournal, isJournal, onOpenColorPicker, onShare 
}: { 
  onEdit: () => void, onDelete: () => void, onAdd?: () => void, addTitle?: string, onToggleJournal?: () => void, isJournal?: boolean, onOpenColorPicker?: () => void, onShare?: () => void 
}) {
  return (
    <div className="flex md:hidden md:group-hover:flex items-center absolute right-2 bg-zinc-800 rounded shadow-lg border border-zinc-700">
      {onToggleJournal && (
        <button 
          onClick={(e) => { e.stopPropagation(); onToggleJournal(); }} 
          className={`p-1 hover:bg-zinc-700 rounded-l ${isJournal ? 'text-amber-400 hover:text-amber-300' : 'text-zinc-400 hover:text-white'}`} 
          title={isJournal ? "Switch to Standard Notebook" : "Convert to Journal Mode"}
        >
          <BookOpen size={14} />
        </button>
      )}
      {onOpenColorPicker && (
        <button 
          onClick={(e) => { e.stopPropagation(); onOpenColorPicker(); }} 
          className="p-1 hover:bg-zinc-700 hover:text-white text-zinc-400" 
          title="Section Color"
        >
          <Palette size={14} />
        </button>
      )}
      {onShare && (
        <button 
          onClick={(e) => { e.stopPropagation(); onShare(); }} 
          className="p-1 hover:bg-zinc-700 hover:text-primary-400 text-zinc-400" 
          title="Share & Collaborate"
        >
          <Share2 size={13} />
        </button>
      )}
      {onAdd && (
        <button onClick={(e) => { e.stopPropagation(); onAdd(); }} className={`p-1 hover:bg-zinc-700 hover:text-white ${!onToggleJournal && !onOpenColorPicker ? 'rounded-l' : ''} text-zinc-400`} title={addTitle}>
          <Plus size={14} />
        </button>
      )}
      <button onClick={(e) => { e.stopPropagation(); onEdit(); }} className="p-1 hover:bg-zinc-700 hover:text-white text-zinc-400" title="Rename">
        <Edit2 size={14} />
      </button>
      <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="p-1 hover:bg-red-500/20 hover:text-red-400 rounded-r text-zinc-400" title="Delete">
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function NotebookItem({
  notebook, selectedPageId, onSelectPage,
  onAddSection, onUpdate, onDelete, onToggleJournalMode,
  onUpdateSection, onDeleteSection,
  onAddPage, onUpdatePage, onDeletePage, onShare, onShareSection, onSharePage
}: any) {
  const [expanded, setExpanded] = useState(true);
  const [isEditing, setIsEditing] = useState(false);

  return (
    <div className="space-y-1">
      <EditableItem 
        icon={notebook.is_journal ? BookOpen : Book} 
        title={notebook.title} 
        isEditing={isEditing} 
        iconColor={notebook.is_journal ? "text-amber-400" : "text-primary-400"}
        onSave={(val) => { onUpdate(val); setIsEditing(false); }}
        onCancel={() => setIsEditing(false)}
      >
        <div 
          onClick={() => setExpanded(!expanded)}
          onDoubleClick={(e) => {
            e.stopPropagation();
            if (typeof window !== 'undefined') window.getSelection()?.removeAllRanges();
            setIsEditing(true);
          }}
          className="group relative w-full flex items-center gap-2 px-2 py-1.5 text-sm font-medium rounded-md hover:bg-zinc-800/50 transition-colors text-zinc-200 cursor-pointer select-none"
        >
          <div className="w-4 flex items-center justify-center">
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </div>
          {notebook.is_journal ? (
            <BookOpen size={16} className="text-amber-400 flex-shrink-0" />
          ) : (
            <Book size={16} className="text-primary-400 flex-shrink-0" />
          )}
          <span 
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (typeof window !== 'undefined') window.getSelection()?.removeAllRanges();
              setIsEditing(true);
            }}
            className="truncate flex-1 text-left flex items-center gap-1.5 select-none"
          >
            {notebook.title}
            {notebook.is_journal && (
              <span className="text-[10px] uppercase font-semibold px-1.5 py-0.2 bg-amber-500/15 text-amber-300 border border-amber-500/30 rounded">
                Journal
              </span>
            )}
            {notebook.isShared && (
              <span title="Shared notebook" className="inline-flex items-center">
                <Users size={12} className="text-primary-400 shrink-0" />
              </span>
            )}
          </span>
          <ItemActions 
            onEdit={() => setIsEditing(true)} 
            onDelete={onDelete} 
            onAdd={() => { setExpanded(true); onAddSection(); }} 
            addTitle="Add Section"
            onToggleJournal={() => onToggleJournalMode?.(notebook.id, !notebook.is_journal)}
            isJournal={notebook.is_journal}
            onShare={onShare}
          />
        </div>
      </EditableItem>

      {expanded && (
        <div className="ml-4 pl-2 border-l border-zinc-800 space-y-1 pb-1">
          {notebook.sections.map((sec: any) => (
            <SectionItem
              key={sec.id}
              section={sec}
              selectedPageId={selectedPageId}
              onSelectPage={onSelectPage}
              onAddPage={() => onAddPage(sec.id)}
              onUpdate={(title: string) => onUpdateSection(sec.id, title)}
              onDelete={() => onDeleteSection(sec.id)}
              onUpdatePage={onUpdatePage}
              onDeletePage={onDeletePage}
              onShare={onShareSection ? () => onShareSection(sec) : undefined}
              onSharePage={onSharePage}
            />
          ))}
          <button 
            onClick={onAddSection}
            className="flex items-center gap-1.5 px-2 py-1 mt-1 text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/30 rounded w-full transition-colors"
          >
            <Plus size={12} /> Add Section
          </button>
        </div>
      )}
    </div>
  );
}

export const SECTION_COLORS = [
  { name: 'Purple', hex: '#a855f7' },
  { name: 'Blue', hex: '#3b82f6' },
  { name: 'Teal', hex: '#14b8a6' },
  { name: 'Green', hex: '#22c55e' },
  { name: 'Amber', hex: '#f59e0b' },
  { name: 'Coral', hex: '#ef4444' },
  { name: 'Pink', hex: '#ec4899' },
  { name: 'Indigo', hex: '#6366f1' },
];

function SectionItem({
  section, selectedPageId, onSelectPage,
  onAddPage, onUpdate, onDelete,
  onUpdatePage, onDeletePage, onShare, onSharePage
}: any) {
  const [expanded, setExpanded] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const colorPickerRef = useRef<HTMLDivElement>(null);

  const [sectionColor, setSectionColor] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(`cubnotes_sec_color_${section.id}`);
      if (saved) return saved;
    }
    let hash = 0;
    for (let i = 0; i < section.id.length; i++) hash = (hash << 5) - hash + section.id.charCodeAt(i);
    return SECTION_COLORS[Math.abs(hash) % SECTION_COLORS.length].hex;
  });

  useEffect(() => {
    if (!showColorPicker) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
        setShowColorPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showColorPicker]);

  const handleSelectColor = (hex: string) => {
    setSectionColor(hex);
    if (typeof window !== 'undefined') {
      localStorage.setItem(`cubnotes_sec_color_${section.id}`, hex);
      window.dispatchEvent(new CustomEvent('cubnotes:section_color_changed', { detail: { sectionId: section.id, color: hex } }));
    }
    setShowColorPicker(false);
  };

  return (
    <div className="space-y-1">
      <EditableItem 
        icon={Folder} title={section.title} isEditing={isEditing} 
        onSave={(val) => { onUpdate(val); setIsEditing(false); }}
        onCancel={() => setIsEditing(false)}
      >
        <div 
          onClick={() => setExpanded(!expanded)}
          onDoubleClick={(e) => {
            e.stopPropagation();
            if (typeof window !== 'undefined') window.getSelection()?.removeAllRanges();
            setIsEditing(true);
          }}
          className="group relative w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md hover:bg-zinc-800/50 transition-colors cursor-pointer select-none"
        >
          <div className="w-4 flex items-center justify-center">
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </div>
          <div className="relative flex items-center">
            <Folder size={14} style={{ color: sectionColor }} className="flex-shrink-0" />
            <div 
              className="w-1.5 h-1.5 rounded-full absolute -top-0.5 -right-0.5 shadow-xs" 
              style={{ backgroundColor: sectionColor }}
            />
          </div>
          <span 
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (typeof window !== 'undefined') window.getSelection()?.removeAllRanges();
              setIsEditing(true);
            }}
            className="truncate flex-1 text-left text-zinc-300 select-none flex items-center gap-1.5"
          >
            {section.title}
            {section.isShared && (
              <span title="Shared folder" className="inline-flex items-center">
                <Users size={12} className="text-primary-400 shrink-0" />
              </span>
            )}
          </span>
          <ItemActions 
            onEdit={() => setIsEditing(true)} 
            onDelete={onDelete} 
            onAdd={() => { setExpanded(true); onAddPage(); }} 
            addTitle="Add Page" 
            onOpenColorPicker={() => setShowColorPicker(prev => !prev)}
            onShare={onShare}
          />

          {showColorPicker && (
            <div 
              ref={colorPickerRef}
              onClick={e => e.stopPropagation()}
              className="absolute right-0 top-full mt-1 z-50 p-2 bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl grid grid-cols-4 gap-1.5"
            >
              {SECTION_COLORS.map(c => (
                <button
                  key={c.hex}
                  onClick={() => handleSelectColor(c.hex)}
                  title={c.name}
                  className={`w-5 h-5 rounded-full border transition-transform hover:scale-110 ${sectionColor === c.hex ? 'border-white ring-2 ring-white/30' : 'border-white/20'}`}
                  style={{ backgroundColor: c.hex }}
                />
              ))}
            </div>
          )}
        </div>
      </EditableItem>

      {expanded && (
        <div className="ml-5 space-y-1 pb-1">
          {section.pages.map((page: any) => (
            <PageItem 
              key={page.id} 
              page={page} 
              selected={selectedPageId === page.id} 
              onSelect={() => onSelectPage(page.id)}
              onUpdate={(title: string) => onUpdatePage(page.id, title)}
              onDelete={() => onDeletePage(page.id)}
              onShare={onSharePage ? () => onSharePage(page) : undefined}
              sectionColor={sectionColor}
            />
          ))}
          <button 
            onClick={onAddPage}
            className="flex items-center gap-1.5 px-2 py-1 mt-1 text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/30 rounded w-full transition-colors"
          >
            <Plus size={12} /> Add Page
          </button>
        </div>
      )}
    </div>
  );
}

function PageItem({ page, selected, onSelect, onUpdate, onDelete, onShare, sectionColor }: any) {
  const [isEditing, setIsEditing] = useState(false);

  return (
    <EditableItem 
      icon={FileText} title={page.title} isEditing={isEditing} 
      onSave={(val) => { onUpdate(val); setIsEditing(false); }}
      onCancel={() => setIsEditing(false)}
    >
      <div
        onClick={onSelect}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (typeof window !== 'undefined') window.getSelection()?.removeAllRanges();
          setIsEditing(true);
        }}
        className={`group relative w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md transition-colors cursor-pointer select-none ${
          selected
            ? "bg-zinc-800/90 text-white font-medium"
            : "hover:bg-zinc-800/50 text-zinc-400 hover:text-zinc-200"
        }`}
        style={selected && sectionColor ? { borderLeft: `3px solid ${sectionColor}`, paddingLeft: '6px' } : undefined}
      >
        <FileText size={14} className="flex-shrink-0" style={selected && sectionColor ? { color: sectionColor } : undefined} />
        <div className="flex flex-col items-start overflow-hidden flex-1 select-none">
          <span 
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (typeof window !== 'undefined') window.getSelection()?.removeAllRanges();
              setIsEditing(true);
            }}
            className="truncate w-full text-left select-none flex items-center gap-1.5"
          >
            {page.title}
            {page.isShared && (
              <span title="Shared page" className="inline-flex items-center">
                <Users size={11} className="text-primary-400 shrink-0" />
              </span>
            )}
          </span>
          {page.is_journal_entry && (
            <span className="text-[10px] text-zinc-500">{page.date}</span>
          )}
        </div>
        <ItemActions 
          onEdit={() => setIsEditing(true)} 
          onDelete={onDelete} 
          onShare={onShare}
        />
      </div>
    </EditableItem>
  );
}
