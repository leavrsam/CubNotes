"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import katex from "katex";
import { Pi, Check, Copy, Sparkles, X } from "lucide-react";
import toast from "react-hot-toast";

interface EquationInsertPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertEquation: (latex: string, renderedHtml: string) => void;
}

const COMMON_SYMBOLS = [
  { label: "a/b", latex: "\\frac{a}{b}", title: "Fraction" },
  { label: "√x", latex: "\\sqrt{x}", title: "Square Root" },
  { label: "xⁿ", latex: "x^{n}", title: "Power / Superscript" },
  { label: "xᵢ", latex: "x_{i}", title: "Subscript" },
  { label: "∫", latex: "\\int_{a}^{b} f(x) dx", title: "Integral" },
  { label: "∑", latex: "\\sum_{i=1}^{n} x_i", title: "Summation" },
  { label: "∏", latex: "\\prod_{i=1}^{n} x_i", title: "Product" },
  { label: "df/dx", latex: "\\frac{df}{dx}", title: "Derivative" },
  { label: "∂f/∂x", latex: "\\frac{\\partial f}{\\partial x}", title: "Partial Derivative" },
  { label: "±", latex: "\\pm", title: "Plus-Minus" },
  { label: "≠", latex: "\\neq", title: "Not Equal" },
  { label: "≈", latex: "\\approx", title: "Approximately" },
  { label: "≤", latex: "\\le", title: "Less than or equal" },
  { label: "≥", latex: "\\ge", title: "Greater than or equal" },
  { label: "∞", latex: "\\infty", title: "Infinity" },
  { label: "π", latex: "\\pi", title: "Pi" },
  { label: "θ", latex: "\\theta", title: "Theta" },
  { label: "α", latex: "\\alpha", title: "Alpha" },
  { label: "β", latex: "\\beta", title: "Beta" },
  { label: "λ", latex: "\\lambda", title: "Lambda" },
  { label: "σ", latex: "\\sigma", title: "Sigma" },
  { label: "Δ", latex: "\\Delta", title: "Delta" },
  { label: "lim", latex: "\\lim_{x \\to 0}", title: "Limit" },
  { label: "[Matrix]", latex: "\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}", title: "2x2 Matrix" },
];

const PRESETS = [
  {
    name: "Quadratic Formula",
    latex: "x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}",
  },
  {
    name: "Euler's Identity",
    latex: "e^{i\\pi} + 1 = 0",
  },
  {
    name: "Pythagorean Theorem",
    latex: "a^2 + b^2 = c^2",
  },
  {
    name: "Normal Distribution",
    latex: "f(x) = \\frac{1}{\\sigma \\sqrt{2\\pi}} e^{-\\frac{1}{2}\\left(\\frac{x-\\mu}{\\sigma}\\right)^2}",
  },
];

export function EquationInsertPopover({ isOpen, onClose, onInsertEquation }: EquationInsertPopoverProps) {
  const [latex, setLatex] = useState<string>("x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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

  const { renderedHtml, isError } = useMemo(() => {
    try {
      const html = katex.renderToString(latex.trim() || "\\text{Type a formula...}", {
        displayMode: true,
        throwOnError: false,
      });
      return { renderedHtml: html, isError: false };
    } catch (err: any) {
      return {
        renderedHtml: `<span class="text-red-500 text-xs">Error parsing LaTeX: ${err.message}</span>`,
        isError: true,
      };
    }
  }, [latex]);

  const handleAppendSymbol = (symbolLatex: string) => {
    if (!textareaRef.current) {
      setLatex(prev => prev + " " + symbolLatex);
      return;
    }
    const el = textareaRef.current;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = latex.substring(0, start) + symbolLatex + latex.substring(end);
    setLatex(next);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + symbolLatex.length, start + symbolLatex.length);
    }, 10);
  };

  const handleCopyLatex = () => {
    navigator.clipboard.writeText(latex);
    toast.success("LaTeX copied to clipboard");
  };

  const handleSubmit = () => {
    if (!latex.trim()) return;
    onInsertEquation(latex, renderedHtml);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      ref={popoverRef}
      className="absolute top-[52px] left-36 z-50 w-[420px] bg-white dark:bg-zinc-900 rounded-xl shadow-2xl border border-zinc-200 dark:border-zinc-800 p-3.5 select-none animate-in fade-in zoom-in-95 duration-100"
      style={{ filter: "drop-shadow(0 12px 28px rgba(0,0,0,0.2))" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-zinc-100 dark:border-zinc-800 mb-2.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-800 dark:text-zinc-200">
          <Pi size={16} className="text-primary-500" />
          <span>Insert Math Equation</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopyLatex}
            className="p-1 rounded text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            title="Copy LaTeX"
          >
            <Copy size={13} />
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* KaTeX Live Render Preview Box */}
      <div className="min-h-[64px] max-h-[110px] overflow-x-auto bg-zinc-50 dark:bg-zinc-950 rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 py-2 flex items-center justify-center mb-2.5 shadow-inner">
        <div
          className="text-zinc-900 dark:text-zinc-100 text-sm select-all"
          dangerouslySetInnerHTML={{ __html: renderedHtml }}
        />
      </div>

      {/* LaTeX Input Textarea */}
      <div className="mb-2.5">
        <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 dark:text-zinc-500 block mb-1">
          LaTeX Source Code
        </label>
        <textarea
          ref={textareaRef}
          value={latex}
          onChange={(e) => setLatex(e.target.value)}
          placeholder="e.g. \frac{a}{b} + \sqrt{x}"
          rows={2}
          className="w-full text-xs font-mono px-2.5 py-1.5 bg-white dark:bg-zinc-850 rounded-md border border-zinc-200 dark:border-zinc-750 text-zinc-800 dark:text-zinc-200 focus:outline-hidden focus:ring-1 focus:ring-primary-500 resize-none"
        />
      </div>

      {/* Quick Symbol Palette */}
      <div className="mb-2.5">
        <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 dark:text-zinc-500 block mb-1">
          Quick Symbols
        </span>
        <div className="flex flex-wrap gap-1 max-h-[72px] overflow-y-auto no-scrollbar p-0.5">
          {COMMON_SYMBOLS.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => handleAppendSymbol(s.latex)}
              className="px-1.5 py-0.5 text-xs font-mono font-medium rounded bg-zinc-100 dark:bg-zinc-800 hover:bg-primary-50 dark:hover:bg-primary-900/30 hover:text-primary-600 dark:hover:text-primary-400 border border-zinc-200 dark:border-zinc-700/60 transition-colors"
              title={s.title}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Presets */}
      <div className="mb-3">
        <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 dark:text-zinc-500 block mb-1">
          Standard Formulas
        </span>
        <div className="grid grid-cols-2 gap-1">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => setLatex(p.latex)}
              className="px-2 py-1 text-left text-[11px] rounded bg-zinc-50 dark:bg-zinc-850 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200/60 dark:border-zinc-750 transition-colors truncate"
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-2 pt-1 border-t border-zinc-100 dark:border-zinc-800">
        <button
          onClick={onClose}
          className="px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors font-medium"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={!latex.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary-600 hover:bg-primary-500 text-white rounded-lg font-semibold shadow-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Check size={13} strokeWidth={2.5} />
          <span>Insert Equation</span>
        </button>
      </div>
    </div>
  );
}
