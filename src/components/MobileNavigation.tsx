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
  Check,
  Pin,
  PinOff,
  Edit2,
  Users,
  Smartphone,
  Download,
  RefreshCw
} from "lucide-react";
import { SwipeableRow, SwipeDirection } from "./SwipeableRow";
import { DeleteConfirmModal } from "./DeleteConfirmModal";
import toast from "react-hot-toast";

interface MobileNavigationProps {
  notebooks: Notebook[];
  view: 'folders' | 'notes';
  sectionId: string | null;
  onSelectSection: (sectionId: string) => void;
  onSelectPage: (pageId: string) => void;
  onBackToFolders: () => void;
  onAddNotebook: (title?: string, isJournal?: boolean) => Promise<any>;
  onAddSection: (notebookId: string, title?: string) => Promise<any>;
  onAddPage: (sectionId: string, title?: string) => Promise<any>;
  onDeletePage?: (pageId: string) => Promise<void>;
  onDeleteSection?: (sectionId: string) => Promise<void>;
  onDeleteNotebook?: (notebookId: string) => Promise<void>;
  onUpdatePage?: (id: string, title: string) => Promise<void> | void;
  onUpdateSection?: (id: string, title: string) => Promise<void> | void;
  onUpdateNotebook?: (id: string, title: string) => Promise<void> | void;
  onToggleJournalMode?: (id: string, is_journal: boolean) => Promise<void> | void;
  onMovePage?: (pageId: string, targetSectionId: string) => Promise<void>;
  onMoveSection?: (sectionId: string, targetNotebookId: string) => Promise<void>;
  onOpenSettings?: () => void;
  onOpenTrash?: () => void;
  trashCount?: number;
  onShareItem?: (type: 'notebook' | 'section' | 'page', id: string, title: string) => void;
  onRefresh?: () => void;
  userEmail?: string;
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
  onUpdatePage,
  onUpdateSection,
  onUpdateNotebook,
  onToggleJournalMode,
  onMovePage,
  onMoveSection,
  onOpenSettings,
  onOpenTrash,
  trashCount,
  onShareItem,
  onRefresh,
  userEmail
}: MobileNavigationProps) {
  const [searchQuery, setSearchQuery] = useState("");
  
  // Track swiped open item and direction: e.g. { id: 'note-123', direction: 'left' }
  const [openSwipe, setOpenSwipe] = useState<{ id: string; direction: "left" | "right" } | null>(null);

  // Drilldown to specific notebook
  const [selectedNotebookId, setSelectedNotebookId] = useState<string | null>(null);

  // Deletion confirmation modal state
  const [confirmDelete, setConfirmDelete] = useState<{
    type: 'notebook' | 'folder' | 'page';
    id: string;
    name: string;
    details?: string;
  } | null>(null);

  // Modals
  const [isNewNotebookModalOpen, setIsNewNotebookModalOpen] = useState(false);
  const [newNotebookTitle, setNewNotebookTitle] = useState("");
  const [isNewNotebookJournal, setIsNewNotebookJournal] = useState(false);
  
  const [isNewFolderModalOpen, setIsNewFolderModalOpen] = useState(false);
  const [newFolderTitle, setNewFolderTitle] = useState("");
  const [selectedNotebookIdForFolder, setSelectedNotebookIdForFolder] = useState<string>("");
  const [isDismissedApkBanner, setIsDismissedApkBanner] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        return localStorage.getItem('cubnotes_dismiss_apk_banner') === 'true';
      } catch {}
    }
    return false;
  });

  // Rename Modals
  const [renameNotebook, setRenameNotebook] = useState<{ id: string; title: string } | null>(null);
  const [renameNotebookTitle, setRenameNotebookTitle] = useState("");

  const [renameNote, setRenameNote] = useState<{ id: string; title: string } | null>(null);
  const [renameNoteTitle, setRenameNoteTitle] = useState("");

  const [renameFolder, setRenameFolder] = useState<{ id: string; title: string } | null>(null);
  const [renameFolderTitle, setRenameFolderTitle] = useState("");

  // Move Modals
  const [moveTargetNote, setMoveTargetNote] = useState<Page | null>(null);
  const [moveTargetFolder, setMoveTargetFolder] = useState<Section | null>(null);
  const [isMoving, setIsMoving] = useState(false);

  // Pinned Items State (saved in localStorage for persistence)
  const [pinnedPageIds, setPinnedPageIds] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('cubnotes_pinned_pages');
        return saved ? JSON.parse(saved) : [];
      } catch {
        return [];
      }
    }
    return [];
  });

  const [pinnedSectionIds, setPinnedSectionIds] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('cubnotes_pinned_sections');
        return saved ? JSON.parse(saved) : [];
      } catch {
        return [];
      }
    }
    return [];
  });

  // Ensure window scroll is always reset when switching views
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo(0, 0);
    }
  }, [view, sectionId, selectedNotebookId]);

  // Swipe-to-go-back gesture handling
  const touchStartX = React.useRef<number | null>(null);
  const touchStartY = React.useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    // Initiate if starting within the first 80px from the left edge
    if (touch.clientX < 80) {
      touchStartX.current = touch.clientX;
      touchStartY.current = touch.clientY;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent, onSwipeRight: () => void) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStartX.current;
    const deltaY = Math.abs(touch.clientY - touchStartY.current);

    // If swipe right was at least 65px and mostly horizontal
    if (deltaX > 65 && deltaX > deltaY * 1.3) {
      onSwipeRight();
    }
    touchStartX.current = null;
    touchStartY.current = null;
  };

  const togglePinNote = (pageId: string) => {
    setPinnedPageIds(prev => {
      const next = prev.includes(pageId) ? prev.filter(id => id !== pageId) : [...prev, pageId];
      try {
        localStorage.setItem('cubnotes_pinned_pages', JSON.stringify(next));
      } catch {}
      toast.success(next.includes(pageId) ? "Note pinned to top!" : "Note unpinned");
      return next;
    });
  };

  const togglePinFolder = (sectionId: string) => {
    setPinnedSectionIds(prev => {
      const next = prev.includes(sectionId) ? prev.filter(id => id !== sectionId) : [...prev, sectionId];
      try {
        localStorage.setItem('cubnotes_pinned_sections', JSON.stringify(next));
      } catch {}
      toast.success(next.includes(sectionId) ? "Folder pinned to top!" : "Folder unpinned");
      return next;
    });
  };

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

  // Guard against rapid duplicate button taps
  const isCreatingRef = React.useRef(false);

  const handleCreateNotebook = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isCreatingRef.current) return;
    isCreatingRef.current = true;
    const title = newNotebookTitle.trim() || "New Notebook";
    const isJournal = isNewNotebookJournal;
    setNewNotebookTitle("");
    setIsNewNotebookJournal(false);
    setIsNewNotebookModalOpen(false);
    try {
      await onAddNotebook(title, isJournal);
      toast.success(isJournal ? "Journal Notebook created!" : "Notebook created!");
    } finally {
      setTimeout(() => {
        isCreatingRef.current = false;
      }, 400);
    }
  };

  const handleCreateFolder = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isCreatingRef.current) return;
    isCreatingRef.current = true;
    const targetNbId = selectedNotebookIdForFolder || notebooks[0]?.id;
    if (!targetNbId) {
      isCreatingRef.current = false;
      return;
    }
    const title = newFolderTitle.trim() || "New Folder";
    setNewFolderTitle("");
    setIsNewFolderModalOpen(false);
    try {
      await onAddSection(targetNbId, title);
      toast.success("Folder created!");
    } finally {
      setTimeout(() => {
        isCreatingRef.current = false;
      }, 400);
    }
  };

  const handleCreateNote = async (targetSectionId?: string) => {
    if (isCreatingRef.current) return;
    isCreatingRef.current = true;
    try {
      if (targetSectionId) {
        await onAddPage(targetSectionId, "Untitled Note");
      } else {
        await handleQuickNewNote();
      }
    } finally {
      setTimeout(() => {
        isCreatingRef.current = false;
      }, 400);
    }
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
    if (onShareItem) {
      onShareItem('page', page.id, page.title || 'Untitled Note');
      return;
    }

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
    if (onShareItem) {
      onShareItem('section', section.id, section.title || 'Folder');
      return;
    }

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

  const handleShareNotebook = async (notebook: Notebook) => {
    if (onShareItem) {
      onShareItem('notebook', notebook.id, notebook.title || 'Notebook');
      return;
    }

    const title = notebook.title || 'Notebook';
    const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/?notebookId=${notebook.id}` : '';
    const shareData = {
      title,
      text: `CubNotes Notebook: ${title}`,
      url: shareUrl,
    };

    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share(shareData);
        toast.success("Notebook shared!");
        return;
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
    }

    try {
      await navigator.clipboard.writeText(shareUrl || window.location.href);
      toast.success("Notebook link copied to clipboard!");
    } catch {
      toast.error("Could not copy notebook link");
    }
  };

  const handleDeleteNote = (page: Page) => {
    setOpenSwipe(null);
    setConfirmDelete({
      type: 'page',
      id: page.id,
      name: page.title || 'Untitled Note'
    });
  };

  const handleDeleteFolder = (section: Section) => {
    setOpenSwipe(null);
    const count = (section.pages || []).length;
    setConfirmDelete({
      type: 'folder',
      id: section.id,
      name: section.title,
      details: count > 0 ? `Contains ${count} note(s).` : undefined
    });
  };

  const handleDeleteNotebook = (notebook: Notebook) => {
    setOpenSwipe(null);
    const folderCount = (notebook.sections || []).length;
    const noteCount = (notebook.sections || []).reduce((acc, s) => acc + (s.pages || []).length, 0);
    setConfirmDelete({
      type: 'notebook',
      id: notebook.id,
      name: notebook.title,
      details: folderCount > 0 || noteCount > 0 ? `Contains ${folderCount} folder(s) and ${noteCount} note(s).` : undefined
    });
  };

  const executeConfirmDelete = async () => {
    if (!confirmDelete) return;
    const { type, id } = confirmDelete;
    setConfirmDelete(null);

    if (type === 'page' && onDeletePage) {
      setPinnedPageIds(prev => {
        const next = prev.filter(pid => pid !== id);
        try { localStorage.setItem('cubnotes_pinned_pages', JSON.stringify(next)); } catch {}
        return next;
      });
      await onDeletePage(id);
      toast.success("Note moved to Trash");
    } else if (type === 'folder' && onDeleteSection) {
      setPinnedSectionIds(prev => {
        const next = prev.filter(sid => sid !== id);
        try { localStorage.setItem('cubnotes_pinned_sections', JSON.stringify(next)); } catch {}
        return next;
      });
      await onDeleteSection(id);
      toast.success("Folder moved to Trash");
    } else if (type === 'notebook' && onDeleteNotebook) {
      if (selectedNotebookId === id) {
        setSelectedNotebookId(null);
      }
      await onDeleteNotebook(id);
      toast.success("Notebook moved to Trash");
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

  const handleOpenRenameNotebook = (nb: Notebook) => {
    setRenameNotebook(nb);
    setRenameNotebookTitle(nb.title || "New Notebook");
  };

  const handleConfirmRenameNotebook = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!renameNotebook || !onUpdateNotebook) return;
    const targetId = renameNotebook.id;
    const newTitle = renameNotebookTitle.trim() || "New Notebook";
    setRenameNotebook(null);
    await onUpdateNotebook(targetId, newTitle);
    toast.success("Notebook renamed");
  };

  const handleOpenRenameNote = (page: Page) => {
    setRenameNote(page);
    setRenameNoteTitle(page.title || "Untitled Note");
  };

  const handleConfirmRenameNote = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!renameNote || !onUpdatePage) return;
    const targetId = renameNote.id;
    const newTitle = renameNoteTitle.trim() || "Untitled Note";
    setRenameNote(null);
    await onUpdatePage(targetId, newTitle);
    toast.success("Note renamed");
  };

  const handleOpenRenameFolder = (section: Section) => {
    setRenameFolder(section);
    setRenameFolderTitle(section.title || "New Folder");
  };

  const handleConfirmRenameFolder = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!renameFolder || !onUpdateSection) return;
    const targetId = renameFolder.id;
    const newTitle = renameFolderTitle.trim() || "New Folder";
    setRenameFolder(null);
    await onUpdateSection(targetId, newTitle);
    toast.success("Folder renamed");
  };

  // --- NOTES VIEW (Inside a specific folder) ---
  const renderNotesView = () => {
    let activeSection: Section | null = null;
    let parentNotebook: Notebook | null = null;
    
    for (const nb of (notebooks || [])) {
      const sec = (nb.sections || []).find(s => s.id === sectionId);
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
      <div 
        className="fixed inset-0 w-full h-[100dvh] flex flex-col bg-zinc-50 dark:bg-black overflow-hidden select-none"
        onTouchStart={handleTouchStart}
        onTouchEnd={(e) => handleTouchEnd(e, onBackToFolders)}
      >
        {/* Top Header */}
        <div 
          className="flex-shrink-0 bg-white/90 dark:bg-black/90 backdrop-blur-xl border-b border-zinc-200/80 dark:border-zinc-800 z-20"
          style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)' }}
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
              onClick={() => handleCreateNote(sectionId || undefined)}
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
                onClick={() => handleCreateNote(sectionId || undefined)}
                className="mt-4 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-full text-xs font-semibold shadow-sm active:scale-95 transition-transform"
              >
                + Create Note
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Pinned Notes Section */}
              {filteredPages.some(p => pinnedPageIds.includes(p.id)) && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 px-2 text-xs font-bold text-amber-500 uppercase tracking-wider">
                    <Pin size={13} className="fill-amber-500" />
                    <span>Pinned</span>
                  </div>
                  <div className="bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden shadow-sm border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800/80">
                    {filteredPages.filter(p => pinnedPageIds.includes(p.id)).map((page) => (
                      <SwipeableRow
                        key={page.id}
                        id={`note-${page.id}`}
                        openDirection={openSwipe?.id === `note-${page.id}` ? openSwipe.direction : null}
                        onOpen={(id, direction) => setOpenSwipe({ id, direction })}
                        onClose={() => setOpenSwipe(null)}
                        onShare={() => handleShareNote(page)}
                        onMove={() => setMoveTargetNote(page)}
                        onDelete={() => handleDeleteNote(page)}
                        onPin={() => togglePinNote(page.id)}
                        isPinned={true}
                        onRename={() => handleOpenRenameNote(page)}
                        shareLabel="Share"
                        moveLabel="Move"
                      >
                        <div className="flex items-center justify-between px-4 py-3.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 active:bg-zinc-100 dark:active:bg-zinc-800 transition-colors">
                          <button
                            onClick={() => onSelectPage(page.id)}
                            className="flex-1 text-left flex flex-col min-w-0 pr-3"
                          >
                            <div className="flex items-center gap-1.5">
                              <Pin size={13} className="text-amber-500 fill-amber-500 flex-shrink-0" />
                              <span className="font-semibold text-[15px] text-zinc-900 dark:text-zinc-100 truncate flex items-center gap-1.5">
                                <span>{page.title || 'Untitled Note'}</span>
                                {page.isShared && (
                                  <span title="Shared Note" className="inline-flex items-center">
                                    <Users size={12} className="text-primary-500 shrink-0" />
                                  </span>
                                )}
                              </span>
                            </div>
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
                </div>
              )}

              {/* Regular Notes Section */}
              <div className="space-y-1.5">
                {filteredPages.some(p => pinnedPageIds.includes(p.id)) && (
                  <div className="px-2 text-xs font-bold text-zinc-400 uppercase tracking-wider">
                    Notes
                  </div>
                )}
                <div className="bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden shadow-sm border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800/80">
                  {filteredPages.filter(p => !pinnedPageIds.includes(p.id)).map((page) => (
                    <SwipeableRow
                      key={page.id}
                      id={`note-${page.id}`}
                      openDirection={openSwipe?.id === `note-${page.id}` ? openSwipe.direction : null}
                      onOpen={(id, direction) => setOpenSwipe({ id, direction })}
                      onClose={() => setOpenSwipe(null)}
                      onShare={() => handleShareNote(page)}
                      onMove={() => setMoveTargetNote(page)}
                      onDelete={() => handleDeleteNote(page)}
                      onPin={() => togglePinNote(page.id)}
                      isPinned={false}
                      onRename={() => handleOpenRenameNote(page)}
                      shareLabel="Share"
                      moveLabel="Move"
                    >
                      <div className="flex items-center justify-between px-4 py-3.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 active:bg-zinc-100 dark:active:bg-zinc-800 transition-colors">
                        <button
                          onClick={() => onSelectPage(page.id)}
                          className="flex-1 text-left flex flex-col min-w-0 pr-3"
                        >
                          <span className="font-semibold text-[15px] text-zinc-900 dark:text-zinc-100 truncate flex items-center gap-1.5">
                            <span>{page.title || 'Untitled Note'}</span>
                            {page.isShared && (
                              <Users size={12} className="text-primary-500 shrink-0" title="Shared Note" />
                            )}
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
              </div>
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
            onClick={() => handleCreateNote(sectionId || undefined)}
            className="flex items-center gap-1 text-primary-600 dark:text-primary-400 font-semibold text-sm active:scale-95 transition-transform"
          >
            <Edit3 size={17} />
            <span>New Note</span>
          </button>
        </div>
      </div>
    );
  };

  // --- SINGLE NOTEBOOK VIEW (When clicking into a notebook) ---
  const renderSingleNotebookView = (activeNotebook: Notebook) => {
    const matchingSections = (activeNotebook.sections || []).filter(sec => {
      if (!searchQuery.trim()) return true;
      const matchesSection = (sec.title || "").toLowerCase().includes(searchQuery.toLowerCase());
      const matchesPage = (sec.pages || []).some(p => (p.title || "").toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesSection || matchesPage;
    });

    return (
      <div 
        className="fixed inset-0 w-full h-[100dvh] flex flex-col bg-zinc-50 dark:bg-black overflow-hidden select-none"
        onTouchStart={handleTouchStart}
        onTouchEnd={(e) => handleTouchEnd(e, () => setSelectedNotebookId(null))}
      >
        {/* Top Header */}
        <div 
          className="flex-shrink-0 bg-white/90 dark:bg-black/90 backdrop-blur-xl border-b border-zinc-200/80 dark:border-zinc-800 z-20"
          style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)' }}
        >
          <div className="flex items-center justify-between px-4 py-2.5">
            <button 
              onClick={() => setSelectedNotebookId(null)}
              className="flex items-center gap-1 text-primary-600 dark:text-primary-400 font-semibold text-[15px] active:scale-95 transition-transform"
            >
              <ArrowLeft size={19} className="-ml-1" />
              <span>Notebooks</span>
            </button>

            <div className="flex items-center gap-2">
              <button 
                onClick={() => handleOpenRenameNotebook(activeNotebook)}
                className="p-1.5 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white rounded-full bg-zinc-100 dark:bg-zinc-800 transition-colors"
                title="Rename Notebook"
              >
                <Edit2 size={15} />
              </button>

              <button 
                onClick={() => handleDeleteNotebook(activeNotebook)}
                className="p-1.5 text-zinc-400 hover:text-red-500 dark:hover:text-red-400 rounded-full bg-zinc-100 dark:bg-zinc-800 transition-colors active:scale-90"
                title="Delete Notebook"
              >
                <Trash2 size={15} />
              </button>

              <button 
                onClick={() => {
                  setSelectedNotebookIdForFolder(activeNotebook.id);
                  setIsNewFolderModalOpen(true);
                }}
                className="px-3 py-1 bg-primary-600 hover:bg-primary-500 text-white rounded-full text-xs font-semibold shadow-sm transition-colors flex items-center gap-1 active:scale-95"
                title="Add Folder"
              >
                <Plus size={14} />
                <span>Folder</span>
              </button>
            </div>
          </div>

          <div className="px-4 pt-1 pb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              {activeNotebook.is_journal ? (
                <BookOpen size={24} className="text-amber-500 flex-shrink-0" />
              ) : (
                <Folder size={24} className="text-primary-600 dark:text-primary-400 flex-shrink-0" />
              )}
              <h1 
                onClick={() => handleOpenRenameNotebook(activeNotebook)}
                className="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight truncate cursor-pointer hover:opacity-80 active:scale-[0.99] transition-all flex items-center gap-2"
                title="Click to rename notebook"
              >
                <span>{activeNotebook.title}</span>
                <Edit2 size={16} className="text-zinc-400 opacity-60 inline flex-shrink-0" />
              </h1>
            </div>

            {onToggleJournalMode && (
              <button
                type="button"
                onClick={() => {
                  onToggleJournalMode(activeNotebook.id, !activeNotebook.is_journal);
                  toast.success(!activeNotebook.is_journal ? `"${activeNotebook.title}" switched to Journal mode` : `"${activeNotebook.title}" switched to Standard mode`);
                }}
                className={`p-1.5 rounded-lg transition-colors flex items-center justify-center ${
                  activeNotebook.is_journal 
                    ? 'bg-amber-500/15 text-amber-500 border border-amber-500/30' 
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 hover:text-amber-500 dark:hover:text-amber-400'
                }`}
                title={activeNotebook.is_journal ? "Journal Mode enabled (Click to switch to Standard)" : "Enable Journal Mode"}
              >
                <BookOpen size={16} className={activeNotebook.is_journal ? "fill-amber-500/20" : ""} />
              </button>
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
                placeholder={`Search folders in ${activeNotebook.title}...`}
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

        {/* Folders in this Notebook */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-24">
          {(activeNotebook.sections || []).length === 0 ? (
            <div className="flex flex-col items-center justify-center mt-16 text-center text-zinc-400">
              <Folder size={46} className="opacity-30 mb-3 text-primary-500" />
              <p className="text-base font-semibold text-zinc-700 dark:text-zinc-300">No folders yet</p>
              <p className="text-xs text-zinc-400 mt-1 max-w-[240px]">Add a folder to organize notes in this notebook.</p>
              <button 
                onClick={() => {
                  setSelectedNotebookIdForFolder(activeNotebook.id);
                  setIsNewFolderModalOpen(true);
                }}
                className="mt-5 px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-full text-xs font-semibold shadow-md active:scale-95 transition-transform"
              >
                + Create Folder
              </button>
            </div>
          ) : (
            <div className="bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden shadow-sm border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800/80">
              {[...matchingSections]
                .sort((a, b) => {
                  const aPinned = pinnedSectionIds.includes(a.id);
                  const bPinned = pinnedSectionIds.includes(b.id);
                  if (aPinned && !bPinned) return -1;
                  if (!aPinned && bPinned) return 1;
                  return (a.sort_order || 0) - (b.sort_order || 0);
                })
                .map((sec) => (
                  <SwipeableRow
                    key={sec.id}
                    id={`folder-${sec.id}`}
                    openDirection={openSwipe?.id === `folder-${sec.id}` ? openSwipe.direction : null}
                    onOpen={(id, direction) => setOpenSwipe({ id, direction })}
                    onClose={() => setOpenSwipe(null)}
                    onShare={() => handleShareFolder(sec)}
                    onMove={() => setMoveTargetFolder(sec)}
                    onDelete={() => handleDeleteFolder(sec)}
                    onPin={() => togglePinFolder(sec.id)}
                    isPinned={pinnedSectionIds.includes(sec.id)}
                    onRename={() => handleOpenRenameFolder(sec)}
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
                        <div className="flex items-center gap-1.5 min-w-0">
                          {pinnedSectionIds.includes(sec.id) && (
                            <Pin size={13} className="text-amber-500 fill-amber-500 flex-shrink-0" />
                          )}
                          <span className="font-semibold text-[15px] text-zinc-900 dark:text-zinc-100 truncate flex items-center gap-1.5">
                            <span>{sec.title}</span>
                            {sec.isShared && (
                              <span title="Shared Folder" className="inline-flex items-center">
                                <Users size={12} className="text-primary-500 shrink-0" />
                              </span>
                            )}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">
                          {(sec.pages || []).length}
                        </span>
                        <ChevronRight size={17} className="text-zinc-300 dark:text-zinc-600" />
                      </div>
                    </button>
                  </SwipeableRow>
                ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  // --- MAIN FOLDERS VIEW ---
  const renderAllNotebooksView = () => (
    <div className="fixed inset-0 w-full h-[100dvh] flex flex-col bg-zinc-50 dark:bg-black overflow-hidden select-none">
      {/* Top Header */}
      <div 
        className="flex-shrink-0 bg-white/90 dark:bg-black/90 backdrop-blur-xl border-b border-zinc-200/80 dark:border-zinc-800 z-20"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)' }}
      >
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="CubNotes" className="w-6 h-6 object-contain" />
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

            {onOpenTrash && (
              <button 
                onClick={onOpenTrash}
                className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors relative"
                title="Trash"
              >
                <Trash2 size={18} />
                {trashCount != null && trashCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center">
                    {trashCount > 9 ? '9+' : trashCount}
                  </span>
                )}
              </button>
            )}

            {onRefresh && (
              <button 
                onClick={() => {
                  toast.loading("Syncing notes from cloud...", { id: "sync-toast" });
                  onRefresh();
                  setTimeout(() => toast.success("Notes synced!", { id: "sync-toast" }), 800);
                }}
                className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors"
                title="Sync Notes"
              >
                <RefreshCw size={17} />
              </button>
            )}

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
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-24">
        {/* Android APK Download Banner for Screen-Off Recording */}
        {typeof window !== 'undefined' && !isDismissedApkBanner && !((window as any).Capacitor?.isNativePlatform?.()) && (
          <div className="p-3.5 bg-gradient-to-r from-primary-950/40 via-zinc-900/90 to-zinc-900 border border-primary-500/30 rounded-2xl flex items-center justify-between gap-3 shadow-md animate-in fade-in duration-200">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-primary-600/20 border border-primary-500/40 flex items-center justify-center text-primary-400 shrink-0">
                <Smartphone size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-white flex items-center gap-1.5 truncate">
                  Record with Screen Off
                </p>
                <p className="text-[11px] text-zinc-400 truncate">
                  Download Android APK for background audio
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <a
                href="/CubNotes.apk"
                download="CubNotes.apk"
                className="px-3 py-1.5 bg-primary-600 hover:bg-primary-500 text-white rounded-xl text-xs font-semibold shadow-sm flex items-center gap-1.5 active:scale-95 transition-transform"
              >
                <Download size={13} />
                <span>APK</span>
              </a>
              <button
                type="button"
                onClick={() => {
                  setIsDismissedApkBanner(true);
                  try { localStorage.setItem('cubnotes_dismiss_apk_banner', 'true'); } catch {}
                }}
                className="p-1 text-zinc-500 hover:text-zinc-300 rounded-lg"
                title="Dismiss"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}
        {notebooks.length === 0 ? (
          <div className="flex flex-col items-center justify-center mt-14 text-center text-zinc-400 px-4">
            <Folder size={46} className="opacity-30 mb-3 text-primary-500" />
            <p className="text-base font-semibold text-zinc-700 dark:text-zinc-300">No folders yet</p>
            {userEmail && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                Signed in as <strong className="text-zinc-700 dark:text-zinc-200">{userEmail}</strong>
              </p>
            )}
            <p className="text-xs text-zinc-400 mt-1 max-w-[260px]">
              If you have notes under another email, switch accounts in Settings or tap Sync below.
            </p>
            <div className="flex items-center gap-2 mt-5">
              {onRefresh && (
                <button 
                  onClick={() => {
                    toast.loading("Syncing notes from cloud...", { id: "sync-toast" });
                    onRefresh();
                    setTimeout(() => toast.success("Notes synced!", { id: "sync-toast" }), 800);
                  }}
                  className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 rounded-full text-xs font-semibold shadow-sm flex items-center gap-1.5 active:scale-95 transition-transform"
                >
                  <RefreshCw size={14} />
                  <span>Sync Cloud</span>
                </button>
              )}
              <button 
                onClick={() => setIsNewNotebookModalOpen(true)}
                className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-full text-xs font-semibold shadow-md active:scale-95 transition-transform"
              >
                + Create Notebook
              </button>
            </div>
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
                <SwipeableRow
                  id={`notebook-${nb.id}`}
                  openDirection={openSwipe?.id === `notebook-${nb.id}` ? openSwipe.direction : null}
                  onOpen={(id, direction) => setOpenSwipe({ id, direction })}
                  onClose={() => setOpenSwipe(null)}
                  onShare={() => handleShareNotebook(nb)}
                  onRename={() => handleOpenRenameNotebook(nb)}
                  onDelete={() => handleDeleteNotebook(nb)}
                  onToggleJournal={onToggleJournalMode ? () => {
                    onToggleJournalMode(nb.id, !nb.is_journal);
                    toast.success(!nb.is_journal ? `"${nb.title}" switched to Journal mode` : `"${nb.title}" switched to Standard mode`);
                  } : undefined}
                  isJournal={nb.is_journal}
                  className="rounded-xl overflow-hidden"
                  leftActionsWidth={80}
                  rightActionsWidth={onToggleJournalMode ? 230 : 150}
                >
                  <div className="flex items-center justify-between px-3 py-2 bg-zinc-100/80 dark:bg-zinc-800/60 rounded-xl hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition-colors">
                    <button 
                      onClick={() => setSelectedNotebookId(nb.id)}
                      className="flex items-center gap-2 text-left group min-w-0 flex-1 py-0.5"
                      title={`View folders in ${nb.title}`}
                    >
                      {nb.is_journal ? (
                        <BookOpen size={15} className="text-amber-500 flex-shrink-0" />
                      ) : (
                        <Folder size={15} className="text-zinc-400 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors flex-shrink-0" />
                      )}
                      <h2 className="text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider truncate group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors flex items-center gap-1.5">
                        <span>{nb.title}</span>
                        {nb.isShared && (
                          <span title="Shared Notebook" className="inline-flex items-center">
                            <Users size={12} className="text-primary-500 shrink-0" />
                          </span>
                        )}
                      </h2>
                      {nb.is_journal && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex-shrink-0">
                          Journal
                        </span>
                      )}
                      <ChevronRight size={13} className="text-zinc-400 dark:text-zinc-500 opacity-60 group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
                    </button>

                    <div className="flex items-center gap-2 pl-2 flex-shrink-0">
                      <button 
                        onClick={() => {
                          setSelectedNotebookIdForFolder(nb.id);
                          setIsNewFolderModalOpen(true);
                        }}
                        className="text-xs font-semibold text-primary-600 dark:text-primary-400 flex items-center gap-0.5 hover:underline px-1.5 py-0.5"
                        title="Add Folder"
                      >
                        <Plus size={14} />
                        <span>Folder</span>
                      </button>
                    </div>
                  </div>
                </SwipeableRow>
                
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
                    [...nb.sections]
                      .sort((a, b) => {
                        const aPinned = pinnedSectionIds.includes(a.id);
                        const bPinned = pinnedSectionIds.includes(b.id);
                        if (aPinned && !bPinned) return -1;
                        if (!aPinned && bPinned) return 1;
                        return (a.sort_order || 0) - (b.sort_order || 0);
                      })
                      .map((sec) => (
                        <SwipeableRow
                          key={sec.id}
                          id={`folder-${sec.id}`}
                          openDirection={openSwipe?.id === `folder-${sec.id}` ? openSwipe.direction : null}
                          onOpen={(id, direction) => setOpenSwipe({ id, direction })}
                          onClose={() => setOpenSwipe(null)}
                          onShare={() => handleShareFolder(sec)}
                          onMove={() => setMoveTargetFolder(sec)}
                          onDelete={() => handleDeleteFolder(sec)}
                          onPin={() => togglePinFolder(sec.id)}
                          isPinned={pinnedSectionIds.includes(sec.id)}
                          onRename={() => handleOpenRenameFolder(sec)}
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
                              <div className="flex items-center gap-1.5 min-w-0">
                                {pinnedSectionIds.includes(sec.id) && (
                                  <Pin size={13} className="text-amber-500 fill-amber-500 flex-shrink-0" />
                                )}
                                <span className="font-semibold text-[15px] text-zinc-900 dark:text-zinc-100 truncate">
                                  {sec.title}
                                </span>
                              </div>
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
          onClick={() => handleCreateNote()}
          className="flex items-center gap-1.5 text-primary-600 dark:text-primary-400 font-semibold text-sm active:scale-95 transition-transform"
        >
          <Edit3 size={18} />
          <span>New Note</span>
        </button>
      </div>
    </div>
  );

  // Main Component Render
  const activeNotebook = selectedNotebookId ? (notebooks || []).find(nb => nb.id === selectedNotebookId) : null;

  return (
    <>
      {view === 'notes' && sectionId
        ? renderNotesView()
        : activeNotebook
        ? renderSingleNotebookView(activeNotebook)
        : renderAllNotebooksView()}

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

            {/* Journal Mode Toggle Switch */}
            <div 
              onClick={() => setIsNewNotebookJournal(!isNewNotebookJournal)}
              className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-colors ${
                isNewNotebookJournal 
                  ? 'bg-amber-500/10 border-amber-500/30' 
                  : 'bg-zinc-50 dark:bg-zinc-800/60 border-zinc-200 dark:border-zinc-700/60'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <BookOpen size={18} className={isNewNotebookJournal ? "text-amber-500" : "text-zinc-400"} />
                <div>
                  <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Journal Mode</div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Permanent audio & daily reflection prompts</div>
                </div>
              </div>
              <div className={`w-5 h-5 rounded-md flex items-center justify-center border transition-colors ${
                isNewNotebookJournal 
                  ? 'bg-amber-500 border-amber-500 text-white' 
                  : 'border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800'
              }`}>
                {isNewNotebookJournal && <Check size={13} strokeWidth={3} />}
              </div>
            </div>

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

      {/* Modal: Rename Notebook */}
      {renameNotebook && (
        <div className="fixed inset-0 z-[3000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <form 
            onSubmit={handleConfirmRenameNotebook}
            className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl p-5 shadow-2xl border border-zinc-200 dark:border-zinc-800 space-y-4"
          >
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Rename Notebook</h3>
            <input 
              type="text" 
              autoFocus
              value={renameNotebookTitle}
              onChange={(e) => setRenameNotebookTitle(e.target.value)}
              placeholder="Notebook Title"
              className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-primary-500"
            />
            <div className="flex items-center justify-end gap-2 pt-2">
              <button 
                type="button"
                onClick={() => setRenameNotebook(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button 
                type="submit"
                disabled={!renameNotebookTitle.trim()}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-primary-600 hover:bg-primary-700 text-white shadow-sm disabled:opacity-50 transition-colors"
              >
                Save
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Rename Note */}
      {renameNote && (
        <div className="fixed inset-0 z-[3000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <form 
            onSubmit={handleConfirmRenameNote}
            className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl p-5 shadow-2xl border border-zinc-200 dark:border-zinc-800 space-y-4"
          >
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Rename Note</h3>
            <input 
              type="text"
              autoFocus
              value={renameNoteTitle}
              onChange={(e) => setRenameNoteTitle(e.target.value)}
              placeholder="Note Title"
              className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-primary-500"
            />
            <div className="flex items-center justify-end gap-2 pt-2">
              <button 
                type="button"
                onClick={() => setRenameNote(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button 
                type="submit"
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-primary-600 hover:bg-primary-700 text-white shadow-sm transition-colors"
              >
                Save
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Rename Folder */}
      {renameFolder && (
        <div className="fixed inset-0 z-[3000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <form 
            onSubmit={handleConfirmRenameFolder}
            className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl p-5 shadow-2xl border border-zinc-200 dark:border-zinc-800 space-y-4"
          >
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Rename Folder</h3>
            <input 
              type="text"
              autoFocus
              value={renameFolderTitle}
              onChange={(e) => setRenameFolderTitle(e.target.value)}
              placeholder="Folder Name"
              className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-primary-500"
            />
            <div className="flex items-center justify-end gap-2 pt-2">
              <button 
                type="button"
                onClick={() => setRenameFolder(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button 
                type="submit"
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-primary-600 hover:bg-primary-700 text-white shadow-sm transition-colors"
              >
                Save
              </button>
            </div>
          </form>
        </div>
      )}

      {confirmDelete && (
        <DeleteConfirmModal
          isOpen={true}
          onClose={() => setConfirmDelete(null)}
          onConfirm={executeConfirmDelete}
          itemType={confirmDelete.type}
          itemName={confirmDelete.name}
          details={confirmDelete.details}
          isPermanent={false}
        />
      )}
    </>
  );
}
