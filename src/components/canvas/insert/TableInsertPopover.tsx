"use client";

import React, { useState, useRef, useEffect } from "react";
import { Table, Columns, Rows, Plus, Check } from "lucide-react";

interface TableInsertPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertTable: (rows: number, cols: number, presetType?: 'standard' | 'comparison') => void;
}

export function TableInsertPopover({ isOpen, onClose, onInsertTable }: TableInsertPopoverProps) {
  const [hoverRow, setHoverRow] = useState<number>(3);
  const [hoverCol, setHoverCol] = useState<number>(3);
  const popoverRef = useRef<HTMLDivElement>(null);

  const maxRows = 8;
  const maxCols = 10;

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

  if (!isOpen) return null;

  return (
    <div
      ref={popoverRef}
      className="absolute top-[52px] left-2 z-50 w-72 bg-white dark:bg-zinc-900 rounded-xl shadow-xl border border-zinc-200 dark:border-zinc-800 p-3 select-none animate-in fade-in zoom-in-95 duration-100"
      style={{ filter: "drop-shadow(0 10px 20px rgba(0,0,0,0.15))" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-zinc-100 dark:border-zinc-800 mb-2.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-800 dark:text-zinc-200">
          <Table size={14} className="text-primary-500" />
          <span>Insert Table</span>
        </div>
        <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
          {hoverCol} × {hoverRow}
        </span>
      </div>

      {/* Grid Hover Selector */}
      <div
        className="grid gap-1 p-1 bg-zinc-50 dark:bg-zinc-850 rounded-lg border border-zinc-100 dark:border-zinc-800 mb-3"
        style={{
          gridTemplateColumns: `repeat(${maxCols}, minmax(0, 1fr))`,
        }}
        onMouseLeave={() => {
          setHoverRow(3);
          setHoverCol(3);
        }}
      >
        {Array.from({ length: maxRows }).map((_, rIdx) => {
          const r = rIdx + 1;
          return Array.from({ length: maxCols }).map((_, cIdx) => {
            const c = cIdx + 1;
            const isHighlighted = r <= hoverRow && c <= hoverCol;
            return (
              <div
                key={`${r}-${c}`}
                onMouseEnter={() => {
                  setHoverRow(r);
                  setHoverCol(c);
                }}
                onClick={() => {
                  onInsertTable(r, c);
                  onClose();
                }}
                className={`w-5 h-5 rounded-[3px] cursor-pointer transition-all ${
                  isHighlighted
                    ? "bg-primary-500 ring-1 ring-primary-600 scale-[1.08] shadow-2xs"
                    : "bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:border-zinc-400"
                }`}
                title={`${c} × ${r}`}
              />
            );
          });
        })}
      </div>

      {/* Quick Presets */}
      <div className="space-y-1">
        <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 dark:text-zinc-500 block px-1">
          Quick Presets
        </span>
        <div className="grid grid-cols-2 gap-1.5 pt-0.5">
          <button
            onClick={() => {
              onInsertTable(2, 2);
              onClose();
            }}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-left text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="font-medium">2 × 2 Basic</span>
          </button>
          <button
            onClick={() => {
              onInsertTable(3, 3);
              onClose();
            }}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-left text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="font-medium">3 × 3 Standard</span>
          </button>
          <button
            onClick={() => {
              onInsertTable(5, 4);
              onClose();
            }}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-left text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <span className="w-2 h-2 rounded-full bg-purple-500" />
            <span className="font-medium">4 × 5 Data Grid</span>
          </button>
          <button
            onClick={() => {
              onInsertTable(4, 3, 'comparison');
              onClose();
            }}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-left text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span className="font-medium">Comparison</span>
          </button>
        </div>
      </div>
    </div>
  );
}
