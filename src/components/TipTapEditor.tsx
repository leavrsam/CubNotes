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
import { Extension } from "@tiptap/core";
import { 
  Trash2, Bold, Italic, Underline as UnderlineIcon, 
  Heading1, Heading2, List, ListOrdered, CheckSquare, AlignLeft, AlignCenter, AlignRight,
  Highlighter, ChevronDown
} from "lucide-react";

// Custom Font Size Extension
const FontSize = Extension.create({
  name: 'fontSize',
  addOptions() {
    return { types: ['textStyle'] }
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
              if (!attributes.fontSize) return {}
              return { style: `font-size: ${attributes.fontSize}` }
            },
          },
        },
      },
    ]
  },
  addCommands() {
    return {
      setFontSize: fontSize => ({ chain }) => {
        return chain().setMark('textStyle', { fontSize }).run()
      },
      unsetFontSize: () => ({ chain }) => {
        return chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run()
      },
    }
  },
});

// Custom Tab Indent Extension
const TabIndent = Extension.create({
  name: 'tabIndent',
  addKeyboardShortcuts() {
    return {
      Tab: () => {
        // If in a list item, let the default list extension handle it (return false)
        if (this.editor.isActive('listItem')) {
          return false;
        }
        // Otherwise, insert 4 spaces for visual indent
        return this.editor.commands.insertContent('    ');
      },
    };
  },
});

const FONT_OPTIONS = [
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

const SIZE_OPTIONS = [
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

function BubbleDropdown({
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
        <span className="truncate max-w-[4.5rem]">{selected && selected.value ? selected.label : label}</span>
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

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        history: false,
      }),
      TextStyle,
      Color,
      FontFamily,
      Highlight.configure({ multicolor: true }),
      Underline,
      FontSize,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TabIndent,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({
        nested: true,
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

  // Focus on initial mount
  useEffect(() => {
    if (editor && content === "<p></p>") {
      editor.commands.focus();
    }
  }, [editor, content]);

  // Sync external content changes (e.g. from global Undo/Redo)
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      const { from, to } = editor.state.selection;
      editor.commands.setContent(content, false);
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
      <div className="p-0 prose dark:prose-invert max-w-none focus:outline-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:text-[16px] [&_.ProseMirror]:leading-[32px] [&_.ProseMirror_p]:text-[16px] [&_.ProseMirror_p]:leading-[32px] [&_.ProseMirror_p]:m-0 [&_.ProseMirror_p]:p-0 [&_.ProseMirror_p]:min-h-[32px] [&_.ProseMirror_li]:text-[16px] [&_.ProseMirror_li]:leading-[32px] [&_.ProseMirror_li]:m-0 [&_.ProseMirror_h1]:text-[24px] [&_.ProseMirror_h1]:leading-[64px] [&_.ProseMirror_h1]:m-0 [&_.ProseMirror_h2]:text-[20px] [&_.ProseMirror_h2]:leading-[64px] [&_.ProseMirror_h2]:m-0 prose-p:my-0 prose-p:leading-[32px] prose-p:whitespace-pre-wrap prose-li:marker:text-inherit">
        <EditorContent editor={editor} />
      </div>

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
          className="flex items-center bg-zinc-900/95 text-white rounded-lg shadow-2xl border border-zinc-700/80 px-1.5 py-1 z-[9999] backdrop-blur-md gap-1"
        >
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

          <div className="w-px h-5 bg-zinc-700/80 self-center mx-0.5" />

          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`p-2 hover:bg-zinc-700 ${editor.isActive('bold') ? 'bg-zinc-800' : ''}`}
            title="Bold"
          >
            <Bold size={14} />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`p-2 hover:bg-zinc-700 ${editor.isActive('italic') ? 'bg-zinc-800' : ''}`}
            title="Italic"
          >
            <Italic size={14} />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={`p-2 hover:bg-zinc-700 ${editor.isActive('underline') ? 'bg-zinc-800' : ''}`}
            title="Underline"
          >
            <UnderlineIcon size={14} />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().toggleHighlight().run()}
            className={`p-2 hover:bg-zinc-700 ${editor.isActive('highlight') ? 'bg-zinc-800 text-yellow-400' : ''}`}
            title="Highlight"
          >
            <Highlighter size={14} />
          </button>
          
          <div className="w-px h-5 bg-zinc-700/80 self-center mx-0.5" />

          {/* Quick Color Dots */}
          <div className="flex items-center gap-1 px-1">
            {['#000000', '#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'].map(color => (
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
              value={editor.getAttributes('textStyle')?.color || '#000000'}
              onPointerDown={(e) => e.stopPropagation()}
              onInput={(e) => {
                editor.chain().focus().setColor((e.target as HTMLInputElement).value).run();
              }}
              title="More Colors"
            />
          </div>

          <div className="w-px h-5 bg-zinc-700/80 self-center mx-0.5" />

          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            className={`p-2 hover:bg-zinc-700 ${editor.isActive('heading', { level: 1 }) ? 'bg-zinc-800' : ''}`}
            title="Heading 1"
          >
            <Heading1 size={14} />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={`p-2 hover:bg-zinc-700 ${editor.isActive('heading', { level: 2 }) ? 'bg-zinc-800' : ''}`}
            title="Heading 2"
          >
            <Heading2 size={14} />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`p-2 hover:bg-zinc-700 ${editor.isActive('bulletList') ? 'bg-zinc-800' : ''}`}
            title="Bullet List"
          >
            <List size={14} />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={`p-2 hover:bg-zinc-700 ${editor.isActive('orderedList') ? 'bg-zinc-800' : ''}`}
            title="Numbered List"
          >
            <ListOrdered size={14} />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => (editor.chain().focus() as any).toggleTaskList().run()}
            className={`p-2 hover:bg-zinc-700 ${(editor as any).isActive('taskList') ? 'bg-zinc-800 text-primary-400' : ''}`}
            title="To-Do List (Checkboxes)"
          >
            <CheckSquare size={14} />
          </button>
          
          <div className="w-px h-6 bg-zinc-700 self-center mx-1" />
          
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
            className={`p-2 hover:bg-zinc-700 ${editor.isActive({ textAlign: 'left' }) ? 'bg-zinc-800' : ''}`}
            title="Align Left"
          >
            <AlignLeft size={14} />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
            className={`p-2 hover:bg-zinc-700 ${editor.isActive({ textAlign: 'center' }) ? 'bg-zinc-800' : ''}`}
            title="Align Center"
          >
            <AlignCenter size={14} />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().setTextAlign('right').run()}
            className={`p-2 hover:bg-zinc-700 ${editor.isActive({ textAlign: 'right' }) ? 'bg-zinc-800' : ''}`}
            title="Align Right"
          >
            <AlignRight size={14} />
          </button>
        </BubbleMenu>
      )}
    </div>
  );
}
