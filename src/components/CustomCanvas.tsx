"use client";

import React, { useState, useEffect, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import { createClient } from "@/lib/supabase/client";
import debounce from "lodash/debounce";
import { format } from "date-fns";
import { Pen, Type, Hand, MousePointer2, Bold, Italic, Underline as UnderlineIcon, Highlighter, AlignLeft, AlignCenter, AlignRight, Heading1, Heading2, List, ListOrdered } from "lucide-react";
import { Editor } from "@tiptap/react";
import { SpatialCanvas } from "./SpatialCanvas";
import { RichTextOverlay } from "./RichTextOverlay";
import { AudioOverlay } from "./AudioOverlay";

interface CustomCanvasProps {
  pageId: string;
  pageTitle: string;
  pageCreatedAt: string;
  onUpdatePageTitle: (title: string) => void;
}

export type Stroke = {
  id: string;
  points: number[][]; // [x, y, pressure][]
  color: string;
  size: number;
  x?: number;
  y?: number;
  scaleX?: number;
  scaleY?: number;
};

export type TextNode = {
  id: string;
  x: number;
  y: number;
  content: string;
  width: number;
};

export type AudioNode = {
  id: string;
  x: number;
  y: number;
  width?: number;
  url: string;
  title?: string;
  summary?: string;
  transcript?: string;
};

export type ToolType = "home" | "pen" | "pan";
export type RibbonTab = "Home" | "Insert" | "Draw" | "View";

export type DocumentState = {
  strokes: Stroke[];
  texts: TextNode[];
  audios?: AudioNode[];
};

import { useCanvasData } from "@/hooks/useCanvasData";
import { Mic } from "lucide-react";
import toast from "react-hot-toast";

export function CustomCanvas({ pageId, pageTitle, pageCreatedAt, onUpdatePageTitle }: CustomCanvasProps) {
  const { loading, strokes, setStrokes, texts, setTexts, audios, setAudios } = useCanvasData(pageId);

  // Drawing state
  const [activeColor, setActiveColor] = useState("#3f3f46"); // zinc-700
  const [activeSize, setActiveSize] = useState(4);

  // Selection state
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Active Tool and Ribbon
  const [tool, setTool] = useState<ToolType>("home");
  const [activeTab, setActiveTab] = useState<RibbonTab>("Home");
  const [isRibbonExpanded, setIsRibbonExpanded] = useState(true);
  const [activeEditor, setActiveEditor] = useState<Editor | null>(null);
  const [editorUpdateTick, setEditorUpdateTick] = useState(0);

  // Viewport state
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);

  const handleCanvasClick = useCallback((x: number, y: number) => {
    // In 'home' mode, clicking the canvas creates a text block
    if (tool === "home") {
      const newNode: TextNode = {
        id: uuidv4(),
        x,
        y,
        width: 600,
        content: "<p></p>"
      };
      setTexts(prev => [...prev, newNode]);
    }
  }, [tool, setTexts]);

  useEffect(() => {
    const handleInjectSummary = (e: Event) => {
      const customEvent = e as CustomEvent<{ id: string, summary: string, transcript: string }>;
      const { id, summary, transcript } = customEvent.detail;
      
      setAudios(prev => prev.map(audio => {
        if (audio.id === id) {
          return { ...audio, summary, transcript };
        }
        return audio;
      }));
    };

    const handleInjectAudio = (e: Event) => {
      const customEvent = e as CustomEvent<{ id: string, url: string }>;
      const { id, url } = customEvent.detail;
      
      // Calculate center of screen for the audio node
      const screenCenterX = window.innerWidth / 2;
      const screenCenterY = window.innerHeight / 2;
      
      // Offset by half the width of the audio player (approx 160px) to truly center it
      const worldX = (screenCenterX - 160 - pan.x) / zoom;
      const worldY = (screenCenterY - pan.y) / zoom;

      const newAudio: AudioNode = {
        id: id || uuidv4(),
        x: worldX,
        y: worldY,
        width: 400,
        url,
        title: "Meeting Recording"
      };
      
      setAudios(prev => [...prev, newAudio]);
    };

    window.addEventListener('inject-summary', handleInjectSummary);
    window.addEventListener('inject-audio', handleInjectAudio);
    
    return () => {
      window.removeEventListener('inject-summary', handleInjectSummary);
      window.removeEventListener('inject-audio', handleInjectAudio);
    };
  }, [pan, zoom, setAudios]);

  if (loading) {
    return <div className="w-full h-full flex items-center justify-center text-zinc-500">Loading canvas...</div>;
  }

  return (
    <div className="w-full h-full relative overflow-hidden bg-[#fafafa] dark:bg-zinc-900" style={{ touchAction: 'none' }}>
      
      {/* Top Ribbon Container */}
      <div className="absolute top-0 left-0 w-full bg-[#f3f2f1] dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 z-50 flex flex-col pointer-events-auto">
        {/* Tab Headers */}
        <div className="flex px-2 pt-1 gap-1">
          {(["Home", "Insert", "Draw", "View"] as RibbonTab[]).map(tab => (
            <button
              key={tab}
              onClick={() => {
                if (activeTab === tab) {
                  setIsRibbonExpanded(!isRibbonExpanded);
                } else {
                  setActiveTab(tab);
                  setIsRibbonExpanded(true);
                }
                if (tab === "Home") setTool("home");
                if (tab === "Draw") setTool("pen");
              }}
              className={`px-4 py-1 text-sm font-medium rounded-t-md transition-colors ${
                activeTab === tab 
                  ? 'bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 border-t border-l border-r border-zinc-200 dark:border-zinc-800' 
                  : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        
        {/* Ribbon Content */}
        {isRibbonExpanded && (
          <div className="h-[48px] bg-white dark:bg-zinc-900 flex items-center px-4 gap-4 shadow-sm border-b border-zinc-200 dark:border-zinc-800">
            {activeTab === "Home" && (
              <div className="flex items-center gap-2 h-full py-1">
                <button
                  onClick={() => setTool("home")}
                  className={`flex flex-col items-center justify-center h-full px-3 rounded ${tool === "home" ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300'}`}
                >
                  <MousePointer2 size={16} strokeWidth={2} />
                  <span className="text-[10px] font-medium mt-0.5">Select</span>
                </button>
                
                <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-700 mx-1" />

                {/* Text Formatting Tools */}
                <div className="flex items-center gap-1">
                  <select
                    className="bg-transparent text-xs px-2 py-1 rounded border border-transparent hover:border-zinc-300 dark:hover:border-zinc-700 outline-none w-28 text-zinc-700 dark:text-zinc-300"
                    onChange={(e) => {
                      if (!activeEditor) return;
                      if (e.target.value === "") {
                        activeEditor.chain().focus().unsetFontFamily().run();
                      } else {
                        activeEditor.chain().focus().setFontFamily(e.target.value).run();
                      }
                    }}
                    value={activeEditor?.getAttributes('textStyle').fontFamily || ""}
                    disabled={!activeEditor}
                  >
                    <option value="">Font</option>
                    <option value="Arial, sans-serif">Arial</option>
                    <option value="Helvetica, sans-serif">Helvetica</option>
                    <option value="Inter, sans-serif">Inter</option>
                    <option value="Verdana, sans-serif">Verdana</option>
                    <option value="Trebuchet MS, sans-serif">Trebuchet MS</option>
                    <option value="Georgia, serif">Georgia</option>
                    <option value="Times New Roman, serif">Times New Roman</option>
                    <option value="Garamond, serif">Garamond</option>
                    <option value="Menlo, monospace">Menlo</option>
                    <option value="Courier New, monospace">Courier New</option>
                    <option value="Comic Sans MS, cursive">Comic Sans MS</option>
                  </select>
                  
                  <select
                    className="bg-transparent text-xs px-2 py-1 rounded border border-transparent hover:border-zinc-300 dark:hover:border-zinc-700 outline-none w-16 text-zinc-700 dark:text-zinc-300"
                    onChange={(e) => {
                      if (!activeEditor) return;
                      if (e.target.value === "") {
                        (activeEditor.chain().focus() as any).unsetFontSize().run();
                      } else {
                        (activeEditor.chain().focus() as any).setFontSize(e.target.value).run();
                      }
                    }}
                    value={activeEditor?.getAttributes('textStyle').fontSize || ""}
                    disabled={!activeEditor}
                  >
                    <option value="">Size</option>
                    <option value="12px">12</option>
                    <option value="14px">14</option>
                    <option value="16px">16</option>
                    <option value="18px">18</option>
                    <option value="20px">20</option>
                    <option value="24px">24</option>
                    <option value="30px">30</option>
                    <option value="36px">36</option>
                  </select>
                </div>

                <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-700 mx-1" />

                <div className="flex items-center">
                  <button
                    onClick={() => activeEditor?.chain().focus().toggleBold().run()}
                    disabled={!activeEditor}
                    className={`p-1.5 rounded transition-colors ${activeEditor?.isActive('bold') ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-white' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                    title="Bold"
                  >
                    <Bold size={14} />
                  </button>
                  <button
                    onClick={() => activeEditor?.chain().focus().toggleItalic().run()}
                    disabled={!activeEditor}
                    className={`p-1.5 rounded transition-colors ${activeEditor?.isActive('italic') ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-white' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                    title="Italic"
                  >
                    <Italic size={14} />
                  </button>
                  <button
                    onClick={() => activeEditor?.chain().focus().toggleUnderline().run()}
                    disabled={!activeEditor}
                    className={`p-1.5 rounded transition-colors ${activeEditor?.isActive('underline') ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-white' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                    title="Underline"
                  >
                    <UnderlineIcon size={14} />
                  </button>
                  <button
                    onClick={() => activeEditor?.chain().focus().toggleHighlight().run()}
                    disabled={!activeEditor}
                    className={`p-1.5 rounded transition-colors ${activeEditor?.isActive('highlight') ? 'bg-yellow-200 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-500' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                    title="Highlight"
                  >
                    <Highlighter size={14} />
                  </button>

                  <div className="flex px-2 gap-1 items-center ml-1">
                    <button onClick={() => activeEditor?.chain().focus().setColor('#000000').run()} className="w-3.5 h-3.5 rounded-full bg-black border border-zinc-300 dark:border-zinc-600" title="Black" />
                    <button onClick={() => activeEditor?.chain().focus().setColor('#ef4444').run()} className="w-3.5 h-3.5 rounded-full bg-red-500" title="Red" />
                    <button onClick={() => activeEditor?.chain().focus().setColor('#3b82f6').run()} className="w-3.5 h-3.5 rounded-full bg-blue-500" title="Blue" />
                    <button onClick={() => activeEditor?.chain().focus().setColor('#22c55e').run()} className="w-3.5 h-3.5 rounded-full bg-green-500" title="Green" />
                  </div>
                </div>

                <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-700 mx-1" />

                <div className="flex items-center">
                  <button
                    onClick={() => activeEditor?.chain().focus().toggleBulletList().run()}
                    disabled={!activeEditor}
                    className={`p-1.5 rounded transition-colors ${activeEditor?.isActive('bulletList') ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-white' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                    title="Bullet List"
                  >
                    <List size={14} />
                  </button>
                  <button
                    onClick={() => activeEditor?.chain().focus().toggleOrderedList().run()}
                    disabled={!activeEditor}
                    className={`p-1.5 rounded transition-colors ${activeEditor?.isActive('orderedList') ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-white' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                    title="Numbered List"
                  >
                    <ListOrdered size={14} />
                  </button>
                </div>
              </div>
            )}
            
            {activeTab === "Insert" && (
              <div className="flex items-center gap-2 h-full py-1">
                <button
                  onClick={() => {
                    toast.success("To record audio, use the mic icon in the main sidebar.", { icon: '🎙️' });
                  }}
                  className={`flex flex-col items-center justify-center h-full px-3 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300`}
                >
                  <Mic size={16} strokeWidth={2} />
                  <span className="text-[10px] font-medium mt-0.5">Audio</span>
                </button>
              </div>
            )}

            {activeTab === "Draw" && (
              <div className="flex items-center gap-4 h-full py-1">
                <div className="flex items-center h-full">
                  <button
                    onClick={() => setTool("pen")}
                    className={`flex flex-col items-center justify-center h-full px-3 rounded ${tool === "pen" ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300'}`}
                  >
                    <Pen size={16} strokeWidth={2} />
                    <span className="text-[10px] font-medium mt-0.5">Pen</span>
                  </button>
                  <button
                    onClick={() => setTool("pan")}
                    className={`flex flex-col items-center justify-center h-full px-3 rounded ${tool === "pan" ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300'}`}
                  >
                    <Hand size={16} strokeWidth={2} />
                    <span className="text-[10px] font-medium mt-0.5">Pan</span>
                  </button>
                </div>

                <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-700" />

                <div className="flex flex-col gap-1 justify-center h-full">
                  <div className="flex items-center gap-1">
                    {['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7', '#3f3f46', '#ffffff'].map(color => (
                      <button
                        key={color}
                        onClick={() => { setActiveColor(color); setTool("pen"); }}
                        className={`w-5 h-5 rounded-full border border-zinc-200 dark:border-zinc-700 transition-transform ${activeColor === color && tool === "pen" ? 'scale-125 shadow-sm ring-1 ring-zinc-400 dark:ring-zinc-500' : 'hover:scale-110'}`}
                        style={{ backgroundColor: color }}
                        title={`Color: ${color}`}
                      />
                    ))}
                  </div>
                </div>
                
                <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-700" />

                <div className="flex items-center gap-2 h-full">
                  {[2, 4, 8, 12].map(size => (
                    <button
                      key={size}
                      onClick={() => { setActiveSize(size); setTool("pen"); }}
                      className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${activeSize === size && tool === "pen" ? 'bg-zinc-200 dark:bg-zinc-700' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                      title={`Thickness: ${size}`}
                    >
                      <div 
                        className="rounded-full bg-current text-zinc-900 dark:text-zinc-100" 
                        style={{ width: size, height: size }} 
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Page Title overlay */}
      <div 
        className="absolute left-16 z-40 pointer-events-none transition-all duration-300"
        style={{ top: isRibbonExpanded ? '90px' : '50px' }}
      >
        <input
          type="text"
          value={pageTitle}
          onChange={(e) => onUpdatePageTitle(e.target.value)}
          placeholder="Page Title"
          className="bg-transparent text-4xl font-bold text-zinc-900 dark:text-zinc-100 border-none outline-none focus:ring-0 placeholder:text-zinc-300 dark:placeholder:text-zinc-700 w-[500px] pointer-events-auto"
        />
        {/* Decorative OneNote-style underline */}
        <div className="w-[500px] h-[1px] bg-gradient-to-r from-zinc-300 to-transparent dark:from-zinc-700 mt-2"></div>
        {pageCreatedAt && (
          <div className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 whitespace-pre">
            {format(new Date(pageCreatedAt), "EEEE, MMMM d, yyyy     h:mm a")}
          </div>
        )}
      </div>

      <div className="absolute inset-0" style={{ zIndex: tool === "pen" || tool === "pan" ? 30 : 10, pointerEvents: tool === "pen" || tool === "pan" || tool === "select" ? "auto" : "none" }}>
        <SpatialCanvas 
          strokes={strokes}
          setStrokes={setStrokes}
          pan={pan}
          setPan={setPan}
          zoom={zoom}
          setZoom={setZoom}
          tool={tool}
          activeColor={activeColor}
          activeSize={activeSize}
          selectedNodeId={selectedNodeId}
          setSelectedNodeId={setSelectedNodeId}
        />
      </div>

      <div className="absolute inset-0 z-20 pointer-events-none">
        <RichTextOverlay 
          texts={texts}
          setTexts={setTexts}
          pan={pan}
          zoom={zoom}
          onCanvasClick={handleCanvasClick}
          tool={tool}
          selectedNodeId={selectedNodeId}
          setSelectedNodeId={setSelectedNodeId}
          setActiveEditor={setActiveEditor}
          onEditorUpdate={() => setEditorUpdateTick(t => t + 1)}
        />
      </div>

      <div className="absolute inset-0 z-40 pointer-events-none">
        <AudioOverlay 
          audios={audios}
          setAudios={setAudios}
          pan={pan}
          zoom={zoom}
          tool={tool}
          selectedNodeId={selectedNodeId}
          setSelectedNodeId={setSelectedNodeId}
        />
      </div>
    </div>
  );
}
