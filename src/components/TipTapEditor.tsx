"use client";

import React, { useEffect, useState, useRef, useCallback, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
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
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
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

// Custom Paragraph Spacing Extension (Space After & Space Before)
export const ParagraphSpacing = Extension.create({
  name: 'paragraphSpacing',
  addOptions() {
    return {
      types: ['paragraph', 'heading', 'blockquote'],
    };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          spaceAfter: {
            default: null,
            parseHTML: element => element.getAttribute('data-space-after') || element.style.marginBottom || null,
            renderHTML: attributes => {
              if (!attributes.spaceAfter) return {};
              return {
                'data-space-after': attributes.spaceAfter,
                style: `margin-bottom: ${attributes.spaceAfter}`,
              };
            },
          },
          spaceBefore: {
            default: null,
            parseHTML: element => element.getAttribute('data-space-before') || element.style.marginTop || null,
            renderHTML: attributes => {
              if (!attributes.spaceBefore) return {};
              return {
                'data-space-before': attributes.spaceBefore,
                style: `margin-top: ${attributes.spaceBefore}`,
              };
            },
          },
        },
      },
    ];
  },
  addCommands(): any {
    return {
      setParagraphSpacing: (options: { spaceAfter?: string | null; spaceBefore?: string | null }) => ({ tr, state, dispatch }: any) => {
        const { selection } = state;
        let applicable = false;
        const updateNode = (pos: number, node: any) => {
          applicable = true;
          const newAttrs = { ...node.attrs };
          if (options.spaceAfter !== undefined) {
            newAttrs.spaceAfter = options.spaceAfter || null;
          }
          if (options.spaceBefore !== undefined) {
            newAttrs.spaceBefore = options.spaceBefore || null;
          }
          tr = tr.setNodeMarkup(pos, undefined, newAttrs);
        };

        if (selection.empty) {
          const { $from } = selection;
          for (let d = $from.depth; d > 0; d--) {
            const node = $from.node(d);
            if (this.options.types.includes(node.type.name)) {
              updateNode($from.before(d), node);
              break;
            }
          }
        } else {
          const { from, to } = selection;
          state.doc.nodesBetween(from, to, (node: any, pos: any) => {
            if (this.options.types.includes(node.type.name)) {
              updateNode(pos, node);
            }
          });
        }
        if (applicable && dispatch) {
          dispatch(tr);
        }
        return applicable;
      },
      unsetParagraphSpacing: () => ({ tr, state, dispatch }: any) => {
        const { selection } = state;
        let applicable = false;
        const clearNode = (pos: number, node: any) => {
          applicable = true;
          const newAttrs = { ...node.attrs };
          delete newAttrs.spaceAfter;
          delete newAttrs.spaceBefore;
          tr = tr.setNodeMarkup(pos, undefined, newAttrs);
        };

        if (selection.empty) {
          const { $from } = selection;
          for (let d = $from.depth; d > 0; d--) {
            const node = $from.node(d);
            if (this.options.types.includes(node.type.name)) {
              clearNode($from.before(d), node);
              break;
            }
          }
        } else {
          const { from, to } = selection;
          state.doc.nodesBetween(from, to, (node: any, pos: any) => {
            if (this.options.types.includes(node.type.name)) {
              clearNode(pos, node);
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

export const PARAGRAPH_SPACING_OPTIONS = [
  { value: "0px", label: "0 pt (No space)" },
  { value: "4px", label: "4 pt (Compact)" },
  { value: "8px", label: "8 pt (Tight)" },
  { value: "12px", label: "10 pt (Normal)" },
  { value: "16px", label: "14 pt (Relaxed)" },
  { value: "24px", label: "18 pt (Loose)" },
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

export const TEXT_PALETTE_COLORS = [
  // Neutrals & Monochrome
  { color: "#000000", label: "Black" },
  { color: "#374151", label: "Dark Gray" },
  { color: "#6b7280", label: "Gray" },
  { color: "#9ca3af", label: "Light Gray" },
  { color: "#ffffff", label: "White" },
  // Warm colors
  { color: "#ef4444", label: "Red" },
  { color: "#f97316", label: "Orange" },
  { color: "#f59e0b", label: "Amber" },
  { color: "#eab308", label: "Yellow" },
  { color: "#84cc16", label: "Lime" },
  // Cool colors
  { color: "#10b981", label: "Green" },
  { color: "#06b6d4", label: "Cyan" },
  { color: "#3b82f6", label: "Blue" },
  { color: "#6366f1", label: "Indigo" },
  { color: "#8b5cf6", label: "Purple" },
  // Accents & Deep colors
  { color: "#ec4899", label: "Pink" },
  { color: "#d946ef", label: "Fuchsia" },
  { color: "#991b1b", label: "Dark Red" },
  { color: "#1e40af", label: "Dark Blue" },
  { color: "#065f46", label: "Dark Green" },
];

export const executeIndent = (editor: Editor) => {
  if (!editor || editor.isDestroyed) return;
  try {
    if (editor.can?.()?.sinkListItem?.('listItem')) {
      editor.chain().focus().sinkListItem('listItem').run();
    } else if (editor.can?.()?.sinkListItem?.('taskItem')) {
      editor.chain().focus().sinkListItem('taskItem').run();
    } else {
      (editor.chain().focus() as any).indent?.().run();
    }
  } catch (err) {
    console.warn("executeIndent failed:", err);
  }
};

export const executeOutdent = (editor: Editor) => {
  if (!editor || editor.isDestroyed) return;
  try {
    if (editor.can?.()?.liftListItem?.('listItem')) {
      editor.chain().focus().liftListItem('listItem').run();
    } else if (editor.can?.()?.liftListItem?.('taskItem')) {
      editor.chain().focus().liftListItem('taskItem').run();
    } else {
      (editor.chain().focus() as any).outdent?.().run();
    }
  } catch (err) {
    console.warn("executeOutdent failed:", err);
  }
};

export const getCurrentStyle = (editor: Editor | null): string => {
  if (!editor || editor.isDestroyed) return "p";
  try {
    if (editor.isActive('heading', { level: 1 })) return "h1";
    if (editor.isActive('heading', { level: 2 })) return "h2";
    if (editor.isActive('heading', { level: 3 })) return "h3";
    if (editor.isActive('blockquote')) return "quote";
    if (editor.isActive('codeBlock')) return "codeBlock";
  } catch {
    return "p";
  }
  return "p";
};

export const applyStyle = (editor: Editor, style: string) => {
  if (!editor || editor.isDestroyed) return;
  try {
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
  } catch (err) {
    console.warn("applyStyle failed:", err);
  }
};

export const getCurrentLineSpacing = (editor: Editor | null): string => {
  if (!editor || editor.isDestroyed) return "";
  try {
    const { state } = editor;
    if (!state) return "";
    const { selection } = state;
    const { $from } = selection;
    for (let d = $from.depth; d > 0; d--) {
      const node = $from.node(d);
      if (node?.attrs && node.attrs.lineHeight) {
        return String(node.attrs.lineHeight);
      }
    }
  } catch {
    return "";
  }
  return "";
};

export const getCurrentParagraphSpacing = (editor: Editor | null): { spaceAfter: string | null; spaceBefore: string | null } => {
  if (!editor || editor.isDestroyed) return { spaceAfter: null, spaceBefore: null };
  try {
    const { selection } = editor.state;
    let spaceAfter: string | null = null;
    let spaceBefore: string | null = null;
    if (selection.empty) {
      const { $from } = selection;
      for (let d = $from.depth; d > 0; d--) {
        const node = $from.node(d);
        if (['paragraph', 'heading', 'blockquote'].includes(node?.type?.name)) {
          spaceAfter = node.attrs.spaceAfter || null;
          spaceBefore = node.attrs.spaceBefore || null;
          break;
        }
      }
    } else {
      const { from, to } = selection;
      editor.state.doc.nodesBetween(from, to, (node: any) => {
        if (['paragraph', 'heading', 'blockquote'].includes(node?.type?.name)) {
          if (!spaceAfter) spaceAfter = node.attrs.spaceAfter || null;
          if (!spaceBefore) spaceBefore = node.attrs.spaceBefore || null;
        }
      });
    }
    return { spaceAfter, spaceBefore };
  } catch {
    return { spaceAfter: null, spaceBefore: null };
  }
};

export const clearFormatting = (editor: Editor) => {
  editor.chain().focus().unsetAllMarks().clearNodes().run();
  (editor.chain().focus() as any).unsetLineHeight?.().run();
  (editor.chain().focus() as any).unsetParagraphSpacing?.().run();
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
// Reusable Portal Positioning & Dropdown Menus
// ==========================================

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

interface UsePortalDropdownOptions {
  triggerRef: React.RefObject<HTMLElement | null>;
  isOpen: boolean;
  placement?: "bottom" | "top" | "auto";
  offset?: number;
  dropdownWidth?: number;
  dropdownHeight?: number;
}

export function usePortalDropdown({
  triggerRef,
  isOpen,
  placement = "bottom",
  offset = 4,
  dropdownWidth = 200,
  dropdownHeight = 260,
}: UsePortalDropdownOptions) {
  const [coords, setCoords] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    maxHeight?: number;
    placement: "top" | "bottom";
  } | null>(null);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current || typeof window === "undefined") return;
    const rect = triggerRef.current.getBoundingClientRect();

    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    let effPlacement: "top" | "bottom" = placement === "top" ? "top" : "bottom";
    if (placement === "auto") {
      effPlacement = spaceBelow < dropdownHeight && spaceAbove > spaceBelow ? "top" : "bottom";
    } else if (placement === "bottom") {
      if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
        effPlacement = "top";
      }
    } else if (placement === "top") {
      if (spaceAbove < dropdownHeight && spaceBelow > spaceAbove) {
        effPlacement = "bottom";
      }
    }

    const margin = 8;
    let left = rect.left;
    if (left + dropdownWidth > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - dropdownWidth - margin);
    }
    if (left < margin) {
      left = margin;
    }

    if (effPlacement === "top") {
      const maxHeight = Math.max(120, Math.min(360, rect.top - offset - margin));
      setCoords({
        bottom: window.innerHeight - rect.top + offset,
        left,
        maxHeight,
        placement: "top",
      });
    } else {
      const maxHeight = Math.max(120, Math.min(360, window.innerHeight - rect.bottom - offset - margin));
      setCoords({
        top: rect.bottom + offset,
        left,
        maxHeight,
        placement: "bottom",
      });
    }
  }, [triggerRef, placement, offset, dropdownWidth, dropdownHeight]);

  useIsomorphicLayoutEffect(() => {
    if (!isOpen) {
      setCoords(null);
      return;
    }

    updatePosition();

    const handleUpdate = () => updatePosition();
    window.addEventListener("resize", handleUpdate);
    window.addEventListener("scroll", handleUpdate, true);

    return () => {
      window.removeEventListener("resize", handleUpdate);
      window.removeEventListener("scroll", handleUpdate, true);
    };
  }, [isOpen, updatePosition]);

  return coords;
}

export function BubbleDropdown({
  label,
  value,
  options,
  onSelect,
  width = "w-28",
  dropdownWidth = 140,
  isOpen,
  onToggle,
  onClose,
}: {
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onSelect: (val: string) => void;
  width?: string;
  dropdownWidth?: number;
  isOpen?: boolean;
  onToggle?: () => void;
  onClose?: () => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const openState = isOpen !== undefined ? isOpen : internalOpen;
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  const handleToggle = () => {
    if (onToggle) onToggle();
    else setInternalOpen(!internalOpen);
  };

  const handleClose = () => {
    if (onClose) onClose();
    else setInternalOpen(false);
  };

  const coords = usePortalDropdown({
    triggerRef,
    isOpen: openState,
    placement: "bottom",
    dropdownWidth,
  });

  useEffect(() => {
    if (!openState) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      handleClose();
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [openState, onClose]);

  return (
    <div className="relative inline-block" ref={triggerRef}>
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleToggle();
        }}
        className={`flex items-center justify-between gap-1 px-1.5 py-1 text-xs rounded transition-colors ${
          openState
            ? 'bg-zinc-700 text-white border-zinc-600'
            : 'bg-zinc-800/90 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
        } border`}
      >
        <span className="truncate max-w-[4.8rem]">{selected && selected.value ? selected.label : label}</span>
        <ChevronDown size={10} className="opacity-60 flex-shrink-0" />
      </button>

      {openState && coords && typeof document !== 'undefined' && createPortal(
        <div 
          ref={menuRef}
          style={{
            position: 'fixed',
            top: coords.top !== undefined ? `${coords.top}px` : undefined,
            bottom: coords.bottom !== undefined ? `${coords.bottom}px` : undefined,
            left: `${coords.left}px`,
            maxHeight: coords.maxHeight !== undefined ? `${coords.maxHeight}px` : undefined,
            width: `${dropdownWidth}px`,
            zIndex: 999999,
          }}
          className="overflow-y-auto bg-zinc-900 border border-zinc-700 rounded-md shadow-2xl py-1 text-xs"
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
                handleClose();
              }}
              className={`w-full text-left px-2 py-1 text-xs hover:bg-zinc-800 transition-colors ${
                value === opt.value ? 'bg-primary-600/30 text-primary-400 font-medium' : 'text-zinc-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

// Line and Paragraph Spacing Dropdown Component (Word & OneNote style)
export function LineSpacingDropdown({
  editor,
  dropdownWidth = 230,
  placement = "bottom",
  isOpen,
  onToggle,
  onClose,
}: {
  editor: Editor | null;
  dropdownWidth?: number;
  placement?: "bottom" | "top";
  isOpen?: boolean;
  onToggle?: () => void;
  onClose?: () => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const openState = isOpen !== undefined ? isOpen : internalOpen;
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleToggle = () => {
    if (onToggle) onToggle();
    else setInternalOpen(!internalOpen);
  };

  const handleClose = () => {
    if (onClose) onClose();
    else setInternalOpen(false);
  };

  const coords = usePortalDropdown({
    triggerRef,
    isOpen: openState,
    placement,
    dropdownWidth,
    dropdownHeight: 340,
  });

  const currentLineHeight = getCurrentLineSpacing(editor);
  const currentParagraphSpacing = getCurrentParagraphSpacing(editor);
  const hasSpaceBefore = Boolean(currentParagraphSpacing.spaceBefore && currentParagraphSpacing.spaceBefore !== "0px");
  const hasSpaceAfter = Boolean(currentParagraphSpacing.spaceAfter && currentParagraphSpacing.spaceAfter !== "0px");

  useEffect(() => {
    if (!openState) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      handleClose();
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [openState, onClose]);

  return (
    <div className="relative inline-block" ref={triggerRef}>
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (editor) handleToggle();
        }}
        disabled={!editor}
        className={`flex items-center gap-0.5 p-1.5 rounded transition-colors ${
          openState
            ? 'bg-zinc-700 text-white'
            : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
        } ${!editor ? 'opacity-40 cursor-not-allowed' : ''}`}
        title="Line and Paragraph Spacing"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 4v16M4 7l3-3 3 3M4 17l3 3 3-3M13 6h8M13 12h8M13 18h8" />
        </svg>
        <ChevronDown size={10} className="opacity-60 flex-shrink-0" />
      </button>

      {openState && editor && coords && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: coords.top !== undefined ? `${coords.top}px` : undefined,
            bottom: coords.bottom !== undefined ? `${coords.bottom}px` : undefined,
            left: `${coords.left}px`,
            maxHeight: coords.maxHeight !== undefined ? `${coords.maxHeight}px` : undefined,
            width: `${dropdownWidth}px`,
            zIndex: 999999,
          }}
          className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl py-1 text-xs font-sans overflow-y-auto"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          {/* 1. Line Spacing Section */}
          <div className="px-3 py-1 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
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
                  handleClose();
                }}
                className={`w-full flex items-center justify-between px-3 py-1.5 hover:bg-zinc-800 transition-colors ${
                  isSelected ? 'text-primary-400 font-semibold bg-primary-900/30' : 'text-zinc-200'
                }`}
              >
                <span>{opt.label}</span>
                {isSelected && <span className="text-primary-400 font-bold">✓</span>}
              </button>
            );
          })}

          <div className="my-1 border-t border-zinc-800" />

          {/* 2. Paragraph Spacing Presets */}
          <div className="px-3 py-1 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
            Paragraph Spacing
          </div>
          {PARAGRAPH_SPACING_OPTIONS.map((opt) => {
            const isSelected = (currentParagraphSpacing.spaceAfter === opt.value) || (!currentParagraphSpacing.spaceAfter && opt.value === "0px");
            return (
              <button
                key={opt.value}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (opt.value === "0px") {
                    (editor.chain().focus() as any).setParagraphSpacing({ spaceAfter: null }).run();
                  } else {
                    (editor.chain().focus() as any).setParagraphSpacing({ spaceAfter: opt.value }).run();
                  }
                  handleClose();
                }}
                className={`w-full flex items-center justify-between px-3 py-1.5 hover:bg-zinc-800 transition-colors ${
                  isSelected ? 'text-primary-400 font-semibold bg-primary-900/30' : 'text-zinc-200'
                }`}
              >
                <span>{opt.label}</span>
                {isSelected && <span className="text-primary-400 font-bold">✓</span>}
              </button>
            );
          })}

          <div className="my-1 border-t border-zinc-800" />

          {/* 3. Quick Space Before / After Toggles */}
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              (editor.chain().focus() as any).setParagraphSpacing({
                spaceBefore: hasSpaceBefore ? null : "12px"
              }).run();
              handleClose();
            }}
            className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-zinc-800 transition-colors text-zinc-200"
          >
            <span>{hasSpaceBefore ? "Remove Space Before Paragraph" : "Add Space Before Paragraph"}</span>
            {hasSpaceBefore && <span className="text-primary-400 font-bold">✓</span>}
          </button>

          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              (editor.chain().focus() as any).setParagraphSpacing({
                spaceAfter: hasSpaceAfter ? null : "12px"
              }).run();
              handleClose();
            }}
            className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-zinc-800 transition-colors text-zinc-200"
          >
            <span>{hasSpaceAfter ? "Remove Space After Paragraph" : "Add Space After Paragraph"}</span>
            {hasSpaceAfter && <span className="text-primary-400 font-bold">✓</span>}
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}

// Highlight Color Dropdown Component (Word & OneNote split button style)
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
  const openState = isOpen !== undefined ? isOpen : internalOpen;
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleToggle = () => {
    if (onToggle) onToggle();
    else setInternalOpen(!internalOpen);
  };

  const handleClose = () => {
    if (onClose) onClose();
    else setInternalOpen(false);
  };

  const coords = usePortalDropdown({
    triggerRef,
    isOpen: openState,
    placement,
    dropdownWidth: 168,
    dropdownHeight: 180,
  });

  const activeHighlight = editor?.getAttributes('highlight')?.color;
  const isHighlightActive = Boolean(editor?.isActive('highlight'));
  const [lastHighlightColor, setLastHighlightColor] = useState<string>('#fef08a');
  const currentColorBar = activeHighlight || lastHighlightColor;

  useEffect(() => {
    if (!openState) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      handleClose();
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [openState, onClose]);

  return (
    <div className="relative inline-flex items-center" ref={triggerRef}>
      <div className={`flex items-center rounded overflow-hidden border ${
        openState ? 'border-zinc-500 bg-zinc-800' : 'border-transparent hover:bg-zinc-800/80'
      }`}>
        {/* Left: Marker Icon + Color underline bar */}
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            if (!editor) return;
            if (editor.isActive('highlight')) {
              editor.chain().focus().unsetHighlight().run();
            } else {
              editor.chain().focus().setHighlight({ color: currentColorBar }).run();
            }
          }}
          disabled={!editor}
          className={`px-1.5 py-1 flex flex-col items-center justify-center transition-colors ${
            isHighlightActive
              ? 'text-yellow-400 font-semibold'
              : 'text-zinc-300 hover:text-white'
          } ${!editor ? 'opacity-40 cursor-not-allowed' : ''}`}
          title="Highlight Text (Click to toggle)"
        >
          <Highlighter size={13} />
          <div 
            className="w-3.5 h-[3px] mt-0.5 rounded-full shadow-xs" 
            style={{ backgroundColor: currentColorBar }} 
          />
        </button>

        {/* Right: Chevron Arrow to open palette */}
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (editor) handleToggle();
          }}
          disabled={!editor}
          className={`py-1.5 px-1 text-zinc-400 hover:text-white transition-colors ${
            !editor ? 'opacity-40 cursor-not-allowed' : ''
          }`}
          title="Highlight Colors"
        >
          <ChevronDown size={10} className="opacity-70" />
        </button>
      </div>

      {openState && editor && coords && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: coords.top !== undefined ? `${coords.top}px` : undefined,
            bottom: coords.bottom !== undefined ? `${coords.bottom}px` : undefined,
            left: `${coords.left}px`,
            maxHeight: coords.maxHeight !== undefined ? `${coords.maxHeight}px` : undefined,
            width: '168px',
            zIndex: 999999,
          }}
          className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl p-2.5 text-white font-sans text-xs"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2 px-0.5">
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
                  setLastHighlightColor(c.color);
                  handleClose();
                }}
                className="w-7 h-7 rounded border border-zinc-700 hover:scale-110 active:scale-95 transition-transform flex items-center justify-center shadow-xs"
                style={{ backgroundColor: c.color }}
                title={c.label}
              >
                {activeHighlight === c.color && (
                  <span className="text-black text-xs font-bold">✓</span>
                )}
              </button>
            ))}
          </div>

          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              editor.chain().focus().unsetHighlight().run();
              handleClose();
            }}
            className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs text-zinc-300 hover:text-white hover:bg-zinc-800 rounded transition-colors"
          >
            <span className="w-4 h-4 rounded border border-dashed border-zinc-500 flex items-center justify-center text-[10px] text-red-400">✕</span>
            <span>No Color</span>
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}

// Font Color Dropdown Component (Word & OneNote split button style)
export function TextColorDropdown({
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
  const openState = isOpen !== undefined ? isOpen : internalOpen;
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleToggle = () => {
    if (onToggle) onToggle();
    else setInternalOpen(!internalOpen);
  };

  const handleClose = () => {
    if (onClose) onClose();
    else setInternalOpen(false);
  };

  const coords = usePortalDropdown({
    triggerRef,
    isOpen: openState,
    placement,
    dropdownWidth: 196,
    dropdownHeight: 250,
  });

  const activeTextColor = editor?.getAttributes('textStyle')?.color || null;
  const [lastTextColor, setLastTextColor] = useState<string>('#ef4444');
  const displayColor = activeTextColor || lastTextColor;

  useEffect(() => {
    if (!openState) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      handleClose();
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [openState, onClose]);

  return (
    <div className="relative inline-flex items-center" ref={triggerRef}>
      <div className={`flex items-center rounded overflow-hidden border ${
        openState ? 'border-zinc-500 bg-zinc-800' : 'border-transparent hover:bg-zinc-800/80'
      }`}>
        {/* Left: Letter 'A' + color underline bar */}
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            if (!editor) return;
            editor.chain().focus().setColor(displayColor).run();
          }}
          disabled={!editor}
          className={`px-1.5 py-1 flex flex-col items-center justify-center transition-colors ${
            activeTextColor
              ? 'text-white font-semibold'
              : 'text-zinc-300 hover:text-white'
          } ${!editor ? 'opacity-40 cursor-not-allowed' : ''}`}
          title="Font Color (Click to apply)"
        >
          <span className="font-serif text-xs font-bold leading-none">A</span>
          <div 
            className="w-3.5 h-[3px] mt-0.5 rounded-full shadow-xs" 
            style={{ backgroundColor: displayColor }} 
          />
        </button>

        {/* Right: Chevron Arrow to open palette */}
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (editor) handleToggle();
          }}
          disabled={!editor}
          className={`py-1.5 px-1 text-zinc-400 hover:text-white transition-colors ${
            !editor ? 'opacity-40 cursor-not-allowed' : ''
          }`}
          title="Font Colors"
        >
          <ChevronDown size={10} className="opacity-70" />
        </button>
      </div>

      {openState && editor && coords && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: coords.top !== undefined ? `${coords.top}px` : undefined,
            bottom: coords.bottom !== undefined ? `${coords.bottom}px` : undefined,
            left: `${coords.left}px`,
            maxHeight: coords.maxHeight !== undefined ? `${coords.maxHeight}px` : undefined,
            width: '196px',
            zIndex: 999999,
          }}
          className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl p-2.5 text-white font-sans text-xs"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2 px-0.5">
            Font Color
          </div>

          {/* Automatic (Default/Inherit) */}
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              editor.chain().focus().unsetColor().run();
              handleClose();
            }}
            className="w-full flex items-center gap-2 px-2 py-1 text-xs text-zinc-300 hover:text-white hover:bg-zinc-800 rounded transition-colors mb-2"
          >
            <div className="w-3.5 h-3.5 rounded-sm border border-zinc-500 bg-white flex items-center justify-center text-[9px] text-zinc-900 font-bold">A</div>
            <span>Automatic</span>
          </button>

          {/* Color Palette Grid */}
          <div className="grid grid-cols-5 gap-1.5 mb-2">
            {TEXT_PALETTE_COLORS.map((c) => (
              <button
                key={c.color}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  editor.chain().focus().setColor(c.color).run();
                  setLastTextColor(c.color);
                  handleClose();
                }}
                className={`w-6 h-6 rounded-sm border transition-transform hover:scale-115 active:scale-95 flex items-center justify-center shadow-xs ${
                  activeTextColor?.toLowerCase() === c.color.toLowerCase()
                    ? 'border-white ring-2 ring-white/50 scale-105'
                    : 'border-zinc-700 hover:border-zinc-400'
                }`}
                style={{ backgroundColor: c.color }}
                title={c.label}
              >
                {activeTextColor?.toLowerCase() === c.color.toLowerCase() && (
                  <span className={`text-[10px] font-bold ${['#ffffff', '#fef08a', '#eab308', '#84cc16', '#bae6fd', '#bbf7d0'].includes(c.color.toLowerCase()) ? 'text-black' : 'text-white'}`}>✓</span>
                )}
              </button>
            ))}
          </div>

          <div className="border-t border-zinc-800 my-1.5" />

          {/* Custom Color Native Trigger */}
          <label className="w-full flex items-center justify-between px-2 py-1 text-xs text-zinc-300 hover:text-white hover:bg-zinc-800 rounded cursor-pointer transition-colors relative">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full border border-zinc-500 bg-gradient-to-tr from-rose-500 via-amber-400 to-indigo-500 shadow-xs" />
              <span>More Colors...</span>
            </div>
            <input
              type="color"
              value={activeTextColor || '#ef4444'}
              onMouseDown={(e) => e.stopPropagation()}
              onChange={(e) => {
                const newColor = e.target.value;
                editor.chain().focus().setColor(newColor).run();
                setLastTextColor(newColor);
                handleClose();
              }}
              className="w-5 h-5 rounded cursor-pointer border-0 p-0 bg-transparent"
            />
          </label>
        </div>,
        document.body
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
  showBubbleMenu?: boolean;
  onMountEditor?: (id: string, editor: Editor | null) => void;
  ydoc?: any;
  provider?: any;
  user?: { name: string; color: string };
}

export function TipTapEditor({ id, content, onChange, onDelete, setActiveEditor, onEditorUpdate, onBlurText, showBubbleMenu = false, onMountEditor, ydoc, provider, user }: TipTapEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeBubbleDropdown, setActiveBubbleDropdown] = useState<string | null>(null);

  const editor = useEditor({
    extensions: [
      ydoc ? StarterKit.configure({ undoRedo: false }) : StarterKit,
      TextStyle,
      Color,
      FontFamily,
      Highlight.configure({ multicolor: true }),
      Underline,
      FontSize,
      LineHeight,
      ParagraphSpacing,
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
      ...(ydoc ? [
        Collaboration.configure({
          document: ydoc,
          field: `text-${id}`,
        }),
        ...(provider?.awareness ? [
          CollaborationCursor.configure({
            provider: provider,
            user: user || { name: "Collaborator", color: "#6366f1" },
          })
        ] : [])
      ] : []),
    ],
    content: ydoc ? undefined : content,
    editorProps: {
      handleScrollToSelection: () => {
        // Prevent ProseMirror from firing uncontrolled DOM scrollIntoView that shoots text to the top.
        // We manage smooth, precise Apple Notes / Google Keep positioning in ensureCursorVisible.
        return true;
      },
    },
    onCreate: ({ editor }) => {
      // If Yjs document field is empty but we have existing content from database, seed it!
      if (ydoc && content) {
        try {
          const fragment = ydoc.getXmlFragment(`text-${id}`);
          if (fragment.length === 0) {
            editor.commands.setContent(content);
          }
        } catch (e) {
          console.warn("Could not seed Yjs fragment:", e);
        }
      }
    },
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
    onDestroy: () => {
      setActiveEditor?.(null);
    },
  }, [id, ydoc, provider]);

  // Report editor instance on mount/unmount
  useEffect(() => {
    if (editor) {
      onMountEditor?.(id, editor);
    }
    return () => {
      onMountEditor?.(id, null);
    };
  }, [editor, id, onMountEditor]);

  // Focus on initial mount if empty template
  useEffect(() => {
    if (editor && content === "<p></p>") {
      editor.commands.focus('end', { scrollIntoView: false });
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
      <div className="p-0 prose dark:prose-invert max-w-none focus:outline-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:text-[16px] [&_.ProseMirror]:leading-[32px] [&_.ProseMirror_p]:text-[16px] [&_.ProseMirror_p]:leading-[32px] [&_.ProseMirror_p]:m-0 [&_.ProseMirror_p]:p-0 [&_.ProseMirror_p]:min-h-[32px] [&_.ProseMirror_li]:text-[16px] [&_.ProseMirror_li]:leading-[32px] [&_.ProseMirror_li]:m-0 [&_.ProseMirror_h1]:text-[24px] [&_.ProseMirror_h1]:leading-[64px] [&_.ProseMirror_h1]:m-0 [&_.ProseMirror_h2]:text-[20px] [&_.ProseMirror_h2]:leading-[56px] [&_.ProseMirror_h2]:m-0 [&_.ProseMirror_h3]:text-[18px] [&_.ProseMirror_h3]:leading-[48px] [&_.ProseMirror_h3]:m-0 [&_.ProseMirror_blockquote]:border-l-4 [&_.ProseMirror_blockquote]:border-primary-500 [&_.ProseMirror_blockquote]:pl-3 [&_.ProseMirror_blockquote]:italic [&_.ProseMirror_blockquote]:my-1 [&_.ProseMirror_pre]:bg-zinc-100 dark:[&_.ProseMirror_pre]:bg-zinc-800/80 [&_.ProseMirror_pre]:p-2.5 [&_.ProseMirror_pre]:rounded-md [&_.ProseMirror_pre]:font-mono [&_.ProseMirror_pre]:text-sm [&_.ProseMirror_code]:bg-zinc-100 dark:[&_.ProseMirror_code]:bg-zinc-800 [&_.ProseMirror_code]:px-1.5 [&_.ProseMirror_code]:py-0.5 [&_.ProseMirror_code]:rounded [&_.ProseMirror_code]:text-sm [&_.ProseMirror_code]:font-mono [&_.ProseMirror_sub]:text-[0.75em] [&_.ProseMirror_sub]:align-sub [&_.ProseMirror_sup]:text-[0.75em] [&_.ProseMirror_sup]:align-super [&_.ProseMirror_s]:line-through [&_.ProseMirror_del]:line-through [&_.ProseMirror_strike]:line-through [&_.ProseMirror_hr]:border-t-2 [&_.ProseMirror_hr]:border-zinc-300 dark:[&_.ProseMirror_hr]:border-zinc-700 [&_.ProseMirror_hr]:my-3 [&_.ProseMirror_a]:text-primary-600 dark:[&_.ProseMirror_a]:text-primary-400 [&_.ProseMirror_a]:underline prose-p:my-0 prose-p:leading-[32px] prose-p:whitespace-pre-wrap prose-li:marker:text-inherit">
        <EditorContent editor={editor} />
      </div>

      {/* Floating Microsoft Word / OneNote Style BubbleMenu */}
      {showBubbleMenu && editor && (
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
          className="flex items-center bg-zinc-900/95 text-white rounded-xl shadow-2xl border border-zinc-700/80 px-2 py-1.5 z-[9999] backdrop-blur-md gap-1 max-w-[calc(100vw-32px)] overflow-x-auto md:overflow-visible no-scrollbar"
        >
          {/* Styles Dropdown (Normal, H1, H2, H3, Quote, Code) */}
          <BubbleDropdown
            label="Style"
            value={getCurrentStyle(editor)}
            options={STYLE_OPTIONS}
            width="w-32"
            dropdownWidth={130}
            isOpen={activeBubbleDropdown === 'style'}
            onToggle={() => setActiveBubbleDropdown(activeBubbleDropdown === 'style' ? null : 'style')}
            onClose={() => setActiveBubbleDropdown(null)}
            onSelect={(val) => applyStyle(editor, val)}
          />

          {/* Font Family Dropdown */}
          <BubbleDropdown
            label="Font"
            value={editor.getAttributes('textStyle').fontFamily || ""}
            options={FONT_OPTIONS}
            width="w-36"
            dropdownWidth={160}
            isOpen={activeBubbleDropdown === 'font'}
            onToggle={() => setActiveBubbleDropdown(activeBubbleDropdown === 'font' ? null : 'font')}
            onClose={() => setActiveBubbleDropdown(null)}
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
            dropdownWidth={90}
            isOpen={activeBubbleDropdown === 'size'}
            onToggle={() => setActiveBubbleDropdown(activeBubbleDropdown === 'size' ? null : 'size')}
            onClose={() => setActiveBubbleDropdown(null)}
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
            isOpen={activeBubbleDropdown === 'highlight'}
            onToggle={() => setActiveBubbleDropdown(activeBubbleDropdown === 'highlight' ? null : 'highlight')}
            onClose={() => setActiveBubbleDropdown(null)}
          />

          {/* Font Color Dropdown (Word & OneNote style) */}
          <TextColorDropdown 
            editor={editor}
            placement="bottom"
            isOpen={activeBubbleDropdown === 'textColor'}
            onToggle={() => setActiveBubbleDropdown(activeBubbleDropdown === 'textColor' ? null : 'textColor')}
            onClose={() => setActiveBubbleDropdown(null)}
          />

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
            isOpen={activeBubbleDropdown === 'spacing'}
            onToggle={() => setActiveBubbleDropdown(activeBubbleDropdown === 'spacing' ? null : 'spacing')}
            onClose={() => setActiveBubbleDropdown(null)}
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
