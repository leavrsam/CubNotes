"use client";

import React, { useEffect, useState, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import FontFamily from "@tiptap/extension-font-family";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import { Extension } from "@tiptap/core";
import { 
  Trash2, Bold, Italic, Underline as UnderlineIcon, 
  Heading1, Heading2, List, ListOrdered, AlignLeft, AlignCenter, AlignRight,
  Highlighter
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

interface TipTapEditorProps {
  content: string;
  onChange: (content: string) => void;
  onDelete: () => void;
  isFocused?: boolean;
  setActiveEditor?: (editor: Editor | null) => void;
  onEditorUpdate?: () => void;
}

export function TipTapEditor({ content, onChange, onDelete, setActiveEditor, onEditorUpdate }: TipTapEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
      FontFamily,
      Highlight.configure({ multicolor: true }),
      FontSize,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TabIndent,
    ],
    content: content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
      onEditorUpdate?.();
    },
    onSelectionUpdate: () => {
      onEditorUpdate?.();
    },
    onFocus: ({ editor }) => {
      setActiveEditor?.(editor);
    },
    onBlur: ({ editor }) => {
      // Clean up empty text boxes when they lose focus
      if (editor.isEmpty) {
        onDelete();
      }
    },
  });

  // Focus on initial mount
  useEffect(() => {
    if (editor && content === "<p></p>") {
      editor.commands.focus();
    }
  }, [editor, content]);

  if (!editor) {
    return null;
  }

  return (
    <div className="group relative w-full h-full bg-transparent">
      <div className="p-1 prose dark:prose-invert max-w-none focus:outline-none [&_.ProseMirror]:outline-none prose-p:my-0 prose-p:leading-normal prose-p:whitespace-pre-wrap prose-li:marker:text-inherit">
        <EditorContent editor={editor} />
      </div>

      {editor && (
        <BubbleMenu 
          editor={editor} 
          className="flex bg-zinc-900 text-white rounded-md overflow-hidden shadow-lg border border-zinc-700 z-50"
        >
          <select
            className="bg-zinc-800 text-xs px-2 py-1 mx-1 rounded border border-zinc-700 outline-none text-zinc-300"
            style={{ colorScheme: 'dark' }}
            onChange={(e) => {
              if (e.target.value === "") {
                editor.chain().focus().unsetFontFamily().run();
              } else {
                editor.chain().focus().setFontFamily(e.target.value).run();
              }
            }}
            value={editor.getAttributes('textStyle').fontFamily || ""}
          >
            <option value="">Font</option>
            <option value="Arial, sans-serif">Arial</option>
            <option value="Calibri, sans-serif">Calibri</option>
            <option value="Cambria, serif">Cambria</option>
            <option value="Comic Sans MS, cursive">Comic Sans MS</option>
            <option value="Consolas, monospace">Consolas</option>
            <option value="Courier New, monospace">Courier New</option>
            <option value="Garamond, serif">Garamond</option>
            <option value="Georgia, serif">Georgia</option>
            <option value="Helvetica, sans-serif">Helvetica</option>
            <option value="Impact, sans-serif">Impact</option>
            <option value="Inter, sans-serif">Inter</option>
            <option value="Menlo, monospace">Menlo</option>
            <option value="Palatino, serif">Palatino</option>
            <option value="Roboto, sans-serif">Roboto</option>
            <option value="Times New Roman, serif">Times New Roman</option>
            <option value="Trebuchet MS, sans-serif">Trebuchet MS</option>
            <option value="Verdana, sans-serif">Verdana</option>
          </select>
          
          <select
            className="bg-zinc-800 text-xs px-2 py-1 mx-1 rounded border border-zinc-700 outline-none text-zinc-300"
            style={{ colorScheme: 'dark' }}
            onChange={(e) => {
              if (e.target.value === "") {
                (editor.chain().focus() as any).unsetFontSize().run();
              } else {
                (editor.chain().focus() as any).setFontSize(e.target.value).run();
              }
            }}
            value={editor.getAttributes('textStyle').fontSize || ""}
          >
            <option value="">Size</option>
            <option value="8px">8</option>
            <option value="9px">9</option>
            <option value="10px">10</option>
            <option value="11px">11</option>
            <option value="12px">12</option>
            <option value="14px">14</option>
            <option value="16px">16</option>
            <option value="18px">18</option>
            <option value="20px">20</option>
            <option value="22px">22</option>
            <option value="24px">24</option>
            <option value="26px">26</option>
            <option value="28px">28</option>
            <option value="36px">36</option>
            <option value="48px">48</option>
            <option value="72px">72</option>
          </select>

          <div className="w-px h-6 bg-zinc-700 self-center mx-1" />

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
          
          <div className="w-px h-6 bg-zinc-700 self-center mx-1" />

          {/* Color Picker */}
          <div className="flex px-1 gap-1 items-center">
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().setColor('#000000').run()} className="w-4 h-4 rounded-full bg-black border border-zinc-600" title="Black" />
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().setColor('#ef4444').run()} className="w-4 h-4 rounded-full bg-red-500" title="Red" />
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().setColor('#3b82f6').run()} className="w-4 h-4 rounded-full bg-blue-500" title="Blue" />
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().setColor('#22c55e').run()} className="w-4 h-4 rounded-full bg-green-500" title="Green" />
          </div>

          <div className="w-px h-6 bg-zinc-700 self-center mx-1" />

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
