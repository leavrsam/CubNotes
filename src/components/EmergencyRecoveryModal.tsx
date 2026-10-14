"use client";

import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, 
  RefreshCw, 
  X, 
  FileText, 
  BookOpen, 
  Check, 
  Copy, 
  ChevronRight, 
  Loader2,
  Sparkles,
  ExternalLink
} from 'lucide-react';
import { getAllCachedPages, CachedPageRecord } from '@/lib/offlineStore';
import { Notebook } from '@/hooks/useNotebooks';
import toast from 'react-hot-toast';

interface EmergencyRecoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeNotebooks: Notebook[];
  onResurrectPages: (
    pages: { id: string; title: string; documentState: any }[],
    targetNotebookTitle?: string
  ) => Promise<{ notebook: any; firstPageId?: string }>;
  onSelectPage?: (pageId: string) => void;
}

interface OrphanedPageInfo {
  id: string;
  title: string;
  updatedAt: number;
  textCount: number;
  audioCount: number;
  strokeCount: number;
  imageCount: number;
  previewSnippet: string;
  documentState: any;
  isLikelyCDO: boolean;
}

export function EmergencyRecoveryModal({
  isOpen,
  onClose,
  activeNotebooks,
  onResurrectPages,
  onSelectPage
}: EmergencyRecoveryModalProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [orphanedPages, setOrphanedPages] = useState<OrphanedPageInfo[]>([]);
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(new Set());
  const [notebookTitle, setNotebookTitle] = useState("CDO");
  const [isResurrecting, setIsResurrecting] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);

  // Scan local IndexedDB for orphaned pages
  const runScan = async () => {
    setIsScanning(true);
    try {
      const allCached = await getAllCachedPages();
      
      // Collect all active page IDs
      const activePageIds = new Set<string>();
      for (const nb of activeNotebooks) {
        for (const sec of nb.sections || []) {
          for (const page of sec.pages || []) {
            activePageIds.add(page.id);
          }
        }
      }

      // Filter for cached pages not in any active notebook
      const orphanedRecords = allCached.filter(record => !activePageIds.has(record.pageId));

      const parsedOrphans: OrphanedPageInfo[] = orphanedRecords.map(record => {
        const state = record.documentState || {};
        const texts = Array.isArray(state.texts) ? state.texts : [];
        const audios = Array.isArray(state.audios) ? state.audios : [];
        const strokes = Array.isArray(state.strokes) ? state.strokes : [];
        const images = Array.isArray(state.images) ? state.images : [];

        // Extract a meaningful title from text nodes or audios
        let title = "Recovered Note";
        let previewSnippet = "";

        if (texts.length > 0) {
          // Sort by Y position to find the topmost title/header
          const sortedTexts = [...texts].sort((a, b) => (a.y || 0) - (b.y || 0));
          const firstNonEmpty = sortedTexts.find(t => t.content && t.content.trim().length > 0);
          if (firstNonEmpty) {
            const rawContent = firstNonEmpty.content.replace(/<[^>]+>/g, '').trim();
            const lines = rawContent.split('\n').filter(l => l.trim().length > 0);
            if (lines.length > 0) {
              title = lines[0].substring(0, 50);
              previewSnippet = rawContent.substring(0, 100);
            }
          }
        } else if (audios.length > 0 && audios[0].summary) {
          title = "Meeting Recording";
          previewSnippet = audios[0].summary.substring(0, 100);
        }

        const isLikelyCDO = title.toLowerCase().includes('cdo') || previewSnippet.toLowerCase().includes('cdo');

        return {
          id: record.pageId,
          title,
          updatedAt: record.updatedAt || Date.now(),
          textCount: texts.length,
          audioCount: audios.length,
          strokeCount: strokes.length,
          imageCount: images.length,
          previewSnippet,
          documentState: state,
          isLikelyCDO
        };
      });

      // Sort with CDO-related or most recently updated notes first
      parsedOrphans.sort((a, b) => {
        if (a.isLikelyCDO && !b.isLikelyCDO) return -1;
        if (!a.isLikelyCDO && b.isLikelyCDO) return 1;
        return b.updatedAt - a.updatedAt;
      });

      setOrphanedPages(parsedOrphans);
      // Default to selecting all orphaned pages
      setSelectedPageIds(new Set(parsedOrphans.map(o => o.id)));
    } catch (err) {
      console.error("Scan failed:", err);
      toast.error("Failed to scan offline database");
    } finally {
      setIsScanning(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      runScan();
    }
  }, [isOpen]);

  const handleToggleSelectAll = () => {
    if (selectedPageIds.size === orphanedPages.length) {
      setSelectedPageIds(new Set());
    } else {
      setSelectedPageIds(new Set(orphanedPages.map(o => o.id)));
    }
  };

  const handleToggleSelectOne = (id: string) => {
    setSelectedPageIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleResurrect = async () => {
    if (selectedPageIds.size === 0) {
      toast.error("Please select at least one page to restore");
      return;
    }

    const pagesToRecover = orphanedPages
      .filter(o => selectedPageIds.has(o.id))
      .map(o => ({
        id: o.id,
        title: o.title,
        documentState: o.documentState
      }));

    setIsResurrecting(true);
    try {
      const res = await onResurrectPages(pagesToRecover, notebookTitle.trim() || "CDO");
      toast.success(`Successfully recovered "${notebookTitle}" with ${pagesToRecover.length} notes!`);
      if (res?.firstPageId && onSelectPage) {
        onSelectPage(res.firstPageId);
      }
      onClose();
    } catch (err) {
      console.error("Error during resurrection:", err);
      toast.error("Failed to resurrect notebook");
    } finally {
      setIsResurrecting(false);
    }
  };

  const consoleRescueSnippet = `// === CubNotes Emergency CDO Notebook Rescue Script ===
(async () => {
  console.log("🔍 Scanning CubNotes IndexedDB for orphaned pages...");
  const dbReq = indexedDB.open('cubnotes_offline_db');
  dbReq.onsuccess = async () => {
    const db = dbReq.result;
    const tx = db.transaction(['pages', 'notebooks'], 'readwrite');
    const pagesStore = tx.objectStore('pages');
    const nbStore = tx.objectStore('notebooks');
    
    const allPagesReq = pagesStore.getAll();
    allPagesReq.onsuccess = async () => {
      const cachedPages = allPagesReq.result || [];
      console.log(\`📦 Found \${cachedPages.length} cached pages on device\`);
      
      const hierarchyReq = nbStore.get('hierarchy');
      hierarchyReq.onsuccess = async () => {
        const activeNotebooks = hierarchyReq.result || [];
        const activeIds = new Set();
        activeNotebooks.forEach(nb => nb.sections?.forEach(s => s.pages?.forEach(p => activeIds.add(p.id))));
        
        const orphans = cachedPages.filter(p => !activeIds.has(p.pageId));
        console.log(\`🎯 Found \${orphans.length} orphaned pages eligible for recovery\`);
        
        if (orphans.length === 0) {
          alert("No orphaned pages found in browser cache. If the user was on another device, please run this on that device!");
          return;
        }

        const newNbId = crypto.randomUUID();
        const newSecId = crypto.randomUUID();
        const recoveredPages = orphans.map(op => {
          let title = "Recovered Note";
          const texts = op.documentState?.texts || [];
          if (texts.length > 0) {
            const raw = texts[0].content?.replace(/<[^>]+>/g, '').trim();
            if (raw) title = raw.split('\\n')[0].substring(0, 50);
          }
          return {
            id: op.pageId,
            section_id: newSecId,
            title,
            date: null,
            is_journal_entry: false,
            created_at: new Date().toISOString(),
            document_state: op.documentState
          };
        });

        const recoveredNb = {
          id: newNbId,
          user_id: activeNotebooks[0]?.user_id || 'restored-user',
          title: "CDO (Restored)",
          is_journal: false,
          sections: [{
            id: newSecId,
            notebook_id: newNbId,
            title: "Restored Notes",
            sort_order: 0,
            pages: recoveredPages
          }]
        };

        const updated = [recoveredNb, ...activeNotebooks];
        nbStore.put(updated, 'hierarchy');
        alert(\`🎉 Restored notebook "CDO (Restored)" with \${recoveredPages.length} notes! Refreshing...\`);
        window.location.reload();
      };
    };
  };
})();`;

  const copyConsoleScript = () => {
    navigator.clipboard.writeText(consoleRescueSnippet);
    setCopiedScript(true);
    toast.success("Rescue script copied to clipboard!");
    setTimeout(() => setCopiedScript(false), 3000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="w-full max-w-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-amber-500/10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500 text-white rounded-xl shadow-xs">
              <ShieldAlert size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                  Emergency Notebook & Note Recovery
                </h2>
                <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                  Rescue Tool
                </span>
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                Scans local browser storage to rescue deleted notebooks & orphaned notes
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Status / Instructions banner */}
        <div className="p-4 bg-zinc-50 dark:bg-zinc-800/40 border-b border-zinc-200 dark:border-zinc-800 text-xs text-zinc-600 dark:text-zinc-400 flex items-start gap-3">
          <Sparkles size={16} className="text-amber-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-zinc-800 dark:text-zinc-200">
              How Recovery Works for Issy (&ldquo;CDO&rdquo; Notebook):
            </p>
            <p>
              When a notebook is deleted, CubNotes does not purge individual note canvas drawings or audios from the browser&apos;s local IndexedDB. 
              As long as the user hasn&apos;t cleared browser cache/data, their notes are cached intact right here.
            </p>
          </div>
        </div>

        {/* Target Notebook Name Input */}
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-4 bg-white dark:bg-zinc-900">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Restore into Notebook Name:
            </label>
            <input
              type="text"
              value={notebookTitle}
              onChange={(e) => setNotebookTitle(e.target.value)}
              placeholder="e.g. CDO"
              className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-xl px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <button
            onClick={runScan}
            disabled={isScanning}
            className="flex items-center gap-1.5 px-3 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-xl text-xs font-semibold transition-colors mt-5 disabled:opacity-50"
          >
            <RefreshCw size={13} className={isScanning ? 'animate-spin' : ''} />
            <span>Re-Scan</span>
          </button>
        </div>

        {/* Scan Results */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {isScanning ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3 text-zinc-500">
              <Loader2 size={28} className="animate-spin text-amber-500" />
              <p className="text-xs">Scanning local browser storage for orphaned notes...</p>
            </div>
          ) : orphanedPages.length === 0 ? (
            <div className="py-8 text-center space-y-3">
              <div className="p-3 bg-zinc-100 dark:bg-zinc-800 rounded-full w-12 h-12 flex items-center justify-center mx-auto text-zinc-400">
                <FileText size={24} />
              </div>
              <h4 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                No Orphaned Notes Found on this Browser
              </h4>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
                If the user was using a different computer, tablet, or browser when they deleted the &ldquo;CDO&rdquo; notebook, they should open this tool on that exact device.
              </p>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500">
                <span>Found <strong>{orphanedPages.length}</strong> recoverable note(s)</span>
                <button
                  type="button"
                  onClick={handleToggleSelectAll}
                  className="text-primary-600 dark:text-primary-400 hover:underline font-medium"
                >
                  {selectedPageIds.size === orphanedPages.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {orphanedPages.map((orphan) => {
                  const isSelected = selectedPageIds.has(orphan.id);
                  return (
                    <div
                      key={orphan.id}
                      onClick={() => handleToggleSelectOne(orphan.id)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                        isSelected 
                          ? 'border-amber-500/80 bg-amber-50/50 dark:bg-amber-950/20' 
                          : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className={`w-5 h-5 rounded-md flex items-center justify-center border text-white ${
                          isSelected ? 'bg-amber-500 border-amber-500' : 'border-zinc-300 dark:border-zinc-600'
                        }`}>
                          {isSelected && <Check size={12} strokeWidth={3} />}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 truncate">
                              {orphan.title}
                            </span>
                            {orphan.isLikelyCDO && (
                              <span className="px-1.5 py-0.2 bg-amber-500/20 text-amber-600 dark:text-amber-300 text-[10px] font-bold rounded">
                                CDO Match
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                            {orphan.previewSnippet || `${orphan.textCount} texts, ${orphan.strokeCount} drawings, ${orphan.audioCount} audios`}
                          </div>
                        </div>
                      </div>

                      <div className="text-right text-[10px] text-zinc-400 shrink-0">
                        {new Date(orphan.updatedAt).toLocaleDateString()}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* DevTools Console Rescue Snippet section */}
          <div className="mt-4 p-3 bg-zinc-900 text-zinc-200 rounded-xl border border-zinc-800 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-zinc-300 flex items-center gap-1.5">
                <span>DevTools Rescue Script (for Issy)</span>
              </span>
              <button
                type="button"
                onClick={copyConsoleScript}
                className="flex items-center gap-1 px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-[11px] transition-colors"
              >
                {copiedScript ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                <span>{copiedScript ? 'Copied!' : 'Copy Script'}</span>
              </button>
            </div>
            <p className="text-[11px] text-zinc-400">
              Issy can also open DevTools (<kbd className="px-1 bg-zinc-800 rounded font-mono">F12</kbd> &rarr; Console) on their browser, paste this script, and hit Enter to resurrect the notebook instantly.
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/90 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200/70 dark:hover:bg-zinc-800 rounded-xl transition-colors"
          >
            Close
          </button>

          <button
            type="button"
            onClick={handleResurrect}
            disabled={isResurrecting || selectedPageIds.size === 0}
            className="flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-xs transition-transform active:scale-95 disabled:opacity-50"
          >
            {isResurrecting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <BookOpen size={14} />
            )}
            <span>
              Resurrect &ldquo;{notebookTitle}&rdquo; ({selectedPageIds.size} {selectedPageIds.size === 1 ? 'note' : 'notes'})
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
