import { Editor } from "@tiptap/react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

export interface CopiedFormat {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  subscript?: boolean;
  superscript?: boolean;
  fontFamily?: string;
  fontSize?: string;
  color?: string;
  highlight?: string;
  textAlign?: string;
  lineHeight?: string;
  spaceAfter?: string | number;
  headingLevel?: number | null; // 0 or null for normal paragraph, 1-6 for headings
}

interface FormatPainterState {
  isActive: boolean;
  isPersistent: boolean;
  format: CopiedFormat | null;
}

class FormatPainterStore {
  private state: FormatPainterState = {
    isActive: false,
    isPersistent: false,
    format: null,
  };

  private listeners: Set<(state: FormatPainterState) => void> = new Set();

  getState(): FormatPainterState {
    return this.state;
  }

  isActive(): boolean {
    return this.state.isActive;
  }

  isPersistent(): boolean {
    return this.state.isPersistent;
  }

  copy(editor: Editor, isPersistent: boolean = false): boolean {
    if (!editor || editor.isDestroyed) return false;

    try {
      const textStyleAttrs = editor.getAttributes("textStyle") || {};
      const highlightAttrs = editor.getAttributes("highlight") || {};
      const paragraphAttrs = editor.getAttributes("paragraph") || {};
      const headingAttrs = editor.getAttributes("heading") || {};

      let headingLevel: number | null = null;
      for (let lvl = 1; lvl <= 6; lvl++) {
        if (editor.isActive("heading", { level: lvl })) {
          headingLevel = lvl;
          break;
        }
      }

      const format: CopiedFormat = {
        bold: editor.isActive("bold"),
        italic: editor.isActive("italic"),
        underline: editor.isActive("underline"),
        strike: editor.isActive("strike"),
        subscript: (editor as any).isActive?.("subscript") || false,
        superscript: (editor as any).isActive?.("superscript") || false,
        fontFamily: textStyleAttrs.fontFamily || undefined,
        fontSize: textStyleAttrs.fontSize || undefined,
        color: textStyleAttrs.color || undefined,
        highlight: highlightAttrs.color || undefined,
        textAlign: paragraphAttrs.textAlign || headingAttrs.textAlign || undefined,
        lineHeight: paragraphAttrs.lineHeight || headingAttrs.lineHeight || undefined,
        spaceAfter: paragraphAttrs.spaceAfter || headingAttrs.spaceAfter || undefined,
        headingLevel,
      };

      this.state = {
        isActive: true,
        isPersistent,
        format,
      };

      this.notify();

      if (isPersistent) {
        toast.success("Format Painter locked! Click or drag across text to apply. Press Esc to exit.", {
          id: "format-painter",
          duration: 3500,
        });
      } else {
        toast.success("Format copied! Click or select text to apply once.", {
          id: "format-painter",
          duration: 2500,
        });
      }

      return true;
    } catch (err) {
      console.warn("Failed to copy format from editor:", err);
      return false;
    }
  }

  apply(editor: Editor): boolean {
    if (!this.state.isActive || !this.state.format || !editor || editor.isDestroyed) {
      return false;
    }

    try {
      const f = this.state.format;
      let chain = editor.chain().focus();

      // Bold
      if (f.bold) chain = chain.setBold(); else chain = chain.unsetBold();
      // Italic
      if (f.italic) chain = chain.setItalic(); else chain = chain.unsetItalic();
      // Underline
      if (f.underline) chain = chain.setUnderline(); else chain = chain.unsetUnderline();
      // Strike
      if (f.strike) chain = chain.setStrike(); else chain = chain.unsetStrike();
      // Subscript / Superscript
      if (f.subscript) {
        chain = (chain as any).setSubscript ? (chain as any).setSubscript() : chain;
      } else if (f.superscript) {
        chain = (chain as any).setSuperscript ? (chain as any).setSuperscript() : chain;
      } else {
        if ((chain as any).unsetSubscript) (chain as any).unsetSubscript();
        if ((chain as any).unsetSuperscript) (chain as any).unsetSuperscript();
      }

      // Font Family
      if (f.fontFamily) {
        chain = chain.setFontFamily(f.fontFamily);
      } else {
        chain = chain.unsetFontFamily();
      }

      // Font Size
      if (f.fontSize) {
        if ((chain as any).setFontSize) {
          chain = (chain as any).setFontSize(f.fontSize);
        }
      } else {
        if ((chain as any).unsetFontSize) {
          chain = (chain as any).unsetFontSize();
        }
      }

      // Text Color
      if (f.color) {
        chain = chain.setColor(f.color);
      } else {
        chain = chain.unsetColor();
      }

      // Highlight
      if (f.highlight && f.highlight !== "none") {
        chain = chain.setHighlight({ color: f.highlight });
      } else {
        chain = chain.unsetHighlight();
      }

      // Alignment
      if (f.textAlign) {
        chain = chain.setTextAlign(f.textAlign);
      }

      // Line Height
      if (f.lineHeight && (chain as any).setLineHeight) {
        chain = (chain as any).setLineHeight(f.lineHeight);
      }

      // Space After
      if (f.spaceAfter !== undefined && (chain as any).setParagraphSpacing) {
        chain = (chain as any).setParagraphSpacing({ spaceAfter: f.spaceAfter });
      }

      // Heading vs Paragraph
      if (f.headingLevel && f.headingLevel > 0) {
        chain = chain.setHeading({ level: f.headingLevel as any });
      } else if (f.headingLevel === 0) {
        chain = chain.setParagraph();
      }

      chain.run();

      // If not persistent, deactivate after 1 application
      if (!this.state.isPersistent) {
        this.clear();
      }

      toast.success("Format applied!", { id: "format-painter-applied", duration: 1500 });
      return true;
    } catch (err) {
      console.warn("Failed to apply format to editor:", err);
      return false;
    }
  }

  clear() {
    if (!this.state.isActive) return;
    this.state = {
      isActive: false,
      isPersistent: false,
      format: null,
    };
    this.notify();
  }

  toggle(editor: Editor) {
    if (this.state.isActive) {
      this.clear();
    } else {
      this.copy(editor, false);
    }
  }

  lock(editor: Editor) {
    this.copy(editor, true);
  }

  subscribe(listener: (state: FormatPainterState) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}

export const formatPainterStore = new FormatPainterStore();

/**
 * Hook for consuming format painter state reactively
 */
export function useFormatPainter() {
  const [state, setState] = useState<FormatPainterState>(formatPainterStore.getState());

  useEffect(() => {
    return formatPainterStore.subscribe(setState);
  }, []);

  // Listen for Escape key to dismiss format painter
  useEffect(() => {
    if (!state.isActive) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        formatPainterStore.clear();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [state.isActive]);

  return {
    isActive: state.isActive,
    isPersistent: state.isPersistent,
    format: state.format,
    copy: (editor: Editor, isPersistent = false) => formatPainterStore.copy(editor, isPersistent),
    apply: (editor: Editor) => formatPainterStore.apply(editor),
    clear: () => formatPainterStore.clear(),
    toggle: (editor: Editor) => formatPainterStore.toggle(editor),
    lock: (editor: Editor) => formatPainterStore.lock(editor),
  };
}
