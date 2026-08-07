"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import { createClient } from "@/lib/supabase/client";
import debounce from "lodash/debounce";
import { format } from "date-fns";
import { Pen, Type, Hand, MousePointer2, Bold, Italic, Underline as UnderlineIcon, Highlighter, AlignLeft, AlignCenter, AlignRight, Heading1, Heading2, List, ListOrdered, Image as ImageIcon, File as FileIcon, Video, Table as TableIcon } from "lucide-react";
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

export type ToolType = "home" | "pen" | "pan";
export type RibbonTab = "Home" | "Insert" | "Draw" | "View";

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

export function CustomCanvas({ pageId, pageTitle, pageCreatedAt, onUpdatePageTitle }: CustomCanvasProps) {
  const { loading, strokes, setStrokes, texts, setTexts, audios, setAudios, images, setImages, files, setFiles, videos, setVideos } = useCanvasData(pageId);

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

  if (loading) {
    return <div className="w-full h-full flex items-center justify-center text-zinc-500">Loading canvas...</div>;
  }

  return (
    <div 
      className="w-full h-full relative overflow-hidden bg-[#fafafa] dark:bg-zinc-900"
      style={{ touchAction: 'none' }}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      
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
                if (tab === "Draw") setTool("pen");
                else setTool("home");
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

                <div className="flex items-center gap-1">
                  <select
                    className="bg-zinc-100 dark:bg-zinc-800 text-xs px-2 py-1 rounded border border-transparent hover:border-zinc-300 dark:hover:border-zinc-700 outline-none w-28 text-zinc-900 dark:text-zinc-300"
                    style={{ colorScheme: 'dark' }}
                    onChange={(e) => {
                      if (!activeEditor) return;
                      if (e.target.value === "") {
                        activeEditor.chain().focus().unsetFontFamily().run();
                      } else {
                        activeEditor.chain().focus().setFontFamily(e.target.value).run();
                      }
                    }}
                    value={activeEditor?.getAttributes('textStyle')?.fontFamily || ""}
                    disabled={!activeEditor}
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
                    className="bg-zinc-100 dark:bg-zinc-800 text-xs px-2 py-1 rounded border border-transparent hover:border-zinc-300 dark:hover:border-zinc-700 outline-none w-16 text-zinc-900 dark:text-zinc-300"
                    style={{ colorScheme: 'dark' }}
                    onChange={(e) => {
                      if (!activeEditor) return;
                      if (e.target.value === "") {
                        (activeEditor.chain().focus() as any).unsetFontSize().run();
                      } else {
                        (activeEditor.chain().focus() as any).setFontSize(e.target.value).run();
                      }
                    }}
                    value={activeEditor?.getAttributes('textStyle')?.fontSize || ""}
                    disabled={!activeEditor}
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
