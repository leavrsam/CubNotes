"use client";

import React, { useState, useRef, useEffect } from "react";
import { Book, Folder, FileText, ChevronRight, ChevronDown, Plus, MoreVertical, Edit2, Trash2 } from "lucide-react";
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
}

export function Sidebar({ 
  notebooks, selectedPageId, onSelectPage,
  onAddNotebook, onUpdateNotebook, onDeleteNotebook,
  onAddSection, onUpdateSection, onDeleteSection,
  onAddPage, onUpdatePage, onDeletePage,
  onClose
}: SidebarProps) {
  return (
    <aside className="w-64 bg-zinc-950 text-zinc-300 h-screen flex flex-col border-r border-zinc-800 flex-shrink-0">
      <div className="p-4 border-b border-zinc-800 flex items-center justify-between group">
        <h1 className="text-lg font-bold text-zinc-100 tracking-tight">CubNotes</h1>
        <button 
          onClick={onAddNotebook}
          className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors"
          title="New Notebook"
        >
          <Plus size={18} />
        </button>
      </div>
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
          className="flex-1 bg-zinc-900 border border-indigo-500 rounded px-1 text-sm text-zinc-100 outline-none"
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
        icon={Book} title={notebook.title} isEditing={isEditing} iconColor="text-indigo-400"
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
          <Book size={16} className="text-indigo-400 flex-shrink-0" />
          <span className="truncate flex-1 text-left">{notebook.title}</span>
          <ItemActions onEdit={() => setIsEditing(true)} onDelete={onDelete} onAdd={() => { setExpanded(true); onAddSection(); }} addTitle="Add Section" />
        </div>
      </EditableItem>

      {expanded && (
        <div className="ml-4 pl-2 border-l border-zinc-800 space-y-1">
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
          {notebook.sections.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-zinc-600 italic">No sections</div>
          )}
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
        <div className="ml-5 space-y-1">
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
          {section.pages.length === 0 && (
            <div className="px-2 py-1 text-xs text-zinc-600 italic">No pages</div>
          )}
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
            ? "bg-indigo-500/10 text-indigo-300 font-medium"
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
