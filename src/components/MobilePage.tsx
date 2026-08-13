"use client";

import React, { useMemo, useEffect, useState, useRef } from "react";
import { useCanvasData } from "@/hooks/useCanvasData";
import { v4 as uuidv4 } from "uuid";
import { TipTapEditor } from "./TipTapEditor";
import { Trash2, Plus, File, Download, ChevronLeft, Type, Image as ImageIcon, Mic, PenTool } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";
import { SettingsModal } from "./SettingsModal";
import { MobileAudioCard } from "./MobileAudioCard";
import { MobileDrawOverlay } from "./MobileDrawOverlay";
import type { Stroke, TextNode, ImageNode, AudioNode, FileNode, VideoNode } from "./CustomCanvas";

function getStrokeBoundingBox(stroke: Stroke) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of stroke.points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const sX = stroke.scaleX || 1;
  const sY = stroke.scaleY || 1;
  const tX = stroke.x || 0;
  const tY = stroke.y || 0;
  
  return {
    minX: minX * sX + tX,
    minY: minY * sY + tY,
    maxX: maxX * sX + tX,
    maxY: maxY * sY + tY,
  };
}

function getBlockBoundingBox(block: any) {
  let width = block.width || 400;
  let height = 200; 
  if (block.type === 'image') { width = block.width || 400; height = block.height || 400; }
  if (block.type === 'video') { width = 480; height = 270; }
  if (block.type === 'file') { width = 256; height = 64; }
  if (block.type === 'audio') { width = 400; height = 100; }
  if (block.type === 'text') { width = block.width || 400; height = 300; }
  
  return {
    minX: block.x,
    minY: block.y,
    maxX: block.x + width,
    maxY: block.y + height,
    width,
    height
  };
}

function getIntersectionArea(box1: any, box2: any) {
  const overlapX = Math.max(0, Math.min(box1.maxX, box2.maxX) - Math.max(box1.minX, box2.minX));
  const overlapY = Math.max(0, Math.min(box1.maxY, box2.maxY) - Math.max(box1.minY, box2.minY));
  return overlapX * overlapY;
}

import { getStroke } from "perfect-freehand";

// Utility to convert perfect-freehand points to an SVG path string
function getSvgPathFromStroke(stroke: number[][]) {
  if (!stroke.length) return "";
  const d = stroke.reduce(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length];
      acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
      return acc;
    },
    ["M", ...stroke[0], "Q"]
  );
  d.push("Z");
  return d.join(" ");
}

// Render strokes attached to a block
function AttachedStrokes({ strokes, blockBox, isStandalone }: { strokes: Stroke[], blockBox: any, isStandalone?: boolean }) {
  if (!strokes || strokes.length === 0) return null;

  // We want to ensure we don't clip strokes that go slightly outside the block
  let minX = blockBox.minX;
  let minY = blockBox.minY;
  let maxX = blockBox.maxX;
  let maxY = blockBox.maxY;

  strokes.forEach((stroke: Stroke) => {
    const box = getStrokeBoundingBox(stroke);
    minX = Math.min(minX, box.minX);
    minY = Math.min(minY, box.minY);
    maxX = Math.max(maxX, box.maxX);
    maxY = Math.max(maxY, box.maxY);
  });

  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);

  // For attached strokes, use the block's width as the reference.
  // For standalone strokes, use a virtual desktop width (e.g. 800) so small scribbles don't become massive.
  const referenceWidth = isStandalone ? 800 : blockBox.width;

  // Use percentages relative to the block width so strokes scale gracefully with text layout on mobile
  const leftPercent = isStandalone ? 0 : ((minX - blockBox.minX) / referenceWidth) * 100;
  
  return (
    <svg 
      className={`${isStandalone ? 'relative' : 'absolute'} pointer-events-none z-20`}
      style={{
        left: isStandalone ? undefined : `${leftPercent}%`, 
        top: isStandalone ? undefined : 0,
        // Calculate proportional width relative to reference width
        width: `${Math.min((width / referenceWidth) * 100, 200)}%`,
        height: 'auto',
      }}
      viewBox={`${minX} ${minY} ${width} ${height}`}
      preserveAspectRatio="xMinYMin meet"
    >
      <defs>
        <mask id={`mask-${strokes[0]?.id || 'empty'}`}>
          <rect x={minX} y={minY} width={width} height={height} fill="white" />
          {strokes.filter(s => s.type === 'eraser').map(stroke => {
            if (!stroke.points || stroke.points.length === 0) return null;
            const strokeData = getStroke(stroke.points, { size: stroke.size, thinning: 0.5, smoothing: 0.5, streamline: 0.5 });
            const pathData = getSvgPathFromStroke(strokeData);
            const sX = stroke.scaleX || 1;
            const sY = stroke.scaleY || 1;
            const tX = stroke.x || 0;
            const tY = stroke.y || 0;
            return <path key={stroke.id} d={pathData} fill="black" transform={`translate(${tX}, ${tY}) scale(${sX}, ${sY})`} />;
          })}
        </mask>
      </defs>
      <g mask={`url(#mask-${strokes[0]?.id || 'empty'})`}>
        {strokes.filter(s => s.type !== 'eraser').map((stroke) => {
          if (!stroke.points || stroke.points.length === 0) return null;
          
          const strokeData = getStroke(stroke.points, {
            size: stroke.size,
            thinning: 0.5,
            smoothing: 0.5,
            streamline: 0.5,
          });
          const pathData = getSvgPathFromStroke(strokeData);

          const sX = stroke.scaleX || 1;
          const sY = stroke.scaleY || 1;
          const tX = stroke.x || 0;
          const tY = stroke.y || 0;

          // Apply opacity for highlighter
          const opacity = stroke.type === 'highlighter' ? 0.4 : 1;

          return (
            <path
              key={stroke.id}
              d={pathData}
              fill={stroke.color}
              opacity={opacity}
              transform={`translate(${tX}, ${tY}) scale(${sX}, ${sY})`}
              style={stroke.type === 'highlighter' ? { mixBlendMode: 'multiply' } : undefined}
            />
          );
        })}
      </g>
    </svg>
  );
}

interface MobilePageProps {
  pageId: string;
  pageTitle: string;
  pageCreatedAt: string;
  onUpdatePageTitle: (title: string) => void;
  onBack?: () => void;
  isRecording?: boolean;
  isProcessing?: boolean;
  onToggleMeeting?: () => void;
}

export function MobilePage({ pageId, pageTitle, pageCreatedAt, onUpdatePageTitle, onBack, isRecording, isProcessing, onToggleMeeting }: MobilePageProps) {
  const { loading, strokes, setStrokes, texts, setTexts, audios, setAudios, images, setImages, files, setFiles, videos, setVideos } = useCanvasData(pageId);
  const [bottomY, setBottomY] = useState(0);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  
  const [isDrawOverlayOpen, setIsDrawOverlayOpen] = useState(false);
  const [drawOverlayBlockId, setDrawOverlayBlockId] = useState<string | null>(null);

  const openDrawOverlay = (blockId: string | null = null) => {
    setDrawOverlayBlockId(blockId);
    setIsDrawOverlayOpen(true);
  };
  
  const imageInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const toastId = toast.loading(`Uploading image...`);
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

      setImages(prev => [...(prev || []), {
        id: uuidv4(),
        x: 50,
        y: bottomY,
        url: publicUrl
      }]);
      toast.success(`Image uploaded!`, { id: toastId });
      setTimeout(() => {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      }, 100);
    } catch (error: any) {
      toast.error(`Upload failed: ${error.message}`, { id: toastId });
    } finally {
      e.target.value = ''; // Reset input
    }
  };

  // Group blocks and strokes
  const sortedBlocks = useMemo(() => {
    const baseBlocks = [
      ...texts.map(t => ({ ...t, type: 'text' as const, attachedStrokes: [] as Stroke[] })),
      ...(audios || []).map(a => ({ ...a, type: 'audio' as const, attachedStrokes: [] as Stroke[] })),
      ...(images || []).map(i => ({ ...i, type: 'image' as const, attachedStrokes: [] as Stroke[] })),
      ...(files || []).map(f => ({ ...f, type: 'file' as const, attachedStrokes: [] as Stroke[] })),
      ...(videos || []).map(v => ({ ...v, type: 'video' as const, attachedStrokes: [] as Stroke[] }))
    ];

    const unattachedStrokes: Stroke[] = [];

    strokes.forEach((stroke: Stroke) => {
      if (!stroke.points || stroke.points.length === 0) return;
      
      if (stroke.blockId) {
        const block = baseBlocks.find(b => b.id === stroke.blockId);
        if (block) {
          block.attachedStrokes.push(stroke);
        } else {
          // Fallback
          unattachedStrokes.push(stroke);
        }
      } else {
        // Global sketches have no blockId
        unattachedStrokes.push(stroke);
      }
    });

    // Group unattached strokes into drawing blocks
    const drawingBlocks: any[] = [];
    
    unattachedStrokes.forEach(stroke => {
      const box = getStrokeBoundingBox(stroke);
      const padding = 50;
      const expandedBox = {
        minX: box.minX - padding,
        minY: box.minY - padding,
        maxX: box.maxX + padding,
        maxY: box.maxY + padding
      };
      
      const overlappingCluster = drawingBlocks.find(c => getIntersectionArea(expandedBox, c) > 0);
      
      if (overlappingCluster) {
        overlappingCluster.attachedStrokes.push(stroke);
        overlappingCluster.minX = Math.min(overlappingCluster.minX, box.minX);
        overlappingCluster.minY = Math.min(overlappingCluster.minY, box.minY);
        overlappingCluster.maxX = Math.max(overlappingCluster.maxX, box.maxX);
        overlappingCluster.maxY = Math.max(overlappingCluster.maxY, box.maxY);
        overlappingCluster.x = overlappingCluster.minX;
        overlappingCluster.y = overlappingCluster.minY;
        overlappingCluster.width = overlappingCluster.maxX - overlappingCluster.minX;
        overlappingCluster.height = overlappingCluster.maxY - overlappingCluster.minY;
      } else {
        drawingBlocks.push({
          type: 'drawing',
          id: `cluster-${stroke.id}`,
          x: box.minX,
          y: box.minY,
          minX: box.minX,
          minY: box.minY,
          maxX: box.maxX,
          maxY: box.maxY,
          width: box.maxX - box.minX,
          height: box.maxY - box.minY,
          attachedStrokes: [stroke]
        });
      }
    });

    const finalBlocks = [...baseBlocks, ...drawingBlocks];
    return finalBlocks.sort((a, b) => {
      if (Math.abs(a.y - b.y) > 10) return a.y - b.y; // 10px tolerance for vertical alignment
      return a.x - b.x;
    });
  }, [texts, audios, images, files, videos, strokes]);

  useEffect(() => {
    if (sortedBlocks.length > 0) {
      setBottomY(sortedBlocks[sortedBlocks.length - 1].y + 200);
    } else {
      setBottomY(100);
    }
  }, [sortedBlocks]);

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
      
      const newAudio = {
        id: id || uuidv4(),
        x: 50,
        y: bottomY,
        width: 400,
        url,
        title: "Meeting Recording"
      };
      
      setAudios(prev => [...(prev || []), newAudio as any]);
      
      setTimeout(() => {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      }, 100);
    };

    window.addEventListener('inject-summary', handleInjectSummary);
    window.addEventListener('inject-audio', handleInjectAudio);
    
    return () => {
      window.removeEventListener('inject-summary', handleInjectSummary);
      window.removeEventListener('inject-audio', handleInjectAudio);
    };
  }, [bottomY, setAudios]);

  const addTextBlock = () => {
    const newNode = {
      id: uuidv4(),
      x: 50,
      y: bottomY,
      width: 400,
      content: "<p></p>"
    };
    setTexts(prev => [...prev, newNode]);
    setTimeout(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }, 100);
  };

  if (loading) {
    return <div className="w-full h-full flex items-center justify-center text-zinc-500">Loading notes...</div>;
  }

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-black relative">
      
      {/* Blurred Header */}
      <div 
        className="sticky top-0 z-50 bg-white/70 dark:bg-black/70 backdrop-blur-xl border-b border-zinc-200 dark:border-zinc-800 transition-all"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)' }}
      >
        <div className="flex items-center px-4 py-3">
          {onBack && (
            <button 
              onClick={onBack}
              className="flex items-center text-primary-600 dark:text-yellow-500 font-medium mr-2"
            >
              <ChevronLeft size={24} className="-ml-2" />
              Notes
            </button>
          )}
          <div className="flex-1" />
          <button className="p-1 text-primary-600 dark:text-yellow-500 rounded-full">
            {/* Placeholder for more actions */}
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
          </button>
        </div>
      </div>

      <div 
        className="flex-1 overflow-y-auto overflow-x-hidden relative scroll-smooth" 
        style={{ WebkitOverflowScrolling: 'touch' }}
        onClick={() => setActiveBlockId(null)}
      >
        
        {/* Title area (scrolls with content) */}
        <div className="px-5 pt-4 pb-6">
          <input
            type="text"
            value={pageTitle}
            onChange={(e) => onUpdatePageTitle(e.target.value)}
            placeholder="Page Title"
            className="bg-transparent text-4xl font-bold text-zinc-900 dark:text-white border-none outline-none focus:ring-0 placeholder:text-zinc-300 dark:placeholder:text-zinc-700 w-full mb-1"
          />
          {pageCreatedAt && (
            <div className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              {format(new Date(pageCreatedAt), "MMMM d, yyyy 'at' h:mm a")}
            </div>
          )}
        </div>

        {/* Linear feed of blocks */}
        <div className="flex flex-col gap-6 w-full px-5 pb-32 relative z-10 min-h-full">
          {sortedBlocks.map((block, index) => {
            const blockBox = getBlockBoundingBox(block);
            const reverseZ = 1000 - index;

            if (block.type === 'text') {
              return (
                <div 
                  key={block.id} 
                  id={`block-${block.id}`}
                  className="w-full min-h-[50px] relative"
                  style={{ zIndex: reverseZ }}
                >
                  <button 
                    onClick={(e) => { e.stopPropagation(); openDrawOverlay(block.id); }}
                    className="absolute -top-3 -right-3 w-8 h-8 bg-white dark:bg-zinc-800 rounded-full shadow border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-indigo-500 hover:text-indigo-600 z-30"
                  >
                    <PenTool size={14} />
                  </button>
                  <TipTapEditor 
                    content={block.content}
                    onChange={(content) => {
                      setTexts(prev => prev.map(t => t.id === block.id ? { ...t, content } : t));
                    }}
                    onDelete={() => {
                      setTexts(prev => prev.filter(t => t.id !== block.id));
                    }}
                  />
                  <AttachedStrokes strokes={block.attachedStrokes} blockBox={blockBox} />
                </div>
              );
            } else if (block.type === 'audio') {
              return (
                <div key={block.id} id={`block-${block.id}`} className="relative w-full" style={{ zIndex: reverseZ }}>
                  <MobileAudioCard 
                    node={block} 
                    updateAudioTitle={(id, title) => setAudios(prev => prev.map(a => a.id === id ? { ...a, title } : a))}
                    updateAudioField={(id, field, value) => setAudios(prev => prev.map(a => a.id === id ? { ...a, [field]: value } : a))}
                    deleteAudioNode={(id) => setAudios(prev => prev.filter(a => a.id !== id))}
                    onAnnotate={(id) => openDrawOverlay(id)}
                  />
                  <AttachedStrokes strokes={block.attachedStrokes} blockBox={blockBox} />
                </div>
              );
            } else if (block.type === 'image') {
              return (
                <div 
                  key={block.id} 
                  id={`block-${block.id}`}
                  className="relative w-full rounded shadow-sm border border-zinc-200 dark:border-zinc-800 bg-black"
                  style={{ zIndex: reverseZ }}
                >
                  <img src={block.url} alt="Canvas Image" className="w-full h-auto object-contain" />
                  <button 
                    onClick={(e) => { e.stopPropagation(); openDrawOverlay(block.id); }}
                    className="absolute top-2 right-12 w-8 h-8 bg-white/80 dark:bg-black/50 backdrop-blur rounded-full flex items-center justify-center text-indigo-500 hover:text-indigo-600 z-30"
                  >
                    <PenTool size={14} />
                  </button>
                  <button 
                    onClick={() => setImages(prev => prev.filter(n => n.id !== block.id))}
                    className="absolute top-2 right-2 w-8 h-8 bg-white/80 dark:bg-black/50 backdrop-blur rounded-full flex items-center justify-center text-red-500 hover:text-red-600 z-30"
                  >
                    <Trash2 size={14} />
                  </button>
                  <AttachedStrokes strokes={block.attachedStrokes} blockBox={blockBox} />
                </div>
              );
            } else if (block.type === 'file') {
              return (
                <div 
                  key={block.id} 
                  id={`block-${block.id}`}
                  className="relative w-full bg-white dark:bg-zinc-900 p-4 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 flex items-center justify-between"
                  style={{ zIndex: reverseZ }}
                >
                  <div className="flex items-center gap-3 overflow-hidden relative z-30">
                    <File size={24} className="text-primary-500 flex-shrink-0" />
                    <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">{block.filename}</span>
                  </div>
                  <div className="flex items-center gap-2 relative z-30">
                    <button 
                      onClick={(e) => { e.stopPropagation(); openDrawOverlay(block.id); }}
                      className="p-2 text-indigo-500 hover:text-indigo-600"
                    >
                      <PenTool size={18} />
                    </button>
                    <a href={block.url} download target="_blank" rel="noopener noreferrer" className="p-2 text-primary-600 dark:text-primary-400">
                      <Download size={18} />
                    </a>
                    <button onClick={() => setFiles(prev => prev.filter(n => n.id !== block.id))} className="p-2 text-red-500">
                      <Trash2 size={18} />
                    </button>
                  </div>
                  <AttachedStrokes strokes={block.attachedStrokes} blockBox={blockBox} />
                </div>
              );
            } else if (block.type === 'video') {
              let videoId = "";
              if (block.url.includes("youtube.com/watch")) {
                videoId = new URL(block.url).searchParams.get("v") || "";
              } else if (block.url.includes("youtu.be/")) {
                videoId = block.url.split("youtu.be/")[1]?.split("?")[0];
              }
              const embedUrl = videoId ? `https://www.youtube.com/embed/${videoId}` : block.url;

              return (
                <div 
                  key={block.id} 
                  id={`block-${block.id}`}
                  className="relative w-full rounded shadow-sm border border-zinc-200 dark:border-zinc-800 bg-black aspect-video"
                  style={{ zIndex: reverseZ }}
                >
                  <iframe 
                    src={embedUrl} 
                    title="YouTube video player" 
                    frameBorder="0" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                    allowFullScreen
                    className="w-full h-full relative z-10"
                  ></iframe>
                  <button 
                    onClick={(e) => { e.stopPropagation(); openDrawOverlay(block.id); }}
                    className="absolute top-2 right-12 w-8 h-8 bg-white/80 dark:bg-black/50 backdrop-blur rounded-full flex items-center justify-center text-indigo-500 hover:text-indigo-600 z-30"
                  >
                    <PenTool size={14} />
                  </button>
                  <button 
                    onClick={() => setVideos(prev => prev.filter(n => n.id !== block.id))}
                    className="absolute top-2 right-2 w-8 h-8 bg-white/80 dark:bg-black/50 backdrop-blur rounded-full flex items-center justify-center text-red-500 hover:text-red-600 z-30"
                  >
                    <Trash2 size={14} />
                  </button>
                  <AttachedStrokes strokes={block.attachedStrokes} blockBox={blockBox} />
                </div>
              );
            } else if (block.type === 'drawing') {
              // Standalone drawing cluster
              const blockBox = {
                minX: block.minX,
                minY: block.minY,
                maxX: block.maxX,
                maxY: block.maxY,
                width: block.width
              };

              const isActive = activeBlockId === block.id;
              const activeClasses = isActive 
                ? 'overflow-x-auto ring-1 ring-zinc-200 dark:ring-zinc-800 rounded-lg p-2 -mx-2 bg-white dark:bg-zinc-900 shadow-sm z-20 custom-scrollbar' 
                : 'overflow-x-hidden z-10';

              return (
                <div 
                  key={block.id} 
                  className={`w-full my-4 transition-all duration-300 ${activeClasses}`}
                  onClick={(e) => { e.stopPropagation(); setActiveBlockId(block.id); }}
                >
                  <AttachedStrokes strokes={block.attachedStrokes} blockBox={blockBox} isStandalone={true} />
                </div>
              );
            }
          })}
          
          {/* Tap Zone at bottom to append text */}
          <div 
            className="flex-1 min-h-[200px] w-full cursor-text" 
            onClick={addTextBlock}
          />
        </div>
      </div>

      {/* Sticky Bottom Action Bar */}
      <div className="sticky bottom-0 z-50 bg-white/80 dark:bg-black/80 backdrop-blur-xl border-t border-zinc-200 dark:border-zinc-800 px-6 py-4 pb-safe flex items-center justify-between">
        <input 
          type="file" 
          ref={imageInputRef} 
          onChange={handleFileUpload} 
          accept="image/*" 
          className="hidden" 
        />
        <button onClick={addTextBlock} className="p-2 text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-white transition-colors">
          <Type size={22} />
        </button>
        <button onClick={() => imageInputRef.current?.click()} className="p-2 text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-white transition-colors">
          <ImageIcon size={22} />
        </button>
        <button 
          onClick={onToggleMeeting}
          disabled={isProcessing}
          className={`p-2 transition-colors ${
            isRecording 
              ? 'text-red-500 animate-pulse' 
              : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-white'
          }`}
        >
          <Mic size={22} />
        </button>
        <button 
          onClick={() => openDrawOverlay(null)}
          className="p-2 text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-white transition-colors"
        >
          <PenTool size={22} />
        </button>
        <div className="w-px h-6 bg-zinc-300 dark:bg-zinc-700 mx-2" />
        <button 
          onClick={addTextBlock}
          className="p-2 text-primary-600 dark:text-yellow-500"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
      </div>

      <MobileDrawOverlay 
        isOpen={isDrawOverlayOpen}
        onClose={() => setIsDrawOverlayOpen(false)}
        annotateBlockId={drawOverlayBlockId}
        strokes={strokes}
        setStrokes={setStrokes}
      />
    </div>
  );
}
