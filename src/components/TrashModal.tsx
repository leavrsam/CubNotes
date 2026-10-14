"use client";

import React, { useState, useMemo } from 'react';
import { 
  Trash2, 
  RotateCcw, 
  X, 
  Search, 
  Book, 
  Folder, 
  FileText, 
  AlertTriangle, 
  Clock, 
  Sparkles,
  RefreshCw,
  FolderOpen
} from 'lucide-react';
import { TrashItem } from '@/hooks/useNotebooks';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import toast from 'react-hot-toast';

interface TrashModalProps {
  isOpen: boolean;
  onClose: () => void;
  trash: TrashItem[];
  onRestore: (id: string) => Promise<boolean | void>;
  onPermanentDelete: (id: string) => Promise<void>;
  onEmptyTrash: () => Promise<void>;
  onOpenEmergencyRecovery?: () => void;
}

export function TrashModal({
  isOpen,
  onClose,
  trash,
  onRestore,
  onPermanentDelete,
  onEmptyTrash,
  onOpenEmergencyRecovery,
}: TrashModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'notebook' | 'section' | 'page'>('all');
  const [confirmDeleteTarget, setConfirmDeleteTarget] = useState<TrashItem | null>(null);
  const [isConfirmingEmptyTrash, setIsConfirmingEmptyTrash] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
    return trash.filter(item => {
      if (filterType !== 'all' && item.type !== filterType) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = item.title.toLowerCase().includes(q);
        const matchesParent = (item.notebookTitle || '').toLowerCase().includes(q) || (item.sectionTitle || '').toLowerCase().includes(q);
        return matchesTitle || matchesParent;
      }
      return true;
    });
  }, [trash, filterType, searchQuery]);

  if (!isOpen) return null;

  const getDaysRemaining = (deletedAt: string) => {
    const deletedTime = new Date(deletedAt).getTime();
    const now = Date.now();
    const elapsedDays = Math.floor((now - deletedTime) / (1000 * 60 * 60 * 24));
    const remainingDays = Math.max(0, 30 - elapsedDays);
    return remainingDays;
  };

  const handleRestore = async (item: TrashItem) => {
    setRestoringId(item.id);
    try {
      await onRestore(item.id);
      const label = item.type === 'notebook' ? 'Notebook' : item.type === 'section' ? 'Folder' : 'Note';
      toast.success(`${label} "${item.title}" restored!`);
    } catch {
      toast.error('Failed to restore item');
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
        <div 
          className="w-full max-w-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/80">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 rounded-xl">
                <Trash2 size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                    Trash & Archive
                  </h2>
                  <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                    {trash.length} {trash.length === 1 ? 'item' : 'items'}
                  </span>
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Items remain in Trash for 30 days before being permanently deleted
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {trash.length > 0 && (
                <button
                  onClick={() => setIsConfirmingEmptyTrash(true)}
                  className="px-3 py-1.5 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-xl transition-colors"
                >
                  Empty Trash
                </button>
              )}
              <button
                onClick={onClose}
                className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row gap-3 items-center justify-between bg-zinc-50/30 dark:bg-zinc-900/30">
            <div className="relative w-full sm:w-72">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                placeholder="Search deleted items..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl pl-9 pr-3 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            {/* Type filters */}
            <div className="flex items-center gap-1 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
              {(['all', 'notebook', 'section', 'page'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors capitalize ${
                    filterType === type
                      ? 'bg-primary-600 text-white font-semibold'
                      : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  {type === 'section' ? 'Folders' : type === 'page' ? 'Notes' : type === 'notebook' ? 'Notebooks' : 'All'}
                </button>
              ))}
            </div>
          </div>

          {/* Content List */}
          <div className="flex-1 overflow-y-auto p-4 divide-y divide-zinc-100 dark:divide-zinc-800/50">
            {filteredItems.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
                <div className="p-4 bg-zinc-100 dark:bg-zinc-800/60 rounded-full text-zinc-400">
                  <FolderOpen size={32} />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                    {searchQuery ? 'No matching items in Trash' : 'Trash is empty'}
                  </h4>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mt-1">
                    Deleted notebooks, folders, and notes will show up here for 30 days before permanent deletion.
                  </p>
                </div>
              </div>
            ) : (
              filteredItems.map((item) => {
                const daysLeft = getDaysRemaining(item.deletedAt);
                const Icon = item.type === 'notebook' ? Book : item.type === 'section' ? Folder : FileText;
                const isRestoring = restoringId === item.id;

                return (
                  <div 
                    key={item.id} 
                    className="py-3 flex items-center justify-between gap-3 group hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 px-2 rounded-xl transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className={`p-2 rounded-lg shrink-0 ${
                        item.type === 'notebook'
                          ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400'
                          : item.type === 'section'
                          ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400'
                          : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                      }`}>
                        <Icon size={16} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                            {item.title}
                          </h4>
                          <span className="shrink-0 text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                            {item.type === 'section' ? 'Folder' : item.type === 'page' ? 'Note' : 'Notebook'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                          {(item.notebookTitle || item.sectionTitle) && (
                            <span className="truncate max-w-[200px]">
                              from {[item.notebookTitle, item.sectionTitle].filter(Boolean).join(' / ')}
                            </span>
                          )}
                          <span>•</span>
                          <span className="flex items-center gap-1 shrink-0 text-amber-600 dark:text-amber-400 font-medium">
                            <Clock size={11} />
                            {daysLeft === 0 ? 'Expires today' : `${daysLeft} days left`}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleRestore(item)}
                        disabled={isRestoring}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
                        title="Restore item"
                      >
                        <RotateCcw size={13} className={isRestoring ? 'animate-spin' : ''} />
                        <span>Restore</span>
                      </button>
                      <button
                        onClick={() => setConfirmDeleteTarget(item)}
                        className="p-1.5 text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl transition-colors"
                        title="Permanently delete"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer with Emergency Deep Scan option */}
          <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/90 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
              <Sparkles size={14} className="text-amber-500 shrink-0" />
              <span>Lost a notebook deleted prior to the 30-day Trash update?</span>
            </div>
            {onOpenEmergencyRecovery && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenEmergencyRecovery();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-950/30 rounded-xl transition-colors border border-primary-200 dark:border-primary-900/50"
              >
                <RefreshCw size={12} />
                <span>Deep Scan / Recovery Tool</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation modal for permanent deletion of single item */}
      {confirmDeleteTarget && (
        <DeleteConfirmModal
          isOpen={true}
          onClose={() => setConfirmDeleteTarget(null)}
          onConfirm={async () => {
            const target = confirmDeleteTarget;
            setConfirmDeleteTarget(null);
            await onPermanentDelete(target.id);
            toast.success(`"${target.title}" permanently erased`);
          }}
          itemType={confirmDeleteTarget.type === 'section' ? 'folder' : confirmDeleteTarget.type}
          itemName={confirmDeleteTarget.title}
          isPermanent={true}
          details="This item will be permanently removed from CubNotes and cannot be recovered."
        />
      )}

      {/* Confirmation modal for Empty Trash */}
      {isConfirmingEmptyTrash && (
        <DeleteConfirmModal
          isOpen={true}
          onClose={() => setIsConfirmingEmptyTrash(false)}
          onConfirm={async () => {
            setIsConfirmingEmptyTrash(false);
            await onEmptyTrash();
            toast.success("Trash emptied");
          }}
          itemType="notebook"
          itemName={`All ${trash.length} items in Trash`}
          isPermanent={true}
          details="All deleted notebooks, folders, and notes will be permanently erased. This action cannot be undone."
        />
      )}
    </>
  );
}
