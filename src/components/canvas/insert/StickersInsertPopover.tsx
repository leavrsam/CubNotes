"use client";

import React, { useRef, useEffect } from "react";
import { 
  Smile, 
  AlertCircle, 
  Flame, 
  CheckSquare, 
  CheckCircle2, 
  Clock, 
  Sparkles, 
  HelpCircle, 
  ShieldCheck, 
  Eye, 
  Bookmark, 
  StickyNote, 
  Quote, 
  AlertTriangle, 
  Info,
  X 
} from "lucide-react";

export interface StickerBadgeItem {
  id: string;
  label: string;
  iconName: string;
  color: string;
  bgLight: string;
  borderLight: string;
}

export const VECTOR_BADGES: StickerBadgeItem[] = [
  { id: "important", label: "IMPORTANT", iconName: "AlertCircle", color: "#ef4444", bgLight: "#fef2f2", borderLight: "#fca5a5" },
  { id: "urgent", label: "URGENT", iconName: "Flame", color: "#f97316", bgLight: "#fff7ed", borderLight: "#fdba74" },
  { id: "action_item", label: "ACTION ITEM", iconName: "CheckSquare", color: "#3b82f6", bgLight: "#eff6ff", borderLight: "#93c5fd" },
  { id: "completed", label: "COMPLETED", iconName: "CheckCircle2", color: "#10b981", bgLight: "#ecfdf5", borderLight: "#6ee7b7" },
  { id: "in_progress", label: "IN PROGRESS", iconName: "Clock", color: "#a855f7", bgLight: "#faf5ff", borderLight: "#d8b4fe" },
  { id: "key_idea", label: "KEY IDEA", iconName: "Sparkles", color: "#eab308", bgLight: "#fefce8", borderLight: "#fde047" },
  { id: "question", label: "QUESTION", iconName: "HelpCircle", color: "#06b6d4", bgLight: "#ecfeff", borderLight: "#67e8f9" },
  { id: "approved", label: "APPROVED", iconName: "ShieldCheck", color: "#14b8a6", bgLight: "#f0fdfa", borderLight: "#5eead4" },
  { id: "review", label: "REVIEW", iconName: "Eye", color: "#6366f1", bgLight: "#eef2ff", borderLight: "#a5b4fc" },
  { id: "bookmark", label: "BOOKMARK", iconName: "Bookmark", color: "#f43f5e", bgLight: "#fff1f2", borderLight: "#fda4af" },
];

export const STICKY_COLORS = [
  { name: "Yellow", fill: "rgba(254, 240, 138, 0.55)", stroke: "#eab308" },
  { name: "Mint", fill: "rgba(187, 247, 208, 0.55)", stroke: "#22c55e" },
  { name: "Sky", fill: "rgba(186, 230, 253, 0.55)", stroke: "#0ea5e9" },
  { name: "Lavender", fill: "rgba(233, 213, 255, 0.55)", stroke: "#a855f7" },
  { name: "Peach", fill: "rgba(254, 215, 170, 0.55)", stroke: "#f97316" },
  { name: "Blush", fill: "rgba(254, 205, 211, 0.55)", stroke: "#f43f5e" },
];

interface StickersInsertPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertBadge: (badge: StickerBadgeItem) => void;
  onInsertStickyNote: (fill: string, stroke: string) => void;
  onInsertCallout: (type: 'info' | 'warning' | 'tip' | 'quote') => void;
}

export function StickersInsertPopover({
  isOpen,
  onClose,
  onInsertBadge,
  onInsertStickyNote,
  onInsertCallout,
}: StickersInsertPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDownOutside = (e: MouseEvent | TouchEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("mousedown", handlePointerDownOutside);
    window.addEventListener("touchstart", handlePointerDownOutside);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDownOutside);
      window.removeEventListener("touchstart", handlePointerDownOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  const renderBadgeIcon = (iconName: string, color: string) => {
    const props = { size: 12, strokeWidth: 2.5, style: { color } };
    switch (iconName) {
      case "AlertCircle": return <AlertCircle {...props} />;
      case "Flame": return <Flame {...props} />;
      case "CheckSquare": return <CheckSquare {...props} />;
      case "CheckCircle2": return <CheckCircle2 {...props} />;
      case "Clock": return <Clock {...props} />;
      case "Sparkles": return <Sparkles {...props} />;
      case "HelpCircle": return <HelpCircle {...props} />;
      case "ShieldCheck": return <ShieldCheck {...props} />;
      case "Eye": return <Eye {...props} />;
      case "Bookmark": return <Bookmark {...props} />;
      default: return <Smile {...props} />;
    }
  };

  if (!isOpen) return null;

  return (
    <div
      ref={popoverRef}
      className="absolute top-[52px] right-24 z-50 w-[340px] bg-white dark:bg-zinc-900 rounded-xl shadow-2xl border border-zinc-200 dark:border-zinc-800 p-3 select-none animate-in fade-in zoom-in-95 duration-100"
      style={{ filter: "drop-shadow(0 12px 28px rgba(0,0,0,0.2))" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-zinc-100 dark:border-zinc-800 mb-2.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-800 dark:text-zinc-200">
          <Smile size={15} className="text-primary-500" />
          <span>Stickers & Badges</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          <X size={13} />
        </button>
      </div>

      {/* Section 1: Vector Status Badges */}
      <div className="mb-3">
        <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 dark:text-zinc-500 block mb-1.5 px-0.5">
          Status & Priority Badges
        </span>
        <div className="grid grid-cols-2 gap-1.5">
          {VECTOR_BADGES.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => {
                onInsertBadge(b);
                onClose();
              }}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-left transition-transform active:scale-95 hover:shadow-2xs"
              style={{
                backgroundColor: b.bgLight,
                borderColor: b.borderLight,
              }}
            >
              {renderBadgeIcon(b.iconName, b.color)}
              <span className="text-[10px] font-bold tracking-wide" style={{ color: b.color }}>
                {b.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Section 2: Sticky Notes */}
      <div className="mb-3">
        <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 dark:text-zinc-500 block mb-1.5 px-0.5">
          Sticky Notes
        </span>
        <div className="grid grid-cols-6 gap-1.5">
          {STICKY_COLORS.map((col) => (
            <button
              key={col.name}
              type="button"
              onClick={() => {
                onInsertStickyNote(col.fill, col.stroke);
                onClose();
              }}
              className="group flex flex-col items-center gap-1 p-1 rounded-lg border border-transparent hover:border-zinc-300 dark:hover:border-zinc-700 transition-all hover:scale-105"
              title={`${col.name} Sticky Note`}
            >
              <div
                className="w-8 h-8 rounded-sm shadow-2xs relative flex items-center justify-center border"
                style={{ backgroundColor: col.fill, borderColor: col.stroke }}
              >
                <div
                  className="absolute bottom-0 right-0 w-2.5 h-2.5 border-t border-l"
                  style={{
                    backgroundColor: "rgba(0,0,0,0.12)",
                    borderColor: col.stroke,
                  }}
                />
              </div>
              <span className="text-[9px] text-zinc-500 font-medium">{col.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Section 3: Callout Boxes */}
      <div>
        <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 dark:text-zinc-500 block mb-1.5 px-0.5">
          Callouts & Quotes
        </span>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => {
              onInsertCallout('info');
              onClose();
            }}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 text-blue-700 dark:text-blue-300 text-left text-[11px] font-medium hover:opacity-90"
          >
            <Info size={13} className="text-blue-500 shrink-0" />
            <span>Info Callout</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onInsertCallout('warning');
              onClose();
            }}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-700 dark:text-amber-300 text-left text-[11px] font-medium hover:opacity-90"
          >
            <AlertTriangle size={13} className="text-amber-500 shrink-0" />
            <span>Warning Callout</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onInsertCallout('tip');
              onClose();
            }}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/60 text-purple-700 dark:text-purple-300 text-left text-[11px] font-medium hover:opacity-90"
          >
            <Sparkles size={13} className="text-purple-500 shrink-0" />
            <span>Pro Tip</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onInsertCallout('quote');
              onClose();
            }}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 text-left text-[11px] font-medium hover:opacity-90"
          >
            <Quote size={13} className="text-zinc-500 shrink-0" />
            <span>Block Quote</span>
          </button>
        </div>
      </div>
    </div>
  );
}
