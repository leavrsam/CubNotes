"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { v4 as uuidv4 } from "uuid";
import { createClient } from "@/lib/supabase/client";
import debounce from "lodash/debounce";
import { format } from "date-fns";
import { getStroke } from "perfect-freehand";
import { Pen, Type, Hand, MousePointer2, Bold, Italic, Underline as UnderlineIcon, Highlighter, AlignLeft, AlignCenter, AlignRight, Heading1, Heading2, List, ListOrdered, Image as ImageIcon, File as FileIcon, Video, Table as TableIcon, ChevronDown, Mic, Square, BookOpen, Flame, RotateCw, Sparkles, ArrowRight } from "lucide-react";
import { Editor } from "@tiptap/react";
import { SpatialCanvas } from "./SpatialCanvas";
import { RichTextOverlay } from "./RichTextOverlay";
import { AudioOverlay } from "./AudioOverlay";
import { MediaOverlay } from "./MediaOverlay";
import { Minimap } from "./Minimap";
import { uploadMediaFile } from "@/lib/storage";

interface CustomCanvasProps {
  pageId: string;
  pageTitle: string;
  pageCreatedAt: string;
  onUpdatePageTitle: (title: string) => void;
  headerControls?: React.ReactNode;
  isJournal?: boolean;
}

export type Stroke = {
  id: string;
  points: number[][]; // [x, y, pressure][]
  color: string;
  size: number;
  type?: 'highlighter' | 'eraser' | 'pen';
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  blockId?: string; // Links local strokes to specific blocks
  blockY?: number; // The absolute vertical position in the block feed
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
  notes?: string;
  enhancedNotes?: string;
  chatHistory?: { role: 'user' | 'assistant', text: string }[];
  isLiveRecording?: boolean;
  isTranscribing?: boolean;
  recordingStartedAt?: number;
  audioCreatedAt?: number;
  audioExpiresAt?: number;
  isAudioSavedPermanently?: boolean;
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
export type RibbonTab = "Home" | "Insert" | "Record" | "Draw" | "History" | "View";

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
import { useMinimapSettings } from "@/hooks/useMinimapSettings";
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

const JOURNAL_PROMPTS = [
  "What gave you energy or brought you clarity today?",
  "What is something you are genuinely grateful for right now?",
  "What was a challenge you navigated, and what did it teach you?",
  "What is one insight, lesson, or idea that caught your attention?",
  "What is currently on your mind as you start this entry?",
  "Who was someone that made a positive impact on your day?",
  "What is a small win or quiet moment worth remembering?",
  "What is something you would like to focus on tomorrow?"
];

const MOOD_OPTIONS = [
  { id: 'focused', label: 'Focused' },
  { id: 'calm', label: 'Calm' },
  { id: 'reflective', label: 'Reflective' },
  { id: 'grateful', label: 'Grateful' },
  { id: 'energized', label: 'Energized' },
  { id: 'fatigued', label: 'Fatigued' }
];

export function CustomCanvas({ pageId, pageTitle, pageCreatedAt, onUpdatePageTitle, headerControls, isJournal }: CustomCanvasProps) {
  const { 
    loading, strokes, setStrokes, texts, setTexts, audios, setAudios, 
    images, setImages, files, setFiles, videos, setVideos,
    undo, redo, canUndo, canRedo,
    pageVersions, fetchVersions, restoreVersion
  } = useCanvasData(pageId);

  // Journal Prompt & Mood State
  const [currentPromptIdx, setCurrentPromptIdx] = useState(0);
  const [selectedMood, setSelectedMood] = useState<string | null>(null);

  const streakCount = useMemo(() => {
    if (!isJournal) return 1;
    const dates = new Set<string>();
    texts.forEach(() => dates.add(format(new Date(), 'yyyy-MM-dd')));
    audios.forEach(a => dates.add(format(new Date(a.audioCreatedAt || a.recordingStartedAt || Date.now()), 'yyyy-MM-dd')));
    
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
  }, [texts, audios, isJournal]);

  const handleAnswerPrompt = (promptText: string) => {
    const minExistingY = texts.length > 0 ? Math.min(...texts.map(t => t.y)) : 350;
    const targetY = minExistingY - 200;
    const newNode: TextNode = {
      id: uuidv4(),
      x: 64,
      y: targetY,
      width: 500,
      content: `<h3>${promptText}</h3><p></p>`
    };
    setTexts(prev => [newNode, ...prev]);
    toast.success("Prompt inserted into your journal!", { id: "prompt-insert" });
  };

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
  const [eraserSize, setEraserSize] = useState<number>(10);
  const [isEraserMenuOpen, setIsEraserMenuOpen] = useState(false);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isVersionsMenuOpen, setIsVersionsMenuOpen] = useState(false);
  const [annotateBlockId, setAnnotateBlockId] = useState<string | null>(null);

  const blockOffsetMap = useMemo(() => {
    const map: Record<string, {x: number, y: number}> = {};
    const allBlocks = [...(texts || []), ...(audios || []), ...(images || []), ...(videos || []), ...(files || [])];
    allBlocks.forEach(b => {
      map[b.id] = { x: b.x, y: b.y };
    });
    return map;
  }, [texts, audios, images, videos, files]);

  // Selection dragging state
  const originalSelectionRef = useRef<{
    strokes: any[];
    texts: any[];
    images: any[];
    videos: any[];
    files: any[];
    audios: any[];
  } | null>(null);

  const handleDragSelectionStart = useCallback((draggedId: string) => {
    const activeIds = selectedIds.includes(draggedId) ? selectedIds : [draggedId];
    if (!selectedIds.includes(draggedId)) {
      setSelectedIds([draggedId]);
    }

    originalSelectionRef.current = {
      strokes: strokes.filter(s => activeIds.includes(s.id)),
      texts: texts.filter(t => activeIds.includes(t.id)),
      images: images.filter(i => activeIds.includes(i.id)),
      videos: videos.filter(v => activeIds.includes(v.id)),
      files: files.filter(f => activeIds.includes(f.id)),
      audios: audios.filter(a => activeIds.includes(a.id))
    };
  }, [selectedIds, strokes, texts, images, videos, files, audios]);

  const handleDragSelectionMove = useCallback((deltaX: number, deltaY: number) => {
    const orig = originalSelectionRef.current;
    if (!orig) return;

    if (orig.strokes.length > 0) {
      setStrokes(prev => prev.map(s => {
        const origStroke = orig.strokes.find(os => os.id === s.id);
        if (origStroke) {
          return { ...origStroke, points: origStroke.points.map((p: any) => [p[0] + deltaX, p[1] + deltaY, p[2]]) };
        }
        return s;
      }));
    }
    
    if (orig.texts.length > 0) setTexts(prev => prev.map(t => orig.texts.find(ot => ot.id === t.id) ? { ...t, x: orig.texts.find(ot => ot.id === t.id).x + deltaX, y: orig.texts.find(ot => ot.id === t.id).y + deltaY } : t));
    if (orig.images.length > 0) setImages(prev => prev.map(i => orig.images.find(oi => oi.id === i.id) ? { ...i, x: orig.images.find(oi => oi.id === i.id).x + deltaX, y: orig.images.find(oi => oi.id === i.id).y + deltaY } : i));
    if (orig.videos.length > 0) setVideos(prev => prev.map(v => orig.videos.find(ov => ov.id === v.id) ? { ...v, x: orig.videos.find(ov => ov.id === v.id).x + deltaX, y: orig.videos.find(ov => ov.id === v.id).y + deltaY } : v));
    if (orig.files.length > 0) setFiles(prev => prev.map(f => orig.files.find(of => of.id === f.id) ? { ...f, x: orig.files.find(of => of.id === f.id).x + deltaX, y: orig.files.find(of => of.id === f.id).y + deltaY } : f));
    if (orig.audios.length > 0) setAudios(prev => prev.map(a => orig.audios.find(oa => oa.id === a.id) ? { ...a, x: orig.audios.find(oa => oa.id === a.id).x + deltaX, y: orig.audios.find(oa => oa.id === a.id).y + deltaY } : a));
  }, [setStrokes, setTexts, setImages, setVideos, setFiles, setAudios]);

  const handleDragSelectionEnd = useCallback(() => {
    originalSelectionRef.current = null;
  }, []);

  const handleLassoComplete = useCallback((minX: number, maxX: number, minY: number, maxY: number, path: number[][]) => {
    const foundIds: string[] = [];

    // Find strokes
    strokes.forEach(stroke => {
      if (stroke.points.some((p: any) => p[0] >= minX && p[0] <= maxX && p[1] >= minY && p[1] <= maxY)) {
        foundIds.push(stroke.id);
      }
    });

    // Find texts
    texts.forEach(t => {
      // Approximate bounding box center for selection
      if (t.x >= minX && t.x <= maxX && t.y >= minY && t.y <= maxY) {
        foundIds.push(t.id);
      }
    });

    // Find images
    images?.forEach(i => {
      if (i.x >= minX && i.x <= maxX && i.y >= minY && i.y <= maxY) {
        foundIds.push(i.id);
      }
    });

    // Find videos
    videos?.forEach(v => {
      if (v.x >= minX && v.x <= maxX && v.y >= minY && v.y <= maxY) {
        foundIds.push(v.id);
      }
    });

    // Find files
    files?.forEach(f => {
      if (f.x >= minX && f.x <= maxX && f.y >= minY && f.y <= maxY) {
        foundIds.push(f.id);
      }
    });

    // Find audios
    audios?.forEach(a => {
      if (a.x >= minX && a.x <= maxX && a.y >= minY && a.y <= maxY) {
        foundIds.push(a.id);
      }
    });

    if (foundIds.length > 0) {
      setSelectedIds(foundIds);
      setTool('home'); // Switch to home tool so selection UI becomes visible and interactable
    } else {
      setSelectedIds([]);
    }
  }, [strokes, texts, images, videos, files, audios]);

  // Active Tool and Ribbon
  const [tool, setTool] = useState<ToolType>("home");
  const [activeTab, setActiveTab] = useState<RibbonTab>("Home");
  const [isRibbonExpanded, setIsRibbonExpanded] = useState(true);
  const [activeEditor, setActiveEditor] = useState<Editor | null>(null);

  const handleAnnotateBlock = useCallback((id: string) => {
    setAnnotateBlockId(id);
    setTool('pen');
    setActiveTab('Draw');
  }, []);

  useEffect(() => {
    if (tool !== 'pen' && tool !== 'highlighter' && tool !== 'eraser') {
      setAnnotateBlockId(null);
    }
  }, [tool]);
  const [editorUpdateTick, setEditorUpdateTick] = useState(0);

  // Viewport state
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);

  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  // Audio Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const { showMinimap, setShowMinimap } = useMinimapSettings();

  const getCanvasCenter = useCallback(() => {
    const screenCenterX = window.innerWidth / 2;
    const screenCenterY = window.innerHeight / 2;
    return {
      x: (screenCenterX - pan.x) / zoom,
      y: (screenCenterY - pan.y) / zoom
    };
  }, [pan, zoom]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'file' | 'image' | 'audio') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const toastId = toast.loading(`Uploading ${type}...`);
    try {
      const result = await uploadMediaFile(file, pageId);
      const publicUrl = result.url;
      const center = getCanvasCenter();
      
      if (type === 'image') {
        setImages(prev => [...(prev || []), {
          id: uuidv4(),
          x: center.x - 200, // Approximate centering for a 400px image
          y: center.y - 150,
          url: publicUrl
        }]);
      } else if (type === 'audio') {
        setAudios(prev => [...(prev || []), {
          id: uuidv4(),
          x: center.x - 160, // 320px wide player
          y: center.y - 40,
          url: publicUrl,
          title: file.name
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
      toast.success(`${type} uploaded (${result.storage === 'r2' ? 'Cloudflare R2' : 'Storage'})!`, { id: toastId });
    } catch (error: any) {
      toast.error(`Upload failed: ${error.message}`, { id: toastId });
    } finally {
      e.target.value = ''; // Reset input
    }
  };

  const activeRecordingNodeIdRef = useRef<string | null>(null);

  // Recording Logic
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1, // Mono voice capture
          noiseSuppression: true,
          echoCancellation: true,
          autoGainControl: true,
        },
      });

      const mimeType = typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 28000, // 28 kbps Opus = crystal clear speech at ~12 MB/hr
      });

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      const center = getCanvasCenter();
      const nodeId = uuidv4();
      activeRecordingNodeIdRef.current = nodeId;

      // Spawn Audio Card immediately so user can type notes in real-time
      setAudios(prev => [...(prev || []), {
        id: nodeId,
        x: center.x - 220,
        y: isJournal ? 80 : center.y - 100,
        width: 500,
        url: "",
        title: isJournal ? `Journal Entry - ${format(new Date(), 'MMM d, yyyy')}` : `Meeting Note - ${format(new Date(), 'MMM d, yyyy')}`,
        summary: "",
        transcript: "",
        notes: "",
        isLiveRecording: true,
        recordingStartedAt: Date.now(),
        audioCreatedAt: Date.now(),
        audioExpiresAt: isJournal ? undefined : Date.now() + 7 * 24 * 60 * 60 * 1000,
        isAudioSavedPermanently: isJournal ? true : false,
      }]);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await uploadAndTranscribeRecording(audioBlob, nodeId);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setIsPaused(false);
      setRecordingDuration(0);

      timerIntervalRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);

    } catch (err) {
      console.error("Error accessing microphone:", err);
      toast.error("Could not access microphone.");
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "paused") {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      timerIntervalRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    }
  };

  const uploadAndTranscribeRecording = async (audioBlob: Blob, existingNodeId?: string) => {
    const toastId = toast.loading("Processing meeting with Gemini...");
    setIsTranscribing(true);
    const nodeId = existingNodeId || activeRecordingNodeIdRef.current || uuidv4();

    // Mark node as transcribing
    setAudios(prev => prev.map(a => a.id === nodeId ? { ...a, isLiveRecording: false, isTranscribing: true } : a));

    try {
      // 1. Upload audio to Cloudflare R2 (or fallback)
      const audioFile = new File([audioBlob], `meeting_${Date.now()}.webm`, { type: 'audio/webm' });
      const uploadResult = await uploadMediaFile(audioFile, pageId);
      const audioUrl = uploadResult.url;

      // 2. Call Edge Function for Transcription/Summary
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      
      const base64Data = await new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          const base64String = (reader.result as string).split(',')[1];
          resolve(base64String);
        };
        reader.onerror = reject;
      });

      const { data: edgeData, error: edgeError } = await supabase.functions.invoke('summarize-meeting', {
        body: { audioBase64: base64Data, mimeType: 'audio/webm', isJournal: Boolean(isJournal) }
      });

      if (edgeError || (edgeData && edgeData.success === false)) {
        const actualError = edgeData?.error || edgeError;
        console.error("============= EDGE FUNCTION ERROR =============");
        console.error(actualError);
        console.error("===============================================");
        throw new Error(String(actualError));
      }

      const transcript = edgeData?.transcript || "Transcript not available.";
      const summary = edgeData?.summary || "Summary not available.";

      const audioCreatedAt = Date.now();
      const audioExpiresAt = isJournal ? undefined : audioCreatedAt + 7 * 24 * 60 * 60 * 1000;
      const isAudioSavedPermanently = isJournal ? true : false;

      setAudios(prev => prev.map(audio => {
        if (audio.id === nodeId) {
          return { 
            ...audio, 
            transcript, 
            summary, 
            isLiveRecording: false, 
            isTranscribing: false, 
            url: audioUrl,
            audioCreatedAt,
            audioExpiresAt,
            isAudioSavedPermanently: isAudioSavedPermanently ?? audio.isAudioSavedPermanently ?? false,
          };
        }
        return audio;
      }));

      // Sync embedding for semantic search
      const center = getCanvasCenter();
      fetch('/api/sync-embedding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          id: nodeId, 
          content: summary + "\n\n" + transcript, 
          type: 'meeting_summary',
          metadata: { pageId, x: center.x - 200, y: center.y - 100 }
        })
      }).catch(err => console.error("Failed to sync audio embedding", err));

      toast.success("Meeting note generated!", { id: toastId });

    } catch (error: any) {
      setAudios(prev => prev.map(a => a.id === nodeId ? { ...a, isLiveRecording: false, isTranscribing: false } : a));
      toast.error(`Recording processing failed: ${error.message}`, { id: toastId });
    } finally {
      setIsTranscribing(false);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
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
    const handleStartRecordingNode = (e: Event) => {
      const customEvent = e as CustomEvent<{ id: string }>;
      const { id } = customEvent.detail;
      const center = getCanvasCenter();
      setAudios(prev => {
        if (prev.some(a => a.id === id)) return prev;
        return [...(prev || []), {
          id,
          url: "",
          x: center.x - 220,
          y: center.y - 100,
          width: 500,
          title: `Meeting Note - ${format(new Date(), 'MMM d, yyyy')}`,
          summary: "",
          transcript: "",
          notes: "",
          isLiveRecording: true,
          recordingStartedAt: Date.now()
        }];
      });
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

    const handleJumpToCoordinates = (e: Event) => {
      const customEvent = e as CustomEvent<{ x: number, y: number }>;
      const { x, y } = customEvent.detail;
      
      const screenCenterX = window.innerWidth / 2;
      const screenCenterY = window.innerHeight / 2;
      
      setPan({
        x: screenCenterX - x * zoom,
        y: screenCenterY - y * zoom
      });
    };

    window.addEventListener('start-recording-node', handleStartRecordingNode);
    window.addEventListener('inject-transcribing', handleInjectTranscribing);
    window.addEventListener('inject-summary', handleInjectSummary);
    window.addEventListener('inject-audio', handleInjectAudio);
    window.addEventListener('jump-to-coordinates', handleJumpToCoordinates);

    return () => {
      window.removeEventListener('start-recording-node', handleStartRecordingNode);
      window.removeEventListener('inject-transcribing', handleInjectTranscribing);
      window.removeEventListener('inject-summary', handleInjectSummary);
      window.removeEventListener('inject-audio', handleInjectAudio);
      window.removeEventListener('jump-to-coordinates', handleJumpToCoordinates);
    };
  }, [getCanvasCenter, setAudios, setPan, zoom]);

  const getSelectionBounds = useCallback(() => {
    if (selectedIds.length === 0) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    const updateBounds = (x: number, y: number, w: number, h: number) => {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x + w > maxX) maxX = x + w;
      if (y + h > maxY) maxY = y + h;
    };

    selectedIds.forEach(id => {
      const stroke = strokes?.find(s => s.id === id);
      if (stroke) {
        let sMinX = Infinity;
        let sMinY = Infinity;
        let sMaxX = -Infinity;
        let sMaxY = -Infinity;
        stroke.points.forEach(p => {
          if (p[0] < sMinX) sMinX = p[0];
          if (p[1] < sMinY) sMinY = p[1];
          if (p[0] > sMaxX) sMaxX = p[0];
          if (p[1] > sMaxY) sMaxY = p[1];
        });
        updateBounds(sMinX + (stroke.x || 0), sMinY + (stroke.y || 0), sMaxX - sMinX, sMaxY - sMinY);
      }
      
      const text = texts?.find(t => t.id === id);
      if (text) updateBounds(text.x, text.y, text.width || 200, 100);

      const image = images?.find(i => i.id === id);
      if (image) updateBounds(image.x, image.y, image.width || 400, image.height || 300);
      
      const file = files?.find(f => f.id === id);
      const audio = audios?.find(a => a.id === id);
      if (audio) updateBounds(audio.x, audio.y, audio.width || 400, 100);
      
      const video = videos?.find(v => v.id === id);
      if (video) updateBounds(video.x, video.y, video.width || 480, video.height || 270);
    });

    if (minX === Infinity) return null;

    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }, [selectedIds, strokes, texts, images, files, audios, videos]);

  const handleOrganize = async () => {
    if (selectedIds.length < 2) return;
    
    const toastId = toast.loading("Organizing chaos...");
    try {
      // Gather data
      const selectedTexts = texts.filter(t => selectedIds.includes(t.id));
      const selectedAudios = audios.filter(a => selectedIds.includes(a.id));
      const selectedStrokes = strokes.filter(s => selectedIds.includes(s.id));
      
      let imageNodes: string[] = [];

      if (selectedStrokes.length > 0) {
        const bounds = getSelectionBounds();
        if (bounds) {
          const canvas = document.createElement('canvas');
          const padding = 20;
          canvas.width = bounds.width + padding * 2;
          canvas.height = bounds.height + padding * 2;
          const ctx = canvas.getContext('2d');
          
          if (ctx) {
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            ctx.translate(-bounds.x + padding, -bounds.y + padding);

            selectedStrokes.forEach(stroke => {
              const outlinePoints = getStroke(stroke.points, {
                size: stroke.size || 4,
                thinning: 0.5,
                smoothing: 0.5,
                streamline: 0.5,
              });
              const pathData = getSvgPathFromStroke(outlinePoints);
              const p = new Path2D(pathData);
              ctx.fillStyle = stroke.color || '#000000';
              ctx.save();
              ctx.translate(stroke.x || 0, stroke.y || 0);
              ctx.fill(p);
              ctx.restore();
            });

            const dataUrl = canvas.toDataURL('image/png');
            imageNodes.push(dataUrl);
          }
        }
      }
      
      const promptData = {
        textNodes: selectedTexts.map(t => t.content),
        audioSummaries: selectedAudios.map(a => a.summary),
        imageNodes
      };

      if (promptData.textNodes.length === 0 && promptData.audioSummaries.length === 0 && promptData.imageNodes.length === 0) {
        toast.error("Select at least one block to organize.", { id: toastId });
        return;
      }

      const res = await fetch('/api/organize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(promptData)
      });

      if (!res.ok) throw new Error("Failed to organize");
      const { organizedHtml } = await res.json();

      // Replace selected texts and audios with one big text node
      const bounds = getSelectionBounds();
      
      const newTextNode: TextNode = {
        id: uuidv4(),
        x: bounds ? bounds.x : window.innerWidth / 2,
        y: bounds ? bounds.y : window.innerHeight / 2,
        width: Math.max(bounds ? bounds.width : 400, 400),
        content: organizedHtml
      };

      // Remove the old ones
      setTexts(prev => prev.filter(t => !selectedIds.includes(t.id)));
      setAudios(prev => prev.filter(a => !selectedIds.includes(a.id)));
      setStrokes(prev => prev.filter(s => !selectedIds.includes(s.id))); // Clear associated scribbles

      setTexts(prev => [...prev, newTextNode]);
      setSelectedIds([newTextNode.id]); // Select the new node
      
      // Sync embedding for semantic search
      fetch('/api/sync-embedding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          id: newTextNode.id, 
          content: newTextNode.content, 
          type: 'text',
          metadata: { pageId, x: newTextNode.x, y: newTextNode.y }
        })
      }).catch(err => console.error("Failed to sync organized text embedding", err));

      toast.success("Chaos organized!", { id: toastId });
    } catch (err) {
      toast.error("Failed to organize chaos.", { id: toastId });
    }
  };

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

  // Keyboard Shortcuts for Undo/Redo and Deletion
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInputFocused = activeEl && (
        activeEl.tagName === 'INPUT' || 
        activeEl.tagName === 'TEXTAREA' || 
        (activeEl as HTMLElement).isContentEditable
      );

      if (!isInputFocused && (e.key === 'Delete' || e.key === 'Backspace')) {
        if (selectedIds.length > 0) {
          e.preventDefault();
          setStrokes(prev => prev.filter(s => !selectedIds.includes(s.id)));
          setTexts(prev => prev.filter(t => !selectedIds.includes(t.id)));
          if (setImages) setImages(prev => prev.filter(i => !selectedIds.includes(i.id)));
          if (setVideos) setVideos(prev => prev.filter(v => !selectedIds.includes(v.id)));
          if (setFiles) setFiles(prev => prev.filter(f => !selectedIds.includes(f.id)));
          if (setAudios) setAudios(prev => prev.filter(a => !selectedIds.includes(a.id)));
          setSelectedIds([]);
        }
      }

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, selectedIds, setStrokes, setTexts, setImages, setVideos, setFiles, setAudios, setSelectedIds]);

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
        <div className="flex items-end px-2 pt-1 gap-4">
          
          {/* Inject headerControls here on the left */}
          {headerControls && (
            <div className="flex items-center pb-1 mr-2 gap-1 border-r border-zinc-300 dark:border-zinc-700 pr-2">
              {headerControls}
            </div>
          )}

          <div className="flex gap-1">
            {(["Home", "Insert", "Record", "Draw", "History", "View"] as RibbonTab[]).map(tab => (
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

          <div className="flex items-center gap-1 mb-1 border-l border-zinc-300 dark:border-zinc-700 pl-4">
            <button
              onClick={undo}
              disabled={!canUndo}
              className={`p-1.5 rounded-md transition-colors ${canUndo ? 'text-zinc-700 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/10' : 'text-zinc-400 dark:text-zinc-600 cursor-not-allowed opacity-50'}`}
              title="Undo (Ctrl+Z)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              className={`p-1.5 rounded-md transition-colors ${canRedo ? 'text-zinc-700 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/10' : 'text-zinc-400 dark:text-zinc-600 cursor-not-allowed opacity-50'}`}
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
            
            {activeTab === "Record" && (
              <div className="flex items-center gap-4 h-full py-1">
                <input type="file" ref={audioInputRef} accept="audio/*" className="hidden" onChange={(e) => handleFileUpload(e, 'audio')} />
                
                <div className="flex items-center h-full gap-2">
                  {!isRecording ? (
                    <button
                      onClick={startRecording}
                      className="flex flex-col items-center justify-center h-full px-4 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-primary-600 dark:text-primary-400 font-semibold"
                    >
                      <Mic size={18} strokeWidth={2} />
                      <span className="text-[11px] font-bold mt-1 flex items-center gap-1">
                        Start Meeting ✨
                      </span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-1 bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded">
                      <button
                        onClick={stopRecording}
                        className="flex flex-col items-center justify-center h-full px-3 rounded hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors text-red-500"
                      >
                        <Square size={16} strokeWidth={2} className="fill-current animate-pulse" />
                        <span className="text-[10px] font-bold mt-0.5">Stop</span>
                      </button>

                      {isPaused ? (
                        <button
                          onClick={resumeRecording}
                          className="flex flex-col items-center justify-center h-full px-3 rounded hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors text-red-500"
                        >
                          <Mic size={16} strokeWidth={2} className="fill-current" />
                          <span className="text-[10px] font-bold mt-0.5">Resume</span>
                        </button>
                      ) : (
                        <button
                          onClick={pauseRecording}
                          className="flex flex-col items-center justify-center h-full px-3 rounded hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors text-red-500"
                        >
                          <div className="flex gap-0.5">
                            <div className="w-1 h-3.5 bg-current rounded-sm"></div>
                            <div className="w-1 h-3.5 bg-current rounded-sm"></div>
                          </div>
                          <span className="text-[10px] font-bold mt-0.5 pt-0.5">Pause</span>
                        </button>
                      )}

                      <div className="px-2 font-mono text-red-500 text-sm font-bold min-w-[50px] text-center">
                        {formatTime(recordingDuration)}
                      </div>
                    </div>
                  )}

                  <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-700" />
                  
                  <button
                    onClick={() => audioInputRef.current?.click()}
                    className="flex flex-col items-center justify-center h-full px-3 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
                  >
                    <FileIcon size={16} strokeWidth={2} />
                    <span className="text-[10px] font-medium mt-0.5">Upload Audio File</span>
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
                    onClick={() => setTool("home")}
                    className={`flex flex-col items-center justify-center h-full px-2 rounded ${tool === "home" ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300'}`}
                    title="Select / Pan"
                  >
                    <MousePointer2 size={16} strokeWidth={2} className="mb-0.5" />
                    <span className="text-[10px] font-medium leading-none">Select</span>
                  </button>
                  <button
                    onClick={() => setTool(tool === "lasso" ? "home" : "lasso")}
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
                      onClick={() => setTool(tool === "eraser" ? "home" : "eraser")}
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
                        <div className="w-full h-px bg-zinc-200 dark:bg-zinc-800 my-1"></div>
                        <div className="px-3 py-1 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Point Size</div>
                        {[5, 10, 20, 40, 80].map(size => (
                          <button 
                            key={size}
                            className="text-left px-3 py-1.5 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-between"
                            onClick={() => { setEraserSize(size); setEraserType('point'); setTool('eraser'); setIsEraserMenuOpen(false); }}
                          >
                            <span>{size === 5 ? 'Extra Small' : size === 10 ? 'Small' : size === 20 ? 'Medium' : size === 40 ? 'Large' : 'Extra Large'}</span>
                            {eraserType === 'point' && eraserSize === size && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center h-full overflow-x-auto custom-scrollbar pr-2">
                  {presets.map(preset => (
                    <button
                      key={preset.id}
                      onClick={() => {
                        if (tool === 'pen' && activePresetId === preset.id) {
                          setTool('home');
                        } else {
                          setActivePresetId(preset.id); 
                          setTool("pen"); 
                        }
                      }}
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
            {activeTab === "History" && (
              <div className="flex items-center gap-4 h-full py-1">
                <div className="flex items-center h-full relative">
                  <button
                    onClick={() => {
                      if (!isVersionsMenuOpen) {
                        fetchVersions();
                      }
                      setIsVersionsMenuOpen(!isVersionsMenuOpen);
                    }}
                    className={`flex flex-col items-center justify-center h-full px-3 rounded transition-colors ${isVersionsMenuOpen ? 'bg-zinc-200 dark:bg-zinc-800' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'} text-zinc-600 dark:text-zinc-300`}
                    title="Page Versions"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-0.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                    <span className="text-[10px] font-medium mt-0.5 flex items-center gap-1">Page Versions <ChevronDown size={10} /></span>
                  </button>
                  
                  {isVersionsMenuOpen && (
                    <div className="absolute top-full left-0 mt-1 w-64 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl z-50 max-h-96 overflow-y-auto">
                      <div className="p-2 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center">
                        <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Version History</span>
                      </div>
                      <div className="p-1 flex flex-col">
                        {pageVersions.length === 0 ? (
                          <div className="px-3 py-4 text-xs text-zinc-500 text-center">No versions found.</div>
                        ) : (
                          pageVersions.map((version) => (
                            <button
                              key={version.id}
                              onClick={() => {
                                restoreVersion(version.document_state);
                                setIsVersionsMenuOpen(false);
                                toast.success("Restored previous version. (You can Undo if this was a mistake)");
                              }}
                              className="text-left px-3 py-2 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded flex flex-col gap-1 transition-colors"
                            >
                              <span className="font-medium text-zinc-800 dark:text-zinc-200">{format(new Date(version.created_at), "MMM d, yyyy 'at' h:mm a")}</span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
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

                <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-700 mx-1" />

                <div className="flex flex-col gap-1 justify-center h-full">
                  <div className="flex items-center relative">
                    <button
                      onClick={() => setShowMinimap(!showMinimap)}
                      className={`flex flex-col items-center justify-center h-full px-3 rounded ${showMinimap ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300'}`}
                      title="Toggle Minimap"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-0.5"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/><path d="M15 15h6"/></svg>
                      <span className="text-[10px] font-medium leading-none mt-1">Minimap</span>
                    </button>
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

        {/* Desktop Journal Mode Indicator, Streak & Reflection Prompt */}
        {isJournal && (
          <div className="w-[500px] mt-4 rounded-2xl bg-amber-500/10 dark:bg-amber-950/25 border border-amber-500/20 p-4 space-y-3 shadow-sm pointer-events-auto">
            {/* Header: Mode & Streak */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen size={15} className="text-amber-500" />
                <span className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">Journal Mode</span>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-[11px] font-bold text-amber-700 dark:text-amber-300">
                <Flame size={12} className="text-amber-500 fill-amber-500/40" />
                <span>{streakCount} {streakCount === 1 ? 'Day' : 'Days'} Active Streak</span>
              </div>
            </div>

            {/* Daily Prompt Card */}
            <div className="bg-white/80 dark:bg-zinc-900/80 rounded-xl p-3 border border-amber-500/15 space-y-2">
              <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                  <Sparkles size={12} />
                  <span>Daily Reflection Prompt</span>
                </div>
                <button
                  onClick={() => setCurrentPromptIdx((prev) => (prev + 1) % JOURNAL_PROMPTS.length)}
                  className="flex items-center gap-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors p-0.5"
                  title="Next Prompt"
                >
                  <RotateCw size={11} />
                  <span>Next</span>
                </button>
              </div>

              <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 leading-snug">
                {JOURNAL_PROMPTS[currentPromptIdx]}
              </p>

              <button
                onClick={() => handleAnswerPrompt(JOURNAL_PROMPTS[currentPromptIdx])}
                className="w-full mt-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-300 font-semibold text-xs transition-colors active:scale-98"
              >
                <span>Write about this</span>
                <ArrowRight size={12} />
              </button>
            </div>

            {/* Mood Selector Row */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 px-0.5">
                How are you feeling right now?
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {MOOD_OPTIONS.map((mood) => {
                  const isSelected = selectedMood === mood.id;
                  return (
                    <button
                      key={mood.id}
                      onClick={() => setSelectedMood(selectedMood === mood.id ? null : mood.id)}
                      className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                        isSelected
                          ? 'bg-amber-500 text-white dark:text-zinc-950 shadow-sm ring-2 ring-amber-500/30'
                          : 'bg-white/80 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:border-amber-500/40'
                      }`}
                    >
                      {mood.label}
                    </button>
                  );
                })}
              </div>
            </div>
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
          eraserSize={eraserSize}
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
          onCanvasClick={handleCanvasClick}
          onDragSelectionStart={handleDragSelectionStart}
          onDragSelectionMove={handleDragSelectionMove}
          onDragSelectionEnd={handleDragSelectionEnd}
          onLassoComplete={handleLassoComplete}
          annotateBlockId={annotateBlockId}
          blockOffsetMap={blockOffsetMap}
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
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
          setActiveEditor={setActiveEditor}
          onEditorUpdate={() => setEditorUpdateTick(t => t + 1)}
          onDragSelectionStart={handleDragSelectionStart}
          onDragSelectionMove={handleDragSelectionMove}
          onDragSelectionEnd={handleDragSelectionEnd}
          onAnnotate={handleAnnotateBlock}
          onBlurText={(id, text, x, y) => {
            fetch('/api/sync-embedding', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id, content: text, type: 'text', metadata: { pageId, x, y } })
            }).catch(err => console.error("Failed to sync text embedding", err));
          }}
        />
      </div>

      <div className="absolute inset-0 z-40 pointer-events-none">
        <AudioOverlay 
          audios={audios || []}
          setAudios={setAudios}
          pan={pan}
          zoom={zoom}
          tool={tool}
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
          onDragSelectionStart={handleDragSelectionStart}
          onDragSelectionMove={handleDragSelectionMove}
          onDragSelectionEnd={handleDragSelectionEnd}
          activeRecordingDuration={recordingDuration}
          isActiveRecordingPaused={isPaused}
          onPauseRecording={pauseRecording}
          onResumeRecording={resumeRecording}
          onStopRecording={stopRecording}
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
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
          onDragSelectionStart={handleDragSelectionStart}
          onDragSelectionMove={handleDragSelectionMove}
          onDragSelectionEnd={handleDragSelectionEnd}
          onAnnotate={handleAnnotateBlock}
        />
      </div>

      {selectedIds.length > 1 && getSelectionBounds() && (() => {
        const bounds = getSelectionBounds()!;
        const screenX = (bounds.x * zoom) + pan.x;
        const screenY = (bounds.y * zoom) + pan.y;
        
        return (
          <div 
            className="absolute z-50 pointer-events-auto"
            style={{ 
              left: screenX, 
              top: screenY - 50,
            }}
          >
            <button
              onClick={() => handleOrganize()}
              className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-full shadow-xl font-medium transition-transform active:scale-95"
            >
              <span>Organize Chaos</span>
            </button>
          </div>
        );
      })()}

      {showMinimap && (
        <Minimap
          strokes={strokes || []}
          texts={texts || []}
          images={images || []}
          files={files || []}
          videos={videos || []}
          audios={audios || []}
          pan={pan}
          zoom={zoom}
          setPan={setPan}
        />
      )}
    </div>
  );
}
