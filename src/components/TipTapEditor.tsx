"use client";

import React, { useEffect, useState, useRef } from "react";
import { useEditor, EditorContent, Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import FontFamily from "@tiptap/extension-font-family";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import Underline from '@tiptap/extension-underline';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Link from '@tiptap/extension-link';
import { Extension, Mark } from "@tiptap/core";
import { 
  Trash2, Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Heading1, Heading2, Heading3, List, ListOrdered, CheckSquare, 
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Highlighter, ChevronDown, Indent as IndentIcon, Outdent as OutdentIcon,
  Subscript as SubscriptIcon, Superscript as SuperscriptIcon,
  RemoveFormatting, Quote, Code, Minus, Link2, Unlink
} from "lucide-react";

// ==========================================
// Custom TipTap Extensions (Word / OneNote)
// ==========================================

// Custom Font Size Extension
export const FontSize = Extension.create({
  name: 'fontSize',
  addOptions() {
    return { types: ['textStyle'] };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: element => element.style.fontSize.replace(/['"]+/g, ''),
            renderHTML: attributes => {
              if (!attributes.fontSize) return {};
              return { style: `font-size: ${attributes.fontSize}` };
            },
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setFontSize: fontSize => ({ chain }) => {
        return chain().setMark('textStyle', { fontSize }).run();
      },
      unsetFontSize: () => ({ chain }) => {
        return chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run();
      },
    };
  },
});

// Custom Line Height Extension (Paragraph & Block Spacing)
export const LineHeight = Extension.create({
  name: 'lineHeight',
  addOptions() {
    return {
      types: ['paragraph', 'heading', 'listItem', 'blockquote'],
    };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: element => element.style.lineHeight || null,
            renderHTML: attributes => {
              if (!attributes.lineHeight) return {};
              return { style: `line-height: ${attributes.lineHeight}` };
            },
          },
        },
      },
    ];
  },
  addCommands(): any {
    return {
      setLineHeight: (lineHeight: string) => ({ tr, state, dispatch }: any) => {
        const { selection } = state;
        let applicable = false;
        if (selection.empty) {
          const { $from } = selection;
          for (let d = $from.depth; d > 0; d--) {
            const node = $from.node(d);
            if (this.options.types.includes(node.type.name)) {
              applicable = true;
              const pos = $from.before(d);
              tr = tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                lineHeight: lineHeight || null,
              });
              break;
            }
          }
        } else {
          const { from, to } = selection;
          state.doc.nodesBetween(from, to, (node: any, pos: any) => {
            if (this.options.types.includes(node.type.name)) {
              applicable = true;
              tr = tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                lineHeight: lineHeight || null,
              });
            }
          });
        }
        if (applicable && dispatch) {
          dispatch(tr);
        }
        return applicable;
      },
      unsetLineHeight: () => ({ tr, state, dispatch }: any) => {
        const { selection } = state;
        let applicable = false;
        if (selection.empty) {
          const { $from } = selection;
          for (let d = $from.depth; d > 0; d--) {
            const node = $from.node(d);
            if (this.options.types.includes(node.type.name)) {
              applicable = true;
              const pos = $from.before(d);
              const newAttrs = { ...node.attrs };
              delete newAttrs.lineHeight;
              tr = tr.setNodeMarkup(pos, undefined, newAttrs);
              break;
            }
          }
        } else {
          const { from, to } = selection;
          state.doc.nodesBetween(from, to, (node: any, pos: any) => {
            if (this.options.types.includes(node.type.name)) {
              applicable = true;
              const newAttrs = { ...node.attrs };
              delete newAttrs.lineHeight;
              tr = tr.setNodeMarkup(pos, undefined, newAttrs);
            }
          });
        }
        if (applicable && dispatch) {
          dispatch(tr);
        }
        return applicable;
      },
    };
  },
});

// Custom Paragraph & List Indent Extension
export const Indent = Extension.create({
  name: 'indent',
  addOptions() {
    return {
      types: ['paragraph', 'heading', 'blockquote'],
      minIndent: 0,
      maxIndent: 8,
    };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          indent: {
            default: 0,
            parseHTML: element => {
              const val = element.getAttribute('data-indent');
              if (val) return parseInt(val, 10);
              const marginLeft = element.style.marginLeft;
              if (marginLeft) {
                const px = parseInt(marginLeft, 10);
                return Math.min(8, Math.max(0, Math.round(px / 28)));
              }
              return 0;
            },
            renderHTML: attributes => {
              if (!attributes.indent || attributes.indent <= 0) return {};
              return {
                'data-indent': attributes.indent,
                style: `margin-left: ${attributes.indent * 28}px`,
              };
            },
          },
        },
      },
    ];
  },
  addCommands(): any {
    return {
      indent: () => ({ tr, state, dispatch }: any) => {
        const { selection } = state;
        let applicable = false;
        if (selection.empty) {
          const { $from } = selection;
          for (let d = $from.depth; d > 0; d--) {
            const node = $from.node(d);
            if (this.options.types.includes(node.type.name)) {
              applicable = true;
              const pos = $from.before(d);
              const currentIndent = node.attrs.indent || 0;
              if (currentIndent < this.options.maxIndent) {
                tr = tr.setNodeMarkup(pos, undefined, {
                  ...node.attrs,
                  indent: currentIndent + 1,
                });
              }
              break;
            }
          }
        } else {
          const { from, to } = selection;
          state.doc.nodesBetween(from, to, (node: any, pos: any) => {
            if (this.options.types.includes(node.type.name)) {
              applicable = true;
              const currentIndent = node.attrs.indent || 0;
              if (currentIndent < this.options.maxIndent) {
                tr = tr.setNodeMarkup(pos, undefined, {
                  ...node.attrs,
                  indent: currentIndent + 1,
                });
              }
            }
          });
        }
        if (applicable && dispatch) {
          dispatch(tr);
        }
        return applicable;
      },
      outdent: () => ({ tr, state, dispatch }: any) => {
        const { selection } = state;
        let applicable = false;
        if (selection.empty) {
          const { $from } = selection;
          for (let d = $from.depth; d > 0; d--) {
            const node = $from.node(d);
            if (this.options.types.includes(node.type.name)) {
              applicable = true;
              const pos = $from.before(d);
              const currentIndent = node.attrs.indent || 0;
              if (currentIndent > this.options.minIndent) {
                tr = tr.setNodeMarkup(pos, undefined, {
                  ...node.attrs,
                  indent: currentIndent - 1,
                });
              }
              break;
            }
          }
        } else {
          const { from, to } = selection;
          state.doc.nodesBetween(from, to, (node: any, pos: any) => {
            if (this.options.types.includes(node.type.name)) {
              applicable = true;
              const currentIndent = node.attrs.indent || 0;
              if (currentIndent > this.options.minIndent) {
                tr = tr.setNodeMarkup(pos, undefined, {
                  ...node.attrs,
                  indent: currentIndent - 1,
                });
              }
            }
          });
        }
        if (applicable && dispatch) {
          dispatch(tr);
        }
        return applicable;
      },
    };
  },
  addKeyboardShortcuts() {
    return {
      Tab: () => {
        if (this.editor.isActive('listItem') || this.editor.isActive('taskItem')) {
          return false;
        }
        return (this.editor.commands as any).indent();
      },
      'Shift-Tab': () => {
        if (this.editor.isActive('listItem') || this.editor.isActive('taskItem')) {
          return false;
        }
        return (this.editor.commands as any).outdent();
      },
    };
  },
});

// Custom Subscript & Superscript Marks
export const Subscript = Mark.create({
  name: 'subscript',
  parseHTML() {
    return [{ tag: 'sub' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['sub', HTMLAttributes, 0];
  },
  addCommands(): any {
    return {
      setSubscript: () => ({ commands }: any) => commands.setMark(this.name),
      toggleSubscript: () => ({ commands }: any) => commands.toggleMark(this.name),
      unsetSubscript: () => ({ commands }: any) => commands.unsetMark(this.name),
    };
  },
});

export const Superscript = Mark.create({
  name: 'superscript',
  parseHTML() {
    return [{ tag: 'sup' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['sup', HTMLAttributes, 0];
  },
  addCommands(): any {
    return {
      setSuperscript: () => ({ commands }: any) => commands.setMark(this.name),
      toggleSuperscript: () => ({ commands }: any) => commands.toggleMark(this.name),
      unsetSuperscript: () => ({ commands }: any) => commands.unsetMark(this.name),
    };
  },
});

// ==========================================
// Formatting Constants & Helper Functions
// ==========================================

export const FONT_OPTIONS = [
  { value: "", label: "Font" },
  { value: "Arial, sans-serif", label: "Arial" },
  { value: "Calibri, sans-serif", label: "Calibri" },
  { value: "Cambria, serif", label: "Cambria" },
  { value: "Comic Sans MS, cursive", label: "Comic Sans" },
  { value: "Consolas, monospace", label: "Consolas" },
  { value: "Courier New, monospace", label: "Courier New" },
  { value: "Georgia, serif", label: "Georgia" },
  { value: "Helvetica, sans-serif", label: "Helvetica" },
  { value: "Impact, sans-serif", label: "Impact" },
  { value: "Inter, sans-serif", label: "Inter" },
  { value: "Menlo, monospace", label: "Menlo" },
  { value: "Palatino, serif", label: "Palatino" },
  { value: "Roboto, sans-serif", label: "Roboto" },
  { value: "Times New Roman, serif", label: "Times New Roman" },
  { value: "Verdana, sans-serif", label: "Verdana" },
];

export const SIZE_OPTIONS = [
  { value: "", label: "Size" },
  { value: "8px", label: "8" },
  { value: "9px", label: "9" },
  { value: "10px", label: "10" },
  { value: "11px", label: "11" },
  { value: "12px", label: "12" },
  { value: "14px", label: "14" },
  { value: "16px", label: "16" },
  { value: "18px", label: "18" },
  { value: "20px", label: "20" },
  { value: "22px", label: "22" },
  { value: "24px", label: "24" },
  { value: "26px", label: "26" },
  { value: "28px", label: "28" },
  { value: "36px", label: "36" },
  { value: "48px", label: "48" },
  { value: "72px", label: "72" },
];

export const LINE_SPACING_OPTIONS = [
  { value: "", label: "Default" },
  { value: "1.0", label: "1.0 (Single)" },
  { value: "1.15", label: "1.15" },
  { value: "1.25", label: "1.25" },
  { value: "1.5", label: "1.5" },
  { value: "2.0", label: "2.0 (Double)" },
  { value: "2.5", label: "2.5" },
  { value: "3.0", label: "3.0" },
];

export const STYLE_OPTIONS = [
  { value: "p", label: "Normal (Body)" },
  { value: "h1", label: "Heading 1" },
  { value: "h2", label: "Heading 2" },
  { value: "h3", label: "Heading 3" },
  { value: "quote", label: "Blockquote" },
  { value: "codeBlock", label: "Code Block" },
];

export const HIGHLIGHT_COLORS = [
  { color: "#fef08a", label: "Yellow" },
  { color: "#bbf7d0", label: "Green" },
  { color: "#bae6fd", label: "Cyan" },
  { color: "#fbcfe8", label: "Pink" },
  { color: "#fed7aa", label: "Orange" },
  { color: "#e9d5ff", label: "Purple" },
  { color: "#fecaca", label: "Red" },
  { color: "#e4e4e7", label: "Gray" },
  { color: "none", label: "No Color" },
];

export const executeIndent = (editor: Editor) => {
  if (editor.can().sinkListItem('listItem')) {
    editor.chain().focus().sinkListItem('listItem').run();
  } else if (editor.can().sinkListItem('taskItem')) {
    editor.chain().focus().sinkListItem('taskItem').run();
  } else {
    (editor.chain().focus() as any).indent().run();
  }
};

export const executeOutdent = (editor: Editor) => {
  if (editor.can().liftListItem('listItem')) {
    editor.chain().focus().liftListItem('listItem').run();
  } else if (editor.can().liftListItem('taskItem')) {
    editor.chain().focus().liftListItem('taskItem').run();
  } else {
    (editor.chain().focus() as any).outdent().run();
  }
};

export const getCurrentStyle = (editor: Editor | null): string => {
  if (!editor) return "p";
  if (editor.isActive('heading', { level: 1 })) return "h1";
  if (editor.isActive('heading', { level: 2 })) return "h2";
  if (editor.isActive('heading', { level: 3 })) return "h3";
  if (editor.isActive('blockquote')) return "quote";
  if (editor.isActive('codeBlock')) return "codeBlock";
  return "p";
};

export const applyStyle = (editor: Editor, style: string) => {
  const chain = editor.chain().focus();
  if (style === "p") {
    chain.setParagraph().run();
  } else if (style === "h1") {
    chain.setHeading({ level: 1 }).run();
  } else if (style === "h2") {
    chain.setHeading({ level: 2 }).run();
  } else if (style === "h3") {
    chain.setHeading({ level: 3 }).run();
  } else if (style === "quote") {
    chain.setBlockquote().run();
  } else if (style === "codeBlock") {
    chain.setCodeBlock().run();
  }
};

export const getCurrentLineSpacing = (editor: Editor | null): string => {
  if (!editor) return "";
  const { state } = editor;
  const { selection } = state;
  const { $from } = selection;
  for (let d = $from.depth; d > 0; d--) {
    const node = $from.node(d);
    if (node.attrs && node.attrs.lineHeight) {
      return String(node.attrs.lineHeight);
    }
  }
  return "";
};

export const clearFormatting = (editor: Editor) => {
  editor.chain().focus().unsetAllMarks().clearNodes().run();
  (editor.chain().focus() as any).unsetLineHeight?.().run();
  (editor.chain().focus() as any).unsetFontSize?.().run();
  editor.chain().focus().unsetFontFamily().run();
};

export const handleToggleLink = (editor: Editor) => {
  if (editor.isActive('link')) {
    editor.chain().focus().unsetLink().run();
    return;
  }
  const previousUrl = editor.getAttributes('link').href || '';
  const url = window.prompt('Enter URL:', previousUrl);
  if (url === null) return;
  if (url.trim() === '') {
    editor.chain().focus().unsetLink().run();
    return;
  }
  const formattedUrl = url.startsWith('http://') || url.startsWith('https://') || url.startsWith('mailto:') 
    ? url.trim() 
    : `https://${url.trim()}`;
  editor.chain().focus().setLink({ href: formattedUrl }).run();
};

// ==========================================
// Reusable Dropdown Menus
// ==========================================

export function BubbleDropdown({
  label,
  value,
  options,
  onSelect,
  width = "w-28",
}: {
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onSelect: (val: string) => void;
  width?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="flex items-center justify-between gap-1 px-1.5 py-1 text-xs rounded bg-zinc-800/90 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors"
      >
        <span className="truncate max-w-[4.8rem]">{selected && selected.value ? selected.label : label}</span>
        <ChevronDown size={10} className="opacity-60 flex-shrink-0" />
      </button>

      {isOpen && (
        <div 
          className={`absolute top-full mt-1 left-0 ${width} max-h-56 overflow-y-auto bg-zinc-900 border border-zinc-700 rounded-md shadow-2xl py-1 z-[10000]`}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onSelect(opt.value);
                setIsOpen(false);
              }}
              className={`w-full text-left px-2 py-1 text-xs hover:bg-zinc-800 transition-colors ${
                value === opt.value ? 'bg-primary-600/30 text-primary-400 font-medium' : 'text-zinc-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Line Spacing Dropdown Component
export function LineSpacingDropdown({
  editor,
  dropdownWidth = "w-44",
  placement = "bottom",
}: {
  editor: Editor | null;
  dropdownWidth?: string;
  placement?: "bottom" | "top";
}) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const currentLineHeight = getCurrentLineSpacing(editor);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (editor) setIsOpen(!isOpen);
        }}
        disabled={!editor}
        className={`flex items-center gap-0.5 p-1.5 rounded transition-colors ${
          isOpen ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-white' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
        } ${!editor ? 'opacity-40 cursor-not-allowed' : ''}`}
        title="Line and Paragraph Spacing"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 4v16M4 7l3-3 3 3M4 17l3 3 3-3M13 6h8M13 12h8M13 18h8" />
        </svg>
        <ChevronDown size={10} className="opacity-60 flex-shrink-0" />
      </button>

      {isOpen && editor && (
        <div
          className={`absolute ${placement === "top" ? "bottom-full mb-1" : "top-full mt-1"} left-0 ${dropdownWidth} bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl py-1 z-[10000] text-xs font-sans`}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <div className="px-3 py-1 text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
            Line Spacing
          </div>
          {LINE_SPACING_OPTIONS.map((opt) => {
            const isSelected = currentLineHeight === opt.value || (!currentLineHeight && opt.value === "");
            return (
              <button
                key={opt.value}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (opt.value === "") {
                    (editor.chain().focus() as any).unsetLineHeight().run();
                  } else {
                    (editor.chain().focus() as any).setLineHeight(opt.value).run();
                  }
                  setIsOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors ${
                  isSelected ? 'text-primary-600 dark:text-primary-400 font-semibold bg-primary-50/50 dark:bg-primary-900/20' : 'text-zinc-700 dark:text-zinc-200'
                }`}
              >
                <span>{opt.label}</span>
                {isSelected && <span className="text-primary-600 dark:text-primary-400 font-bold">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Highlight Color Dropdown Component
export function HighlightDropdown({
  editor,
  isOpen,
  onToggle,
  onClose,
  placement = "bottom",
}: {
  editor: Editor | null;
  isOpen?: boolean;
  onToggle?: () => void;
  onClose?: () => void;
  placement?: "bottom" | "top";
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const openState = isOpen !== undefined ? isOpen : internalOpen;
  const setOpenState = (v: boolean) => {
    if (onToggle) {
      onToggle();
    } else {
      setInternalOpen(v);
    }
  };

  useEffect(() => {
    if (!openState) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        if (onClose) onClose();
        else setInternalOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openState, onClose]);

  const activeHighlight = editor?.getAttributes('highlight')?.color;

  return (
    <div className="relative inline-flex items-center" ref={ref}>
      <div className="flex items-center rounded overflow-hidden">
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            if (!editor) return;
            if (editor.isActive('highlight')) {
              editor.chain().focus().unsetHighlight().run();
            } else {
              editor.chain().focus().setHighlight({ color: activeHighlight || '#fef08a' }).run();
            }
          }}
          disabled={!editor}
          className={`p-1.5 transition-colors ${
            editor?.isActive('highlight')
              ? 'bg-yellow-200/90 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-400'
              : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
          } ${!editor ? 'opacity-40 cursor-not-allowed' : ''}`}
          title="Highlight Text"
        >
          <Highlighter size={14} />
        </button>

        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (editor) setOpenState(!openState);
          }}
          disabled={!editor}
          className={`p-1 pl-0.5 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors ${
            !editor ? 'opacity-40 cursor-not-allowed' : ''
          }`}
          title="Highlight Colors"
        >
          <ChevronDown size={10} />
        </button>
      </div>

      {openState && editor && (
        <div
          className={`absolute ${placement === "top" ? "bottom-full mb-1" : "top-full mt-1"} left-0 w-44 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl p-2 z-[10000] text-xs font-sans`}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <div className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1.5 px-1">
            Highlight Color
          </div>
          <div className="grid grid-cols-4 gap-1.5 mb-2">
            {HIGHLIGHT_COLORS.filter(c => c.color !== 'none').map((c) => (
              <button
                key={c.color}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  editor.chain().focus().setHighlight({ color: c.color }).run();
                  if (onClose) onClose();
                  else setInternalOpen(false);
                }}
                className="w-7 h-7 rounded border border-zinc-300 dark:border-zinc-700 hover:scale-110 active:scale-95 transition-transform flex items-center justify-center shadow-xs"
                style={{ backgroundColor: c.color }}
                title={c.label}
              />
            ))}
          </div>

          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              editor.chain().focus().unsetHighlight().run();
              if (onClose) onClose();
              else setInternalOpen(false);
            }}
            className="w-full flex items-center gap-1.5 px-2 py-1 text-xs text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"
          >
            <span className="w-4 h-4 rounded border border-dashed border-zinc-400 flex items-center justify-center text-[10px] text-red-500">✕</span>
            <span>No Color</span>
          </button>
        </div>
      )}
    </div>
  );
}

// ==========================================
// Main TipTapEditor Component
// ==========================================

interface TipTapEditorProps {
  id: string;
  content: string;
  onChange: (content: string) => void;
  onDelete: () => void;
  isFocused?: boolean;
  setActiveEditor?: (editor: Editor | null) => void;
  onEditorUpdate?: () => void;
  onBlurText?: (text: string) => void;
}

export function TipTapEditor({ id, content, onChange, onDelete, setActiveEditor, onEditorUpdate, onBlurText }: TipTapEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [openBubbleHighlight, setOpenBubbleHighlight] = useState(false);

  const editor = useEditor({
    extensions: [
      (StarterKit.configure as any)({
        history: false,
      }),
      TextStyle,
      Color,
      FontFamily,
      Highlight.configure({ multicolor: true }),
      Underline,
      FontSize,
      LineHeight,
      Indent,
      Subscript,
      Superscript,
      TextAlign.configure({ 
        types: ['heading', 'paragraph'], 
        alignments: ['left', 'center', 'right', 'justify'] 
      }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Link.configure({
        openOnClick: true,
        autolink: true,
        defaultProtocol: 'https',
      }),
    ],
    content: content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
      onEditorUpdate?.();
    },
    onSelectionUpdate: ({ editor }) => {
      setActiveEditor?.(editor);
      onEditorUpdate?.();
    },
    onFocus: ({ editor }) => {
      setActiveEditor?.(editor);
      onEditorUpdate?.();
    },
    onBlur: ({ editor }) => {
      if (editor.isEmpty) {
        onDelete();
      } else {
        onBlurText?.(editor.getText());
      }
    },
  });

  // Focus on initial mount if empty template
  useEffect(() => {
    if (editor && content === "<p></p>") {
      editor.commands.focus();
    }
  }, [editor, content]);

  // Sync external content changes (e.g. from global Undo/Redo)
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      const { from, to } = editor.state.selection;
      editor.commands.setContent(content, { emitUpdate: false });
      try {
        editor.commands.setTextSelection({ from, to });
      } catch (e) {}
    }
  }, [content, editor]);

  if (!editor) {
    return null;
  }

  return (
    <div className="group relative w-full h-full bg-transparent">
      {/* Editor Content with Word / OneNote Typography styles */}
      <div className="p-0 prose dark:prose-invert max-w-none focus:outline-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:text-[16px] [&_.ProseMirror]:leading-[32px] [&_.ProseMirror_p]:text-[16px] [&_.ProseMirror_p]:leading-[32px] [&_.ProseMirror_p]:m-0 [&_.ProseMirror_p]:p-0 [&_.ProseMirror_p]:min-h-[32px] [&_.ProseMirror_li]:text-[16px] [&_.ProseMirror_li]:leading-[32px] [&_.ProseMirror_li]:m-0 [&_.ProseMirror_h1]:text-[24px] [&_.ProseMirror_h1]:leading-[64px] [&_.ProseMirror_h1]:m-0 [&_.ProseMirror_h2]:text-[20px] [&_.ProseMirror_h2]:leading-[56px] [&_.ProseMirror_h2]:m-0 [&_.ProseMirror_h3]:text-[18px] [&_.ProseMirror_h3]:leading-[48px] [&_.ProseMirror_h3]:m-0 [&_.ProseMirror_blockquote]:border-l-4 [&_.ProseMirror_blockquote]:border-primary-500 [&_.ProseMirror_blockquote]:pl-3 [&_.ProseMirror_blockquote]:italic [&_.ProseMirror_blockquote]:my-1 [&_.ProseMirror_pre]:bg-zinc-100 dark:[&_.ProseMirror_pre]:bg-zinc-800/80 [&_.ProseMirror_pre]:p-2.5 [&_.ProseMirror_pre]:rounded-md [&_.ProseMirror_pre]:font-mono [&_.ProseMirror_pre]:text-sm [&_.ProseMirror_code]:bg-zinc-100 dark:[&_.ProseMirror_code]:bg-zinc-800 [&_.ProseMirror_code]:px-1.5 [&_.ProseMirror_code]:py-0.5 [&_.ProseMirror_code]:rounded [&_.ProseMirror_code]:text-sm [&_.ProseMirror_code]:font-mono [&_.ProseMirror_sub]:text-[0.75em] [&_.ProseMirror_sub]:align-sub [&_.ProseMirror_sup]:text-[0.75em] [&_.ProseMirror_sup]:align-super [&_.ProseMirror_hr]:border-t-2 [&_.ProseMirror_hr]:border-zinc-300 dark:[&_.ProseMirror_hr]:border-zinc-700 [&_.ProseMirror_hr]:my-3 [&_.ProseMirror_a]:text-primary-600 dark:[&_.ProseMirror_a]:text-primary-400 [&_.ProseMirror_a]:underline prose-p:my-0 prose-p:leading-[32px] prose-p:whitespace-pre-wrap prose-li:marker:text-inherit">
        <EditorContent editor={editor} />
      </div>

      {/* Floating Microsoft Word / OneNote Style BubbleMenu */}
      {editor && (
        <BubbleMenu 
          editor={editor}
          appendTo={typeof document !== 'undefined' ? () => document.body : undefined}
          options={{
            strategy: "fixed",
            placement: "top",
            offset: 8
          }}
          shouldShow={({ editor }) => {
            if (!editor || editor.isDestroyed) return false;
            return !editor.state.selection.empty;
          }}
          className="flex items-center bg-zinc-900/95 text-white rounded-xl shadow-2xl border border-zinc-700/80 px-2 py-1.5 z-[9999] backdrop-blur-md gap-1 max-w-[calc(100vw-32px)] overflow-x-auto no-scrollbar"
        >
          {/* Styles Dropdown (Normal, H1, H2, H3, Quote, Code) */}
          <BubbleDropdown
            label="Style"
            value={getCurrentStyle(editor)}
            options={STYLE_OPTIONS}
            width="w-32"
            onSelect={(val) => applyStyle(editor, val)}
          />

          {/* Font Family Dropdown */}
          <BubbleDropdown
            label="Font"
            value={editor.getAttributes('textStyle').fontFamily || ""}
            options={FONT_OPTIONS}
            width="w-36"
            onSelect={(val) => {
              if (val === "") {
                editor.chain().focus().unsetFontFamily().run();
              } else {
                editor.chain().focus().setFontFamily(val).run();
              }
            }}
          />

          {/* Font Size Dropdown */}
          <BubbleDropdown
            label="Size"
            value={editor.getAttributes('textStyle').fontSize || ""}
            options={SIZE_OPTIONS}
            width="w-20"
            onSelect={(val) => {
              if (val === "") {
                (editor.chain().focus() as any).unsetFontSize().run();
              } else {
                (editor.chain().focus() as any).setFontSize(val).run();
              }
            }}
          />

          {/* Quick Increase Font Size (A▲) */}
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const currentSizeStr = editor.getAttributes('textStyle').fontSize || '16px';
              const currentNum = parseInt(currentSizeStr) || 16;
              const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72];
              const nextSize = SIZES.find(s => s > currentNum) || (currentNum + 4);
              (editor.chain().focus() as any).setFontSize(`${nextSize}px`).run();
            }}
            className="p-1 hover:bg-zinc-800 rounded transition-colors flex items-center font-bold text-xs text-zinc-200"
            title="Increase Font Size (A▲)"
          >
            <span>A</span><span className="text-[9px] leading-none ml-0.5">▲</span>
          </button>

          {/* Quick Decrease Font Size (A▼) */}
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const currentSizeStr = editor.getAttributes('textStyle').fontSize || '16px';
              const currentNum = parseInt(currentSizeStr) || 16;
              const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72];
              const prevSize = [...SIZES].reverse().find(s => s < currentNum) || Math.max(8, currentNum - 2);
              (editor.chain().focus() as any).setFontSize(`${prevSize}px`).run();
            }}
            className="p-1 hover:bg-zinc-800 rounded transition-colors flex items-center font-bold text-xs text-zinc-200"
            title="Decrease Font Size (A▼)"
          >
            <span>A</span><span className="text-[9px] leading-none ml-0.5">▼</span>
          </button>

          {/* Clear Formatting */}
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              clearFormatting(editor);
            }}
            className="p-1.5 hover:bg-zinc-800 text-zinc-300 hover:text-white rounded transition-colors"
            title="Clear Formatting"
          >
            <RemoveFormatting size={13} />
          </button>

          <div className="w-px h-5 bg-zinc-700/80 self-center mx-0.5" />

          {/* Bold, Italic, Underline, Strikethrough, Sub, Sup */}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`p-1.5 hover:bg-zinc-800 rounded ${editor.isActive('bold') ? 'bg-zinc-700 text-white font-bold' : 'text-zinc-300'}`}
            title="Bold"
          >
            <Bold size={13} />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`p-1.5 hover:bg-zinc-800 rounded ${editor.isActive('italic') ? 'bg-zinc-700 text-white italic' : 'text-zinc-300'}`}
            title="Italic"
          >
            <Italic size={13} />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={`p-1.5 hover:bg-zinc-800 rounded ${editor.isActive('underline') ? 'bg-zinc-700 text-white underline' : 'text-zinc-300'}`}
            title="Underline"
          >
            <UnderlineIcon size={13} />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().toggleStrike().run()}
            className={`p-1.5 hover:bg-zinc-800 rounded ${editor.isActive('strike') ? 'bg-zinc-700 text-white line-through' : 'text-zinc-300'}`}
            title="Strikethrough"
          >
            <Strikethrough size={13} />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => (editor.chain().focus() as any).toggleSubscript().run()}
            className={`p-1.5 hover:bg-zinc-800 rounded ${(editor as any).isActive('subscript') ? 'bg-zinc-700 text-white' : 'text-zinc-300'}`}
            title="Subscript (X₂)"
          >
            <SubscriptIcon size={13} />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => (editor.chain().focus() as any).toggleSuperscript().run()}
            className={`p-1.5 hover:bg-zinc-800 rounded ${(editor as any).isActive('superscript') ? 'bg-zinc-700 text-white' : 'text-zinc-300'}`}
            title="Superscript (X²)"
          >
            <SuperscriptIcon size={13} />
          </button>

          <div className="w-px h-5 bg-zinc-700/80 self-center mx-0.5" />

          {/* Highlighter Dropdown */}
          <HighlightDropdown 
            editor={editor}
            placement="bottom"
            isOpen={openBubbleHighlight}
            onToggle={() => setOpenBubbleHighlight(!openBubbleHighlight)}
            onClose={() => setOpenBubbleHighlight(false)}
          />

          {/* Quick Color Dots */}
          <div className="flex items-center gap-1 px-1">
            {['#ffffff', '#000000', '#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'].map(color => (
              <button
                key={color}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  editor.chain().focus().setColor(color).run();
                }}
                className={`w-3.5 h-3.5 rounded-full border transition-transform hover:scale-125 ${
                  editor.getAttributes('textStyle')?.color === color ? 'border-white scale-110 ring-1 ring-white/50' : 'border-zinc-600'
                }`}
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
            <input
              type="color"
              className="w-4 h-4 p-0 border-0 rounded cursor-pointer bg-transparent"
              value={editor.getAttributes('textStyle')?.color || '#ffffff'}
              onPointerDown={(e) => e.stopPropagation()}
              onInput={(e) => {
                editor.chain().focus().setColor((e.target as HTMLInputElement).value).run();
              }}
              title="More Colors"
            />
          </div>

          <div className="w-px h-5 bg-zinc-700/80 self-center mx-0.5" />

          {/* Alignments */}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
            className={`p-1.5 hover:bg-zinc-800 rounded ${editor.isActive({ textAlign: 'left' }) ? 'bg-zinc-700 text-white' : 'text-zinc-300'}`}
            title="Align Left"
          >
            <AlignLeft size={13} />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
            className={`p-1.5 hover:bg-zinc-800 rounded ${editor.isActive({ textAlign: 'center' }) ? 'bg-zinc-700 text-white' : 'text-zinc-300'}`}
            title="Align Center"
          >
            <AlignCenter size={13} />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().setTextAlign('right').run()}
            className={`p-1.5 hover:bg-zinc-800 rounded ${editor.isActive({ textAlign: 'right' }) ? 'bg-zinc-700 text-white' : 'text-zinc-300'}`}
            title="Align Right"
          >
            <AlignRight size={13} />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().setTextAlign('justify').run()}
            className={`p-1.5 hover:bg-zinc-800 rounded ${editor.isActive({ textAlign: 'justify' }) ? 'bg-zinc-700 text-white' : 'text-zinc-300'}`}
            title="Justify"
          >
            <AlignJustify size={13} />
          </button>

          {/* Indent & Outdent */}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => executeOutdent(editor)}
            className="p-1.5 hover:bg-zinc-800 rounded text-zinc-300 hover:text-white"
            title="Decrease Indent (Shift+Tab)"
          >
            <OutdentIcon size={13} />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => executeIndent(editor)}
            className="p-1.5 hover:bg-zinc-800 rounded text-zinc-300 hover:text-white"
            title="Increase Indent (Tab)"
          >
            <IndentIcon size={13} />
          </button>

          {/* Line Spacing Adjuster */}
          <LineSpacingDropdown 
            editor={editor}
            placement="bottom"
          />

          <div className="w-px h-5 bg-zinc-700/80 self-center mx-0.5" />

          {/* Lists */}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`p-1.5 hover:bg-zinc-800 rounded ${editor.isActive('bulletList') ? 'bg-zinc-700 text-white' : 'text-zinc-300'}`}
            title="Bullet List"
          >
            <List size={13} />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={`p-1.5 hover:bg-zinc-800 rounded ${editor.isActive('orderedList') ? 'bg-zinc-700 text-white' : 'text-zinc-300'}`}
            title="Numbered List"
          >
            <ListOrdered size={13} />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => (editor.chain().focus() as any).toggleTaskList().run()}
            className={`p-1.5 hover:bg-zinc-800 rounded ${(editor as any).isActive('taskList') ? 'bg-zinc-700 text-primary-400' : 'text-zinc-300'}`}
            title="To-Do Checklist"
          >
            <CheckSquare size={13} />
          </button>

          {/* Link */}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => handleToggleLink(editor)}
            className={`p-1.5 hover:bg-zinc-800 rounded ${editor.isActive('link') ? 'bg-primary-600 text-white' : 'text-zinc-300'}`}
            title={editor.isActive('link') ? "Remove Link" : "Insert Link"}
          >
            <Link2 size={13} />
          </button>
        </BubbleMenu>
      )}
    </div>
  );
}
