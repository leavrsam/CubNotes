"use client";

import React, { useEffect } from 'react';
import { Trash2, AlertTriangle, X } from 'lucide-react';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  itemType: 'notebook' | 'folder' | 'page';
  itemName: string;
  details?: string;
  isPermanent?: boolean;
}

export function DeleteConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  itemType,
  itemName,
  details,
  isPermanent = false,
}: DeleteConfirmModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const typeLabel = itemType === 'notebook' ? 'Notebook' : itemType === 'folder' ? 'Folder' : 'Note';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-2">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400 rounded-xl">
              {isPermanent ? <AlertTriangle size={20} /> : <Trash2 size={20} />}
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                {isPermanent ? `Permanently Delete ${typeLabel}?` : `Move ${typeLabel} to Trash?`}
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {isPermanent ? 'This action cannot be undone' : 'Safe 30-day retention'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-3">
          <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
            Are you sure you want to delete <span className="font-semibold text-zinc-900 dark:text-white break-words">&ldquo;{itemName}&rdquo;</span>?
          </p>

          {details && (
            <div className="p-3 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/80 dark:border-zinc-700/80 rounded-xl text-xs text-zinc-600 dark:text-zinc-400">
              {details}
            </div>
          )}

          <div className={`p-3 rounded-xl border text-xs leading-relaxed ${
            isPermanent 
              ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-300'
              : 'bg-amber-50/70 dark:bg-amber-950/20 border-amber-200/80 dark:border-amber-900/40 text-amber-800 dark:text-amber-300'
          }`}>
            {isPermanent ? (
              <span>⚠️ <strong>Permanent Deletion:</strong> This will permanently erase this {typeLabel.toLowerCase()} and its contents from CubNotes and cannot be recovered.</span>
            ) : (
              <span>📦 <strong>30-Day Trash:</strong> This will be moved to your Trash. You can restore it at any time over the next 30 days before it is permanently removed.</span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-zinc-50 dark:bg-zinc-900/90 border-t border-zinc-100 dark:border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200/70 dark:hover:bg-zinc-800 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white rounded-xl shadow-xs transition-transform active:scale-95 ${
              isPermanent
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            <Trash2 size={14} />
            <span>{isPermanent ? 'Delete Forever' : 'Move to Trash'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
