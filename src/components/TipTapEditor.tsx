"use client";

import React, { useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import FontFamily from "@tiptap/extension-font-family";
import TextAlign from "@tiptap/extension-text-align";
import { 
  Trash2, Bold, Italic, Underline as UnderlineIcon, 
  Heading1, Heading2, List, ListOrdered, AlignLeft, AlignCenter, AlignRight 
} from "lucide-react";

interface TipTapEditorProps {
  content: string;
  onChange: (content: string) => void;
  onDelete: () => void;
}

export function TipTapEditor({ content, onChange, onDelete }: TipTapEditorProps) {
  const [isFocused, setIsFocused] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
      FontFamily,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    content: content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    onFocus: () => setIsFocused(true),
    onBlur: () => setIsFocused(false),
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
    <div 
      className={`group relative rounded-md transition-all ${
        isFocused 
          ? 'ring-2 ring-indigo-500 bg-white/50 dark:bg-zinc-800/50 shadow-sm' 
          : 'hover:ring-1 hover:ring-zinc-300 dark:hover:ring-zinc-600 bg-transparent'
      }`}
    >
      <div className="p-3 prose prose-sm dark:prose-invert max-w-none focus:outline-none">
        <EditorContent editor={editor} />
      </div>

      {editor && (
        <BubbleMenu 
          editor={editor} 
          className="flex bg-zinc-900 text-white rounded-md overflow-hidden shadow-lg border border-zinc-700"
        >
          <button
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`p-2 hover:bg-zinc-700 ${editor.isActive('bold') ? 'bg-zinc-800' : ''}`}
            title="Bold"
          >
            <Bold size={14} />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`p-2 hover:bg-zinc-700 ${editor.isActive('italic') ? 'bg-zinc-800' : ''}`}
            title="Italic"
          >
            <Italic size={14} />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={`p-2 hover:bg-zinc-700 ${editor.isActive('underline') ? 'bg-zinc-800' : ''}`}
            title="Underline"
          >
            <UnderlineIcon size={14} />
          </button>
          
          <div className="w-px h-6 bg-zinc-700 self-center mx-1" />

          {/* Color Picker */}
          <div className="flex px-1 gap-1 items-center">
            <button onClick={() => editor.chain().focus().setColor('#000000').run()} className="w-4 h-4 rounded-full bg-black border border-zinc-600" title="Black" />
            <button onClick={() => editor.chain().focus().setColor('#ef4444').run()} className="w-4 h-4 rounded-full bg-red-500" title="Red" />
            <button onClick={() => editor.chain().focus().setColor('#3b82f6').run()} className="w-4 h-4 rounded-full bg-blue-500" title="Blue" />
            <button onClick={() => editor.chain().focus().setColor('#22c55e').run()} className="w-4 h-4 rounded-full bg-green-500" title="Green" />
          </div>

          <div className="w-px h-6 bg-zinc-700 self-center mx-1" />

          <button
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            className={`p-2 hover:bg-zinc-700 ${editor.isActive('heading', { level: 1 }) ? 'bg-zinc-800' : ''}`}
            title="Heading 1"
          >
            <Heading1 size={14} />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={`p-2 hover:bg-zinc-700 ${editor.isActive('heading', { level: 2 }) ? 'bg-zinc-800' : ''}`}
            title="Heading 2"
          >
            <Heading2 size={14} />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`p-2 hover:bg-zinc-700 ${editor.isActive('bulletList') ? 'bg-zinc-800' : ''}`}
            title="Bullet List"
          >
            <List size={14} />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={`p-2 hover:bg-zinc-700 ${editor.isActive('orderedList') ? 'bg-zinc-800' : ''}`}
            title="Numbered List"
          >
            <ListOrdered size={14} />
          </button>
          
          <div className="w-px h-6 bg-zinc-700 self-center mx-1" />
          
          <button
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
            className={`p-2 hover:bg-zinc-700 ${editor.isActive({ textAlign: 'left' }) ? 'bg-zinc-800' : ''}`}
            title="Align Left"
          >
            <AlignLeft size={14} />
          </button>
          <button
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
            className={`p-2 hover:bg-zinc-700 ${editor.isActive({ textAlign: 'center' }) ? 'bg-zinc-800' : ''}`}
            title="Align Center"
          >
            <AlignCenter size={14} />
          </button>
          <button
            onClick={() => editor.chain().focus().setTextAlign('right').run()}
            className={`p-2 hover:bg-zinc-700 ${editor.isActive({ textAlign: 'right' }) ? 'bg-zinc-800' : ''}`}
            title="Align Right"
          >
            <AlignRight size={14} />
          </button>
        </BubbleMenu>
      )}

      {/* Delete button (only visible on hover or focus) */}
      {(isFocused || content === "<p></p>") && (
        <button 
          onClick={onDelete}
          className="absolute -top-3 -right-3 p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 shadow-md transition-colors opacity-0 group-hover:opacity-100"
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}
