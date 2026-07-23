"use client";

import React, { useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import { Trash2, Bold, Italic, Heading1, Heading2, List, ListOrdered } from "lucide-react";

interface TipTapEditorProps {
  content: string;
  onChange: (content: string) => void;
  onDelete: () => void;
}

export function TipTapEditor({ content, onChange, onDelete }: TipTapEditorProps) {
  const [isFocused, setIsFocused] = useState(false);

  const editor = useEditor({
    extensions: [StarterKit],
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
          ? 'ring-2 ring-indigo-500 bg-white dark:bg-zinc-800 shadow-xl' 
          : 'hover:ring-1 hover:ring-zinc-300 dark:hover:ring-zinc-600 bg-white/80 dark:bg-zinc-800/80 backdrop-blur-sm'
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
          >
            <Bold size={14} />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`p-2 hover:bg-zinc-700 ${editor.isActive('italic') ? 'bg-zinc-800' : ''}`}
          >
            <Italic size={14} />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            className={`p-2 hover:bg-zinc-700 ${editor.isActive('heading', { level: 1 }) ? 'bg-zinc-800' : ''}`}
          >
            <Heading1 size={14} />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={`p-2 hover:bg-zinc-700 ${editor.isActive('heading', { level: 2 }) ? 'bg-zinc-800' : ''}`}
          >
            <Heading2 size={14} />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`p-2 hover:bg-zinc-700 ${editor.isActive('bulletList') ? 'bg-zinc-800' : ''}`}
          >
            <List size={14} />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={`p-2 hover:bg-zinc-700 ${editor.isActive('orderedList') ? 'bg-zinc-800' : ''}`}
          >
            <ListOrdered size={14} />
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
