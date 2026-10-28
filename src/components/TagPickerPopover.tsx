"use client";

import React, { useState, useRef, useEffect } from "react";
import { Plus, X, Tag as TagIcon, Check, Hash } from "lucide-react";
import { 
  normalizeTagId, 
  formatTagName, 
  getTagColor, 
  TAG_PALETTE, 
  loadTagRegistry, 
  saveTagDefinition 
} from "@/lib/tags";

interface TagPickerPopoverProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  availableTags?: string[];
  size?: 'sm' | 'md';
  placeholder?: string;
  readOnly?: boolean;
  onTagClick?: (tag: string) => void;
  className?: string;
}

export function TagPickerPopover({
  tags = [],
  onChange,
  availableTags = [],
  size = 'md',
  placeholder = "Add tag...",
  readOnly = false,
  onTagClick,
  className = ""
}: TagPickerPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedColor, setSelectedColor] = useState<string>(TAG_PALETTE[0].color);
  const [registry, setRegistry] = useState(loadTagRegistry());
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync registry updates across components
  useEffect(() => {
    const handleUpdate = () => setRegistry(loadTagRegistry());
    window.addEventListener('cubnotes:tag_registry_updated', handleUpdate);
    return () => window.removeEventListener('cubnotes:tag_registry_updated', handleUpdate);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery("");
    }
  }, [isOpen]);

  const normalizedCurrent = tags.map(normalizeTagId);

  const handleAddTag = (raw: string, color?: string) => {
    const id = normalizeTagId(raw);
    if (!id) return;
    if (!normalizedCurrent.includes(id)) {
      const updated = [...tags, id];
      onChange(updated);

      // If user selected a custom color or tag isn't registered, save definition
      if (color || !registry[id]) {
        saveTagDefinition({
          id,
          name: formatTagName(raw),
          color: color || selectedColor || getTagColor(id).color
        });
      }
    }
    setQuery("");
    setIsOpen(false);
  };

  const handleRemoveTag = (tagToRemove: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const id = normalizeTagId(tagToRemove);
    onChange(tags.filter(t => normalizeTagId(t) !== id));
  };

  const filteredSuggestions = availableTags
    .map(normalizeTagId)
    .filter(t => t && !normalizedCurrent.includes(t))
    .filter(t => !query || t.includes(normalizeTagId(query)))
    .slice(0, 8);

  const isExactMatch = filteredSuggestions.some(s => s === normalizeTagId(query));

  const pillTextSize = size === 'sm' ? 'text-[10px] py-0.5 px-2' : 'text-xs py-1 px-2.5';

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {/* Existing Tag Pills */}
      {tags.map((tag) => {
        const id = normalizeTagId(tag);
        const style = getTagColor(id, registry);
        return (
          <span
            key={id}
            onClick={() => onTagClick?.(id)}
            style={{
              backgroundColor: style.bg,
              borderColor: style.border,
              color: style.text
            }}
            className={`inline-flex items-center gap-1 rounded-full font-medium border transition-all ${pillTextSize} ${
              onTagClick ? 'cursor-pointer hover:opacity-85' : 'select-none'
            }`}
          >
            <Hash size={size === 'sm' ? 10 : 12} className="opacity-70 shrink-0" />
            <span>{formatTagName(tag)}</span>
            {!readOnly && (
              <button
                type="button"
                onClick={(e) => handleRemoveTag(tag, e)}
                className="hover:opacity-100 opacity-60 p-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors ml-0.5"
                title="Remove tag"
              >
                <X size={size === 'sm' ? 10 : 12} />
              </button>
            )}
          </span>
        );
      })}

      {/* Add Tag Button & Popover */}
      {!readOnly && (
        <div className="relative inline-block" ref={popoverRef}>
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className={`inline-flex items-center gap-1 rounded-full border border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:border-zinc-400 dark:hover:border-zinc-500 font-medium transition-colors ${pillTextSize}`}
            title="Add tag"
          >
            <Plus size={size === 'sm' ? 11 : 13} />
            <span>Tag</span>
          </button>

          {/* Floating Popover Menu */}
          {isOpen && (
            <div 
              className="absolute left-0 top-full mt-1.5 w-60 z-[2000] rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl p-2.5 space-y-2 animate-in fade-in zoom-in-95 duration-100"
              onPointerDown={(e) => e.stopPropagation()}
            >
              {/* Input field */}
              <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700">
                <Hash size={13} className="text-zinc-400 shrink-0" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && query.trim()) {
                      e.preventDefault();
                      handleAddTag(query, selectedColor);
                    } else if (e.key === 'Escape') {
                      setIsOpen(false);
                    }
                  }}
                  placeholder={placeholder}
                  className="w-full bg-transparent border-none outline-none text-xs text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400"
                />
              </div>

              {/* Color Palette Selector for New Tag */}
              <div className="pt-1">
                <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1.5">Tag Color</span>
                <div className="flex items-center justify-between gap-1">
                  {TAG_PALETTE.slice(0, 8).map(p => (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => setSelectedColor(p.color)}
                      style={{ backgroundColor: p.color }}
                      className={`w-4 h-4 rounded-full transition-transform flex items-center justify-center ${
                        selectedColor === p.color ? 'scale-125 ring-2 ring-white dark:ring-zinc-900 shadow-sm' : 'opacity-80 hover:opacity-100 hover:scale-110'
                      }`}
                      title={p.name}
                    >
                      {selectedColor === p.color && <Check size={8} className="text-white drop-shadow-xs" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Suggestions / Create option */}
              <div className="pt-1.5 border-t border-zinc-100 dark:border-zinc-800 space-y-1 max-h-36 overflow-y-auto custom-scrollbar">
                {query.trim() && !isExactMatch && (
                  <button
                    type="button"
                    onClick={() => handleAddTag(query, selectedColor)}
                    className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs text-primary-600 dark:text-primary-400 font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    <Plus size={13} />
                    <span>Create &quot;#{normalizeTagId(query)}&quot;</span>
                  </button>
                )}

                {filteredSuggestions.map((suggestion) => {
                  const style = getTagColor(suggestion, registry);
                  return (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => handleAddTag(suggestion)}
                      className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs text-zinc-700 dark:text-zinc-300 flex items-center justify-between transition-colors group"
                    >
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: style.color }} />
                        <span>#{suggestion}</span>
                      </span>
                      <Plus size={11} className="opacity-0 group-hover:opacity-100 text-zinc-400" />
                    </button>
                  );
                })}

                {!query.trim() && filteredSuggestions.length === 0 && (
                  <div className="text-[11px] text-zinc-400 text-center py-2">
                    Type a tag name above to create your first tag
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
