"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import { createClient } from "@/lib/supabase/client";
import debounce from "lodash/debounce";
import { format } from "date-fns";
import { Pen, Type, Hand, MousePointer2, Bold, Italic, Underline as UnderlineIcon, Highlighter, AlignLeft, AlignCenter, AlignRight, Heading1, Heading2, List, ListOrdered, Image as ImageIcon, File as FileIcon, Video, Table as TableIcon, ChevronDown } from "lucide-react";
import { Editor } from "@tiptap/react";
import { SpatialCanvas } from "./SpatialCanvas";
import { RichTextOverlay } from "./RichTextOverlay";
import { AudioOverlay } from "./AudioOverlay";
import { MediaOverlay } from "./MediaOverlay";

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
  type?: 'highlighter' | 'eraser';
  x?: number;
  y?: number;
  width?: number;
  height?: number;
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

export type ImageNode = {
  id: string;
  x: number;
  y: number;
  url: string;
  width?: number;
  height?: number;
};

export type FileNode = {
  id: string;
  x: number;
  y: number;
  url: string;
  filename: string;
};

export type VideoNode = {
  id: string;
  x: number;
  y: number;
  url: string;
  width?: number;
  height?: number;
};

import { ColorPickerMenu } from "./ColorPickerMenu";

export type ToolType = "pan" | "home" | "pen" | "eraser" | "lasso";
export type RibbonTab = "Home" | "Insert" | "Draw" | "View";

export type ToolPreset = {
  id: string;
  type: 'pen' | 'highlighter';
  color: string;
  size: number;
};

export type EraserType = 'stroke' | 'point';

export type DocumentState = {
  strokes: Stroke[];
  texts: TextNode[];
  audios?: AudioNode[];
  images?: ImageNode[];
  files?: FileNode[];
  videos?: VideoNode[];
};

import { useCanvasData } from "@/hooks/useCanvasData";
import { Mic } from "lucide-react";
import toast from "react-hot-toast";

const FONT_OPTIONS = [
  { value: "", label: "Font" },
  { value: "Arial, sans-serif", label: "Arial" },
  { value: "Calibri, sans-serif", label: "Calibri" },
  { value: "Cambria, serif", label: "Cambria" },
  { value: "Comic Sans MS, cursive", label: "Comic Sans MS" },
  { value: "Consolas, monospace", label: "Consolas" },
  { value: "Courier New, monospace", label: "Courier New" },
  { value: "Garamond, serif", label: "Garamond" },
  { value: "Georgia, serif", label: "Georgia" },
  { value: "Helvetica, sans-serif", label: "Helvetica" },
  { value: "Impact, sans-serif", label: "Impact" },
  { value: "Inter, sans-serif", label: "Inter" },
  { value: "Menlo, monospace", label: "Menlo" },
  { value: "Palatino, serif", label: "Palatino" },
  { value: "Roboto, sans-serif", label: "Roboto" },
  { value: "Times New Roman, serif", label: "Times New Roman" },
  { value: "Trebuchet MS, sans-serif", label: "Trebuchet MS" },
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

function CustomSelect({ 
  value, 
  onChange, 
  options, 
  placeholder, 
  width,
  disabled
}: { 
  value: string; 
  onChange: (v: string) => void; 
  options: { label: string, value: string }[];
  placeholder: string;
  width: string;
  disabled: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find(o => o.value === value);

  return (
    <div className={`relative ${width}`} ref={ref} onPointerDown={(e) => e.stopPropagation()}>
      <button
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!disabled) setIsOpen(!isOpen);
        }}
        disabled={disabled}
        className={`w-full flex items-center justify-between bg-zinc-100 dark:bg-zinc-800 text-xs px-2 py-1 rounded border border-transparent hover:border-zinc-300 dark:hover:border-zinc-700 outline-none text-zinc-900 dark:text-zinc-300 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <span className="truncate">{selectedOption ? selectedOption.label : placeholder}</span>
        <ChevronDown size={12} className="opacity-50 flex-shrink-0 ml-1" />
      </button>
      {isOpen && !disabled && (
        <div className="absolute top-full mt-1 left-0 w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded shadow-lg z-50 max-h-60 overflow-y-auto">
          {options.map((opt) => (
            <button
              key={opt.value}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onChange(opt.value);
                setIsOpen(false);
              }}
              className={`w-full text-left px-2 py-1.5 text-xs hover:bg-primary-50 dark:hover:bg-primary-900/30 transition-colors ${value === opt.value ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 font-medium' : 'text-zinc-700 dark:text-zinc-300'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function CustomCanvas({ pageId, pageTitle, pageCreatedAt, onUpdatePageTitle }: CustomCanvasProps) {
  const { 
    loading, strokes, setStrokes, texts, setTexts, audios, setAudios, 
    images, setImages, files, setFiles, videos, setVideos,
    undo, redo, canUndo, canRedo 
  } = useCanvasData(pageId);

  // View state
  const [backgroundStyle, setBackgroundStyle] = useState<'none' | 'ruled' | 'grid'>('none');
  const [pageColor, setPageColor] = useState<string>('default');
  const [openColorMenu, setOpenColorMenu] = useState<'text' | 'drawing' | 'page' | null>(null);

  const PAGE_COLORS = ['default', '#fef9c3', '#dcfce7', '#e0f2fe', '#f3e8ff', '#fce7f3'];
  const [presets, setPresets] = useState<ToolPreset[]>([
    { id: '1', type: 'pen', color: '#3f3f46', size: 4 }, // zinc-700
    { id: '2', type: 'pen', color: '#ef4444', size: 4 }, // red-500
    { id: '3', type: 'pen', color: '#3b82f6', size: 4 }, // blue-500
    { id: '4', type: 'highlighter', color: '#eab308', size: 16 } // yellow-500
  ]);
  const [activePresetId, setActivePresetId] = useState<string>('1');
  const activePreset = presets.find(p => p.id === activePresetId) || presets[0];
  const activeColor = activePreset.color;
  const activeSize = activePreset.size;

  const [eraserType, setEraserType] = useState<EraserType>('stroke');
  const [isEraserMenuOpen, setIsEraserMenuOpen] = useState(false);

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

  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const getCanvasCenter = useCallback(() => {
    const screenCenterX = window.innerWidth / 2;
    const screenCenterY = window.innerHeight / 2;
    return {
      x: (screenCenterX - pan.x) / zoom,
      y: (screenCenterY - pan.y) / zoom
    };
  }, [pan, zoom]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'file' | 'image') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const toastId = toast.loading(`Uploading ${type}...`);
    try {
      const ext = file.name.split('.').pop();
      const filename = `${pageId}/${uuidv4()}.${ext}`;

      const { data, error } = await supabase.storage
        .from('recordings')
        .upload(filename, file);

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('recordings')
        .getPublicUrl(filename);

      const center = getCanvasCenter();
      
      if (type === 'image') {
        setImages(prev => [...(prev || []), {
          id: uuidv4(),
          x: center.x - 200, // Approximate centering for a 400px image
          y: center.y - 150,
          url: publicUrl
        }]);
      } else {
        setFiles(prev => [...(prev || []), {
          id: uuidv4(),
          x: center.x - 128, // 256px wide card
          y: center.y - 64,
          url: publicUrl,
          filename: file.name
        }]);
      }
      toast.success(`${type} uploaded!`, { id: toastId });
    } catch (error: any) {
      toast.error(`Upload failed: ${error.message}`, { id: toastId });
    } finally {
      e.target.value = ''; // Reset input
    }
  };

  const handleInsertVideo = () => {
    const url = prompt("Enter YouTube URL:");
    if (!url) return;
    const center = getCanvasCenter();
    setVideos(prev => [...(prev || []), {
      id: uuidv4(),
      x: center.x - 240, // 480px wide video
      y: center.y - 135,
      url,
      width: 480,
      height: 270
    }]);
  };

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

  const [isMiddleClickPanning, setIsMiddleClickPanning] = useState(false);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (tool !== "home") return; // SpatialCanvas handles it for other tools
    
    // Don't pan if we're scrolling inside a text editor or a scrollable element
    const target = e.target as HTMLElement;
    if (target.closest('.ProseMirror') && target.scrollHeight > target.clientHeight) {
      return;
    }

    if (e.ctrlKey || e.metaKey) {
      // Zoom (basic center zoom fallback)
      const scaleBy = 1.05;
      const newZoom = e.deltaY < 0 ? zoom * scaleBy : zoom / scaleBy;
      setZoom(Math.max(0.1, Math.min(newZoom, 5)));
    } else {
      // Pan
      setPan(prev => ({
        x: prev.x - e.deltaX,
        y: prev.y - e.deltaY
      }));
    }
  }, [tool, zoom]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button === 1) { // Middle click
      e.preventDefault();
      setIsMiddleClickPanning(true);
      document.body.style.cursor = 'grabbing';
    }
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (isMiddleClickPanning) {
      setPan(prev => ({
        x: prev.x + e.movementX,
        y: prev.y + e.movementY
      }));
    }
  }, [isMiddleClickPanning]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (e.button === 1 || isMiddleClickPanning) {
      setIsMiddleClickPanning(false);
      document.body.style.cursor = '';
    }
  }, [isMiddleClickPanning]);

  // Keyboard Shortcuts for Undo/Redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        const target = e.target as HTMLElement;
        if (!target.closest('.ProseMirror')) {
          e.preventDefault();
          undo();
        }
      }
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        const target = e.target as HTMLElement;
        if (!target.closest('.ProseMirror')) {
          e.preventDefault();
          redo();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  if (loading) {
    return <div className="w-full h-full flex items-center justify-center text-zinc-500">Loading canvas...</div>;
  }

  return (
    <div 
      className={`w-full h-full relative overflow-hidden ${pageColor === 'default' ? 'bg-[#fafafa] dark:bg-zinc-900' : ''}`}
      style={{ touchAction: 'none', backgroundColor: pageColor === 'default' ? undefined : pageColor }}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      
      {/* Top Ribbon Container */}
      <div className="absolute top-0 left-0 w-full bg-[#f3f2f1] dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 z-50 flex flex-col pointer-events-auto">
        {/* Tab Headers and Quick Access Toolbar */}
        <div className="flex items-end justify-between px-2 pt-1">
          <div className="flex gap-1">
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
                  if (tab === "Draw") setTool("pen");
                  else setTool("home");
                }}
                className={`px-4 py-1.5 text-sm rounded-t-md transition-colors ${
                  activeTab === tab 
                    ? 'bg-white dark:bg-[#202020] text-zinc-900 dark:text-zinc-100 shadow-[0_-1px_3px_rgba(0,0,0,0.05)] border-t border-l border-r border-transparent dark:border-zinc-800 relative z-10' 
                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-black/5 dark:hover:bg-white/5 border-t border-l border-r border-transparent'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 mb-1 mr-2">
            <button
              onClick={undo}
              disabled={!canUndo}
              className={`p-1.5 rounded-md transition-colors ${canUndo ? 'text-zinc-700 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/10' : 'text-zinc-400 dark:text-zinc-600 cursor-not-allowed'}`}
              title="Undo (Ctrl+Z)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              className={`p-1.5 rounded-md transition-colors ${canRedo ? 'text-zinc-700 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/10' : 'text-zinc-400 dark:text-zinc-600 cursor-not-allowed'}`}
              title="Redo (Ctrl+Y)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"/></svg>
            </button>
          </div>
        </div>
        
        {/* Ribbon Content */}
        {isRibbonExpanded && (
          <div className="h-[48px] bg-white dark:bg-zinc-900 flex items-center px-4 gap-4 shadow-sm border-b border-zinc-200 dark:border-zinc-800">
            {activeTab === "Home" && (
              <div className="flex items-center gap-2 h-full py-1">
                <button
                  onClick={() => setTool("home")}
                  className={`flex flex-col items-center justify-center h-full px-3 rounded ${tool === "home" ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300'}`}
                >
                  <MousePointer2 size={16} strokeWidth={2} />
                  <span className="text-[10px] font-medium mt-0.5">Select</span>
                </button>
                
                <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-700 mx-1" />

                <div className="flex items-center gap-1">
                  <CustomSelect
                    width="w-28"
                    placeholder="Font"
                    options={FONT_OPTIONS}
                    disabled={!activeEditor}
                    value={activeEditor?.getAttributes('textStyle')?.fontFamily || ""}
                    onChange={(val) => {
                      if (!activeEditor) return;
                      if (val === "") {
                        activeEditor.chain().focus().unsetFontFamily().run();
                      } else {
                        activeEditor.chain().focus().setFontFamily(val).run();
                      }
                    }}
                  />
                  
                  <CustomSelect
                    width="w-16"
                    placeholder="Size"
                    options={SIZE_OPTIONS}
                    disabled={!activeEditor}
                    value={activeEditor?.getAttributes('textStyle')?.fontSize || ""}
                    onChange={(val) => {
                      if (!activeEditor) return;
                      if (val === "") {
                        (activeEditor.chain().focus() as any).unsetFontSize().run();
                      } else {
                        (activeEditor.chain().focus() as any).setFontSize(val).run();
                      }
                    }}
                  />
                </div>

                <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-700 mx-1" />

                <div className="flex items-center">
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => activeEditor?.chain().focus().toggleBold().run()}
                    disabled={!activeEditor}
                    className={`p-1.5 rounded transition-colors ${activeEditor?.isActive('bold') ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-white' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                    title="Bold"
                  >
                    <Bold size={14} />
                  </button>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => activeEditor?.chain().focus().toggleItalic().run()}
                    disabled={!activeEditor}
                    className={`p-1.5 rounded transition-colors ${activeEditor?.isActive('italic') ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-white' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                    title="Italic"
                  >
                    <Italic size={14} />
                  </button>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => activeEditor?.chain().focus().toggleUnderline().run()}
                    disabled={!activeEditor}
                    className={`p-1.5 rounded transition-colors ${activeEditor?.isActive('underline') ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-white' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                    title="Underline"
                  >
                    <UnderlineIcon size={14} />
                  </button>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => activeEditor?.chain().focus().toggleHighlight().run()}
                    disabled={!activeEditor}
                    className={`p-1.5 rounded transition-colors ${activeEditor?.isActive('highlight') ? 'bg-yellow-200 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-500' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                    title="Highlight"
                  >
                    <Highlighter size={14} />
                  </button>

                  <div className="flex px-2 items-center ml-1 relative">
                    <button
                      disabled={!activeEditor}
                      title={!activeEditor ? "Click inside a text block first" : "Text Color"}
                      className={`w-6 h-6 p-0 border-0 rounded flex items-center justify-center transition-opacity relative ${!activeEditor ? 'opacity-50 cursor-not-allowed' : 'opacity-100 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                      style={{ color: activeEditor?.getAttributes('textStyle')?.color || '#000000' }}
                      onClick={() => setOpenColorMenu(openColorMenu === 'text' ? null : 'text')}
                    >
                      <div className="font-serif text-sm font-bold leading-none">A</div>
                      <div className="absolute bottom-0.5 left-1 right-1 h-[3px]" style={{ backgroundColor: activeEditor?.getAttributes('textStyle')?.color || '#000000' }}></div>
                    </button>
                    <ColorPickerMenu 
                      isOpen={openColorMenu === 'text'} 
                      onClose={() => setOpenColorMenu(null)} 
                      type="text" 
                      activeColor={activeEditor?.getAttributes('textStyle')?.color || '#000000'}
                      onChange={(color) => {
                        if (activeEditor) {
                          activeEditor.chain().focus().setColor(color).run();
                        }
                      }}
                    />
                  </div>
                </div>

                <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-700 mx-1" />

                <div className="flex items-center">
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => activeEditor?.chain().focus().toggleBulletList().run()}
                    disabled={!activeEditor}
                    className={`p-1.5 rounded transition-colors ${activeEditor?.isActive('bulletList') ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-white' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                    title="Bullet List"
                  >
                    <List size={14} />
                  </button>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
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
              <div className="flex items-center gap-4 h-full py-1">
                <input type="file" ref={imageInputRef} accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, 'image')} />
                <input type="file" ref={fileInputRef} className="hidden" onChange={(e) => handleFileUpload(e, 'file')} />
                
                <div className="flex items-center h-full">
                  <button
                    onClick={() => {
                      toast.success("To record audio, use the mic icon in the main sidebar.", { icon: '🎙️' });
                    }}
                    className={`flex flex-col items-center justify-center h-full px-3 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300`}
                  >
                    <Mic size={16} strokeWidth={2} />
                    <span className="text-[10px] font-medium mt-0.5">Audio</span>
                  </button>
                  <button
                    onClick={() => imageInputRef.current?.click()}
                    className={`flex flex-col items-center justify-center h-full px-3 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300`}
                  >
                    <ImageIcon size={16} strokeWidth={2} />
                    <span className="text-[10px] font-medium mt-0.5">Image</span>
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className={`flex flex-col items-center justify-center h-full px-3 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300`}
                  >
                    <FileIcon size={16} strokeWidth={2} />
                    <span className="text-[10px] font-medium mt-0.5">File</span>
                  </button>
                  <button
                    onClick={handleInsertVideo}
                    className={`flex flex-col items-center justify-center h-full px-3 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300`}
                  >
                    <Video size={16} strokeWidth={2} />
                    <span className="text-[10px] font-medium mt-0.5">Video</span>
                  </button>
                </div>

                <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-700" />

                <div className="flex items-center h-full">
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => activeEditor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
                    disabled={!activeEditor}
                    className={`flex flex-col items-center justify-center h-full px-3 rounded ${activeEditor ? 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300' : 'text-zinc-400 dark:text-zinc-600 cursor-not-allowed'}`}
                    title={!activeEditor ? "Click inside a text block first" : "Insert Table"}
                  >
                    <TableIcon size={16} strokeWidth={2} />
                    <span className="text-[10px] font-medium mt-0.5">Table</span>
                  </button>
                </div>
              </div>
            )}

            {activeTab === "Draw" && (
              <div className="flex items-center gap-2 h-full py-1">
                <div className="flex items-center h-full gap-1 border-r border-zinc-200 dark:border-zinc-700 pr-2 mr-1">
                  <button
                    onClick={() => setTool("lasso")}
                    className={`flex flex-col items-center justify-center h-full px-2 rounded ${tool === "lasso" ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300'}`}
                    title="Lasso Select"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-0.5">
                      <path d="M9.6 20H15a2 2 0 0 0 2-2v-1.5" />
                      <path d="M17 12v-1.5a2 2 0 0 0-2-2h-1.5" />
                      <path d="M9.6 4H7.5a2 2 0 0 0-2 2v1.5" />
                      <path d="M5.5 12v1.5a2 2 0 0 0 2 2H9.6" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                    <span className="text-[10px] font-medium leading-none">Lasso</span>
                  </button>
                  
                  <div className="relative h-full flex items-center">
                    <button
                      onClick={() => setTool("eraser")}
                      className={`flex flex-col items-center justify-center h-full px-2 rounded-l ${tool === "eraser" ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300'}`}
                      title="Eraser"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-0.5">
                        <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" />
                        <path d="M22 21H7" />
                        <path d="m5 11 9 9" />
                      </svg>
                      <span className="text-[10px] font-medium leading-none">Eraser</span>
                    </button>
                    <button 
                      className={`flex items-center justify-center h-full px-1 rounded-r border-l border-zinc-200 dark:border-zinc-700/50 ${tool === "eraser" ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-600' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600'} ${isEraserMenuOpen ? 'bg-zinc-200 dark:bg-zinc-700' : ''}`}
                      onClick={() => setIsEraserMenuOpen(!isEraserMenuOpen)}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                    </button>

                    {isEraserMenuOpen && (
                      <div className="absolute top-full mt-1 left-0 w-36 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded shadow-lg z-50 flex flex-col py-1">
                        <button 
                          className="text-left px-3 py-1.5 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-between"
                          onClick={() => { setEraserType('stroke'); setTool('eraser'); setIsEraserMenuOpen(false); }}
                        >
                          <span>Stroke Eraser</span>
                          {eraserType === 'stroke' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                        </button>
                        <button 
                          className="text-left px-3 py-1.5 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-between"
                          onClick={() => { setEraserType('point'); setTool('eraser'); setIsEraserMenuOpen(false); }}
                        >
                          <span>Point Eraser</span>
                          {eraserType === 'point' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center h-full overflow-x-auto custom-scrollbar pr-2">
                  {presets.map(preset => (
                    <button
                      key={preset.id}
                      onClick={() => { setActivePresetId(preset.id); setTool("pen"); }}
                      className={`flex flex-col items-center justify-center h-full px-2 rounded min-w-[40px] relative transition-colors ${activePresetId === preset.id && tool === "pen" ? 'bg-primary-50 dark:bg-primary-900/30' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                    >
                      {preset.type === 'pen' ? (
                        <Pen size={18} strokeWidth={2} color={preset.color} />
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={preset.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-80"><path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/></svg>
                      )}
                      <div 
                        className="absolute bottom-1 w-4 h-1 rounded-full" 
                        style={{ backgroundColor: preset.color, height: Math.max(2, preset.size / 2) + 'px' }}
                      />
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      const newId = String(Date.now());
                      setPresets([...presets, { id: newId, type: 'pen', color: '#000000', size: 4 }]);
                      setActivePresetId(newId);
                      setTool("pen");
                    }}
                    className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 ml-1"
                    title="Add Preset"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  </button>
                </div>

                <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-700 mx-1" />

                <div className="flex flex-col gap-1 justify-center h-full">
                  <div className="flex items-center relative">
                    <button 
                      className="w-7 h-7 p-0 border-0 rounded flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      onClick={() => setOpenColorMenu(openColorMenu === 'drawing' ? null : 'drawing')}
                      title="Preset Color"
                    >
                      <div className="w-4 h-4 rounded-full border border-black/10 dark:border-white/10" style={{ backgroundColor: presets.find(p => p.id === activePresetId)?.color || '#000000' }}></div>
                    </button>
                    <ColorPickerMenu 
                      isOpen={openColorMenu === 'drawing'} 
                      onClose={() => setOpenColorMenu(null)} 
                      type="drawing" 
                      activeColor={presets.find(p => p.id === activePresetId)?.color || '#000000'}
                      onChange={(color) => {
                        setPresets(prev => prev.map(p => p.id === activePresetId ? { ...p, color } : p));
                        setTool("pen");
                      }}
                    />
                  </div>
                </div>
                
                <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-700 mx-1" />

                <div className="flex items-center gap-1 h-full">
                  {[2, 4, 8, 12, 16, 24].map(size => (
                    <button
                      key={size}
                      onClick={() => { 
                        setPresets(prev => prev.map(p => p.id === activePresetId ? { ...p, size: size } : p));
                        setTool("pen"); 
                      }}
                      className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${presets.find(p => p.id === activePresetId)?.size === size && tool === "pen" ? 'bg-zinc-200 dark:bg-zinc-700' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                    >
                      <div className="bg-current rounded-full" style={{ width: Math.max(2, size/2), height: Math.max(2, size/2) }} />
                    </button>
                  ))}
                </div>
              </div>
            )}
            {activeTab === "View" && (
              <div className="flex items-center gap-4 h-full py-1">
                <div className="flex items-center h-full gap-1">
                  <button
                    onClick={() => setZoom(z => Math.min(5, z * 1.2))}
                    className="flex flex-col items-center justify-center h-full px-3 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
                    title="Zoom In"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-0.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
                    <span className="text-[10px] font-medium leading-none mt-0.5">Zoom In</span>
                  </button>
                  <button
                    onClick={() => setZoom(z => Math.max(0.1, z / 1.2))}
                    className="flex flex-col items-center justify-center h-full px-3 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
                    title="Zoom Out"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-0.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
                    <span className="text-[10px] font-medium leading-none mt-0.5">Zoom Out</span>
                  </button>
                  <button
                    onClick={() => setZoom(1)}
                    className="flex flex-col items-center justify-center h-full px-3 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
                    title="Zoom to 100%"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-0.5"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 10.5 12 7l3 3.5"/><path d="M9 13.5 12 17l3-3.5"/></svg>
                    <span className="text-[10px] font-medium leading-none mt-0.5">100%</span>
                  </button>
                </div>

                <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-700" />

                <div className="flex items-center h-full gap-1">
                  <button
                    onClick={() => setBackgroundStyle('none')}
                    className={`flex flex-col items-center justify-center h-full px-3 rounded ${backgroundStyle === 'none' ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300'}`}
                  >
                    <div className="w-4 h-4 border border-zinc-400 rounded-sm bg-white dark:bg-zinc-900 mb-1"></div>
                    <span className="text-[10px] font-medium leading-none">None</span>
                  </button>
                  <button
                    onClick={() => setBackgroundStyle('ruled')}
                    className={`flex flex-col items-center justify-center h-full px-3 rounded ${backgroundStyle === 'ruled' ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300'}`}
                  >
                    <div className="w-4 h-4 border border-zinc-400 rounded-sm bg-white dark:bg-zinc-900 mb-1 flex flex-col justify-evenly px-0.5">
                      <div className="w-full h-[1px] bg-zinc-300 dark:bg-zinc-600"></div>
                      <div className="w-full h-[1px] bg-zinc-300 dark:bg-zinc-600"></div>
                      <div className="w-full h-[1px] bg-zinc-300 dark:bg-zinc-600"></div>
                    </div>
                    <span className="text-[10px] font-medium leading-none">Ruled</span>
                  </button>
                  <button
                    onClick={() => setBackgroundStyle('grid')}
                    className={`flex flex-col items-center justify-center h-full px-3 rounded ${backgroundStyle === 'grid' ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300'}`}
                  >
                    <div className="w-4 h-4 border border-zinc-400 rounded-sm bg-white dark:bg-zinc-900 mb-1 grid grid-cols-3 grid-rows-3 gap-px bg-zinc-300 dark:bg-zinc-600">
                      <div className="bg-white dark:bg-zinc-900"></div><div className="bg-white dark:bg-zinc-900"></div><div className="bg-white dark:bg-zinc-900"></div>
                      <div className="bg-white dark:bg-zinc-900"></div><div className="bg-white dark:bg-zinc-900"></div><div className="bg-white dark:bg-zinc-900"></div>
                      <div className="bg-white dark:bg-zinc-900"></div><div className="bg-white dark:bg-zinc-900"></div><div className="bg-white dark:bg-zinc-900"></div>
                    </div>
                    <span className="text-[10px] font-medium leading-none">Grid</span>
                  </button>
                </div>

                <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-700 mx-1" />

                <div className="flex flex-col gap-1 justify-center h-full">
                  <div className="flex items-center relative">
                    <button
                      onClick={() => setOpenColorMenu(openColorMenu === 'page' ? null : 'page')}
                      className={`flex flex-col items-center justify-center h-full px-2 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300`}
                    >
                      <div className="flex items-center gap-1">
                        <div className="w-4 h-4 rounded border border-zinc-300 dark:border-zinc-700" style={{ backgroundColor: pageColor === 'default' ? 'transparent' : pageColor }}></div>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                      </div>
                      <span className="text-[10px] font-medium leading-none mt-1">Page Color</span>
                    </button>
                    <ColorPickerMenu 
                      isOpen={openColorMenu === 'page'} 
                      onClose={() => setOpenColorMenu(null)} 
                      type="page" 
                      activeColor={pageColor}
                      onChange={(color) => setPageColor(color)}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Dynamic Background Pattern */}
      {backgroundStyle !== 'none' && (
        <div 
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: backgroundStyle === 'ruled' 
              ? `linear-gradient(transparent 0px, transparent calc(32px * ${zoom} - 1px), var(--line-color) calc(32px * ${zoom} - 1px), var(--line-color) calc(32px * ${zoom}))`
              : `linear-gradient(to right, var(--line-color) 1px, transparent 1px), linear-gradient(to bottom, var(--line-color) 1px, transparent 1px)`,
            backgroundSize: backgroundStyle === 'ruled'
              ? `100% calc(32px * ${zoom})`
              : `calc(32px * ${zoom}) calc(32px * ${zoom})`,
            backgroundPosition: `${pan.x}px ${pan.y}px`,
            ['--line-color' as string]: 'var(--tw-prose-hr, rgba(161, 161, 170, 0.2))',
            zIndex: 1
          }}
        />
      )}

      {/* Page Title overlay */}
      <div 
        className="absolute z-40 pointer-events-none"
        style={{ 
          transformOrigin: '0 0',
          transform: `translate(${pan.x + 64 * zoom}px, ${pan.y + 100 * zoom}px) scale(${zoom})`
        }}
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

      <div className="absolute inset-0" style={{ zIndex: tool === "pen" || tool === "pan" ? 30 : 10, pointerEvents: "auto" }}>
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
          activePresetType={activePreset.type}
          eraserType={eraserType}
          selectedNodeId={selectedNodeId}
          setSelectedNodeId={setSelectedNodeId}
          onCanvasClick={handleCanvasClick}
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
          audios={audios || []}
          setAudios={setAudios}
          pan={pan}
          zoom={zoom}
          tool={tool}
          selectedNodeId={selectedNodeId}
          setSelectedNodeId={setSelectedNodeId}
        />
        <MediaOverlay
          images={images || []}
          setImages={setImages}
          files={files || []}
          setFiles={setFiles}
          videos={videos || []}
          setVideos={setVideos}
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
