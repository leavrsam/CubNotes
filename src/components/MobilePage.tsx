"use client";

import React, { useMemo, useEffect, useState, useRef } from "react";
import { useCanvasData } from "@/hooks/useCanvasData";
import { v4 as uuidv4 } from "uuid";
import { TipTapEditor } from "./TipTapEditor";
import { Trash2, Plus, File, Download, ChevronLeft, Image as ImageIcon, Mic, PenTool, MoreHorizontal, ChevronUp, ChevronDown, GripVertical, Check } from "lucide-react";
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

  if (isStandalone) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    strokes.forEach((stroke: Stroke) => {
      const box = getStrokeBoundingBox(stroke);
      minX = Math.min(minX, box.minX);
      minY = Math.min(minY, box.minY);
      maxX = Math.max(maxX, box.maxX);
      maxY = Math.max(maxY, box.maxY);
    });

    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);

    return (
      <svg 
        className="relative w-full pointer-events-none z-20"
        style={{
          height: Math.max(160, Math.min(height + 20, 360)),
        }}
        viewBox={`${minX - 10} ${minY - 10} ${width + 20} ${height + 20}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <mask id={`mask-${strokes[0]?.id || 'empty'}`}>
            <rect x={minX - 10} y={minY - 10} width={width + 20} height={height + 20} fill="white" />
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

  // Non-standalone (attached to text/image/audio card)
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  strokes.forEach((stroke: Stroke) => {
    const box = getStrokeBoundingBox(stroke);
    minX = Math.min(minX, box.minX);
    minY = Math.min(minY, box.minY);
    maxX = Math.max(maxX, box.maxX);
    maxY = Math.max(maxY, box.maxY);
  });

  const cardWidth = blockBox.width || 400;
  const cardHeight = blockBox.height || 300;
  const viewBoxWidth = Math.max(cardWidth, maxX);
  const viewBoxHeight = Math.max(cardHeight, maxY);

  return (
    <svg 
      className="absolute inset-0 w-full h-full pointer-events-none z-20"
      viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
      preserveAspectRatio="none"
    >
      <defs>
        <mask id={`mask-${strokes[0]?.id || 'empty'}`}>
          <rect x={0} y={0} width={viewBoxWidth} height={viewBoxHeight} fill="white" />
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
  pageCreatedAt?: string;
  onUpdatePageTitle: (title: string) => void;
  onBack?: () => void;
  isRecording?: boolean;
  isProcessing?: boolean;
  onToggleMeeting?: () => void;
  onOpenSettings?: () => void;
}

export function MobilePage({ pageId, pageTitle, pageCreatedAt, onUpdatePageTitle, onBack, isRecording, isProcessing, onToggleMeeting, onOpenSettings }: MobilePageProps) {
  const { loading, strokes, setStrokes, texts, setTexts, audios, setAudios, images, setImages, files, setFiles, videos, setVideos } = useCanvasData(pageId);
  const [bottomY, setBottomY] = useState(0);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  
  const [isInternalSettingsOpen, setIsInternalSettingsOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string>("");
  const [currentUser, setCurrentUser] = useState<any>(null);
  
  // Rearrange / Reorder State
  const [isRearranging, setIsRearranging] = useState(false);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartPosRef = useRef<{ x: number, y: number } | null>(null);

  const [isDrawOverlayOpen, setIsDrawOverlayOpen] = useState(false);
  const [drawOverlayBlockId, setDrawOverlayBlockId] = useState<string | null>(null);
  const [drawOverlayBlockType, setDrawOverlayBlockType] = useState<string | null>(null);
  const [drawOverlayInitialY, setDrawOverlayInitialY] = useState<number | undefined>(undefined);

  const openDrawOverlay = (blockId: string | null = null, blockType: string | null = null, initialY?: number) => {
    if (blockId) {
      const targetBlock = sortedBlocks.find(b => b.id === blockId);
      if (targetBlock && targetBlock.attachedStrokes && targetBlock.attachedStrokes.length > 0) {
        const attachedStrokeIds = new Set(targetBlock.attachedStrokes.map((s: any) => s.id));
        setStrokes(prev => prev.map(s => {
          if (attachedStrokeIds.has(s.id) && s.blockId !== blockId) {
            return { ...s, blockId };
          }
          return s;
        }));
      }
    }
    setDrawOverlayBlockId(blockId);
    setDrawOverlayBlockType(blockType);
    setDrawOverlayInitialY(initialY);
    setIsDrawOverlayOpen(true);
  };

  const startNewSketchBlock = () => {
    const newSketchId = `sketch-${uuidv4()}`;
    openDrawOverlay(newSketchId, 'drawing', bottomY);
  };
  
  const imageInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserEmail(user.email || "");
        setCurrentUser(user);
      }
    });
  }, [supabase]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  const handleCardTouchStart = (blockId: string, e: React.TouchEvent) => {
    if (isRearranging) return;
    const touch = e.touches[0];
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };

    longPressTimerRef.current = setTimeout(() => {
      setIsRearranging(true);
      setActiveBlockId(blockId);
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(40);
      }
      toast.success("Rearrange Mode Activated", { id: 'rearrange-toast', duration: 1500 });
    }, 450);
  };

  const handleCardTouchMove = (e: React.TouchEvent) => {
    if (!touchStartPosRef.current || !longPressTimerRef.current) return;
    const touch = e.touches[0];
    const dist = Math.hypot(touch.clientX - touchStartPosRef.current.x, touch.clientY - touchStartPosRef.current.y);
    if (dist > 10) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleCardTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    touchStartPosRef.current = null;
  };

  const deleteDrawingBlock = (block: any) => {
    const strokeIds = new Set((block.attachedStrokes || []).map((s: any) => s.id));
    setStrokes(prev => prev.filter(s => {
      if (strokeIds.has(s.id)) return false;
      if (block.id && s.blockId === block.id) return false;
      return true;
    }));
    setActiveBlockId(null);
    toast.success("Sketch deleted");
  };

  const moveBlock = (currentIndex: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= sortedBlocks.length) return;

    const newBlocks = [...sortedBlocks];
    const [movedBlock] = newBlocks.splice(currentIndex, 1);
    newBlocks.splice(targetIndex, 0, movedBlock);

    // Reassign clean Y coordinates based on the new order
    const updatedTexts: TextNode[] = [];
    const updatedAudios: AudioNode[] = [];
    const updatedImages: ImageNode[] = [];
    const updatedFiles: FileNode[] = [];
    const updatedVideos: VideoNode[] = [];
    let updatedStrokes = [...strokes];

    newBlocks.forEach((block, index) => {
      const newY = 100 + index * 250;
      const deltaY = newY - block.y;

      if (block.type === 'text') {
        const existing = texts.find(t => t.id === block.id);
        if (existing) updatedTexts.push({ ...existing, y: newY });
      } else if (block.type === 'audio') {
        const existing = audios.find(a => a.id === block.id);
        if (existing) updatedAudios.push({ ...existing, y: newY });
      } else if (block.type === 'image') {
        const existing = images.find(i => i.id === block.id);
        if (existing) updatedImages.push({ ...existing, y: newY });
      } else if (block.type === 'file') {
        const existing = files.find(f => f.id === block.id);
        if (existing) updatedFiles.push({ ...existing, y: newY });
      } else if (block.type === 'video') {
        const existing = videos.find(v => v.id === block.id);
        if (existing) updatedVideos.push({ ...existing, y: newY });
      } else if (block.type === 'drawing') {
        const strokeIds = new Set(block.attachedStrokes.map((s: any) => s.id));
        updatedStrokes = updatedStrokes.map(s => {
          if (strokeIds.has(s.id)) {
            return {
              ...s,
              y: (s.y || 0) + deltaY,
              points: s.points.map(([px, py]) => [px, py + deltaY])
            };
          }
          return s;
        });
      }
    });

    setTexts(updatedTexts);
    setAudios(updatedAudios);
    setImages(updatedImages);
    setFiles(updatedFiles);
    setVideos(updatedVideos);
    setStrokes(updatedStrokes);
  };

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

    const sketchBlocksMap = new Map<string, any>();
    const unattachedStrokes: Stroke[] = [];

    strokes.forEach((stroke: Stroke) => {
      if (!stroke.points || stroke.points.length === 0) return;
      
      if (stroke.blockId) {
        const baseBlock = baseBlocks.find(b => b.id === stroke.blockId);
        if (baseBlock) {
          baseBlock.attachedStrokes.push(stroke);
        } else {
          // Standalone sketch block with stable blockId
          if (!sketchBlocksMap.has(stroke.blockId)) {
            const box = getStrokeBoundingBox(stroke);
            sketchBlocksMap.set(stroke.blockId, {
              type: 'drawing',
              id: stroke.blockId,
              x: stroke.x || 50,
              y: stroke.blockY ?? stroke.y ?? box.minY ?? 0,
              minX: box.minX,
              minY: box.minY,
              maxX: box.maxX,
              maxY: box.maxY,
              width: Math.max(box.maxX - box.minX, 300),
              height: Math.max(box.maxY - box.minY, 150),
              attachedStrokes: [stroke]
            });
          } else {
            const sBlock = sketchBlocksMap.get(stroke.blockId)!;
            sBlock.attachedStrokes.push(stroke);
            if (stroke.blockY !== undefined && sBlock.y === sBlock.minY) {
              sBlock.y = stroke.blockY; // Update block Y if a later stroke defines it
            }
            const box = getStrokeBoundingBox(stroke);
            sBlock.minX = Math.min(sBlock.minX, box.minX);
            sBlock.minY = Math.min(sBlock.minY, box.minY);
            sBlock.maxX = Math.max(sBlock.maxX, box.maxX);
            sBlock.maxY = Math.max(sBlock.maxY, box.maxY);
            sBlock.width = Math.max(sBlock.maxX - sBlock.minX, 300);
            sBlock.height = Math.max(sBlock.maxY - sBlock.minY, 150);
          }
        }
      } else {
        // Legacy unattached strokes without blockId
        unattachedStrokes.push(stroke);
      }
    });

    // Group legacy unattached strokes into drawing blocks
    const legacyDrawingBlocks: any[] = [];
    
    unattachedStrokes.forEach(stroke => {
      const box = getStrokeBoundingBox(stroke);
      const padding = 50;
      const expandedBox = {
        minX: box.minX - padding,
        minY: box.minY - padding,
        maxX: box.maxX + padding,
        maxY: box.maxY + padding
      };
      
      const overlappingCluster = legacyDrawingBlocks.find(c => getIntersectionArea(expandedBox, c) > 0);
      
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
        legacyDrawingBlocks.push({
          type: 'drawing',
          id: `sketch-${stroke.id}`,
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

    const finalBlocks = [...baseBlocks, ...Array.from(sketchBlocksMap.values()), ...legacyDrawingBlocks];
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
    <div className="fixed inset-0 w-full h-[100dvh] flex flex-col bg-white dark:bg-black overflow-hidden select-none">
      
      {/* Floating Top Navigation / Rearrange Bar */}
      {isRearranging ? (
        <div 
          className="fixed top-0 left-0 right-0 z-[1600] pointer-events-none px-4 flex items-center justify-between transition-all"
          style={{ paddingTop: 'max(env(safe-area-inset-top), 14px)' }}
        >
          <div className="pointer-events-auto flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-primary-600 dark:bg-primary-500 text-white dark:text-zinc-950 shadow-lg backdrop-blur-2xl font-bold text-xs animate-in fade-in">
            <GripVertical size={15} />
            <span>Rearrange Blocks</span>
          </div>

          <button 
            onClick={() => setIsRearranging(false)}
            className="pointer-events-auto flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-semibold text-xs shadow-lg active:scale-95 transition-transform"
          >
            <Check size={14} />
            <span>Done</span>
          </button>
        </div>
      ) : (
        <div 
          className="fixed top-0 left-0 right-0 z-[1500] pointer-events-none px-4 flex items-center justify-between transition-all"
          style={{ paddingTop: 'max(env(safe-area-inset-top), 14px)' }}
        >
          {onBack ? (
            <button 
              onClick={onBack}
              className="pointer-events-auto flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/75 dark:bg-zinc-900/75 backdrop-blur-2xl border border-white/50 dark:border-white/10 shadow-lg shadow-black/5 dark:shadow-black/40 ring-1 ring-black/5 dark:ring-white/5 text-primary-600 dark:text-primary-400 font-semibold text-sm active:scale-95 transition-all"
              title="Back to Notes"
            >
              <ChevronLeft size={19} className="-ml-1" />
              <span>Notes</span>
            </button>
          ) : <div />}

          <button 
            onClick={() => {
              if (onOpenSettings) {
                onOpenSettings();
              } else {
                setIsInternalSettingsOpen(true);
              }
            }}
            className="pointer-events-auto w-9 h-9 flex items-center justify-center rounded-full bg-white/75 dark:bg-zinc-900/75 backdrop-blur-2xl border border-white/50 dark:border-white/10 shadow-lg shadow-black/5 dark:shadow-black/40 ring-1 ring-black/5 dark:ring-white/5 text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white active:scale-95 transition-all"
            title="Settings"
          >
            <MoreHorizontal size={19} />
          </button>
        </div>
      )}

      <div 
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden relative scroll-smooth overscroll-contain select-text" 
        style={{ 
          WebkitOverflowScrolling: 'touch',
          paddingTop: 'calc(max(env(safe-area-inset-top), 14px) + 50px)'
        }}
        onClick={() => setActiveBlockId(null)}
      >
        
        {/* Title area (scrolls with content) */}
        <div className="px-5 pt-4 pb-4">
          <input
            type="text"
            value={pageTitle}
            onChange={(e) => onUpdatePageTitle(e.target.value)}
            placeholder="Page Title"
            className="bg-transparent text-[32px] font-bold text-zinc-900 dark:text-white border-none outline-none focus:ring-0 placeholder:text-zinc-300 dark:placeholder:text-zinc-700 w-full mb-1 tracking-tight leading-tight"
          />
          {pageCreatedAt && (
            <div className="text-[13px] font-medium text-zinc-400 dark:text-zinc-500">
              {format(new Date(pageCreatedAt), "MMMM d, yyyy 'at' h:mm a")}
            </div>
          )}
        </div>

        {/* Linear feed of blocks */}
        <div className="flex flex-col gap-6 w-full px-5 pb-32 relative z-10 min-h-full">
          {sortedBlocks.map((block, index) => {
            const blockBox = getBlockBoundingBox(block);
            const reverseZ = 500 - index;
            const isSelected = activeBlockId === block.id;

            return (
              <div 
                key={block.id}
                onTouchStart={(e) => handleCardTouchStart(block.id, e)}
                onTouchMove={handleCardTouchMove}
                onTouchEnd={handleCardTouchEnd}
                className={`relative transition-all duration-200 ${
                  isRearranging 
                    ? 'p-3 rounded-2xl border-2 border-dashed border-primary-500/40 dark:border-primary-400/40 bg-zinc-50/70 dark:bg-zinc-900/70 shadow-sm' 
                    : ''
                }`}
                style={{ zIndex: reverseZ }}
              >
                {/* Rearrange Reorder Pill */}
                {isRearranging && (
                  <div className="flex items-center justify-between mb-2 bg-zinc-200/80 dark:bg-zinc-800/90 border border-zinc-300 dark:border-zinc-700/60 rounded-full px-3 py-1 w-full shadow-sm z-30">
                    <span className="text-[11px] font-bold text-zinc-600 dark:text-zinc-300 flex items-center gap-1">
                      <GripVertical size={13} className="text-zinc-400" />
                      Block #{index + 1}
                    </span>
                    <div className="flex items-center gap-1">
                      <button 
                        disabled={index === 0}
                        onClick={(e) => { e.stopPropagation(); moveBlock(index, 'up'); }}
                        className="p-1 rounded-full text-zinc-700 dark:text-zinc-200 hover:bg-zinc-300 dark:hover:bg-zinc-700 disabled:opacity-25 disabled:pointer-events-none transition-colors"
                        title="Move Up"
                      >
                        <ChevronUp size={16} />
                      </button>
                      <button 
                        disabled={index === sortedBlocks.length - 1}
                        onClick={(e) => { e.stopPropagation(); moveBlock(index, 'down'); }}
                        className="p-1 rounded-full text-zinc-700 dark:text-zinc-200 hover:bg-zinc-300 dark:hover:bg-zinc-700 disabled:opacity-25 disabled:pointer-events-none transition-colors"
                        title="Move Down"
                      >
                        <ChevronDown size={16} />
                      </button>
                    </div>
                  </div>
                )}

                {/* Render Block by Type */}
                {block.type === 'text' && (
                  <div 
                    id={`block-${block.id}`}
                    className={`w-full min-h-[50px] relative rounded-xl transition-all duration-200 ${
                      isSelected && !isRearranging ? 'ring-1 ring-primary-500/40 bg-zinc-50/50 dark:bg-zinc-900/30' : ''
                    } ${isRearranging ? 'pointer-events-none' : ''}`}
                    onClick={(e) => { if (!isRearranging) { e.stopPropagation(); setActiveBlockId(block.id); } }}
                  >
                    {isSelected && !isRearranging && (
                      <div className="absolute top-2 right-2 flex items-center gap-1 bg-white/90 dark:bg-zinc-800/90 backdrop-blur-md rounded-full px-2.5 py-1 z-30 shadow-lg border border-zinc-200/60 dark:border-white/10 animate-in fade-in zoom-in-95 duration-150">
                        <button 
                          onPointerDown={(e) => e.stopPropagation()}
                          onTouchStart={(e) => e.stopPropagation()}
                          onClick={(e) => { 
                            e.preventDefault();
                            e.stopPropagation(); 
                            openDrawOverlay(block.id, 'text', block.y); 
                          }}
                          className="flex items-center gap-1 text-xs font-semibold text-zinc-700 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                          title="Annotate Text"
                        >
                          <PenTool size={13} />
                          <span>Annotate</span>
                        </button>
                        <div className="w-px h-3 bg-zinc-300 dark:bg-white/20" />
                        <button 
                          onPointerDown={(e) => e.stopPropagation()}
                          onTouchStart={(e) => e.stopPropagation()}
                          onClick={(e) => { 
                            e.preventDefault();
                            e.stopPropagation(); 
                            setTexts(prev => prev.filter(t => t.id !== block.id)); 
                          }}
                          className="p-1 text-red-400 hover:text-red-500 dark:hover:text-red-300 transition-colors"
                          title="Delete Text"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                    <TipTapEditor 
                      id={block.id}
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
                )}

                {block.type === 'audio' && (
                  <div 
                    id={`block-${block.id}`} 
                    className={`relative w-full rounded-2xl transition-all duration-200 ${
                      isSelected && !isRearranging ? 'ring-2 ring-primary-500/50 shadow-md' : ''
                    }`}
                    onClick={(e) => { if (!isRearranging) { e.stopPropagation(); setActiveBlockId(block.id); } }}
                  >
                    <MobileAudioCard 
                      node={block} 
                      updateAudioTitle={(id, title) => setAudios(prev => prev.map(a => a.id === id ? { ...a, title } : a))}
                      updateAudioField={(id, field, value) => setAudios(prev => prev.map(a => a.id === id ? { ...a, [field]: value } : a))}
                      deleteAudioNode={(id) => setAudios(prev => prev.filter(a => a.id !== id))}
                      onAnnotate={(id) => openDrawOverlay(id, 'audio')}
                    />
                    <AttachedStrokes strokes={block.attachedStrokes} blockBox={blockBox} />
                  </div>
                )}

                {block.type === 'image' && (
                  <div 
                    id={`block-${block.id}`}
                    className={`relative w-full rounded-xl overflow-hidden shadow-sm border transition-all ${
                      isSelected && !isRearranging ? 'border-primary-500 ring-2 ring-primary-500/20' : 'border-zinc-200 dark:border-zinc-800'
                    } bg-black`}
                    onClick={(e) => { if (!isRearranging) { e.stopPropagation(); setActiveBlockId(block.id); } }}
                  >
                    <img src={block.url} alt="Canvas Image" className="w-full h-auto object-contain" />
                    
                    {isSelected && !isRearranging && (
                      <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/75 backdrop-blur-md rounded-full px-2.5 py-1 z-30 shadow-lg border border-white/10">
                        <button 
                          onPointerDown={(e) => e.stopPropagation()}
                          onTouchStart={(e) => e.stopPropagation()}
                          onClick={(e) => { 
                            e.preventDefault();
                            e.stopPropagation(); 
                            openDrawOverlay(block.id, 'image', block.y); 
                          }}
                          className="flex items-center gap-1 text-xs font-semibold text-white/90 hover:text-white transition-colors"
                          title="Annotate"
                        >
                          <PenTool size={13} />
                          <span>Annotate</span>
                        </button>
                        <div className="w-px h-3 bg-white/20" />
                        <button 
                          onPointerDown={(e) => e.stopPropagation()}
                          onTouchStart={(e) => e.stopPropagation()}
                          onClick={(e) => { 
                            e.preventDefault();
                            e.stopPropagation(); 
                            setImages(prev => prev.filter(n => n.id !== block.id)); 
                          }}
                          className="p-1 text-red-400 hover:text-red-300 transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                    <AttachedStrokes strokes={block.attachedStrokes} blockBox={blockBox} />
                  </div>
                )}

                {block.type === 'file' && (
                  <div 
                    id={`block-${block.id}`}
                    className={`relative w-full bg-white dark:bg-zinc-900 p-4 rounded-xl shadow-sm border transition-all ${
                      isSelected && !isRearranging ? 'border-primary-500 ring-2 ring-primary-500/20' : 'border-zinc-200 dark:border-zinc-800'
                    } flex items-center justify-between`}
                    onClick={(e) => { if (!isRearranging) { e.stopPropagation(); setActiveBlockId(block.id); } }}
                  >
                    <div className="flex items-center gap-3 overflow-hidden relative z-30">
                      <File size={22} className="text-primary-500 flex-shrink-0" />
                      <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">{block.filename}</span>
                    </div>
                    <div className="flex items-center gap-1 relative z-30">
                      {isSelected && !isRearranging && (
                        <button 
                          onPointerDown={(e) => e.stopPropagation()}
                          onTouchStart={(e) => e.stopPropagation()}
                          onClick={(e) => { 
                            e.preventDefault();
                            e.stopPropagation(); 
                            openDrawOverlay(block.id, 'file', block.y); 
                          }}
                          className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                          title="Annotate"
                        >
                          <PenTool size={16} />
                        </button>
                      )}
                      <a 
                        href={block.url} 
                        download 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        onPointerDown={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                        className="p-1.5 text-zinc-400 hover:text-primary-600 dark:hover:text-primary-400 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                        title="Download"
                      >
                        <Download size={16} />
                      </a>
                      <button 
                        onPointerDown={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                        onClick={(e) => { 
                          e.preventDefault();
                          e.stopPropagation(); 
                          setFiles(prev => prev.filter(n => n.id !== block.id)); 
                        }} 
                        className="p-1.5 text-zinc-400 hover:text-red-500 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <AttachedStrokes strokes={block.attachedStrokes} blockBox={blockBox} />
                  </div>
                )}

                {block.type === 'video' && (
                  <div 
                    id={`block-${block.id}`}
                    className={`relative w-full rounded-xl overflow-hidden shadow-sm border transition-all ${
                      isSelected && !isRearranging ? 'border-primary-500 ring-2 ring-primary-500/20' : 'border-zinc-200 dark:border-zinc-800'
                    } bg-black aspect-video ${isRearranging ? 'pointer-events-none' : ''}`}
                    onClick={(e) => { if (!isRearranging) { e.stopPropagation(); setActiveBlockId(block.id); } }}
                  >
                    {(() => {
                      let videoId = "";
                      if (block.url.includes("youtube.com/watch")) {
                        videoId = new URL(block.url).searchParams.get("v") || "";
                      } else if (block.url.includes("youtu.be/")) {
                        videoId = block.url.split("youtu.be/")[1]?.split("?")[0];
                      }
                      const embedUrl = videoId ? `https://www.youtube.com/embed/${videoId}` : block.url;
                      return (
                        <iframe 
                          src={embedUrl} 
                          title="YouTube video player" 
                          frameBorder="0" 
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                          allowFullScreen
                          className="w-full h-full relative z-10"
                        />
                      );
                    })()}
                    
                    {isSelected && !isRearranging && (
                      <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/75 backdrop-blur-md rounded-full px-2.5 py-1 z-30 shadow-lg border border-white/10">
                        <button 
                          onPointerDown={(e) => e.stopPropagation()}
                          onTouchStart={(e) => e.stopPropagation()}
                          onClick={(e) => { 
                            e.preventDefault();
                            e.stopPropagation(); 
                            openDrawOverlay(block.id, 'video', block.y); 
                          }}
                          className="flex items-center gap-1 text-xs font-semibold text-white/90 hover:text-white transition-colors"
                          title="Annotate"
                        >
                          <PenTool size={13} />
                          <span>Annotate</span>
                        </button>
                        <div className="w-px h-3 bg-white/20" />
                        <button 
                          onPointerDown={(e) => e.stopPropagation()}
                          onTouchStart={(e) => e.stopPropagation()}
                          onClick={(e) => { 
                            e.preventDefault();
                            e.stopPropagation(); 
                            setVideos(prev => prev.filter(n => n.id !== block.id)); 
                          }}
                          className="p-1 text-red-400 hover:text-red-300 transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                    <AttachedStrokes strokes={block.attachedStrokes} blockBox={blockBox} />
                  </div>
                )}

                {block.type === 'drawing' && (
                  <div 
                    id={`block-${block.id}`}
                    className={`w-full relative rounded-2xl border transition-all duration-200 ${
                      isSelected && !isRearranging
                        ? 'border-primary-500 ring-2 ring-primary-500/20 bg-zinc-50/90 dark:bg-zinc-900/90 shadow-md' 
                        : 'border-zinc-200/60 dark:border-zinc-800/80 bg-zinc-50/40 dark:bg-zinc-900/30 hover:border-zinc-300 dark:hover:border-zinc-700'
                    } p-4 min-h-[140px] flex flex-col justify-center`}
                    onClick={(e) => { if (!isRearranging) { e.stopPropagation(); setActiveBlockId(block.id); } }}
                  >
                    {isSelected && !isRearranging && (
                      <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-black/80 dark:bg-zinc-800/90 backdrop-blur-md rounded-full px-3 py-1.5 z-30 shadow-lg border border-white/10 animate-in fade-in zoom-in-95 duration-150">
                        <button 
                          onPointerDown={(e) => e.stopPropagation()}
                          onTouchStart={(e) => e.stopPropagation()}
                          onClick={(e) => { 
                            e.preventDefault();
                            e.stopPropagation(); 
                            openDrawOverlay(block.id, 'drawing', block.y); 
                          }}
                          className="flex items-center gap-1 text-xs font-semibold text-white/90 hover:text-white transition-colors"
                          title="Edit Sketch"
                        >
                          <PenTool size={13} />
                          <span>Edit</span>
                        </button>
                        <div className="w-px h-3 bg-white/20" />
                        <button 
                          onPointerDown={(e) => e.stopPropagation()}
                          onTouchStart={(e) => e.stopPropagation()}
                          onClick={(e) => { 
                            e.preventDefault();
                            e.stopPropagation(); 
                            deleteDrawingBlock(block); 
                          }}
                          className="p-1 text-red-400 hover:text-red-300 transition-colors"
                          title="Delete Sketch"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}

                    <AttachedStrokes strokes={block.attachedStrokes} blockBox={blockBox} isStandalone={true} />
                  </div>
                )}
              </div>
            );
          })}
          
          {/* Tap Zone at bottom to append text or sketch */}
          <div 
            className="flex-1 min-h-[160px] w-full cursor-text flex flex-col items-center justify-center text-center p-6 select-none" 
            onClick={addTextBlock}
          >
            <div className="text-xs font-medium text-zinc-400/80 dark:text-zinc-600 flex items-center gap-2">
              <span>Tap empty area to write</span>
              <span>•</span>
              <button 
                onClick={(e) => { e.stopPropagation(); startNewSketchBlock(); }}
                className="inline-flex items-center gap-1 text-primary-600 dark:text-primary-400 hover:underline font-semibold"
              >
                <PenTool size={12} />
                <span>Add sketch</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Floating Glassmorphic Dock */}
      <div 
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[1500] pointer-events-none"
        style={{ bottom: 'max(env(safe-area-inset-bottom), 24px)' }}
      >
        <div className="pointer-events-auto flex items-center gap-6 px-7 py-2.5 rounded-full bg-white/75 dark:bg-zinc-900/75 backdrop-blur-2xl border border-white/50 dark:border-white/10 shadow-2xl shadow-black/15 dark:shadow-black/60 ring-1 ring-black/5 dark:ring-white/5 transition-all">
          <input 
            type="file" 
            ref={imageInputRef} 
            onChange={handleFileUpload} 
            accept="image/*" 
            className="hidden" 
          />
          
          <button 
            onClick={() => imageInputRef.current?.click()} 
            className="p-2 text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white active:scale-90 transition-all rounded-full hover:bg-black/5 dark:hover:bg-white/5"
            title="Add Photo / Image"
          >
            <ImageIcon size={22} />
          </button>

          <button 
            onClick={onToggleMeeting}
            disabled={isProcessing}
            className={`p-2 transition-all rounded-full active:scale-90 ${
              isRecording 
                ? 'text-red-500 animate-pulse bg-red-500/10' 
                : 'text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5'
            }`}
            title={isRecording ? "Stop Recording" : "Record Audio / Meeting"}
          >
            <Mic size={22} />
          </button>

          <button 
            onClick={() => {
              if (activeBlockId) {
                const activeBlock = sortedBlocks.find(b => b.id === activeBlockId);
                openDrawOverlay(activeBlockId, activeBlock?.type || 'block', activeBlock?.y);
              } else {
                startNewSketchBlock();
              }
            }}
            className={`p-2 transition-all rounded-full active:scale-90 relative ${
              activeBlockId 
                ? 'text-primary-600 dark:text-primary-400 bg-primary-500/10 dark:bg-primary-400/10 ring-1 ring-primary-500/30' 
                : 'text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5'
            }`}
            title={activeBlockId ? "Annotate Selected Block" : "New Sketch Block"}
          >
            <PenTool size={22} />
            {activeBlockId && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-primary-500 animate-pulse" />
            )}
          </button>
        </div>
      </div>

      <MobileDrawOverlay 
        isOpen={isDrawOverlayOpen}
        onClose={() => setIsDrawOverlayOpen(false)}
        annotateBlockId={drawOverlayBlockId}
        blockType={drawOverlayBlockType}
        targetBlock={sortedBlocks.find(b => b.id === drawOverlayBlockId)}
        initialBlockY={drawOverlayInitialY}
        strokes={strokes}
        setStrokes={setStrokes}
      />

      <SettingsModal 
        isOpen={isInternalSettingsOpen} 
        onClose={() => setIsInternalSettingsOpen(false)} 
        userEmail={userEmail}
        user={currentUser}
        onSignOut={handleSignOut}
      />
    </div>
  );
}
