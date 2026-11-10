"use client";

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Plus, Trash2, X, Check } from "lucide-react";
import toast from "react-hot-toast";
import {
  addItemToChecklist,
  parseChecklist,
  serializeChecklist,
  splitChecklist,
  type ChecklistItem,
} from "@/lib/listItems";

export interface ChecklistCardNode {
  id: string;
  content: string;
  itemsMeta?: unknown;
  checklist?: boolean;
}

interface ChecklistCardProps {
  node: ChecklistCardNode;
  /** Receives the new `content` + `itemsMeta` to merge into the text node. */
  onChange: (patch: { content: string; itemsMeta: ReturnType<typeof serializeChecklist>["itemsMeta"]; checklist: true }) => void;
  /** Larger touch targets and swipe-to-delete on checked items. */
  touch?: boolean;
}

/** Textarea that grows with its content so long items wrap like Keep. */
function AutoGrowTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { inputRef?: (el: HTMLTextAreaElement | null) => void }) {
  const { inputRef, ...rest } = props;
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [rest.value]);
  return (
    <textarea
      {...rest}
      rows={1}
      ref={(el) => {
        ref.current = el;
        inputRef?.(el);
      }}
    />
  );
}

function Checkbox({ checked, onToggle, touch }: { checked: boolean; onToggle: () => void; touch?: boolean }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={checked ? "Uncheck item" : "Check item"}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={`shrink-0 flex items-center justify-center ${touch ? "w-7 h-7 -ml-1" : "w-5 h-5"} mt-px`}
    >
      <span
        className={`flex items-center justify-center w-[18px] h-[18px] rounded-[4px] border-2 transition-colors ${
          checked
            ? "bg-zinc-400 dark:bg-zinc-600 border-zinc-400 dark:border-zinc-600 text-white dark:text-zinc-900"
            : "border-zinc-400 dark:border-zinc-500 hover:border-zinc-600 dark:hover:border-zinc-300"
        }`}
      >
        {checked && <Check size={13} strokeWidth={3} />}
      </span>
    </button>
  );
}

/** Swipe left to reveal/trigger delete (touch only). */
function SwipeToDelete({ enabled, onDelete, children }: { enabled: boolean; onDelete: () => void; children: React.ReactNode }) {
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number; active: boolean } | null>(null);
  if (!enabled) return <>{children}</>;
  return (
    <div className="relative overflow-hidden rounded-md">
      <div className="absolute inset-y-0 right-0 flex items-center pr-3 text-red-500 pointer-events-none" style={{ opacity: Math.min(1, -dx / 60) }}>
        <Trash2 size={16} />
      </div>
      <div
        style={{ transform: `translateX(${dx}px)`, transition: start.current ? "none" : "transform 150ms" }}
        onTouchStart={(e) => {
          const t = e.touches[0];
          start.current = { x: t.clientX, y: t.clientY, active: false };
        }}
        onTouchMove={(e) => {
          if (!start.current) return;
          const t = e.touches[0];
          const mx = t.clientX - start.current.x;
          const my = t.clientY - start.current.y;
          if (!start.current.active && Math.abs(mx) > 10 && Math.abs(mx) > Math.abs(my)) start.current.active = true;
          if (start.current.active) setDx(Math.min(0, mx));
        }}
        onTouchEnd={() => {
          const shouldDelete = dx < -90;
          start.current = null;
          setDx(0);
          if (shouldDelete) onDelete();
        }}
        className="bg-inherit"
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Google Keep–style checklist for list notes. Items stay in their stored
 * (original) order; unchecked items show first and checked items show in a
 * collapsible "Checked items (N)" section with strike-through.
 */
export function ChecklistCard({ node, onChange, touch = false }: ChecklistCardProps) {
  const items = useMemo(() => parseChecklist(node), [node.content, node.itemsMeta]); // eslint-disable-line react-hooks/exhaustive-deps
  const { unchecked, checked } = useMemo(() => splitChecklist(items), [items]);
  const [showChecked, setShowChecked] = useState(true);
  const [newItem, setNewItem] = useState("");
  const inputRefs = useRef<Map<number, HTMLTextAreaElement>>(new Map());
  const addRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingFocus = useRef<number | "add" | null>(null);
  // Text being edited is kept locally and saved on blur/Enter, because the
  // stored format trims lines (saving per keystroke would eat spaces).
  const [editing, setEditing] = useState<{ index: number; text: string } | null>(null);

  const commit = (next: ChecklistItem[]) => onChange({ ...serializeChecklist(next), checklist: true });

  useEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    pendingFocus.current = null;
    const el = target === "add" ? addRef.current : inputRefs.current.get(target);
    if (el) {
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
    }
  });

  const toggle = (index: number) => commit(items.map((it, i) => (i === index ? { ...it, checked: !it.checked } : it)));
  const remove = (index: number) => commit(items.filter((_, i) => i !== index));
  const saveEdit = (index: number, text: string) => {
    setEditing(null);
    const clean = text.replace(/\s+/g, " ").trim();
    if (!items[index]) return;
    if (!clean) return remove(index);
    if (clean !== items[index].text) commit(items.map((it, i) => (i === index ? { ...it, text: clean } : it)));
  };

  const submitNew = () => {
    const text = newItem.trim();
    if (!text) return;
    const { items: next, outcome } = addItemToChecklist(items, text, { addedBy: null, addedByOwner: true });
    commit(next);
    setNewItem("");
    pendingFocus.current = "add";
    if (outcome === "movedFromChecked") toast.success("Moved back from Checked", { id: "checklist-moved", duration: 1800 });
    else if (outcome === "alreadyOnList") toast("Already on the list", { id: "checklist-dupe", duration: 1800 });
  };

  const textSize = touch ? "text-[16px] leading-6" : "text-sm leading-5";
  const rowPad = touch ? "py-1.5" : "py-1";

  const renderRow = ({ item, index }: { item: ChecklistItem; index: number }, position: number, group: { index: number }[]) => (
    <div key={`${index}-${item.checked}`} className={`group/item flex items-start gap-2 ${rowPad}`}>
      <Checkbox checked={item.checked} onToggle={() => toggle(index)} touch={touch} />
      <AutoGrowTextarea
        value={editing?.index === index ? editing.text : item.text}
        inputRef={(el) => {
          if (el) inputRefs.current.set(index, el);
          else inputRefs.current.delete(index);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onFocus={() => setEditing({ index, text: item.text })}
        onChange={(e) => setEditing({ index, text: e.target.value.replace(/\n/g, " ") })}
        onKeyDown={(e) => {
          e.stopPropagation();
          const current = editing?.index === index ? editing.text : item.text;
          if (e.key === "Enter") {
            e.preventDefault();
            (e.currentTarget as HTMLTextAreaElement).blur();
            addRef.current?.focus();
          } else if (e.key === "Backspace" && current === "") {
            e.preventDefault();
            const prev = group[position - 1];
            pendingFocus.current = prev ? (prev.index > index ? prev.index - 1 : prev.index) : "add";
            setEditing(null);
            remove(index);
          }
        }}
        onBlur={() => {
          if (editing?.index === index) saveEdit(index, editing.text);
        }}
        aria-label={item.checked ? "Checked item" : "List item"}
        className={`flex-1 min-w-0 bg-transparent border-none outline-none resize-none overflow-hidden p-0 ${textSize} ${
          item.checked ? "line-through text-zinc-400 dark:text-zinc-500" : "text-zinc-900 dark:text-zinc-100"
        }`}
      />
      {item.checked ? (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            remove(index);
          }}
          className={`shrink-0 flex items-center justify-center rounded-md text-zinc-400 hover:text-red-500 hover:bg-red-500/10 transition-colors ${
            touch ? "w-8 h-8 -my-1" : "w-6 h-6 -my-0.5"
          }`}
          title="Delete (used up, not rebuying)"
          aria-label={`Delete ${item.text}`}
        >
          <Trash2 size={touch ? 16 : 14} />
        </button>
      ) : (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            remove(index);
          }}
          className={`shrink-0 flex items-center justify-center rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-500/10 transition-opacity ${
            touch ? "w-8 h-8 -my-1 opacity-60" : "w-6 h-6 -my-0.5 opacity-0 group-hover/item:opacity-100 focus:opacity-100"
          }`}
          title="Remove item"
          aria-label={`Remove ${item.text}`}
        >
          <X size={touch ? 16 : 14} />
        </button>
      )}
    </div>
  );

  return (
    <div className="px-3 py-2 select-text" data-checklist-card={node.id}>
      {/* Unchecked items */}
      <div>{unchecked.map((entry, pos) => renderRow(entry, pos, unchecked))}</div>

      {/* Add item */}
      <div className={`flex items-start gap-2 ${rowPad}`}>
        <span className={`shrink-0 flex items-center justify-center text-zinc-400 ${touch ? "w-7 h-7 -ml-1" : "w-5 h-5"} mt-px`}>
          <Plus size={touch ? 18 : 16} />
        </span>
        <AutoGrowTextarea
          value={newItem}
          inputRef={(el) => (addRef.current = el)}
          placeholder="List item"
          enterKeyHint="enter"
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => setNewItem(e.target.value.replace(/\n/g, ""))}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") {
              e.preventDefault();
              submitNew();
            }
          }}
          onBlur={submitNew}
          aria-label="Add list item"
          className={`flex-1 min-w-0 bg-transparent border-none outline-none resize-none overflow-hidden p-0 placeholder:text-zinc-400 dark:placeholder:text-zinc-500 text-zinc-900 dark:text-zinc-100 ${textSize}`}
        />
      </div>

      {/* Checked items */}
      {checked.length > 0 && (
        <div className="mt-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setShowChecked((v) => !v);
            }}
            aria-expanded={showChecked}
            className={`flex items-center gap-1.5 -ml-0.5 rounded-md text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors ${
              touch ? "py-1.5 text-sm" : "py-1 text-xs"
            } font-medium`}
          >
            <ChevronDown size={touch ? 18 : 15} className={`transition-transform ${showChecked ? "" : "-rotate-90"}`} />
            <span>Checked items ({checked.length})</span>
          </button>
          {showChecked && (
            <div>
              {checked.map((entry, pos) => (
                <SwipeToDelete key={`${entry.index}-swipe`} enabled={touch} onDelete={() => remove(entry.index)}>
                  {renderRow(entry, pos, checked)}
                </SwipeToDelete>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
