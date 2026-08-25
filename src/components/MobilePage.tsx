"use client";

import React, { useMemo, useEffect, useState, useRef } from "react";
import { useCanvasData } from "@/hooks/useCanvasData";
import { v4 as uuidv4 } from "uuid";
import { TipTapEditor } from "./TipTapEditor";
import { Trash2, Plus, File, Download, ChevronLeft, Image as ImageIcon, Mic, PenTool, MoreHorizontal, ChevronUp, ChevronDown, GripVertical, Check, BookOpen, Calendar, Clock, Flame, MessageCircle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";
import { SettingsModal } from "./SettingsModal";
import { MobileAudioCard } from "./MobileAudioCard";
import { MobileDrawOverlay } from "./MobileDrawOverlay";
import { uploadMediaFile } from "@/lib/storage";
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
  isProcessing?: boolean;
  onToggleMeeting?: () => void;
  onOpenSettings?: () => void;
  isJournal?: boolean;
}

export function MobilePage({ pageId, pageTitle, pageCreatedAt, onUpdatePageTitle, onBack, isRecording, isProcessing, onToggleMeeting, onOpenSettings, isJournal }: MobilePageProps) {
  const { loading, strokes, setStrokes, texts, setTexts, audios, setAudios, images, setImages, files, setFiles, videos, setVideos } = useCanvasData(pageId);
  const [bottomY, setBottomY] = useState(0);
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

  // Virtual Keyboard / Viewport tracking for flush dock attachment
  // Virtual Keyboard & Viewport tracking for seamless accessory attachment
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

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
        if (!isEditable(document.activeElement)) {
          setIsKeyboardOpen(false);
          setKeyboardOffset(0);
        }
      }, 120);
    };

    const updateViewport = () => {
      if (!window.visualViewport) return;
      const offset = window.innerHeight - (window.visualViewport.height + window.visualViewport.offsetTop);
      const isViewportShrunk = offset > 40 || (window.screen.height - window.visualViewport.height > 180);
      
      if (isEditable(document.activeElement) || isViewportShrunk) {
        setIsKeyboardOpen(true);
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
        ? (sortedBlocks.length > 0 ? Math.min(...sortedBlocks.map(b => b.y ?? 0)) - 200 : 0)
        : bottomY;
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
        audioCreatedAt?: number;
        audioExpiresAt?: number;
        isAudioSavedPermanently?: boolean;
      }>;
      const { id, summary, transcript, url, audioCreatedAt, audioExpiresAt, isAudioSavedPermanently } = customEvent.detail;
      setAudios(prev => prev.map(audio => {
        if (audio.id === id) {
          return { 
            ...audio, 
            summary, 
            transcript, 
            isLiveRecording: false, 
            isTranscribing: false, 
            url: url !== undefined ? url : audio.url,
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
      const result = await uploadMediaFile(file, pageId);
      const publicUrl = result.url;

      setImages(prev => [...(prev || []), {
        id: uuidv4(),
        x: 50,
        y: bottomY,
        url: publicUrl
      }]);
      toast.success(`Image uploaded (${result.storage === 'r2' ? 'Cloudflare R2' : 'Storage'})!`, { id: toastId });
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

  useEffect(() => {
    if (sortedBlocks.length > 0) {
      setBottomY(sortedBlocks[sortedBlocks.length - 1].y + 200);
    } else {
      setBottomY(100);
    }
  }, [sortedBlocks]);

  const addTextBlock = () => {
    const targetY = isJournal 
      ? (sortedBlocks.length > 0 ? Math.min(...sortedBlocks.map(b => b.y ?? 0)) - 200 : 0)
      : bottomY;
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

  return (
    <div 
      className={`fixed inset-0 w-full h-[100dvh] flex flex-col overflow-hidden select-none ${
        pageColor === 'default' ? 'bg-white dark:bg-black' : ''
      }`}
      style={{
        backgroundColor: pageColor === 'default' ? undefined : pageColor
      }}
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
              onClick={onBack}
              className="pointer-events-auto flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/75 dark:bg-zinc-900/75 backdrop-blur-2xl border border-white/50 dark:border-white/10 shadow-lg shadow-black/5 dark:shadow-black/40 ring-1 ring-black/5 dark:ring-white/5 text-primary-600 dark:text-primary-400 font-semibold text-sm active:scale-95 transition-all"
              title="Back to Folders"
            >
              <ChevronLeft size={19} className="-ml-1" />
              <span>Folders</span>
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
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 64px)'
        }}
        onClick={() => setActiveBlockId(null)}
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
        </div>

        {/* Linear feed of blocks */}
        <div className="flex flex-col gap-6 w-full px-5 pb-32 relative z-10 min-h-full">
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
                    style={{
                      minHeight: strokeExtent.hasStrokes ? Math.max(50, strokeExtent.maxY + 24) : undefined,
                      marginTop: strokeExtent.hasStrokes && strokeExtent.minY < -4 ? Math.abs(strokeExtent.minY) + 8 : undefined,
                      backgroundImage: backgroundStyle === 'ruled'
                        ? `linear-gradient(transparent 0px, transparent 31px, var(--line-color, rgba(161, 161, 170, 0.25)) 31px, var(--line-color, rgba(161, 161, 170, 0.25)) 32px)`
                        : undefined,
                      backgroundSize: backgroundStyle === 'ruled' ? '100% 32px' : undefined,
                    }}
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
                        setTexts(prev => prev.filter(t => t.id !== block.id));
                      }}
                      setActiveEditor={(editor) => {
                        if (editor) setIsKeyboardOpen(true);
                      }}
                      onBlurText={() => {
                        setTimeout(() => {
                          const active = document.activeElement;
                          const isStillEditing = active && (
                            active.tagName === 'INPUT' || 
                            active.tagName === 'TEXTAREA' || 
                            (active as HTMLElement).isContentEditable ||
                            Boolean(active.closest('.ProseMirror'))
                          );
                          if (!isStillEditing) {
                            setIsKeyboardOpen(false);
                            setKeyboardOffset(0);
                          }
                        }, 120);
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
                      <img src={block.url} alt="Canvas Image" className="w-full h-auto object-contain" />
                    </div>
                    
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
          style={{ bottom: 'max(2px, calc(env(safe-area-inset-bottom, 0px) * 0.12))' }}
        >
          <div className="pointer-events-auto flex items-center gap-8 px-6 py-0.5 rounded-full bg-black/[0.08] dark:bg-white/[0.08] backdrop-blur-md border border-black/10 dark:border-white/15 shadow-sm transition-all">
            <input 
              type="file" 
              ref={imageInputRef} 
              onChange={handleFileUpload} 
              accept="image/*" 
              className="hidden" 
            />
            
            <button 
              onClick={() => imageInputRef.current?.click()} 
              className="p-1 text-zinc-800 dark:text-zinc-100 hover:text-black dark:hover:text-white active:scale-90 transition-all rounded-full hover:bg-black/5 dark:hover:bg-white/10"
              title="Add Photo / Image"
            >
              <ImageIcon size={22} />
            </button>

            <button 
              onClick={onToggleMeeting}
              disabled={isProcessing}
              className={`p-1 transition-all rounded-full active:scale-90 ${
                isRecording 
                  ? 'text-red-500 animate-pulse bg-red-500/20' 
                  : 'text-zinc-800 dark:text-zinc-100 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10'
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
              className={`p-1 transition-all rounded-full active:scale-90 relative ${
                activeBlockId 
                  ? 'text-primary-600 dark:text-primary-400 bg-primary-500/20 dark:bg-primary-400/20 ring-1 ring-primary-500/40' 
                  : 'text-zinc-800 dark:text-zinc-100 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10'
              }`}
              title={activeBlockId ? "Annotate Selected Block" : "New Sketch Block"}
            >
              <PenTool size={22} />
              {activeBlockId && (
                <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-primary-500 animate-pulse" />
              )}
            </button>
          </div>
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
    </div>
  );
}
