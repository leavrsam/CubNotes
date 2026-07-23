"use client";

import React, { useState } from "react";
import { Book, Folder, FileText, ChevronRight, ChevronDown, Plus } from "lucide-react";
import { Notebook, Section, Page } from "@/hooks/useNotebooks";

interface SidebarProps {
  notebooks: Notebook[];
  selectedPageId: string | null;
  onSelectPage: (pageId: string) => void;
}

export function Sidebar({ notebooks, selectedPageId, onSelectPage }: SidebarProps) {
  return (
    <aside className="w-64 bg-zinc-950 text-zinc-300 h-screen flex flex-col border-r border-zinc-800">
      <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
        <h1 className="text-lg font-bold text-zinc-100 tracking-tight">Zenith Notes</h1>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {notebooks.map((nb) => (
          <NotebookItem
            key={nb.id}
            notebook={nb}
            selectedPageId={selectedPageId}
            onSelectPage={onSelectPage}
          />
        ))}
      </div>
    </aside>
  );
}

function NotebookItem({
  notebook,
  selectedPageId,
  onSelectPage,
}: {
  notebook: Notebook;
  selectedPageId: string | null;
  onSelectPage: (pageId: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="space-y-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-2 py-1.5 text-sm font-medium rounded-md hover:bg-zinc-800/50 transition-colors text-zinc-200"
      >
        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <Book size={16} className="text-indigo-400" />
        <span className="truncate">{notebook.title}</span>
      </button>

      {expanded && (
        <div className="ml-4 pl-2 border-l border-zinc-800 space-y-1">
          {notebook.sections.map((sec) => (
            <SectionItem
              key={sec.id}
              section={sec}
              selectedPageId={selectedPageId}
              onSelectPage={onSelectPage}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SectionItem({
  section,
  selectedPageId,
  onSelectPage,
}: {
  section: Section;
  selectedPageId: string | null;
  onSelectPage: (pageId: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="space-y-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md hover:bg-zinc-800/50 transition-colors"
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Folder size={14} className="text-zinc-400" />
        <span className="truncate">{section.title}</span>
      </button>

      {expanded && (
        <div className="ml-4 space-y-1">
          {section.pages.map((page) => (
            <button
              key={page.id}
              onClick={() => onSelectPage(page.id)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md transition-colors ${
                selectedPageId === page.id
                  ? "bg-indigo-500/10 text-indigo-300 font-medium"
                  : "hover:bg-zinc-800/50 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <FileText size={14} />
              <div className="flex flex-col items-start overflow-hidden">
                <span className="truncate w-full text-left">{page.title}</span>
                {page.is_journal_entry && (
                  <span className="text-[10px] text-zinc-500">{page.date}</span>
                )}
              </div>
            </button>
          ))}
          {section.pages.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-zinc-600 italic">No pages</div>
          )}
        </div>
      )}
    </div>
  );
}
