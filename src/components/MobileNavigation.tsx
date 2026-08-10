import React from "react";
import { Notebook, Section, Page } from "@/hooks/useNotebooks";
import { ChevronRight, Folder, FileText, Plus, ArrowLeft } from "lucide-react";

interface MobileNavigationProps {
  notebooks: Notebook[];
  view: 'folders' | 'notes';
  sectionId: string | null;
  onSelectSection: (sectionId: string) => void;
  onSelectPage: (pageId: string) => void;
  onBackToFolders: () => void;
  onAddNotebook: () => void;
  onAddSection: (notebookId: string) => void;
  onAddPage: (sectionId: string) => void;
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
  onAddPage
}: MobileNavigationProps) {
  
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

    return (
      <div className="flex flex-col w-full h-full bg-zinc-50 dark:bg-black">
        {/* Blurred Header */}
        <div 
          className="sticky top-0 z-10 bg-white/70 dark:bg-black/70 backdrop-blur-xl border-b border-zinc-200 dark:border-zinc-800"
          style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)' }}
        >
          <div className="flex items-center justify-between px-4 py-3">
            <button 
              onClick={onBackToFolders}
              className="flex items-center text-primary-600 dark:text-yellow-500 font-medium"
            >
              <ArrowLeft size={20} className="mr-1" />
              Folders
            </button>
            <button onClick={() => onAddPage(sectionId)} className="text-primary-600 dark:text-yellow-500">
              <Plus size={24} />
            </button>
          </div>
          <div className="px-4 pb-4">
            <h1 className="text-3xl font-bold text-zinc-900 dark:text-white tracking-tight">
              {activeSection?.title || 'Notes'}
            </h1>
          </div>
        </div>

        {/* Notes List */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {activeSection?.pages.length === 0 ? (
            <p className="text-zinc-500 text-center mt-10">No notes yet.</p>
          ) : (
            <div className="bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden shadow-sm border border-zinc-200 dark:border-zinc-800">
              {activeSection?.pages.map((page, index) => (
                <button
                  key={page.id}
                  onClick={() => onSelectPage(page.id)}
                  className={`w-full text-left px-4 py-3 flex flex-col hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors ${
                    index !== activeSection!.pages.length - 1 ? 'border-b border-zinc-100 dark:border-zinc-800' : ''
                  }`}
                >
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">{page.title || 'Untitled Note'}</span>
                  <span className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                    {new Date(page.created_at).toLocaleDateString()}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full h-full bg-zinc-50 dark:bg-black">
      {/* Blurred Header */}
      <div 
        className="sticky top-0 z-10 bg-white/70 dark:bg-black/70 backdrop-blur-xl border-b border-zinc-200 dark:border-zinc-800"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)' }}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <div className="w-6" /> {/* Spacer */}
          <button onClick={onAddNotebook} className="text-primary-600 dark:text-yellow-500">
            <Plus size={24} />
          </button>
        </div>
        <div className="px-4 pb-4">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-white tracking-tight">Folders</h1>
        </div>
      </div>

      {/* Folders List */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        {notebooks.length === 0 ? (
          <p className="text-zinc-500 text-center mt-10">No notebooks yet.</p>
        ) : (
          notebooks.map((nb) => (
            <div key={nb.id} className="space-y-2">
              <div className="flex items-center justify-between px-2">
                <h2 className="text-sm font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">{nb.title}</h2>
                <button onClick={() => onAddSection(nb.id)} className="text-primary-600 dark:text-yellow-500">
                  <Plus size={18} />
                </button>
              </div>
              
              <div className="bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden shadow-sm border border-zinc-200 dark:border-zinc-800">
                {nb.sections.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-zinc-500 italic">No sections.</p>
                ) : (
                  nb.sections.map((sec, index) => (
                    <button
                      key={sec.id}
                      onClick={() => onSelectSection(sec.id)}
                      className={`w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors ${
                        index !== nb.sections.length - 1 ? 'border-b border-zinc-100 dark:border-zinc-800' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Folder size={20} className="text-primary-500 dark:text-yellow-500" />
                        <span className="font-medium text-zinc-900 dark:text-zinc-100">{sec.title}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-zinc-400">{sec.pages.length}</span>
                        <ChevronRight size={16} className="text-zinc-400" />
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
