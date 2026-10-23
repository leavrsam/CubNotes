"use client";

import React, { useMemo, useEffect, useState, useRef, useCallback } from "react";
import { useCanvasData } from "@/hooks/useCanvasData";
import { v4 as uuidv4 } from "uuid";
import { TipTapEditor, LineSpacingDropdown, executeIndent, executeOutdent } from "./TipTapEditor";
import type { Editor } from "@tiptap/react";
import { Trash2, Plus, File, Download, ChevronLeft, Image as ImageIcon, Mic, PenTool, MoreHorizontal, ChevronUp, ChevronDown, GripVertical, Check, BookOpen, Calendar, Clock, Flame, MessageCircle, Minimize2, Maximize2, Bold, Italic, Underline as UnderlineIcon, Strikethrough, Highlighter, List, ListOrdered, CheckSquare, Indent as IndentIcon, Outdent as OutdentIcon, Type, Share2, Settings, RefreshCw, Volume2, History, RotateCcw, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";
import { SettingsModal } from "./SettingsModal";
import { MobileAudioCard } from "./MobileAudioCard";
import { MobileDrawOverlay } from "./MobileDrawOverlay";
import { uploadMediaFile } from "@/lib/storage";
import { getAvailableAudioInputs, setPreferredAudioInput } from "@/lib/audioRecorder";
import type { Stroke, TextNode, ImageNode, AudioNode, FileNode, VideoNode } from "./CustomCanvas";

function getStrokeBoundingBox(stroke: Stroke) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of stroke.points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const sX = stroke.x || 0;
  const sY = stroke.y || 0;
  return {
    minX: minX + sX,
    minY: minY + sY,
    maxX: maxX + sX,
    maxY: maxY + sY,
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

function getAttachedStrokesExtent(strokes: Stroke[]) {
  if (!strokes || strokes.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0, hasStrokes: false };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  strokes.forEach(s => {
    if (!s.points || s.points.length === 0) return;
    const box = getStrokeBoundingBox(s);
    minX = Math.min(minX, box.minX);
    minY = Math.min(minY, box.minY);
    maxX = Math.max(maxX, box.maxX);
    maxY = Math.max(maxY, box.maxY);
  });
  return {
    minX,
    minY,
    maxX,
    maxY,
    hasStrokes: isFinite(minY) && minY !== Infinity
  };
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
  // 1:1 pixel rendering: fixed to where and how they were drawn, never stretched or distorted
  return (
    <svg 
      className="absolute inset-0 w-full h-full pointer-events-none z-20 overflow-visible"
    >
      <defs>
        <mask id={`mask-${strokes[0]?.id || 'empty'}`}>
          <rect x="0" y="0" width="100%" height="100%" fill="white" />
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
  isPaused?: boolean;
  onPauseRecording?: () => void;
  onResumeRecording?: () => void;
  onStopRecording?: () => void;
  isProcessing?: boolean;
  onToggleMeeting?: () => void;
  onOpenSettings?: () => void;
  onOpenShare?: () => void;
  isJournal?: boolean;
}

export function MobilePage({ 
  pageId, 
  pageTitle, 
  pageCreatedAt, 
  onUpdatePageTitle, 
  onBack, 
  isRecording, 
  isPaused,
  onPauseRecording,
  onResumeRecording,
  onStopRecording,
  isProcessing, 
  onToggleMeeting, 
  onOpenSettings, 
  onOpenShare, 
  isJournal 
}: MobilePageProps) {
  const {
    loading,
    strokes, setStrokes,
    texts, setTexts,
    audios, setAudios,
    images, setImages,
    files, setFiles,
    videos, setVideos,
    flushSave,
    pageVersions,
    fetchVersions,
    restoreVersion,
    saveManualSnapshot
  } = useCanvasData(pageId);
  const [bottomY, setBottomY] = useState(0);

  // Group blocks and strokes
  const sortedBlocks = useMemo(() => {
    const baseBlocks = [
      ...texts.map(t => ({ ...t, type: 'text' as const, attachedStrokes: [] as Stroke[] })),
      ...(audios || []).map(a => ({ ...a, type: 'audio' as const, attachedStrokes: [] as Stroke[] })),
      ...(images || []).map(i => ({ ...i, type: 'image' as const, attachedStrokes: [] as Stroke[] })),
      ...(files || []).map(f => ({ ...f, type: 'file' as const, attachedStrokes: [] as Stroke[] })),
      ...(videos || []).map(v => ({ ...v, type: 'video' as const, attachedStrokes: [] as Stroke[] }))
    ];

    // 1. Separate strokes attached to content blocks vs standalone sketch strokes
    const standaloneStrokes: Stroke[] = [];

    strokes.forEach((stroke: Stroke) => {
      if (!stroke.points || stroke.points.length === 0) return;
      
      if (stroke.blockId) {
        const baseBlock = baseBlocks.find(b => b.id === stroke.blockId);
        if (baseBlock) {
          baseBlock.attachedStrokes.push(stroke);
          return;
        }
      }
      
      standaloneStrokes.push(stroke);
    });

    // 2. Group standalone strokes into a single unified map
    const sketchBlocksMap = new Map<string, any>();
    const unclusteredStrokes: Stroke[] = [];

    standaloneStrokes.forEach((stroke: Stroke) => {
      if (stroke.blockId) {
        const box = getStrokeBoundingBox(stroke);
        if (!sketchBlocksMap.has(stroke.blockId)) {
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
            sBlock.y = stroke.blockY;
          }
          const box = getStrokeBoundingBox(stroke);
          sBlock.minX = Math.min(sBlock.minX, box.minX);
          sBlock.minY = Math.min(sBlock.minY, box.minY);
          sBlock.maxX = Math.max(sBlock.maxX, box.maxX);
          sBlock.maxY = Math.max(sBlock.maxY, box.maxY);
          sBlock.width = Math.max(sBlock.maxX - sBlock.minX, 300);
          sBlock.height = Math.max(sBlock.maxY - sBlock.minY, 150);
        }
      } else {
        unclusteredStrokes.push(stroke);
      }
    });

    // 3. Cluster legacy unattached strokes without blockId into sketchBlocksMap
    unclusteredStrokes.forEach((stroke: Stroke) => {
      const box = getStrokeBoundingBox(stroke);
      const padding = 60;
      const expandedBox = {
        minX: box.minX - padding,
        minY: box.minY - padding,
        maxX: box.maxX + padding,
        maxY: box.maxY + padding
      };
      
      const overlappingCluster = Array.from(sketchBlocksMap.values()).find(c => getIntersectionArea(expandedBox, c) > 0);
      
      if (overlappingCluster) {
        overlappingCluster.attachedStrokes.push(stroke);
        overlappingCluster.minX = Math.min(overlappingCluster.minX, box.minX);
        overlappingCluster.minY = Math.min(overlappingCluster.minY, box.minY);
        overlappingCluster.maxX = Math.max(overlappingCluster.maxX, box.maxX);
        overlappingCluster.maxY = Math.max(overlappingCluster.maxY, box.maxY);
        overlappingCluster.x = overlappingCluster.minX;
        overlappingCluster.y = overlappingCluster.minY;
        overlappingCluster.width = Math.max(overlappingCluster.maxX - overlappingCluster.minX, 300);
        overlappingCluster.height = Math.max(overlappingCluster.maxY - overlappingCluster.minY, 150);
      } else {
        const newBlockId = `sketch-${stroke.id}`;
        sketchBlocksMap.set(newBlockId, {
          type: 'drawing',
          id: newBlockId,
          x: box.minX,
          y: box.minY,
          minX: box.minX,
          minY: box.minY,
          maxX: box.maxX,
          maxY: box.maxY,
          width: Math.max(box.maxX - box.minX, 300),
          height: Math.max(box.maxY - box.minY, 150),
          attachedStrokes: [stroke]
        });
      }
    });

    // 4. Combine all blocks - guarantees 100% unique IDs across all blocks
    const finalBlocks = [...baseBlocks, ...Array.from(sketchBlocksMap.values())];
    return finalBlocks.sort((a, b) => {
      if (Math.abs(a.y - b.y) > 10) return a.y - b.y; // 10px tolerance for vertical alignment
      return a.x - b.x;
    });
  }, [texts, audios, images, files, videos, strokes]);

  const INITIAL_CONTENT_Y = 240;

  useEffect(() => {
    if (sortedBlocks.length > 0) {
      const last = sortedBlocks[sortedBlocks.length - 1];
      let height = last.height || (last.type === 'image' ? 400 : 180);
      if (typeof document !== 'undefined') {
        const el = document.getElementById(`block-${last.id}`);
        if (el && el.offsetHeight > 0) {
          height = el.offsetHeight;
        }
      }
      const safeLastY = Math.max(last.y ?? INITIAL_CONTENT_Y, INITIAL_CONTENT_Y);
      setBottomY(safeLastY + height + 32);
    } else {
      setBottomY(INITIAL_CONTENT_Y);
    }
  }, [sortedBlocks]);

  // Synchronizes physical linear layout on mobile with desktop canvas coordinates
  // Ensures blocks always start below the desktop Title header (y >= 240) and have >= 32px spacing
  const syncBlockPositions = useCallback(() => {
    if (sortedBlocks.length === 0) return;
    let currentY = INITIAL_CONTENT_Y;
    let hasChanges = false;

    const newTexts = [...texts];
    const newAudios = [...audios];
    const newImages = [...(images || [])];
    const newFiles = [...(files || [])];
    const newVideos = [...(videos || [])];

    sortedBlocks.forEach(block => {
      let height = block.height || (block.type === 'image' ? 400 : block.type === 'audio' ? (block.isCollapsed ? 80 : 160) : 120);
      if (typeof document !== 'undefined') {
        const el = document.getElementById(`block-${block.id}`);
        if (el && el.offsetHeight > 0) {
          height = el.offsetHeight;
        }
      }

      if (Math.abs((block.y ?? 0) - currentY) > 8) {
        hasChanges = true;
        if (block.type === 'text') {
          const idx = newTexts.findIndex(t => t.id === block.id);
          if (idx !== -1) newTexts[idx] = { ...newTexts[idx], y: currentY };
        } else if (block.type === 'audio') {
          const idx = newAudios.findIndex(a => a.id === block.id);
          if (idx !== -1) newAudios[idx] = { ...newAudios[idx], y: currentY };
        } else if (block.type === 'image') {
          const idx = newImages.findIndex(i => i.id === block.id);
          if (idx !== -1) newImages[idx] = { ...newImages[idx], y: currentY };
        } else if (block.type === 'file') {
          const idx = newFiles.findIndex(f => f.id === block.id);
          if (idx !== -1) newFiles[idx] = { ...newFiles[idx], y: currentY };
        } else if (block.type === 'video') {
          const idx = newVideos.findIndex(v => v.id === block.id);
          if (idx !== -1) newVideos[idx] = { ...newVideos[idx], y: currentY };
        }
      }

      currentY += height + 32;
    });

    if (hasChanges) {
      setTexts(newTexts);
      setAudios(newAudios);
      if (images) setImages(newImages);
      if (files) setFiles(newFiles);
      if (videos) setVideos(newVideos);
      setBottomY(currentY);
    }
  }, [sortedBlocks, texts, audios, images, files, videos, setTexts, setAudios, setImages, setFiles, setVideos]);

  // Initial mount auto-sync (fixes legacy overlapping coordinates from past mobile sessions)
  useEffect(() => {
    if (loading) return;
    const timer = setTimeout(() => {
      syncBlockPositions();
    }, 300);
    return () => clearTimeout(timer);
  }, [loading, pageId, syncBlockPositions]);

  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  
  const [isInternalSettingsOpen, setIsInternalSettingsOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string>("");
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Paper & Background Style State
  const [backgroundStyle, setBackgroundStyle] = useState<'none' | 'ruled' | 'grid' | 'dots'>('none');
  const [pageColor, setPageColor] = useState<string>('default');

  useEffect(() => {
    if (!pageId || typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem(`cubnotes_page_style_${pageId}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.backgroundStyle) setBackgroundStyle(parsed.backgroundStyle);
        if (parsed.pageColor) setPageColor(parsed.pageColor);
      } else {
        setBackgroundStyle('none');
        setPageColor('default');
      }
    } catch {}
  }, [pageId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleStyleChange = (e: any) => {
      if (e.detail?.pageId === pageId) {
        if (e.detail.backgroundStyle !== undefined) setBackgroundStyle(e.detail.backgroundStyle);
        if (e.detail.pageColor !== undefined) setPageColor(e.detail.pageColor);
      }
    };
    window.addEventListener('cubnotes:page_style_changed', handleStyleChange);
    return () => window.removeEventListener('cubnotes:page_style_changed', handleStyleChange);
  }, [pageId]);

  // Rearrange / Reorder State
  const [isRearranging, setIsRearranging] = useState(false);

  const [isDrawOverlayOpen, setIsDrawOverlayOpen] = useState(false);
  const [drawOverlayBlockId, setDrawOverlayBlockId] = useState<string | null>(null);
  const [drawOverlayBlockType, setDrawOverlayBlockType] = useState<string | null>(null);
  const [drawOverlayInitialY, setDrawOverlayInitialY] = useState<number | undefined>(undefined);

  // Version History Modal State
  const [isVersionsModalOpen, setIsVersionsModalOpen] = useState(false);
  const [isTakingSnapshot, setIsTakingSnapshot] = useState(false);

  // Safe navigation back that flushes pending edits first
  const handleBack = useCallback(async () => {
    if (flushSave) {
      try {
        await flushSave();
      } catch (e) {
        console.warn("Error flushing save on back:", e);
      }
    }
    if (onBack) onBack();
  }, [flushSave, onBack]);

  // Swipe-to-go-back gesture handling
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const handlePageTouchStart = (e: React.TouchEvent) => {
    if (isDrawOverlayOpen || isRearranging) return;
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    // Start gesture if touching near the left edge (< 80px)
    if (touch.clientX < 80) {
      touchStartX.current = touch.clientX;
      touchStartY.current = touch.clientY;
    }
  };

  const handlePageTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStartX.current;
    const deltaY = Math.abs(touch.clientY - touchStartY.current);

    // If swipe right was at least 65px and mostly horizontal
    if (deltaX > 65 && deltaX > deltaY * 1.3) {
      handleBack();
    }
    touchStartX.current = null;
    touchStartY.current = null;
  };

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
    openDrawOverlay(newSketchId, 'drawing', Math.max(INITIAL_CONTENT_Y, bottomY));
  };
  
  const imageInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  // Virtual Keyboard / Viewport tracking for flush dock attachment
  // Virtual Keyboard & Viewport tracking for seamless accessory attachment
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [mobileActiveEditor, setMobileActiveEditor] = useState<Editor | null>(null);
  const editorMapRef = useRef<Map<string, Editor>>(new Map());
  const [editorUpdateTick, setEditorUpdateTick] = useState(0);
  const [isToolbarExpanded, setIsToolbarExpanded] = useState(true);
  const [activeTray, setActiveTray] = useState<'none' | 'insert' | 'format'>('none');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isTopMenuOpen, setIsTopMenuOpen] = useState(false);
  const [audioInputs, setAudioInputs] = useState<Array<{ deviceId: string; label: string }>>([]);
  const [selectedAudioInput, setSelectedAudioInput] = useState<string>('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('cubnotes_preferred_audio_input') || '';
      setSelectedAudioInput(saved);
      getAvailableAudioInputs().then(inputs => {
        setAudioInputs(inputs);
      });
    }
  }, []);

  const handleSelectAudioInput = (deviceId: string) => {
    setSelectedAudioInput(deviceId);
    setPreferredAudioInput(deviceId);
    toast.success("Audio input updated", { duration: 1500 });
  };

  const ensureCursorVisible = useCallback(() => {
    if (!scrollContainerRef.current) return;
    
    requestAnimationFrame(() => {
      try {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return;
        
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        // Ignore unrendered, zero-dimension, or invalid bounding boxes
        if (!rect || rect.height === 0 || rect.bottom <= 0 || rect.top <= 0) return;

        const container = scrollContainerRef.current;
        if (!container) return;

        // Viewable bottom boundary is above the keyboard and active toolbar
        const bottomNavHeight = isKeyboardOpen 
          ? Math.max(keyboardOffset || 0, 280) + (activeTray !== 'none' ? 190 : 54) 
          : 90;
        const visibleBottom = window.innerHeight - bottomNavHeight - 24;

        // Only scroll down if the cursor is actually obscured beneath the bottom keyboard/toolbar.
        // Never scroll up while typing (prevents shooting to top of screen or bouncing).
        if (rect.bottom > visibleBottom) {
          const scrollDiff = rect.bottom - visibleBottom + 24;
          // 'auto' prevents conflicting queued physics animations during typing
          container.scrollBy({ top: scrollDiff, behavior: 'auto' });
        }
      } catch {}
    });
  }, [isKeyboardOpen, keyboardOffset, activeTray]);


  useEffect(() => {
    if (typeof window === "undefined") return;

    const isEditable = (el: Element | null): boolean => {
      if (!el) return false;
      const htmlEl = el as HTMLElement;
      return (
        htmlEl.tagName === 'INPUT' || 
        htmlEl.tagName === 'TEXTAREA' || 
        htmlEl.isContentEditable || 
        Boolean(htmlEl.closest('.ProseMirror')) ||
        Boolean(htmlEl.closest('[contenteditable="true"]'))
      );
    };

    const handleFocusIn = (e: FocusEvent) => {
      if (isEditable(e.target as Element)) {
        setIsKeyboardOpen(true);
      }
    };

    const handleFocusOut = () => {
      setTimeout(() => {
        const active = document.activeElement;
        const isStillInToolbar = Boolean(active?.closest('[data-mobile-toolbar="true"]'));
        if (!isEditable(active) && !isStillInToolbar) {
          setIsKeyboardOpen(false);
          setKeyboardOffset(0);
        }
      }, 150);
    };

    const updateViewport = () => {
      if (!window.visualViewport) return;
      const active = document.activeElement;
      const isFocused = isEditable(active) || Boolean(active?.closest('[data-mobile-toolbar="true"]'));
      const offset = window.innerHeight - (window.visualViewport.height + window.visualViewport.offsetTop);
      const isKbd = isFocused && offset > 50;
      
      if (isKbd) {
        setIsKeyboardOpen(true);
        setKeyboardOffset(Math.max(0, offset));
      } else if (isFocused) {
        setKeyboardOffset(Math.max(0, offset));
      } else {
        setIsKeyboardOpen(false);
        setKeyboardOffset(0);
      }
    };

    window.addEventListener("focusin", handleFocusIn);
    window.addEventListener("focusout", handleFocusOut);

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", updateViewport);
      window.visualViewport.addEventListener("scroll", updateViewport);
    }

    return () => {
      window.removeEventListener("focusin", handleFocusIn);
      window.removeEventListener("focusout", handleFocusOut);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", updateViewport);
        window.visualViewport.removeEventListener("scroll", updateViewport);
      }
    };
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserEmail(user.email || "");
        setCurrentUser(user);
      }
    });
  }, [supabase]);

  useEffect(() => {
    const handleStartRecordingNode = (e: Event) => {
      const customEvent = e as CustomEvent<{ id: string }>;
      const { id } = customEvent.detail;
      const targetY = isJournal 
        ? INITIAL_CONTENT_Y
        : Math.max(INITIAL_CONTENT_Y, bottomY);

      if (isJournal) {
        const shiftY = 200;
        setTexts(prev => prev.map(t => ({ ...t, y: (t.y ?? INITIAL_CONTENT_Y) + shiftY })));
        setAudios(prev => prev.map(a => ({ ...a, y: (a.y ?? INITIAL_CONTENT_Y) + shiftY })));
        setImages(prev => prev.map(i => ({ ...i, y: (i.y ?? INITIAL_CONTENT_Y) + shiftY })));
        setFiles(prev => prev.map(f => ({ ...f, y: (f.y ?? INITIAL_CONTENT_Y) + shiftY })));
        setVideos(prev => prev.map(v => ({ ...v, y: (v.y ?? INITIAL_CONTENT_Y) + shiftY })));
      }

      const newAudio = {
        id,
        url: "",
        x: 50,
        y: targetY,
        width: 400,
        title: isJournal ? `Journal Entry - ${format(new Date(), 'MMM d, yyyy')}` : `Meeting Note - ${format(new Date(), 'MMM d, yyyy')}`,
        summary: "",
        transcript: "",
        notes: "",
        isLiveRecording: true,
        recordingStartedAt: Date.now(),
        audioCreatedAt: Date.now(),
        audioExpiresAt: isJournal ? undefined : Date.now() + 7 * 24 * 60 * 60 * 1000,
        isAudioSavedPermanently: isJournal ? true : false,
      };

      setAudios(prev => {
        if (prev.some(a => a.id === id)) return prev;
        return isJournal ? [{ ...newAudio }, ...(prev || [])] : [...(prev || []), { ...newAudio }];
      });
      setTimeout(() => {
        if (isJournal) {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
          window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        }
      }, 100);
    };

    const handleInjectTranscribing = (e: Event) => {
      const customEvent = e as CustomEvent<{ id: string }>;
      const { id } = customEvent.detail;
      setAudios(prev => prev.map(a => a.id === id ? { ...a, isLiveRecording: false, isTranscribing: true } : a));
    };

    const handleInjectSummary = (e: Event) => {
      const customEvent = e as CustomEvent<{ 
        id: string; 
        summary: string; 
        transcript: string;
        url?: string;
        durationMs?: number;
        audioCreatedAt?: number;
        audioExpiresAt?: number;
        isAudioSavedPermanently?: boolean;
      }>;
      const { id, summary, transcript, url, durationMs, audioCreatedAt, audioExpiresAt, isAudioSavedPermanently } = customEvent.detail;
      setAudios(prev => prev.map(audio => {
        if (audio.id === id) {
          return { 
            ...audio, 
            summary, 
            transcript, 
            isLiveRecording: false, 
            isTranscribing: false, 
            url: url !== undefined ? url : audio.url,
            durationMs: durationMs || audio.durationMs,
            audioCreatedAt: audioCreatedAt || audio.audioCreatedAt || Date.now(),
            audioExpiresAt: audioExpiresAt || audio.audioExpiresAt || (Date.now() + 7 * 24 * 60 * 60 * 1000),
            isAudioSavedPermanently: isAudioSavedPermanently ?? audio.isAudioSavedPermanently ?? false,
          };
        }
        return audio;
      }));
    };

    const handleInjectAudio = (e: Event) => {
      const customEvent = e as CustomEvent<{ id: string, url: string }>;
      const { id, url } = customEvent.detail;
      setAudios(prev => prev.map(a => a.id === id ? { ...a, url } : a));
    };

    window.addEventListener('start-recording-node', handleStartRecordingNode);
    window.addEventListener('inject-transcribing', handleInjectTranscribing);
    window.addEventListener('inject-summary', handleInjectSummary);
    window.addEventListener('inject-audio', handleInjectAudio);

    return () => {
      window.removeEventListener('start-recording-node', handleStartRecordingNode);
      window.removeEventListener('inject-transcribing', handleInjectTranscribing);
      window.removeEventListener('inject-summary', handleInjectSummary);
      window.removeEventListener('inject-audio', handleInjectAudio);
    };
  }, [bottomY, setAudios]);

  const updateAudioTitle = useCallback((id: string, title: string) => {
    setAudios(prev => prev.map(a => a.id === id ? { ...a, title } : a));
  }, [setAudios]);

  const updateAudioField = useCallback((id: string, field: keyof AudioNode, value: any) => {
    setAudios(prev => prev.map(a => a.id === id ? { ...a, [field]: value } : a));
  }, [setAudios]);

  const deleteAudioNode = useCallback((id: string) => {
    setAudios(prev => prev.filter(a => a.id !== id));
  }, [setAudios]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  const deleteBlock = (block: any) => {
    if (block.type === 'text') setTexts(prev => prev.filter(t => t.id !== block.id));
    else if (block.type === 'image') setImages(prev => prev.filter(i => i.id !== block.id));
    else if (block.type === 'audio') setAudios(prev => prev.filter(a => a.id !== block.id));
    else if (block.type === 'file') setFiles(prev => prev.filter(f => f.id !== block.id));
    else if (block.type === 'video') setVideos(prev => prev.filter(v => v.id !== block.id));
    else if (block.type === 'drawing') deleteDrawingBlock(block);
    setActiveBlockId(null);
    toast.success("Block deleted");
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

    let currentY = INITIAL_CONTENT_Y;
    newBlocks.forEach((block) => {
      let blockHeight = block.height || (block.type === 'image' ? 400 : block.type === 'audio' ? (block.isCollapsed ? 80 : 160) : 120);
      if (typeof document !== 'undefined') {
        const el = document.getElementById(`block-${block.id}`);
        if (el && el.offsetHeight > 0) {
          blockHeight = el.offsetHeight;
        }
      }
      const newY = currentY;
      const deltaY = newY - (block.y ?? currentY);

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

      currentY += blockHeight + 32;
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
      const result = await uploadMediaFile(file, pageId);
      const publicUrl = result.url;

      let imgWidth = 400;
      let imgHeight = 300;
      try {
        const imgObj = new Image();
        imgObj.src = publicUrl;
        await new Promise((resolve) => {
          imgObj.onload = resolve;
          imgObj.onerror = resolve;
          setTimeout(resolve, 1200);
        });
        if (imgObj.naturalWidth && imgObj.naturalHeight) {
          const aspect = imgObj.naturalHeight / imgObj.naturalWidth;
          imgHeight = Math.round(imgWidth * aspect);
        }
      } catch {}

      setImages(prev => [...(prev || []), {
        id: uuidv4(),
        x: 50,
        y: Math.max(INITIAL_CONTENT_Y, bottomY),
        width: imgWidth,
        height: imgHeight,
        url: publicUrl
      }]);
      toast.success("Image uploaded successfully!", { id: toastId });
      setTimeout(() => {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      }, 100);
    } catch (error: any) {
      toast.error(`Upload failed: ${error.message}`, { id: toastId });
    } finally {
      e.target.value = ''; // Reset input
    }
  };


  const addTextBlock = () => {
    // If the candidate adjacent block is already a text box, keep editing inside the SAME text box!
    // This prevents creating multiple separate text boxes on top of each other.
    const candidateBlock = isJournal ? sortedBlocks[0] : sortedBlocks[sortedBlocks.length - 1];
    if (candidateBlock && candidateBlock.type === 'text') {
      const existingEditor = editorMapRef.current.get(candidateBlock.id);
      if (existingEditor) {
        setActiveBlockId(candidateBlock.id);
        existingEditor.commands.focus('end');
        return;
      }
    }

    // If there's an existing active text block, also keep typing in it:
    if (activeBlockId) {
      const activeTextNode = texts.find(t => t.id === activeBlockId);
      if (activeTextNode) {
        const ed = editorMapRef.current.get(activeTextNode.id);
        if (ed) {
          ed.commands.focus('end');
          return;
        }
      }
    }

    // If there is only one text block on the page, default to continuing in it:
    if (texts.length === 1) {
      const singleText = texts[0];
      const ed = editorMapRef.current.get(singleText.id);
      if (ed) {
        setActiveBlockId(singleText.id);
        ed.commands.focus('end');
        return;
      }
    }

    const targetY = isJournal 
      ? INITIAL_CONTENT_Y
      : Math.max(INITIAL_CONTENT_Y, bottomY);

    if (isJournal) {
      const shiftY = 160;
      setTexts(prev => prev.map(t => ({ ...t, y: (t.y ?? INITIAL_CONTENT_Y) + shiftY })));
      setAudios(prev => prev.map(a => ({ ...a, y: (a.y ?? INITIAL_CONTENT_Y) + shiftY })));
      setImages(prev => prev.map(i => ({ ...i, y: (i.y ?? INITIAL_CONTENT_Y) + shiftY })));
      setFiles(prev => prev.map(f => ({ ...f, y: (f.y ?? INITIAL_CONTENT_Y) + shiftY })));
      setVideos(prev => prev.map(v => ({ ...v, y: (v.y ?? INITIAL_CONTENT_Y) + shiftY })));
    }

    const newNode = {
      id: uuidv4(),
      x: 50,
      y: targetY,
      width: 400,
      content: "<p></p>"
    };
    if (isJournal) {
      setTexts(prev => [newNode, ...prev]);
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 100);
    } else {
      setTexts(prev => [...prev, newNode]);
      setTimeout(() => {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      }, 100);
    }
  };

  const getBlockDate = (block: any) => {
    const time = block.audioCreatedAt || block.recordingStartedAt || block.createdAt;
    if (time) return new Date(time);
    if (pageCreatedAt) return new Date(pageCreatedAt);
    return new Date();
  };

  const formatDailyDivider = (d: Date) => {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (d.toDateString() === today.toDateString()) {
      return `Today — ${format(d, "EEEE, MMMM d")}`;
    }
    if (d.toDateString() === yesterday.toDateString()) {
      return `Yesterday — ${format(d, "EEEE, MMMM d")}`;
    }
    return format(d, "EEEE, MMMM d, yyyy");
  };

  const shouldRenderDateDivider = (block: any, prevBlock: any | null) => {
    if (!isJournal) return null;
    const currentD = getBlockDate(block);
    if (!prevBlock) {
      return formatDailyDivider(currentD);
    }
    const prevD = getBlockDate(prevBlock);
    if (currentD.toDateString() !== prevD.toDateString()) {
      return formatDailyDivider(currentD);
    }
    return null;
  };

  const streakCount = useMemo(() => {
    if (!isJournal || sortedBlocks.length === 0) return 1;
    const dates = new Set<string>();
    sortedBlocks.forEach(b => {
      const d = getBlockDate(b);
      dates.add(format(d, 'yyyy-MM-dd'));
    });
    
    let count = 0;
    let current = new Date();
    const todayStr = format(current, 'yyyy-MM-dd');
    if (!dates.has(todayStr)) {
      current.setDate(current.getDate() - 1);
      if (!dates.has(format(current, 'yyyy-MM-dd'))) {
        return dates.size > 0 ? 1 : 0;
      }
    }
    
    while (dates.has(format(current, 'yyyy-MM-dd'))) {
      count++;
      current.setDate(current.getDate() - 1);
    }
    return Math.max(1, count);
  }, [sortedBlocks, isJournal]);



  if (loading) {
    return <div className="w-full h-full flex items-center justify-center text-zinc-500">Loading notes...</div>;
  }

  const executeFormat = (action: () => void) => {
    if (!mobileActiveEditor) return;
    action();
    setEditorUpdateTick(t => t + 1);
  };

  return (
    <div 
      className={`fixed inset-0 w-full h-[100dvh] flex flex-col overflow-hidden select-none ${
        pageColor === 'default' ? 'bg-white dark:bg-black' : ''
      }`}
      style={{
        backgroundColor: pageColor === 'default' ? undefined : pageColor
      }}
      onTouchStart={handlePageTouchStart}
      onTouchEnd={handlePageTouchEnd}
    >
      {/* Paper Pattern Overlay */}
      {backgroundStyle !== 'none' && (
        <div 
          className="absolute inset-0 pointer-events-none z-0"
          style={{
            backgroundImage: backgroundStyle === 'ruled' 
              ? `linear-gradient(transparent 0px, transparent 31px, var(--line-color) 31px, var(--line-color) 32px)`
              : backgroundStyle === 'grid'
              ? `linear-gradient(to right, var(--line-color) 1px, transparent 1px), linear-gradient(to bottom, var(--line-color) 1px, transparent 1px)`
              : `radial-gradient(var(--line-color) 1.5px, transparent 1.5px)`,
            backgroundSize: backgroundStyle === 'ruled'
              ? `100% 32px`
              : backgroundStyle === 'grid'
              ? `32px 32px`
              : `24px 24px`,
            ['--line-color' as string]: 'var(--tw-prose-hr, rgba(161, 161, 170, 0.2))',
          }}
        />
      )}
      
      {/* Floating Top Navigation / Rearrange Bar */}
      {isRearranging ? (
        <div 
          className="fixed top-0 left-0 right-0 z-[1600] pointer-events-none px-4 flex items-center justify-between transition-all"
          style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
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
          style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
        >
          {onBack ? (
            <button 
              onClick={handleBack}
              className="pointer-events-auto flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/75 dark:bg-zinc-900/75 backdrop-blur-2xl border border-white/50 dark:border-white/10 shadow-lg shadow-black/5 dark:shadow-black/40 ring-1 ring-black/5 dark:ring-white/5 text-primary-600 dark:text-primary-400 font-semibold text-sm active:scale-95 transition-all"
              title="Back to Folders"
            >
              <ChevronLeft size={19} className="-ml-1" />
              <span>Folders</span>
            </button>
          ) : <div />}

          <div className="pointer-events-auto flex items-center gap-1.5 p-1 rounded-full bg-white/75 dark:bg-zinc-900/75 backdrop-blur-2xl border border-white/50 dark:border-white/10 shadow-lg shadow-black/5 dark:shadow-black/40 ring-1 ring-black/5 dark:ring-white/5 transition-all">
            {isTopMenuOpen && (
              <div className="flex items-center gap-1.5 animate-in fade-in slide-in-from-right-2 duration-150">
                {onOpenShare && (
                  <button 
                    onClick={() => {
                      setIsTopMenuOpen(false);
                      onOpenShare();
                    }}
                    className="w-8 h-8 flex items-center justify-center rounded-full text-zinc-700 dark:text-zinc-200 hover:text-primary-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 active:scale-95 transition-all"
                    title="Share & Collaborate"
                  >
                    <Share2 size={16} />
                  </button>
                )}

                <button 
                  onClick={() => {
                    setIsTopMenuOpen(false);
                    fetchVersions();
                    setIsVersionsModalOpen(true);
                  }}
                  className="w-8 h-8 flex items-center justify-center rounded-full text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 active:scale-95 transition-all"
                  title="Version History"
                >
                  <History size={16} />
                </button>

                <button 
                  onClick={() => {
                    setIsTopMenuOpen(false);
                    setIsRearranging(true);
                    toast.success("Rearrange Mode Activated", { id: 'rearrange-toast', duration: 1500 });
                  }}
                  className="w-8 h-8 flex items-center justify-center rounded-full text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 active:scale-95 transition-all"
                  title="Rearrange Blocks"
                >
                  <GripVertical size={16} />
                </button>

                <button 
                  onClick={() => {
                    setIsTopMenuOpen(false);
                    if (onOpenSettings) {
                      onOpenSettings();
                    } else {
                      setIsInternalSettingsOpen(true);
                    }
                  }}
                  className="w-8 h-8 flex items-center justify-center rounded-full text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 active:scale-95 transition-all"
                  title="Settings"
                >
                  <Settings size={16} />
                </button>

                <div className="w-px h-4 bg-zinc-300 dark:bg-zinc-700 mx-0.5" />
              </div>
            )}

            <button 
              onClick={() => setIsTopMenuOpen(prev => !prev)}
              className={`w-8 h-8 flex items-center justify-center rounded-full transition-all active:scale-95 ${
                isTopMenuOpen 
                  ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-white' 
                  : 'text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white'
              }`}
              title={isTopMenuOpen ? "Close Menu" : "More Options"}
            >
              <MoreHorizontal size={18} />
            </button>
          </div>
        </div>
      )}

      <div 
        ref={scrollContainerRef}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden relative scroll-smooth overscroll-contain select-text" 
        style={{ 
          WebkitOverflowScrolling: 'touch',
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 64px)'
        }}
        onClick={() => {
          setActiveBlockId(null);
          setIsTopMenuOpen(false);
        }}
      >
        
        {/* Title area (scrolls with content) */}
        <div className="px-5 pt-4 pb-3">
          <div className="flex items-center justify-between gap-3 mb-1">
            <input
              type="text"
              value={pageTitle}
              onChange={(e) => onUpdatePageTitle(e.target.value)}
              placeholder="Page Title"
              className="bg-transparent text-[32px] font-bold text-zinc-900 dark:text-white border-none outline-none focus:ring-0 placeholder:text-zinc-300 dark:placeholder:text-zinc-700 flex-1 min-w-0 tracking-tight leading-tight"
            />
            {isJournal && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-xs font-bold text-amber-700 dark:text-amber-300 flex-shrink-0 shadow-xs">
                <Flame size={14} className="text-amber-500 fill-amber-500/50" />
                <span>{streakCount} {streakCount === 1 ? 'Day' : 'Days'}</span>
              </div>
            )}
          </div>
          {pageCreatedAt && (
            <div className="text-[13px] font-medium text-zinc-400 dark:text-zinc-500 flex items-center gap-1.5">
              {isJournal && (
                <>
                  <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold">
                    <BookOpen size={12} />
                    <span>Journal</span>
                  </span>
                  <span>•</span>
                </>
              )}
              <span>{format(new Date(pageCreatedAt), "MMMM d, yyyy 'at' h:mm a")}</span>
            </div>
          )}
          {audios && audios.length > 0 && (
            <div className="flex items-center gap-2 mt-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  const targetState = !audios.every(a => a.isCollapsed);
                  setAudios(prev => prev.map(a => ({ ...a, isCollapsed: targetState })));
                  toast.success(targetState ? "All cards collapsed" : "All cards expanded", { duration: 1500 });
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors border border-zinc-200 dark:border-zinc-700 shadow-2xs"
              >
                {audios.every(a => a.isCollapsed) ? <Maximize2 size={12} /> : <Minimize2 size={12} />}
                <span>{audios.every(a => a.isCollapsed) ? "Expand All Cards" : "Collapse All Cards"}</span>
                <span className="text-[10px] bg-zinc-200 dark:bg-zinc-700 px-1.5 py-0.2 rounded-full font-bold">
                  {audios.length}
                </span>
              </button>
            </div>
          )}
        </div>

        {/* Linear feed of blocks */}
        <div 
          className="flex flex-col gap-6 w-full px-5 relative z-10 min-h-full transition-[padding] duration-150"
          style={{
            paddingBottom: isKeyboardOpen 
              ? `${Math.max(keyboardOffset || 0, 280) + (activeTray !== 'none' ? 240 : 130)}px` 
              : '140px'
          }}
        >
          {sortedBlocks.map((block, index) => {
            const blockBox = getBlockBoundingBox(block);
            const strokeExtent = getAttachedStrokesExtent(block.attachedStrokes);
            const reverseZ = 500 - index;
            const isSelected = activeBlockId === block.id;
            const dateDivider = shouldRenderDateDivider(block, index > 0 ? sortedBlocks[index - 1] : null);

            return (
              <React.Fragment key={block.id}>
                {dateDivider && (
                  <div className="flex items-center gap-3 my-2 px-1 select-none">
                    <div className="h-px bg-zinc-200/80 dark:bg-zinc-800 flex-1" />
                    <span className="flex items-center gap-1.5 px-3 py-1 bg-zinc-100 dark:bg-zinc-800/90 border border-zinc-200/60 dark:border-zinc-700/60 rounded-full text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 shadow-sm">
                      <Calendar size={12} className="text-amber-500" />
                      <span>{dateDivider}</span>
                    </span>
                    <div className="h-px bg-zinc-200/80 dark:bg-zinc-800 flex-1" />
                  </div>
                )}
                <div 
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
                      <button 
                        onClick={(e) => { e.stopPropagation(); deleteBlock(block); }}
                        className="p-1 rounded-full text-red-500 hover:bg-red-500/10 transition-colors ml-1"
                        title="Delete Block"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                )}

                {/* Render Block by Type */}
                {block.type === 'text' && (
                  <div 
                    id={`block-${block.id}`}
                    className={`w-[calc(100%+24px)] -mx-3 px-3.5 py-2 min-h-[50px] relative rounded-xl transition-all duration-200 ${
                      isSelected && !isRearranging ? 'ring-1 ring-primary-500/50 bg-zinc-50/50 dark:bg-zinc-900/30' : ''
                    } ${isRearranging ? 'pointer-events-none' : ''}`}
                    style={{
                      minHeight: strokeExtent.hasStrokes ? Math.max(50, strokeExtent.maxY + 24) : undefined,
                      marginTop: strokeExtent.hasStrokes && strokeExtent.minY < -4 ? Math.abs(strokeExtent.minY) + 8 : undefined,
                      backgroundImage: backgroundStyle === 'ruled'
                        ? `linear-gradient(transparent 0px, transparent 31px, var(--line-color, rgba(161, 161, 170, 0.25)) 31px, var(--line-color, rgba(161, 161, 170, 0.25)) 32px)`
                        : undefined,
                      backgroundSize: backgroundStyle === 'ruled' ? '100% 32px' : undefined,
                    }}
                    onClick={(e) => { 
                      if (!isRearranging) { 
                        e.stopPropagation(); 
                        setActiveBlockId(block.id); 
                        const ed = editorMapRef.current.get(block.id);
                        if (ed && !ed.isFocused) {
                          ed.commands.focus('end');
                        }
                      } 
                    }}
                  >
                    {isJournal && (
                      <div className="flex items-center gap-1.5 px-3 pt-2 text-[11px] font-medium text-zinc-400 dark:text-zinc-500 select-none">
                        <Clock size={11} className="text-amber-500/80" />
                        <span>{format(getBlockDate(block), "h:mm a")}</span>
                      </div>
                    )}
                    <TipTapEditor 
                      id={block.id}
                      content={block.content}
                      onChange={(content) => {
                        setTexts(prev => prev.map(t => t.id === block.id ? { ...t, content } : t));
                      }}
                      onDelete={() => {
                        editorMapRef.current.delete(block.id);
                        setTexts(prev => prev.filter(t => t.id !== block.id));
                      }}
                      onMountEditor={(id, editor) => {
                        if (editor) {
                          editorMapRef.current.set(id, editor);
                        } else {
                          editorMapRef.current.delete(id);
                        }
                      }}
                      setActiveEditor={(editor) => {
                        setMobileActiveEditor(editor);
                        if (editor) {
                          editorMapRef.current.set(block.id, editor);
                          setIsKeyboardOpen(true);
                          ensureCursorVisible();
                        }
                      }}
                      onEditorUpdate={() => {
                        setEditorUpdateTick(t => t + 1);
                      }}
                      onBlurText={() => {
                        setTimeout(() => {
                          const active = document.activeElement;
                          const isStillEditing = active && (
                            active.tagName === 'INPUT' || 
                            active.tagName === 'TEXTAREA' || 
                            (active as HTMLElement).isContentEditable ||
                            Boolean(active.closest('.ProseMirror')) ||
                            Boolean(active.closest('[data-mobile-toolbar="true"]'))
                          );
                          if (!isStillEditing) {
                            setIsKeyboardOpen(false);
                            setKeyboardOffset(0);
                            setMobileActiveEditor(null);
                            syncBlockPositions();
                          }
                        }, 150);
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
                    style={{
                      minHeight: strokeExtent.hasStrokes ? Math.max(100, strokeExtent.maxY + 24) : undefined,
                      marginTop: strokeExtent.hasStrokes && strokeExtent.minY < -4 ? Math.abs(strokeExtent.minY) + 8 : undefined
                    }}
                    onClick={(e) => { if (!isRearranging) { e.stopPropagation(); setActiveBlockId(block.id); } }}
                  >
                    <MobileAudioCard 
                      node={block} 
                      updateAudioTitle={updateAudioTitle}
                      updateAudioField={updateAudioField}
                      deleteAudioNode={deleteAudioNode}
                      onAnnotate={(id) => openDrawOverlay(id, 'audio')}
                      isActiveRecordingPaused={isPaused}
                      onPauseRecording={onPauseRecording}
                      onResumeRecording={onResumeRecording}
                      onStopRecording={onStopRecording || onToggleMeeting}
                    />
                    <AttachedStrokes strokes={block.attachedStrokes} blockBox={blockBox} />
                  </div>
                )}

                {block.type === 'image' && (
                  <div 
                    id={`block-${block.id}`}
                    className={`relative w-full rounded-xl shadow-sm border transition-all ${
                      isSelected && !isRearranging ? 'border-primary-500 ring-2 ring-primary-500/20' : 'border-zinc-200 dark:border-zinc-800'
                    } bg-black`}
                    style={{
                      minHeight: strokeExtent.hasStrokes ? Math.max(180, strokeExtent.maxY + 24) : undefined,
                      marginTop: strokeExtent.hasStrokes && strokeExtent.minY < -4 ? Math.abs(strokeExtent.minY) + 8 : undefined
                    }}
                    onClick={(e) => { if (!isRearranging) { e.stopPropagation(); setActiveBlockId(block.id); } }}
                  >
                    <div className="w-full h-auto overflow-hidden rounded-xl">
                      <img 
                        src={block.url} 
                        alt="Canvas Image" 
                        className="w-full h-auto object-contain select-text pointer-events-auto" 
                        style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
                      />
                    </div>
                    <AttachedStrokes strokes={block.attachedStrokes} blockBox={blockBox} />
                  </div>
                )}

                {block.type === 'file' && (
                  <div 
                    id={`block-${block.id}`}
                    className={`relative w-full bg-white dark:bg-zinc-900 p-4 rounded-xl shadow-sm border transition-all ${
                      isSelected && !isRearranging ? 'border-primary-500 ring-2 ring-primary-500/20' : 'border-zinc-200 dark:border-zinc-800'
                    } flex items-center justify-between`}
                    style={{
                      minHeight: strokeExtent.hasStrokes ? Math.max(64, strokeExtent.maxY + 24) : undefined,
                      marginTop: strokeExtent.hasStrokes && strokeExtent.minY < -4 ? Math.abs(strokeExtent.minY) + 8 : undefined
                    }}
                    onClick={(e) => { if (!isRearranging) { e.stopPropagation(); setActiveBlockId(block.id); } }}
                  >
                    <div className="flex items-center gap-3 overflow-hidden relative z-30">
                      <File size={22} className="text-primary-500 flex-shrink-0" />
                      <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">{block.filename}</span>
                    </div>
                    <div className="flex items-center gap-1 relative z-30">
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
                    </div>
                    <AttachedStrokes strokes={block.attachedStrokes} blockBox={blockBox} />
                  </div>
                )}

                {block.type === 'video' && (
                  <div 
                    id={`block-${block.id}`}
                    className={`relative w-full rounded-xl shadow-sm border transition-all ${
                      isSelected && !isRearranging ? 'border-primary-500 ring-2 ring-primary-500/20' : 'border-zinc-200 dark:border-zinc-800'
                    } bg-black aspect-video ${isRearranging ? 'pointer-events-none' : ''}`}
                    style={{
                      minHeight: strokeExtent.hasStrokes ? Math.max(200, strokeExtent.maxY + 24) : undefined,
                      marginTop: strokeExtent.hasStrokes && strokeExtent.minY < -4 ? Math.abs(strokeExtent.minY) + 8 : undefined
                    }}
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
                    <AttachedStrokes strokes={block.attachedStrokes} blockBox={blockBox} isStandalone={true} />
                  </div>
                )}
              </div>
            </React.Fragment>
          );
        })}
          
          {/* Tap Zone at bottom to append text */}
          <div 
            className="flex-1 min-h-[160px] w-full cursor-text" 
            onClick={addTextBlock}
          />
        </div>
      </div>

      {/* Floating Glassmorphic Dock - Hidden completely when keyboard is open */}
      {!isKeyboardOpen && (
        <div 
          className="fixed left-1/2 -translate-x-1/2 z-[1500] pointer-events-none transition-all duration-200"
          style={{ bottom: 'max(16px, calc(env(safe-area-inset-bottom, 0px) + 12px))' }}
        >
          <div className="pointer-events-auto flex items-center gap-7 px-6 py-2.5 rounded-full bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border border-zinc-200/80 dark:border-zinc-800/80 shadow-xl transition-all">
            <input 
              type="file" 
              ref={imageInputRef} 
              onChange={handleFileUpload} 
              accept="image/*" 
              className="hidden" 
            />
            
            <button 
              onClick={() => imageInputRef.current?.click()} 
              className="p-1.5 text-zinc-700 dark:text-zinc-200 hover:text-black dark:hover:text-white active:scale-90 transition-all rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800"
              title="Add Photo / Image"
            >
              <ImageIcon size={22} />
            </button>

            <button 
              onClick={onToggleMeeting}
              disabled={isProcessing}
              className={`p-1.5 transition-all rounded-full active:scale-90 ${
                isRecording 
                  ? 'text-red-500 animate-pulse bg-red-500/20 ring-2 ring-red-500/30' 
                  : 'text-zinc-700 dark:text-zinc-200 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800'
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
              className={`p-1.5 transition-all rounded-full active:scale-90 relative ${
                activeBlockId 
                  ? 'text-primary-600 dark:text-primary-400 bg-primary-500/15 dark:bg-primary-400/20 ring-1 ring-primary-500/30' 
                  : 'text-zinc-700 dark:text-zinc-200 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800'
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
      )}

      {/* Mobile Keyboard Formatting Toolbar (Google Keep + Samsung Notes Hybrid Style) */}
      {(isKeyboardOpen || mobileActiveEditor) && (
        <div 
          data-mobile-toolbar="true"
          className="fixed left-0 right-0 z-[1500] pointer-events-auto transition-all duration-200"
          style={{ bottom: keyboardOffset ? `${keyboardOffset}px` : 'env(safe-area-inset-bottom, 0px)' }}
          onPointerDown={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
        >
          {/* 1. Toggle-able Insert Drawer (Google Keep / Samsung Notes style) */}
          {activeTray === 'insert' && isToolbarExpanded && (
            <div 
              className="mx-2 mb-1.5 p-2 rounded-2xl bg-zinc-900/95 text-white backdrop-blur-2xl border border-zinc-700/80 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-150"
            >
              <div className="flex items-center justify-between px-1 mb-2">
                <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Insert Into Note</span>
                <button 
                  type="button"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => setActiveTray('none')}
                  className="text-zinc-400 hover:text-white p-1 rounded-full text-xs"
                >
                  ✕
                </button>
              </div>
              <div className="flex flex-col gap-2">
                <div className="grid grid-cols-2 gap-2">
                  {/* Photo / Image */}
                  <button
                    type="button"
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setActiveTray('none');
                      imageInputRef.current?.click();
                    }}
                    className="flex items-center justify-center gap-2 p-2.5 rounded-xl bg-zinc-800/80 hover:bg-zinc-750 border border-zinc-700/60 active:scale-95 transition-all text-zinc-200 hover:text-white"
                  >
                    <ImageIcon size={18} className="text-blue-400" />
                    <span className="text-xs font-medium">Add Photo</span>
                  </button>

                  {/* Drawing / Sketch */}
                  <button
                    type="button"
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setActiveTray('none');
                      if (activeBlockId) {
                        const activeBlock = sortedBlocks.find(b => b.id === activeBlockId);
                        openDrawOverlay(activeBlockId, activeBlock?.type || 'block', activeBlock?.y);
                      } else {
                        startNewSketchBlock();
                      }
                    }}
                    className="flex items-center justify-center gap-2 p-2.5 rounded-xl bg-zinc-800/80 hover:bg-zinc-750 border border-zinc-700/60 active:scale-95 transition-all text-zinc-200 hover:text-white"
                  >
                    <PenTool size={18} className="text-amber-400" />
                    <span className="text-xs font-medium">Draw / Sketch</span>
                  </button>
                </div>

                {/* Audio Recording Input Source Selector */}
                {audioInputs.length > 0 && (
                  <div className="p-2 rounded-xl bg-zinc-800/60 border border-zinc-700/50 flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-1.5 text-zinc-300 truncate">
                      <Volume2 size={15} className="text-primary-400 shrink-0" />
                      <span className="text-[11px] font-medium truncate">Recording Input:</span>
                    </div>
                    <select 
                      value={selectedAudioInput} 
                      onChange={(e) => handleSelectAudioInput(e.target.value)}
                      className="bg-zinc-900 text-zinc-200 border border-zinc-700 rounded-lg px-2 py-1 text-[11px] max-w-[190px] truncate outline-none cursor-pointer"
                    >
                      <option value="">Default Microphone</option>
                      {audioInputs.map(input => (
                        <option key={input.deviceId} value={input.deviceId}>{input.label}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 2. Toggle-able Text Formatting Drawer (Samsung Notes / Word style) */}
          {activeTray === 'format' && isToolbarExpanded && mobileActiveEditor && (
            <div 
              className="mx-2 mb-1.5 p-2.5 rounded-2xl bg-zinc-900/95 text-white backdrop-blur-2xl border border-zinc-700/80 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-150 max-h-56 overflow-y-auto"
            >
              <div className="flex items-center justify-between px-1 mb-2">
                <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Text Formatting</span>
                <button 
                  type="button"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => setActiveTray('none')}
                  className="text-zinc-400 hover:text-white p-1 rounded-full text-xs"
                >
                  ✕
                </button>
              </div>

              {/* Styles: Normal, H1, H2, H3, Quote */}
              <div className="flex items-center gap-1.5 mb-2.5 overflow-x-auto no-scrollbar py-0.5">
                <button
                  type="button"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => executeFormat(() => mobileActiveEditor.chain().focus().setParagraph().run())}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    !mobileActiveEditor.isActive('heading') && !mobileActiveEditor.isActive('blockquote')
                      ? 'bg-primary-600 text-white border-primary-500'
                      : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:text-white'
                  }`}
                >
                  Normal
                </button>
                <button
                  type="button"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => executeFormat(() => mobileActiveEditor.chain().focus().toggleHeading({ level: 1 }).run())}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                    mobileActiveEditor.isActive('heading', { level: 1 })
                      ? 'bg-primary-600 text-white border-primary-500'
                      : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:text-white'
                  }`}
                >
                  H1
                </button>
                <button
                  type="button"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => executeFormat(() => mobileActiveEditor.chain().focus().toggleHeading({ level: 2 }).run())}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                    mobileActiveEditor.isActive('heading', { level: 2 })
                      ? 'bg-primary-600 text-white border-primary-500'
                      : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:text-white'
                  }`}
                >
                  H2
                </button>
                <button
                  type="button"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => executeFormat(() => mobileActiveEditor.chain().focus().toggleHeading({ level: 3 }).run())}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                    mobileActiveEditor.isActive('heading', { level: 3 })
                      ? 'bg-primary-600 text-white border-primary-500'
                      : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:text-white'
                  }`}
                >
                  H3
                </button>
                <button
                  type="button"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => executeFormat(() => mobileActiveEditor.chain().focus().toggleBlockquote().run())}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    mobileActiveEditor.isActive('blockquote')
                      ? 'bg-primary-600 text-white border-primary-500'
                      : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:text-white'
                  }`}
                >
                  Quote
                </button>
              </div>

              {/* Formatting Actions Row */}
              <div className="flex items-center gap-2 pt-2 border-t border-zinc-800">
                {/* Line & Paragraph Spacing Dropdown */}
                <div className="flex items-center gap-1.5 text-xs text-zinc-300">
                  <span className="text-[10px] uppercase font-bold text-zinc-400">Spacing:</span>
                  <LineSpacingDropdown editor={mobileActiveEditor} placement="top" dropdownWidth={240} />
                </div>

                <div className="w-px h-5 bg-zinc-700 mx-1" />

                {/* Indent / Outdent */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => executeFormat(() => executeOutdent(mobileActiveEditor))}
                    className="p-1.5 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
                    title="Outdent"
                  >
                    <OutdentIcon size={18} />
                  </button>
                  <button
                    type="button"
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => executeFormat(() => executeIndent(mobileActiveEditor))}
                    className="p-1.5 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
                    title="Indent"
                  >
                    <IndentIcon size={18} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 3. Main Keyboard Toolbar (Height ~48px, comfortable tap targets) */}
          {isToolbarExpanded ? (
            <div 
              className="h-[48px] bg-zinc-900/95 dark:bg-zinc-900/95 backdrop-blur-xl border-t border-zinc-700/80 px-2 shadow-lg flex items-center justify-between text-white"
            >
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-1">
                {/* Dedicated Voice / Audio Record Button right on the bar above keyboard */}
                <button
                  type="button"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => onToggleMeeting?.()}
                  disabled={isProcessing}
                  className={`h-9 px-2.5 rounded-lg flex items-center gap-1.5 font-semibold text-xs transition-all active:scale-95 ${
                    isRecording
                      ? 'bg-red-500/25 text-red-400 font-bold border border-red-500/50 animate-pulse'
                      : 'bg-zinc-800 text-zinc-200 hover:text-white hover:bg-zinc-750'
                  }`}
                  title={isRecording ? "Stop Recording" : "Record Audio / Meeting"}
                >
                  <Mic size={17} className={isRecording ? "text-red-500 animate-pulse" : "text-red-400"} />
                  <span>{isRecording ? "Stop" : "Record"}</span>
                </button>

                {/* Option Button 1: Insert Drawer Toggle */}
                <button
                  type="button"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => setActiveTray(prev => prev === 'insert' ? 'none' : 'insert')}
                  className={`h-9 px-2.5 rounded-lg flex items-center gap-1 font-semibold text-xs transition-all active:scale-95 ${
                    activeTray === 'insert'
                      ? 'bg-primary-600 text-white shadow-xs'
                      : 'bg-zinc-800 text-zinc-200 hover:text-white hover:bg-zinc-750'
                  }`}
                  title="Insert options"
                >
                  <Plus size={18} className={activeTray === 'insert' ? 'rotate-45 transition-transform' : 'transition-transform'} />
                  <span className="hidden sm:inline">Insert</span>
                </button>

                {/* Option Button 2: Text Format Drawer Toggle */}
                <button
                  type="button"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => setActiveTray(prev => prev === 'format' ? 'none' : 'format')}
                  className={`h-9 px-2.5 rounded-lg flex items-center gap-1 font-semibold text-xs transition-all active:scale-95 ${
                    activeTray === 'format'
                      ? 'bg-primary-600 text-white shadow-xs'
                      : 'bg-zinc-800 text-zinc-200 hover:text-white hover:bg-zinc-750'
                  }`}
                  title="Text formatting"
                >
                  <Type size={18} />
                  <span className="hidden sm:inline">Format</span>
                </button>

                <div className="w-px h-6 bg-zinc-700/80 mx-1 flex-shrink-0" />

                {/* Quick Action: Checklist */}
                {mobileActiveEditor && (
                  <button
                    type="button"
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => executeFormat(() => (mobileActiveEditor.chain().focus() as any)?.toggleTaskList().run())}
                    className={`h-9 min-w-[36px] px-2 rounded-lg flex items-center justify-center transition-all active:scale-95 ${
                      (mobileActiveEditor as any)?.isActive('taskList')
                        ? 'bg-primary-600/30 text-primary-400 font-bold border border-primary-500/50'
                        : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
                    }`}
                    title="Checklist"
                  >
                    <CheckSquare size={19} />
                  </button>
                )}

                {/* Quick Action: Bold */}
                {mobileActiveEditor && (
                  <button
                    type="button"
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => executeFormat(() => mobileActiveEditor.chain().focus().toggleBold().run())}
                    className={`h-9 min-w-[36px] px-2 rounded-lg flex items-center justify-center transition-all active:scale-95 ${
                      mobileActiveEditor.isActive('bold')
                        ? 'bg-zinc-700 text-white font-bold border border-zinc-600'
                        : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
                    }`}
                    title="Bold"
                  >
                    <Bold size={19} />
                  </button>
                )}

                {/* Quick Action: Italic */}
                {mobileActiveEditor && (
                  <button
                    type="button"
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => executeFormat(() => mobileActiveEditor.chain().focus().toggleItalic().run())}
                    className={`h-9 min-w-[36px] px-2 rounded-lg flex items-center justify-center transition-all active:scale-95 ${
                      mobileActiveEditor.isActive('italic')
                        ? 'bg-zinc-700 text-white font-bold border border-zinc-600'
                        : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
                    }`}
                    title="Italic"
                  >
                    <Italic size={19} />
                  </button>
                )}

                {/* Quick Action: Underline */}
                {mobileActiveEditor && (
                  <button
                    type="button"
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => executeFormat(() => mobileActiveEditor.chain().focus().toggleUnderline().run())}
                    className={`h-9 min-w-[36px] px-2 rounded-lg flex items-center justify-center transition-all active:scale-95 ${
                      mobileActiveEditor.isActive('underline')
                        ? 'bg-zinc-700 text-white font-bold border border-zinc-600'
                        : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
                    }`}
                    title="Underline"
                  >
                    <UnderlineIcon size={19} />
                  </button>
                )}

                {/* Quick Action: Strikethrough */}
                {mobileActiveEditor && (
                  <button
                    type="button"
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => executeFormat(() => mobileActiveEditor.chain().focus().toggleStrike().run())}
                    className={`h-9 min-w-[36px] px-2 rounded-lg flex items-center justify-center transition-all active:scale-95 ${
                      mobileActiveEditor.isActive('strike')
                        ? 'bg-zinc-700 text-white font-bold border border-zinc-600'
                        : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
                    }`}
                    title="Strikethrough"
                  >
                    <Strikethrough size={19} />
                  </button>
                )}

                {/* Quick Action: Highlight */}
                {mobileActiveEditor && (
                  <button
                    type="button"
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => executeFormat(() => {
                      if (mobileActiveEditor.isActive('highlight')) {
                        mobileActiveEditor.chain().focus().unsetHighlight().run();
                      } else {
                        mobileActiveEditor.chain().focus().setHighlight({ color: '#fef08a' }).run();
                      }
                    })}
                    className={`h-9 min-w-[36px] px-2 rounded-lg flex items-center justify-center transition-all active:scale-95 ${
                      mobileActiveEditor.isActive('highlight')
                        ? 'bg-yellow-500/25 text-yellow-300 border border-yellow-500/40'
                        : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
                    }`}
                    title="Highlight"
                  >
                    <Highlighter size={19} />
                  </button>
                )}

                {/* Quick Action: Bullet List */}
                {mobileActiveEditor && (
                  <button
                    type="button"
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => executeFormat(() => mobileActiveEditor.chain().focus().toggleBulletList().run())}
                    className={`h-9 min-w-[36px] px-2 rounded-lg flex items-center justify-center transition-all active:scale-95 ${
                      mobileActiveEditor.isActive('bulletList')
                        ? 'bg-zinc-700 text-white font-bold border border-zinc-600'
                        : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
                    }`}
                    title="Bullet List"
                  >
                    <List size={19} />
                  </button>
                )}

                {/* Quick Action: Numbered List */}
                {mobileActiveEditor && (
                  <button
                    type="button"
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => executeFormat(() => mobileActiveEditor.chain().focus().toggleOrderedList().run())}
                    className={`h-9 min-w-[36px] px-2 rounded-lg flex items-center justify-center transition-all active:scale-95 ${
                      mobileActiveEditor.isActive('orderedList')
                        ? 'bg-zinc-700 text-white font-bold border border-zinc-600'
                        : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
                    }`}
                    title="Numbered List"
                  >
                    <ListOrdered size={19} />
                  </button>
                )}
              </div>

              {/* Right side controls: Toggle Toolbar & Dismiss Keyboard */}
              <div className="flex items-center gap-1 pl-1 border-l border-zinc-800">
                {/* Toggle on/off button */}
                <button
                  type="button"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setIsToolbarExpanded(false);
                    setActiveTray('none');
                  }}
                  className="h-9 w-9 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                  title="Minimize Toolbar"
                >
                  <Minimize2 size={16} />
                </button>

                {/* Dismiss Keyboard */}
                <button
                  type="button"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => {
                    if (typeof document !== 'undefined' && document.activeElement) {
                      (document.activeElement as HTMLElement)?.blur?.();
                    }
                    setIsKeyboardOpen(false);
                    setKeyboardOffset(0);
                    setActiveTray('none');
                  }}
                  className="h-9 w-9 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                  title="Dismiss Keyboard"
                >
                  <ChevronDown size={20} />
                </button>
              </div>
            </div>
          ) : (
            /* Collapsed Toolbar Pill (User toggled it off, easily tap to restore!) */
            <div className="flex justify-end p-2 pointer-events-auto">
              <button
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => setIsToolbarExpanded(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-900/95 text-white border border-zinc-700 shadow-xl backdrop-blur-xl text-xs font-semibold active:scale-95 transition-all"
                title="Expand Toolbar"
              >
                <Type size={14} className="text-primary-400" />
                <span>Format</span>
                <ChevronUp size={14} className="opacity-70" />
              </button>
            </div>
          )}
        </div>
      )}

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
        activePageId={pageId}
        activePageTitle={pageTitle}
        isJournal={isJournal}
        onUpdatePageTitle={onUpdatePageTitle}
      />

      {/* Mobile Version History Modal */}
      {isVersionsModalOpen && (
        <div 
          className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setIsVersionsModalOpen(false)}
        >
          <div 
            className="w-full max-w-lg max-h-[85vh] bg-white dark:bg-zinc-900 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-250 border border-zinc-200 dark:border-zinc-800"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-primary-500" />
                <h3 className="font-bold text-base text-zinc-900 dark:text-white">Version History</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isTakingSnapshot}
                  onClick={async () => {
                    setIsTakingSnapshot(true);
                    try {
                      const ok = await saveManualSnapshot();
                      if (ok) {
                        toast.success("Snapshot created!");
                        await fetchVersions();
                      } else {
                        toast.error("No canvas changes to snapshot");
                      }
                    } catch {
                      toast.error("Failed to take snapshot");
                    } finally {
                      setIsTakingSnapshot(false);
                    }
                  }}
                  className="px-3 py-1.5 text-xs font-semibold rounded-full bg-primary-500 text-white hover:bg-primary-600 active:scale-95 transition-all flex items-center gap-1 shadow-sm disabled:opacity-50"
                >
                  <Plus size={14} />
                  <span>Snapshot</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsVersionsModalOpen(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Subheader */}
            <div className="px-5 py-2.5 bg-zinc-50 dark:bg-zinc-800/40 border-b border-zinc-100 dark:border-zinc-800 text-[12px] text-zinc-500 dark:text-zinc-400">
              Automatic snapshots are saved as you work. Tap a version below to restore it.
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {pageVersions.length === 0 ? (
                <div className="py-12 text-center text-zinc-400 text-sm flex flex-col items-center gap-2">
                  <Clock className="w-8 h-8 opacity-40" />
                  <p>No past snapshots recorded yet.</p>
                  <p className="text-xs text-zinc-500">Tap &quot;+ Snapshot&quot; above to capture a point in time.</p>
                </div>
              ) : (
                pageVersions.map((version) => {
                  const state = version.document_state || {};
                  const textCount = state.texts?.length || 0;
                  const strokeCount = state.strokes?.length || 0;
                  const audioCount = state.audios?.length || 0;
                  const imgCount = state.images?.length || 0;

                  return (
                    <div
                      key={version.id}
                      className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/80 dark:border-zinc-700/60 flex items-center justify-between gap-3 hover:border-primary-500/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm text-zinc-900 dark:text-white truncate">
                          {format(new Date(version.created_at), "MMM d, yyyy 'at' h:mm:ss a")}
                        </div>
                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 flex items-center gap-2 flex-wrap">
                          {textCount > 0 && <span>{textCount} {textCount === 1 ? 'text' : 'texts'}</span>}
                          {strokeCount > 0 && <span>• {strokeCount} strokes</span>}
                          {audioCount > 0 && <span>• {audioCount} audio</span>}
                          {imgCount > 0 && <span>• {imgCount} images</span>}
                          {textCount === 0 && strokeCount === 0 && audioCount === 0 && imgCount === 0 && (
                            <span>Empty canvas</span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          restoreVersion(version.document_state);
                          setIsVersionsModalOpen(false);
                          toast.success("Restored previous version. (You can undo if needed)");
                        }}
                        className="px-3.5 py-1.5 rounded-xl bg-white dark:bg-zinc-700 text-primary-600 dark:text-primary-300 font-semibold text-xs border border-zinc-200 dark:border-zinc-600 shadow-xs hover:bg-primary-50 dark:hover:bg-zinc-600 active:scale-95 transition-all flex items-center gap-1.5"
                      >
                        <RotateCcw size={13} />
                        <span>Restore</span>
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-center text-[11px] text-zinc-400">
              Tiered retention: 10 today · 5/day this week · 1/day up to 60 days
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
