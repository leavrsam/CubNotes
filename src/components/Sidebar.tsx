"use client";

import React, { useState, useRef, useEffect } from "react";
import { Book, Folder, FileText, ChevronRight, ChevronDown, Plus, MoreVertical, Edit2, Trash2, Settings, Search, Loader2, PanelLeftClose } from "lucide-react";
import { Notebook, Section, Page } from "@/hooks/useNotebooks";

interface SidebarProps {
  notebooks: Notebook[];
  selectedPageId: string | null;
  onSelectPage: (pageId: string) => void;
  onAddNotebook: () => void;
  onUpdateNotebook: (id: string, title: string) => void;
  onDeleteNotebook: (id: string) => void;
  onAddSection: (notebookId: string) => void;
  onUpdateSection: (id: string, title: string) => void;
  onDeleteSection: (id: string) => void;
  onAddPage: (sectionId: string) => void;
  onUpdatePage: (id: string, title: string) => void;
  onDeletePage: (id: string) => void;
  onClose?: () => void;
  onOpenSettings?: () => void;
  onJumpToCoordinates?: (pageId: string, x: number, y: number) => void;
  user?: any;
}

export function Sidebar({ 
  notebooks, selectedPageId, onSelectPage,
  onAddNotebook, onUpdateNotebook, onDeleteNotebook,
  onAddSection, onUpdateSection, onDeleteSection,
  onAddPage, onUpdatePage, onDeletePage,
  onClose, onOpenSettings, onJumpToCoordinates, user
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchScope, setSearchScope] = useState<'global' | 'local'>('global');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);

  const handleSearch = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      setIsSearching(true);
      try {
        const res = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            query: searchQuery,
            pageId: searchScope === 'local' ? selectedPageId : undefined
          })
        });
        const data = await res.json();
        setSearchResults(data.matches || []);
      } catch (err) {
        console.error(err);
      } finally {
        setIsSearching(false);
      }
    }
  };

  return (
    <aside className="w-64 bg-zinc-950 text-zinc-300 h-screen flex flex-col border-r border-zinc-800 flex-shrink-0">
      <div className="p-4 border-b border-zinc-800 flex items-center justify-between group">
        <h1 className="text-lg font-bold text-zinc-100 tracking-tight flex items-center gap-2">
          CubNotes
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
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearch}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-md py-1.5 pl-8 pr-16 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 text-zinc-200 placeholder:text-zinc-600"
          />
          <div className="absolute right-1 flex items-center gap-1">
            <button
              onClick={() => setSearchScope(prev => prev === 'global' ? 'local' : 'global')}
              className={`p-1 rounded flex items-center justify-center transition-colors ${searchScope === 'local' ? 'bg-indigo-500/20 text-indigo-400' : 'text-zinc-500 hover:text-zinc-300'}`}
              title={searchScope === 'global' ? "Searching all notes (Click to search current note)" : "Searching current note (Click to search all notes)"}
            >
              {searchScope === 'global' ? <Folder size={12} /> : <FileText size={12} />}
            </button>
            {isSearching && (
              <Loader2 size={12} className="text-zinc-500 animate-spin mr-1" />
            )}
          </div>
        </div>
      </div>

      {searchResults.length > 0 && (
        <div className="max-h-48 overflow-y-auto border-b border-zinc-800 p-2 space-y-1 bg-zinc-900/50">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Top Matches</span>
            <button onClick={() => setSearchResults([])} className="text-xs text-zinc-400 hover:text-zinc-200">Clear</button>
          </div>
          {searchResults.map((res: any) => {
            // strip html tags for preview
            const preview = res.content.replace(/<[^>]+>/g, '').substring(0, 40) + '...';
            return (
              <div 
                key={res.id} 
                className="px-2 py-1.5 rounded hover:bg-zinc-800 cursor-pointer"
                onClick={() => {
                  if (res.metadata?.pageId && res.metadata?.x != null && res.metadata?.y != null) {
                    onJumpToCoordinates?.(res.metadata.pageId, res.metadata.x, res.metadata.y);
                  } else if (res.metadata?.pageId) {
                    onSelectPage(res.metadata.pageId);
                  }
                }}
              >
                <div className="text-xs text-indigo-400 mb-0.5">{(res.similarity * 100).toFixed(1)}% match</div>
                <div className="text-sm text-zinc-300 truncate">{preview}</div>
              </div>
            );
          })}
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
            onDelete={() => onDeleteNotebook(nb.id)}
            onUpdateSection={onUpdateSection}
            onDeleteSection={onDeleteSection}
            onAddPage={onAddPage}
            onUpdatePage={onUpdatePage}
            onDeletePage={onDeletePage}
          />
        ))}
        {notebooks.length === 0 && (
          <div className="p-4 text-center text-sm text-zinc-600 italic">
            No notebooks yet.
          </div>
        )}
      </div>
      
      {/* Settings Footer */}
      <div className="p-4 border-t border-zinc-800 flex items-center justify-between mt-auto">
        <button 
          onClick={onOpenSettings}
          className="flex items-center gap-3 text-sm text-zinc-400 hover:text-zinc-100 transition-colors w-full p-2 rounded-md hover:bg-zinc-800/50 text-left"
        >
          {user?.user_metadata?.avatar_url ? (
             <img src={user.user_metadata.avatar_url} alt="Avatar" className="w-8 h-8 rounded-full object-cover bg-zinc-800" />
          ) : (
             <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center">
                <Settings size={18} />
             </div>
          )}
          <div className="flex flex-col flex-1 overflow-hidden">
             <span className="font-medium text-zinc-200 truncate">{user?.user_metadata?.full_name || "Settings"}</span>
             {user?.user_metadata?.full_name && <span className="text-xs text-zinc-500 truncate">Settings</span>}
          </div>
        </button>
      </div>
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
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  if (isEditing) {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5 w-full">
        <Icon size={16} className={iconColor} />
        <input 
          ref={inputRef}
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') onSave(val);
            if (e.key === 'Escape') onCancel();
          }}
          onBlur={() => onSave(val)}
          className="flex-1 bg-zinc-900 border border-primary-500 rounded px-1 text-sm text-zinc-100 outline-none"
        />
      </div>
    );
  }

  return <>{children}</>;
}

function ItemActions({ 
  onEdit, onDelete, onAdd, addTitle 
}: { 
  onEdit: () => void, onDelete: () => void, onAdd?: () => void, addTitle?: string 
}) {
  return (
    <div className="hidden group-hover:flex items-center absolute right-2 bg-zinc-800 rounded shadow-lg border border-zinc-700">
      {onAdd && (
        <button onClick={(e) => { e.stopPropagation(); onAdd(); }} className="p-1 hover:bg-zinc-700 hover:text-white rounded-l text-zinc-400" title={addTitle}>
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
  onAddSection, onUpdate, onDelete,
  onUpdateSection, onDeleteSection,
  onAddPage, onUpdatePage, onDeletePage
}: any) {
  const [expanded, setExpanded] = useState(true);
  const [isEditing, setIsEditing] = useState(false);

  return (
    <div className="space-y-1">
      <EditableItem 
        icon={Book} title={notebook.title} isEditing={isEditing} iconColor="text-primary-400"
        onSave={(val) => { onUpdate(val); setIsEditing(false); }}
        onCancel={() => setIsEditing(false)}
      >
        <div 
          onClick={() => setExpanded(!expanded)}
          className="group relative w-full flex items-center gap-2 px-2 py-1.5 text-sm font-medium rounded-md hover:bg-zinc-800/50 transition-colors text-zinc-200 cursor-pointer"
        >
          <div className="w-4 flex items-center justify-center">
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </div>
          <Book size={16} className="text-primary-400 flex-shrink-0" />
          <span className="truncate flex-1 text-left">{notebook.title}</span>
          <ItemActions onEdit={() => setIsEditing(true)} onDelete={onDelete} onAdd={() => { setExpanded(true); onAddSection(); }} addTitle="Add Section" />
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

function SectionItem({
  section, selectedPageId, onSelectPage,
  onAddPage, onUpdate, onDelete,
  onUpdatePage, onDeletePage
}: any) {
  const [expanded, setExpanded] = useState(true);
  const [isEditing, setIsEditing] = useState(false);

  return (
    <div className="space-y-1">
      <EditableItem 
        icon={Folder} title={section.title} isEditing={isEditing} 
        onSave={(val) => { onUpdate(val); setIsEditing(false); }}
        onCancel={() => setIsEditing(false)}
      >
        <div 
          onClick={() => setExpanded(!expanded)}
          className="group relative w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md hover:bg-zinc-800/50 transition-colors cursor-pointer"
        >
          <div className="w-4 flex items-center justify-center">
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </div>
          <Folder size={14} className="text-zinc-400 flex-shrink-0" />
          <span className="truncate flex-1 text-left text-zinc-300">{section.title}</span>
          <ItemActions onEdit={() => setIsEditing(true)} onDelete={onDelete} onAdd={() => { setExpanded(true); onAddPage(); }} addTitle="Add Page" />
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

function PageItem({ page, selected, onSelect, onUpdate, onDelete }: any) {
  const [isEditing, setIsEditing] = useState(false);

  return (
    <EditableItem 
      icon={FileText} title={page.title} isEditing={isEditing} 
      onSave={(val) => { onUpdate(val); setIsEditing(false); }}
      onCancel={() => setIsEditing(false)}
    >
      <div
        onClick={onSelect}
        className={`group relative w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md transition-colors cursor-pointer ${
          selected
            ? "bg-primary-500/10 text-primary-300 font-medium"
            : "hover:bg-zinc-800/50 text-zinc-400 hover:text-zinc-200"
        }`}
      >
        <FileText size={14} className="flex-shrink-0" />
        <div className="flex flex-col items-start overflow-hidden flex-1">
          <span className="truncate w-full text-left">{page.title}</span>
          {page.is_journal_entry && (
            <span className="text-[10px] text-zinc-500">{page.date}</span>
          )}
        </div>
        <ItemActions onEdit={() => setIsEditing(true)} onDelete={onDelete} />
      </div>
    </EditableItem>
  );
}
