"use client";

import React, { useState, useMemo } from "react";
import { Notebook, Section, Page } from "@/hooks/useNotebooks";
import { 
  ChevronRight, 
  Folder, 
  FileText, 
  Plus, 
  ArrowLeft, 
  Search, 
  Settings, 
  Trash2, 
  FolderPlus, 
  BookOpen, 
  Edit3,
  X,
  Share2,
  FolderInput,
  Check
} from "lucide-react";
import { SwipeableRow } from "./SwipeableRow";
import toast from "react-hot-toast";

interface MobileNavigationProps {
  notebooks: Notebook[];
  view: 'folders' | 'notes';
  sectionId: string | null;
  onSelectSection: (sectionId: string) => void;
  onSelectPage: (pageId: string) => void;
  onBackToFolders: () => void;
  onAddNotebook: (title?: string) => Promise<any>;
  onAddSection: (notebookId: string, title?: string) => Promise<any>;
  onAddPage: (sectionId: string, title?: string) => Promise<any>;
  onDeletePage?: (pageId: string) => Promise<void>;
  onDeleteSection?: (sectionId: string) => Promise<void>;
  onDeleteNotebook?: (notebookId: string) => Promise<void>;
  onMovePage?: (pageId: string, targetSectionId: string) => Promise<void>;
  onMoveSection?: (sectionId: string, targetNotebookId: string) => Promise<void>;
  onOpenSettings?: () => void;
}

export function MobileNavigation({
  notebooks,
  view,
  sectionId,
  onSelectSection,
  onSelectPage,
  onBackToFolders,
  onAddNotebook,
  onAddSection,
  onAddPage,
  onDeletePage,
  onDeleteSection,
  onDeleteNotebook,
  onMovePage,
  onMoveSection,
  onOpenSettings
}: MobileNavigationProps) {
  const [searchQuery, setSearchQuery] = useState("");
  
  // Track swiped open item
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);

  // Modals
  const [isNewNotebookModalOpen, setIsNewNotebookModalOpen] = useState(false);
  const [newNotebookTitle, setNewNotebookTitle] = useState("");
  
  const [isNewFolderModalOpen, setIsNewFolderModalOpen] = useState(false);
  const [newFolderTitle, setNewFolderTitle] = useState("");
  const [selectedNotebookIdForFolder, setSelectedNotebookIdForFolder] = useState<string>("");

  // Move Modals
  const [moveTargetNote, setMoveTargetNote] = useState<Page | null>(null);
  const [moveTargetFolder, setMoveTargetFolder] = useState<Section | null>(null);
  const [isMoving, setIsMoving] = useState(false);

  // Total pages across all folders
  const totalNotesCount = useMemo(() => {
    let count = 0;
    notebooks.forEach(nb => {
      nb.sections.forEach(sec => {
        count += sec.pages.length;
      });
    });
    return count;
  }, [notebooks]);

  // First available section ID (for quick note creation)
  const defaultSectionId = useMemo(() => {
    for (const nb of notebooks) {
      if (nb.sections.length > 0) return nb.sections[0].id;
    }
    return null;
  }, [notebooks]);

  const handleCreateNotebook = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const title = newNotebookTitle.trim() || "New Notebook";
    await onAddNotebook(title);
    setNewNotebookTitle("");
    setIsNewNotebookModalOpen(false);
  };

  const handleCreateFolder = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const targetNbId = selectedNotebookIdForFolder || notebooks[0]?.id;
    if (!targetNbId) return;
    const title = newFolderTitle.trim() || "New Folder";
    await onAddSection(targetNbId, title);
    setNewFolderTitle("");
    setIsNewFolderModalOpen(false);
  };

  const handleQuickNewNote = async () => {
    if (view === 'notes' && sectionId) {
      await onAddPage(sectionId, "Untitled Note");
    } else if (defaultSectionId) {
      await onAddPage(defaultSectionId, "Untitled Note");
    } else if (notebooks[0]?.id) {
      // Need a section first
      const newSec = await onAddSection(notebooks[0].id, "Notes");
      if (newSec?.id) {
        await onAddPage(newSec.id, "Untitled Note");
      }
    } else {
      // Create default notebook first
      const nbRes = await onAddNotebook("My Notebook");
      if (nbRes?.pageId) {
        onSelectPage(nbRes.pageId);
      }
    }
  };

  // Cross-platform Share (iOS, Android, Web)
  const handleShareNote = async (page: Page) => {
    const title = page.title || 'Untitled Note';
    const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/?page=${page.id}` : '';
    const shareData = {
      title,
      text: `CubNotes: ${title}`,
      url: shareUrl,
    };

    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share(shareData);
        toast.success("Note shared!");
        return;
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return; // User dismissed native share sheet
    }

    // Fallback: Copy link/title to clipboard
    try {
      await navigator.clipboard.writeText(shareUrl || window.location.href);
      toast.success("Note link copied to clipboard!");
    } catch {
      toast.error("Could not copy note link");
    }
  };

  const handleShareFolder = async (section: Section) => {
    const title = section.title || 'Folder';
    const shareUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const shareData = {
      title,
      text: `CubNotes Folder: ${title} (${section.pages.length} notes)`,
      url: shareUrl,
    };

    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share(shareData);
        toast.success("Folder shared!");
        return;
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
    }

    try {
      await navigator.clipboard.writeText(`${title} - ${shareUrl}`);
      toast.success("Folder info copied to clipboard!");
    } catch {
      toast.error("Could not copy folder info");
    }
  };

  const handleDeleteNote = async (page: Page) => {
    if (!onDeletePage) return;
    if (confirm(`Delete "${page.title || 'Untitled Note'}"?`)) {
      await onDeletePage(page.id);
      toast.success("Note deleted");
    }
  };

  const handleDeleteFolder = async (section: Section) => {
    if (!onDeleteSection) return;
    if (confirm(`Delete folder "${section.title}" and its ${section.pages.length} note(s)?`)) {
      await onDeleteSection(section.id);
      toast.success("Folder deleted");
    }
  };

  const handleConfirmMoveNote = async (targetSectionId: string) => {
    if (!moveTargetNote || !onMovePage) return;
    setIsMoving(true);
    try {
      await onMovePage(moveTargetNote.id, targetSectionId);
      toast.success("Note moved!");
      setMoveTargetNote(null);
    } catch (err) {
      console.error(err);
      toast.error("Failed to move note");
    } finally {
      setIsMoving(false);
    }
  };

  const handleConfirmMoveFolder = async (targetNotebookId: string) => {
    if (!moveTargetFolder || !onMoveSection) return;
    setIsMoving(true);
    try {
      await onMoveSection(moveTargetFolder.id, targetNotebookId);
      toast.success("Folder moved!");
      setMoveTargetFolder(null);
    } catch (err) {
      console.error(err);
      toast.error("Failed to move folder");
    } finally {
      setIsMoving(false);
    }
  };

  // --- NOTES VIEW (Inside a specific folder) ---
  if (view === 'notes' && sectionId) {
    let activeSection: Section | null = null;
    let parentNotebook: Notebook | null = null;
    
    for (const nb of notebooks) {
      const sec = nb.sections.find(s => s.id === sectionId);
      if (sec) {
        activeSection = sec;
        parentNotebook = nb;
        break;
      }
    }

    const filteredPages = (activeSection?.pages || []).filter(p => 
      !searchQuery.trim() || (p.title || "").toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
      <div className="flex flex-col w-full h-full bg-zinc-50 dark:bg-black select-none">
        {/* Top Header */}
        <div 
          className="sticky top-0 z-20 bg-white/80 dark:bg-black/80 backdrop-blur-xl border-b border-zinc-200/80 dark:border-zinc-800"
          style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
        >
          <div className="flex items-center justify-between px-4 py-2.5">
            <button 
              onClick={onBackToFolders}
              className="flex items-center gap-1 text-primary-600 dark:text-primary-400 font-semibold text-[15px] active:scale-95 transition-transform"
            >
              <ArrowLeft size={19} className="-ml-1" />
              <span>Folders</span>
            </button>

            <button 
              onClick={() => onAddPage(sectionId, "Untitled Note")}
              className="w-8 h-8 rounded-full flex items-center justify-center bg-primary-600 hover:bg-primary-700 text-white shadow-sm active:scale-95 transition-transform"
              title="Add Note"
            >
              <Plus size={19} />
            </button>
          </div>

          <div className="px-4 pt-1 pb-3">
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight">
              {activeSection?.title || 'Notes'}
            </h1>
            {parentNotebook && (
              <p className="text-xs text-zinc-400 dark:text-zinc-500 font-medium">
                {parentNotebook.title}
              </p>
            )}
          </div>

          {/* Search Bar */}
          <div className="px-4 pb-3">
            <div className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-1.5 text-sm">
              <Search size={16} className="text-zinc-400" />
              <input 
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search notes..."
                className="bg-transparent border-none outline-none text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 w-full text-[14px]"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="text-zinc-400">
                  <X size={15} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Notes List */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 pb-24">
          {filteredPages.length === 0 ? (
            <div className="flex flex-col items-center justify-center mt-16 text-center text-zinc-400">
              <FileText size={42} className="opacity-30 mb-2" />
              <p className="text-sm font-medium">No notes found</p>
              <button 
                onClick={() => onAddPage(sectionId, "Untitled Note")}
                className="mt-4 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-full text-xs font-semibold shadow-sm active:scale-95 transition-transform"
              >
                + Create Note
              </button>
            </div>
          ) : (
            <div className="bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden shadow-sm border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800/80">
              {filteredPages.map((page) => (
                <SwipeableRow
                  key={page.id}
                  id={`note-${page.id}`}
                  isOpen={openSwipeId === `note-${page.id}`}
                  onOpen={(id) => setOpenSwipeId(id)}
                  onClose={() => setOpenSwipeId(null)}
                  onShare={() => handleShareNote(page)}
                  onMove={() => setMoveTargetNote(page)}
                  onDelete={() => handleDeleteNote(page)}
                  shareLabel="Share"
                  moveLabel="Move"
                >
                  <div className="flex items-center justify-between px-4 py-3.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 active:bg-zinc-100 dark:active:bg-zinc-800 transition-colors">
                    <button
                      onClick={() => onSelectPage(page.id)}
                      className="flex-1 text-left flex flex-col min-w-0 pr-3"
                    >
                      <span className="font-semibold text-[15px] text-zinc-900 dark:text-zinc-100 truncate">
                        {page.title || 'Untitled Note'}
                      </span>
                      <span className="text-[12px] text-zinc-400 dark:text-zinc-500 mt-0.5 font-medium">
                        {new Date(page.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </button>

                    <div className="flex items-center gap-1">
                      <ChevronRight size={17} className="text-zinc-300 dark:text-zinc-600" />
                    </div>
                  </div>
                </SwipeableRow>
              ))}
            </div>
          )}
        </div>

        {/* Bottom Toolbar */}
        <div 
          className="fixed bottom-0 left-0 right-0 z-20 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xl border-t border-zinc-200/80 dark:border-zinc-800/80 px-5 py-2.5 flex items-center justify-between"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
        >
          <span className="text-xs text-zinc-400 font-medium">
            {activeSection?.pages.length || 0} {activeSection?.pages.length === 1 ? 'Note' : 'Notes'}
          </span>

          <button 
            onClick={() => onAddPage(sectionId, "Untitled Note")}
            className="flex items-center gap-1 text-primary-600 dark:text-primary-400 font-semibold text-sm active:scale-95 transition-transform"
          >
            <Edit3 size={17} />
            <span>New Note</span>
          </button>
        </div>
      </div>
    );
  }

  // --- MAIN FOLDERS VIEW ---
  return (
    <div className="flex flex-col w-full h-full bg-zinc-50 dark:bg-black select-none">
      {/* Top Header */}
      <div 
        className="sticky top-0 z-20 bg-white/80 dark:bg-black/80 backdrop-blur-xl border-b border-zinc-200/80 dark:border-zinc-800"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
      >
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="CubNotes" className="w-6 h-6 rounded-md object-cover shadow-sm ring-1 ring-black/5 dark:ring-white/10" />
            <span className="font-bold text-sm text-zinc-700 dark:text-zinc-300">CubNotes</span>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsNewNotebookModalOpen(true)}
              className="px-3 py-1 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 rounded-full text-xs font-semibold transition-colors flex items-center gap-1"
              title="New Notebook"
            >
              <Plus size={14} />
              <span>Notebook</span>
            </button>

            {onOpenSettings && (
              <button 
                onClick={onOpenSettings}
                className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors"
                title="Settings"
              >
                <Settings size={18} />
              </button>
            )}
          </div>
        </div>

        <div className="px-4 pt-1 pb-3">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-white tracking-tight">
            Folders
          </h1>
        </div>

        {/* Search Bar */}
        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-1.5 text-sm">
            <Search size={16} className="text-zinc-400" />
            <input 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search folders and notes..."
              className="bg-transparent border-none outline-none text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 w-full text-[14px]"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="text-zinc-400">
                <X size={15} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Folders & Notebooks List */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6 pb-24">
        {notebooks.length === 0 ? (
          <div className="flex flex-col items-center justify-center mt-16 text-center text-zinc-400">
            <Folder size={46} className="opacity-30 mb-3 text-primary-500" />
            <p className="text-base font-semibold text-zinc-700 dark:text-zinc-300">No folders yet</p>
            <p className="text-xs text-zinc-400 mt-1 max-w-[240px]">Create your first notebook to organize your notes.</p>
            <button 
              onClick={() => setIsNewNotebookModalOpen(true)}
              className="mt-5 px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-full text-xs font-semibold shadow-md active:scale-95 transition-transform"
            >
              + Create Notebook
            </button>
          </div>
        ) : (
          notebooks.map((nb) => {
            const matchingSections = nb.sections.filter(sec => {
              if (!searchQuery.trim()) return true;
              const matchesSection = sec.title.toLowerCase().includes(searchQuery.toLowerCase());
              const matchesPage = sec.pages.some(p => p.title.toLowerCase().includes(searchQuery.toLowerCase()));
              return matchesSection || matchesPage;
            });

            if (searchQuery.trim() && matchingSections.length === 0 && !nb.title.toLowerCase().includes(searchQuery.toLowerCase())) {
              return null;
            }

            return (
              <div key={nb.id} className="space-y-2">
                <div className="flex items-center justify-between px-2">
                  <div className="flex items-center gap-1.5">
                    {nb.is_journal ? (
                      <BookOpen size={14} className="text-amber-500 flex-shrink-0" />
                    ) : (
                      <Folder size={14} className="text-zinc-400 flex-shrink-0" />
                    )}
                    <h2 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                      {nb.title}
                      {nb.is_journal && (
                        <span className="text-[9px] uppercase font-bold px-1.5 py-0.2 bg-amber-500/15 text-amber-600 dark:text-amber-300 border border-amber-500/30 rounded">
                          Journal
                        </span>
                      )}
                    </h2>
                  </div>

                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => {
                        setSelectedNotebookIdForFolder(nb.id);
                        setIsNewFolderModalOpen(true);
                      }}
                      className="text-xs font-semibold text-primary-600 dark:text-primary-400 flex items-center gap-0.5 hover:underline"
                      title="Add Folder"
                    >
                      <Plus size={14} />
                      <span>Folder</span>
                    </button>
                  </div>
                </div>
                
                <div className="bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden shadow-sm border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800/80">
                  {nb.sections.length === 0 ? (
                    <div className="px-4 py-3 flex items-center justify-between text-xs text-zinc-400 italic">
                      <span>No folders in this notebook</span>
                      <button 
                        onClick={() => {
                          setSelectedNotebookIdForFolder(nb.id);
                          setIsNewFolderModalOpen(true);
                        }}
                        className="text-primary-600 dark:text-primary-400 font-semibold not-italic"
                      >
                        + Add Folder
                      </button>
                    </div>
                  ) : (
                    nb.sections.map((sec) => (
                      <SwipeableRow
                        key={sec.id}
                        id={`folder-${sec.id}`}
                        isOpen={openSwipeId === `folder-${sec.id}`}
                        onOpen={(id) => setOpenSwipeId(id)}
                        onClose={() => setOpenSwipeId(null)}
                        onShare={() => handleShareFolder(sec)}
                        onMove={() => setMoveTargetFolder(sec)}
                        onDelete={() => handleDeleteFolder(sec)}
                        shareLabel="Share"
                        moveLabel="Move"
                      >
                        <button
                          onClick={() => onSelectSection(sec.id)}
                          className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 active:bg-zinc-100 dark:active:bg-zinc-800 transition-colors text-left"
                        >
                          <div className="flex items-center gap-3 min-w-0 pr-2">
                            <div className="w-8 h-8 rounded-lg bg-primary-50 dark:bg-primary-950/50 flex items-center justify-center flex-shrink-0">
                              <Folder size={18} className="text-primary-600 dark:text-primary-400" />
                            </div>
                            <span className="font-semibold text-[15px] text-zinc-900 dark:text-zinc-100 truncate">
                              {sec.title}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
                              {sec.pages.length}
                            </span>
                            <ChevronRight size={17} className="text-zinc-300 dark:text-zinc-600" />
                          </div>
                        </button>
                      </SwipeableRow>
                    ))
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Bottom Sticky Toolbar (Apple Notes Style) */}
      <div 
        className="fixed bottom-0 left-0 right-0 z-20 bg-white/85 dark:bg-zinc-950/85 backdrop-blur-xl border-t border-zinc-200/80 dark:border-zinc-800/80 px-5 py-2.5 flex items-center justify-between shadow-lg"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
      >
        <button 
          onClick={() => {
            setSelectedNotebookIdForFolder(notebooks[0]?.id || "");
            setIsNewFolderModalOpen(true);
          }}
          className="flex items-center gap-1.5 text-primary-600 dark:text-primary-400 font-semibold text-sm active:scale-95 transition-transform"
        >
          <FolderPlus size={18} />
          <span>New Folder</span>
        </button>

        <span className="text-xs text-zinc-400 font-medium">
          {totalNotesCount} {totalNotesCount === 1 ? 'Note' : 'Notes'}
        </span>

        <button 
          onClick={handleQuickNewNote}
          className="flex items-center gap-1.5 text-primary-600 dark:text-primary-400 font-semibold text-sm active:scale-95 transition-transform"
        >
          <Edit3 size={18} />
          <span>New Note</span>
        </button>
      </div>

      {/* Modal: New Notebook */}
      {isNewNotebookModalOpen && (
        <div className="fixed inset-0 z-[3000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <form 
            onSubmit={handleCreateNotebook}
            className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl p-5 shadow-2xl border border-zinc-200 dark:border-zinc-800 space-y-4"
          >
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white">New Notebook</h3>
            <input 
              type="text"
              autoFocus
              value={newNotebookTitle}
              onChange={(e) => setNewNotebookTitle(e.target.value)}
              placeholder="Notebook Name"
              className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-primary-500"
            />
            <div className="flex items-center justify-end gap-2 pt-2">
              <button 
                type="button"
                onClick={() => setIsNewNotebookModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button 
                type="submit"
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-primary-600 hover:bg-primary-700 text-white shadow-sm transition-colors"
              >
                Create
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: New Folder */}
      {isNewFolderModalOpen && (
        <div className="fixed inset-0 z-[3000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <form 
            onSubmit={handleCreateFolder}
            className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl p-5 shadow-2xl border border-zinc-200 dark:border-zinc-800 space-y-4"
          >
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white">New Folder</h3>
            
            {notebooks.length > 1 && (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Notebook</label>
                <select 
                  value={selectedNotebookIdForFolder || notebooks[0]?.id}
                  onChange={(e) => setSelectedNotebookIdForFolder(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm outline-none"
                >
                  {notebooks.map(nb => (
                    <option key={nb.id} value={nb.id}>{nb.title}</option>
                  ))}
                </select>
              </div>
            )}

            <input 
              type="text"
              autoFocus
              value={newFolderTitle}
              onChange={(e) => setNewFolderTitle(e.target.value)}
              placeholder="Folder Name"
              className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-primary-500"
            />

            <div className="flex items-center justify-end gap-2 pt-2">
              <button 
                type="button"
                onClick={() => setIsNewFolderModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button 
                type="submit"
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-primary-600 hover:bg-primary-700 text-white shadow-sm transition-colors"
              >
                Create
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Move Note to Folder */}
      {moveTargetNote && (
        <div className="fixed inset-0 z-[3000] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150">
          <div className="w-full sm:max-w-md bg-white dark:bg-zinc-900 rounded-t-3xl sm:rounded-2xl p-5 shadow-2xl border border-zinc-200 dark:border-zinc-800 space-y-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-zinc-900 dark:text-white">Move Note</h3>
                <p className="text-xs text-zinc-400 truncate max-w-[280px]">
                  &quot;{moveTargetNote.title || 'Untitled Note'}&quot;
                </p>
              </div>
              <button 
                onClick={() => setMoveTargetNote(null)}
                className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 py-1 pr-1 custom-scrollbar">
              {notebooks.map((nb) => (
                <div key={nb.id} className="space-y-1.5">
                  <div className="flex items-center gap-1.5 px-2">
                    <BookOpen size={13} className="text-zinc-400" />
                    <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">{nb.title}</span>
                  </div>

                  <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800/80 overflow-hidden bg-zinc-50/50 dark:bg-zinc-950/40">
                    {nb.sections.length === 0 ? (
                      <div className="p-3 text-xs text-zinc-400 italic">No folders</div>
                    ) : (
                      nb.sections.map((sec) => {
                        const isCurrent = sec.id === moveTargetNote.section_id;
                        return (
                          <button
                            key={sec.id}
                            disabled={isMoving}
                            onClick={() => handleConfirmMoveNote(sec.id)}
                            className={`w-full flex items-center justify-between p-3 text-left transition-colors ${
                              isCurrent 
                                ? 'bg-primary-50 dark:bg-primary-950/30' 
                                : 'hover:bg-zinc-100 dark:hover:bg-zinc-800/60 active:bg-zinc-200 dark:active:bg-zinc-800'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0 pr-2">
                              <Folder size={16} className={isCurrent ? "text-primary-600 dark:text-primary-400" : "text-zinc-400"} />
                              <span className={`text-sm truncate ${isCurrent ? 'font-bold text-primary-600 dark:text-primary-400' : 'font-medium text-zinc-800 dark:text-zinc-200'}`}>
                                {sec.title}
                              </span>
                            </div>

                            {isCurrent ? (
                              <span className="text-[11px] font-semibold text-primary-600 dark:text-primary-400 flex items-center gap-1">
                                <Check size={14} /> Current
                              </span>
                            ) : (
                              <span className="text-xs text-zinc-400 font-medium">
                                {sec.pages.length}
                              </span>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 flex justify-end">
              <button 
                type="button"
                onClick={() => setMoveTargetNote(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Move Folder to Notebook */}
      {moveTargetFolder && (
        <div className="fixed inset-0 z-[3000] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150">
          <div className="w-full sm:max-w-md bg-white dark:bg-zinc-900 rounded-t-3xl sm:rounded-2xl p-5 shadow-2xl border border-zinc-200 dark:border-zinc-800 space-y-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-zinc-900 dark:text-white">Move Folder</h3>
                <p className="text-xs text-zinc-400 truncate max-w-[280px]">
                  &quot;{moveTargetFolder.title}&quot;
                </p>
              </div>
              <button 
                onClick={() => setMoveTargetFolder(null)}
                className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 py-1 custom-scrollbar">
              <label className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 px-1">Select Destination Notebook</label>
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800/80 overflow-hidden bg-zinc-50/50 dark:bg-zinc-950/40">
                {notebooks.map((nb) => {
                  const isCurrent = nb.id === moveTargetFolder.notebook_id;
                  return (
                    <button
                      key={nb.id}
                      disabled={isMoving}
                      onClick={() => handleConfirmMoveFolder(nb.id)}
                      className={`w-full flex items-center justify-between p-3.5 text-left transition-colors ${
                        isCurrent 
                          ? 'bg-primary-50 dark:bg-primary-950/30' 
                          : 'hover:bg-zinc-100 dark:hover:bg-zinc-800/60 active:bg-zinc-200 dark:active:bg-zinc-800'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 pr-2">
                        <BookOpen size={18} className={isCurrent ? "text-primary-600 dark:text-primary-400" : "text-zinc-400"} />
                        <span className={`text-sm truncate ${isCurrent ? 'font-bold text-primary-600 dark:text-primary-400' : 'font-medium text-zinc-800 dark:text-zinc-200'}`}>
                          {nb.title}
                        </span>
                      </div>

                      {isCurrent ? (
                        <span className="text-[11px] font-semibold text-primary-600 dark:text-primary-400 flex items-center gap-1">
                          <Check size={14} /> Current
                        </span>
                      ) : (
                        <span className="text-xs text-zinc-400 font-medium">
                          {nb.sections.length} {nb.sections.length === 1 ? 'folder' : 'folders'}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 flex justify-end">
              <button 
                type="button"
                onClick={() => setMoveTargetFolder(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
