"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { v4 as uuidv4 } from "uuid";
import { createClient } from "@/lib/supabase/client";
import debounce from "lodash/debounce";
import { format } from "date-fns";
import { Pen, Type, Hand, MousePointer2, Bold, Italic, Underline as UnderlineIcon, Strikethrough, Subscript as SubscriptIcon, Superscript as SuperscriptIcon, Highlighter, AlignLeft, AlignCenter, AlignRight, AlignJustify, Indent as IndentIcon, Outdent as OutdentIcon, Heading1, Heading2, Heading3, List, ListOrdered, CheckSquare, Image as ImageIcon, File as FileIcon, Video, Table as TableIcon, ChevronDown, Mic, Square, BookOpen, Flame, Trash2, Sparkles, GripVertical, X, Upload, Minimize2, Maximize2, Workflow, Circle as CircleIcon, RotateCw, MoveRight, CornerDownRight, Database, StickyNote, Spline, RemoveFormatting, Quote, Code, Minus, Plus, Link2 } from "lucide-react";
import { Editor } from "@tiptap/react";
import { 
  STYLE_OPTIONS, 
  LINE_SPACING_OPTIONS, 
  LineSpacingDropdown, 
  HighlightDropdown, 
  executeIndent, 
  executeOutdent, 
  applyStyle, 
  getCurrentStyle, 
  clearFormatting, 
  handleToggleLink 
} from "./TipTapEditor";
import { SpatialCanvas } from "./SpatialCanvas";
import { RichTextOverlay } from "./RichTextOverlay";
import { AudioOverlay } from "./AudioOverlay";
import { MediaOverlay } from "./MediaOverlay";
import { FlowchartOverlay } from "./FlowchartOverlay";
import { Minimap } from "./Minimap";
import { MeetingWorkspace } from "./MeetingWorkspace";
import { uploadMediaFile } from "@/lib/storage";
import { WebAudioRecorder, RecordingResult } from "@/lib/audioRecorder";
import { processAudioTranscription } from "@/lib/transcribe";
import { liveSpeechRecognizer } from "@/lib/liveSpeech";

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
  isCollapsed?: boolean;
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

export type FlowchartShapeType = 
  | 'rectangle'       // Process
  | 'rounded'         // Start / End
  | 'diamond'         // Decision
  | 'circle'          // Connector / Event
  | 'parallelogram'   // Input / Output
  | 'cylinder'        // Database
  | 'note';           // Sticky Note

export type AnchorPosition = 'top' | 'right' | 'bottom' | 'left';
export type ConnectorRouting = 'curved' | 'orthogonal' | 'straight';
export type ConnectorEnd = 'arrow' | 'none' | 'double-arrow';

export type ShapeNode = {
  id: string;
  type: FlowchartShapeType;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  strokeStyle?: 'solid' | 'dashed';
  fontSize?: number;
  textColor?: string;
  textAlign?: 'left' | 'center' | 'right';
};

export type ConnectorNode = {
  id: string;
  fromShapeId?: string;
  fromAnchor?: AnchorPosition;
  fromPoint?: { x: number; y: number };
  toShapeId?: string;
  toAnchor?: AnchorPosition;
  toPoint?: { x: number; y: number };
  routing?: ConnectorRouting;
  arrowEnd?: ConnectorEnd;
  strokeColor?: string;
  strokeWidth?: number;
  strokeStyle?: 'solid' | 'dashed';
  label?: string;
};

import { ColorPickerMenu } from "./ColorPickerMenu";

export type ToolType = "pan" | "home" | "pen" | "eraser" | "lasso" | "shape" | "connector";
export type RibbonTab = "Home" | "Insert" | "Record" | "Draw" | "Flowchart" | "History" | "View";

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
  shapes?: ShapeNode[];
  connectors?: ConnectorNode[];
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
  disabled,
  dropdownWidth = "w-full"
}: { 
  value: string; 
  onChange: (v: string) => void; 
  options: { label: string, value: string }[];
  placeholder: string;
  width: string;
  disabled: boolean;
  dropdownWidth?: string;
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
        type="button"
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!disabled) setIsOpen(!isOpen);
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        disabled={disabled}
        className={`w-full flex items-center justify-between bg-zinc-100 dark:bg-zinc-800 text-xs px-2 py-1 rounded border border-transparent hover:border-zinc-300 dark:hover:border-zinc-700 outline-none text-zinc-900 dark:text-zinc-300 ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
      >
        <span className="truncate">{selectedOption ? selectedOption.label : placeholder}</span>
        <ChevronDown size={12} className="opacity-50 flex-shrink-0 ml-1" />
      </button>
      {isOpen && !disabled && (
        <div className={`absolute top-full mt-1 left-0 ${dropdownWidth} bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded shadow-lg z-50 max-h-60 overflow-y-auto`}>
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onChange(opt.value);
                setIsOpen(false);
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              className={`w-full text-left px-2.5 py-1.5 text-xs hover:bg-primary-50 dark:hover:bg-primary-900/30 transition-colors ${value === opt.value ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 font-medium' : 'text-zinc-700 dark:text-zinc-300'}`}
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

export function CustomCanvas({ pageId, pageTitle, pageCreatedAt, onUpdatePageTitle, headerControls, isJournal }: CustomCanvasProps) {
  const { 
    loading, strokes, setStrokes, texts, setTexts, audios, setAudios, 
    images, setImages, files, setFiles, videos, setVideos,
    shapes, setShapes, connectors, setConnectors,
    undo, redo, canUndo, canRedo,
    pageVersions, fetchVersions, restoreVersion
  } = useCanvasData(pageId);

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

  // Auto-resolve vertical block collisions on desktop canvas (prevents images from covering text)
  useEffect(() => {
    if (loading || !texts || !images || images.length === 0 || texts.length === 0) return;

    let hasOverlap = false;
    const adjustedTexts = [...texts];

    images.forEach(img => {
      const imgWidth = img.width || 400;
      const imgHeight = img.height || 350;
      const imgBottom = img.y + imgHeight;

      adjustedTexts.forEach((txt, idx) => {
        const txtWidth = txt.width || 400;
        const hOverlap = Math.max(0, Math.min(img.x + imgWidth, txt.x + txtWidth) - Math.max(img.x, txt.x));
        if (hOverlap > 80) {
          if (txt.y >= img.y - 20 && txt.y < imgBottom) {
            adjustedTexts[idx] = { ...txt, y: imgBottom + 32 };
            hasOverlap = true;
          }
        }
      });
    });

    if (hasOverlap) {
      setTexts(adjustedTexts);
    }
  }, [loading, images, texts.length]);

  // View state
  const [backgroundStyle, setBackgroundStyle] = useState<'none' | 'ruled' | 'grid' | 'dots'>('none');
  const [pageColor, setPageColor] = useState<string>('default');
  const [openColorMenu, setOpenColorMenu] = useState<'text' | 'drawing' | 'page' | null>(null);

  // Load per-page style settings
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

  // Listen for global/settings style changes
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

  const updatePageStyle = (newBg?: 'none' | 'ruled' | 'grid' | 'dots', newColor?: string) => {
    const bg = newBg !== undefined ? newBg : backgroundStyle;
    const color = newColor !== undefined ? newColor : pageColor;
    if (newBg !== undefined) setBackgroundStyle(newBg);
    if (newColor !== undefined) setPageColor(newColor);
    if (pageId && typeof window !== 'undefined') {
      try {
        localStorage.setItem(`cubnotes_page_style_${pageId}`, JSON.stringify({ backgroundStyle: bg, pageColor: color }));
      } catch {}
    }
  };

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

  // Active Tool and Ribbon
  const [tool, setTool] = useState<ToolType>("home");
  const [activeTab, setActiveTab] = useState<RibbonTab>("Home");
  const [isRibbonExpanded, setIsRibbonExpanded] = useState(true);
  const [activeEditor, setActiveEditor] = useState<Editor | null>(null);
  const [editorUpdateTick, setEditorUpdateTick] = useState(0);

  // Viewport state
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const ribbonRef = useRef<HTMLDivElement>(null);
  const panRef = useRef(pan);
  panRef.current = pan;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  // Selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isVersionsMenuOpen, setIsVersionsMenuOpen] = useState(false);
  const [annotateBlockId, setAnnotateBlockId] = useState<string | null>(null);

  // Flowchart & Diagramming state
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [selectedConnectorId, setSelectedConnectorId] = useState<string | null>(null);
  const [activeShapeType, setActiveShapeType] = useState<FlowchartShapeType>('rectangle');
  const [connectorRouting, setConnectorRouting] = useState<ConnectorRouting>('curved'); // User default: curved bezier!
  const [isAiFlowchartModalOpen, setIsAiFlowchartModalOpen] = useState(false);
  const [aiFlowchartPrompt, setAiFlowchartPrompt] = useState("");
  const [isGeneratingFlowchart, setIsGeneratingFlowchart] = useState(false);

  // Quick insert helper for flowchart shapes
  const handleInsertShape = useCallback((type: FlowchartShapeType, label = "Shape") => {
    const centerX = (-pan.x + (typeof window !== 'undefined' ? window.innerWidth / 2 : 500)) / zoom;
    const centerY = (-pan.y + (typeof window !== 'undefined' ? window.innerHeight / 2 : 400)) / zoom;
    const isRound = type === 'circle';
    const isDiamond = type === 'diamond';
    const newShape: ShapeNode = {
      id: uuidv4(),
      type,
      x: Math.round(centerX - (isRound ? 45 : isDiamond ? 70 : 80)),
      y: Math.round(centerY - (isRound ? 45 : isDiamond ? 45 : 40)),
      width: isRound ? 90 : isDiamond ? 140 : 160,
      height: isRound ? 90 : isDiamond ? 90 : 80,
      text: "",
      fillColor: type === 'note' ? 'rgba(251, 191, 36, 0.14)' : 'rgba(59, 130, 246, 0.08)',
      strokeColor: type === 'note' ? '#f59e0b' : '#3b82f6',
      strokeWidth: 2,
      strokeStyle: 'solid',
      fontSize: 14,
      textAlign: 'center'
    };
    setShapes(prev => [...prev, newShape]);
    setSelectedShapeId(newShape.id);
    setSelectedConnectorId(null);
    setTool("home");
    toast.success(`Inserted ${label}`);
  }, [pan, zoom, setShapes, setSelectedShapeId, setSelectedConnectorId, setTool]);

  // Quick preset workflows
  const handleInsertPresetWorkflow = useCallback((preset: 'decision' | 'linear') => {
    const centerX = (-pan.x + (typeof window !== 'undefined' ? window.innerWidth / 2 : 500)) / zoom;
    const centerY = (-pan.y + (typeof window !== 'undefined' ? window.innerHeight / 2 : 400)) / zoom;

    if (preset === 'linear') {
      const id1 = uuidv4();
      const id2 = uuidv4();
      const id3 = uuidv4();

      const newShapes: ShapeNode[] = [
        { id: id1, type: 'rounded', x: Math.round(centerX - 240), y: Math.round(centerY - 35), width: 140, height: 70, text: "Start", fillColor: '#dcfce7', strokeColor: '#22c55e', strokeWidth: 2, strokeStyle: 'solid', fontSize: 14, textAlign: 'center' },
        { id: id2, type: 'rectangle', x: Math.round(centerX - 40), y: Math.round(centerY - 35), width: 150, height: 70, text: "Process Task", fillColor: '#ffffff', strokeColor: '#3b82f6', strokeWidth: 2, strokeStyle: 'solid', fontSize: 14, textAlign: 'center' },
        { id: id3, type: 'rounded', x: Math.round(centerX + 170), y: Math.round(centerY - 35), width: 140, height: 70, text: "Complete", fillColor: '#e0f2fe', strokeColor: '#0284c7', strokeWidth: 2, strokeStyle: 'solid', fontSize: 14, textAlign: 'center' },
      ];

      const newConnectors: ConnectorNode[] = [
        { id: uuidv4(), fromShapeId: id1, fromAnchor: 'right', toShapeId: id2, toAnchor: 'left', routing: 'curved', arrowEnd: 'arrow', strokeColor: '#3b82f6', strokeWidth: 2, strokeStyle: 'solid' },
        { id: uuidv4(), fromShapeId: id2, fromAnchor: 'right', toShapeId: id3, toAnchor: 'left', routing: 'curved', arrowEnd: 'arrow', strokeColor: '#3b82f6', strokeWidth: 2, strokeStyle: 'solid' }
      ];

      setShapes(prev => [...prev, ...newShapes]);
      setConnectors(prev => [...prev, ...newConnectors]);
      setSelectedShapeId(id1);
      toast.success("Process preset inserted!");
    } else {
      const startId = uuidv4();
      const decId = uuidv4();
      const yesId = uuidv4();
      const noId = uuidv4();

      const newShapes: ShapeNode[] = [
        { id: startId, type: 'rounded', x: Math.round(centerX - 280), y: Math.round(centerY - 35), width: 130, height: 70, text: "Trigger", fillColor: '#dcfce7', strokeColor: '#22c55e', strokeWidth: 2, strokeStyle: 'solid', fontSize: 13, textAlign: 'center' },
        { id: decId, type: 'diamond', x: Math.round(centerX - 80), y: Math.round(centerY - 45), width: 140, height: 90, text: "Approved?", fillColor: '#fef3c7', strokeColor: '#f59e0b', strokeWidth: 2, strokeStyle: 'solid', fontSize: 13, textAlign: 'center' },
        { id: yesId, type: 'rectangle', x: Math.round(centerX + 130), y: Math.round(centerY - 100), width: 150, height: 70, text: "Proceed Flow", fillColor: '#ffffff', strokeColor: '#3b82f6', strokeWidth: 2, strokeStyle: 'solid', fontSize: 13, textAlign: 'center' },
        { id: noId, type: 'rectangle', x: Math.round(centerX + 130), y: Math.round(centerY + 30), width: 150, height: 70, text: "Request Changes", fillColor: '#ffe4e6', strokeColor: '#f43f5e', strokeWidth: 2, strokeStyle: 'solid', fontSize: 13, textAlign: 'center' },
      ];

      const newConnectors: ConnectorNode[] = [
        { id: uuidv4(), fromShapeId: startId, fromAnchor: 'right', toShapeId: decId, toAnchor: 'left', routing: 'curved', arrowEnd: 'arrow', strokeColor: '#3b82f6', strokeWidth: 2, strokeStyle: 'solid' },
        { id: uuidv4(), fromShapeId: decId, fromAnchor: 'top', toShapeId: yesId, toAnchor: 'left', routing: 'curved', arrowEnd: 'arrow', strokeColor: '#22c55e', strokeWidth: 2, strokeStyle: 'solid', label: 'Yes' },
        { id: uuidv4(), fromShapeId: decId, fromAnchor: 'bottom', toShapeId: noId, toAnchor: 'left', routing: 'curved', arrowEnd: 'arrow', strokeColor: '#f43f5e', strokeWidth: 2, strokeStyle: 'solid', label: 'No' },
      ];

      setShapes(prev => [...prev, ...newShapes]);
      setConnectors(prev => [...prev, ...newConnectors]);
      setSelectedShapeId(startId);
      toast.success("Decision tree preset inserted!");
    }
  }, [pan, zoom, setShapes, setConnectors, setSelectedShapeId]);

  // AI Flowchart Generator caller
  const handleGenerateAiFlowchart = async (customPrompt?: string, useMeetingNotes?: boolean) => {
    setIsGeneratingFlowchart(true);
    const toastId = toast.loading("Generating flowchart with Gemini 3.8 Flash...");

    try {
      const centerX = (-pan.x + (typeof window !== 'undefined' ? window.innerWidth / 3 : 300)) / zoom;
      const centerY = (-pan.y + (typeof window !== 'undefined' ? window.innerHeight / 3 : 200)) / zoom;

      let notesContent = "";
      if (useMeetingNotes) {
        const textParts = texts.map(t => t.content.replace(/<[^>]*>?/gm, '')).filter(Boolean);
        const audioParts = (audios || []).map(a => `${a.title || 'Meeting'}: ${a.summary || ''} ${a.transcript || ''}`).filter(Boolean);
        notesContent = [...textParts, ...audioParts].join('\n\n');
      }

      const res = await fetch('/api/generate-flowchart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: customPrompt || aiFlowchartPrompt,
          notes: notesContent,
          startX: Math.round(centerX),
          startY: Math.round(centerY)
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to generate flowchart");
      }

      if (data.shapes && Array.isArray(data.shapes)) {
        setShapes(prev => [...prev, ...data.shapes]);
        if (data.connectors && Array.isArray(data.connectors)) {
          setConnectors(prev => [...prev, ...data.connectors]);
        }
        toast.success(`Generated flowchart with ${data.shapes.length} steps!`, { id: toastId });
        setIsAiFlowchartModalOpen(false);
        setAiFlowchartPrompt("");
      }
    } catch (err: any) {
      toast.error(err.message || "Flowchart generation failed", { id: toastId });
    } finally {
      setIsGeneratingFlowchart(false);
    }
  };

  // Foresight Meeting Workspace state
  const [isMeetingWorkspaceOpen, setIsMeetingWorkspaceOpen] = useState(false);
  const [meetingWorkspaceAudioId, setMeetingWorkspaceAudioId] = useState<string | null>(null);

  const updateAudioField = useCallback((id: string, field: keyof AudioNode, value: any) => {
    setAudios(prev => (prev || []).map(a => a.id === id ? { ...a, [field]: value } : a));
  }, [setAudios]);

  const activeMeetingAudio = useMemo(() => {
    if (meetingWorkspaceAudioId) {
      return (audios || []).find(a => a.id === meetingWorkspaceAudioId) || null;
    }
    return (audios || []).find(a => a.isLiveRecording) || (audios && audios.length > 0 ? audios[audios.length - 1] : null);
  }, [audios, meetingWorkspaceAudioId]);

  const areAllAudiosCollapsed = useMemo(() => {
    if (!audios || audios.length === 0) return false;
    return audios.every(a => a.isCollapsed);
  }, [audios]);

  const toggleCollapseAllAudios = useCallback((forceState?: boolean) => {
    setAudios(prev => {
      const targetState = forceState !== undefined ? forceState : !prev.every(a => a.isCollapsed);
      return (prev || []).map(a => ({ ...a, isCollapsed: targetState }));
    });
    toast.success(areAllAudiosCollapsed ? "All cards expanded" : "All cards collapsed", { duration: 1500 });
  }, [areAllAudiosCollapsed, setAudios]);

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
    shapes: any[];
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
      audios: audios.filter(a => activeIds.includes(a.id)),
      shapes: (shapes || []).filter(s => activeIds.includes(s.id))
    };
  }, [selectedIds, strokes, texts, images, videos, files, audios, shapes]);

  const handleDragSelectionMove = useCallback((deltaX: number, deltaY: number) => {
    const orig = originalSelectionRef.current;
    if (!orig) return;

    if (orig.strokes.length > 0) {
      setStrokes(prev => prev.map(s => {
        const origStroke = orig.strokes.find(os => os.id === s.id);
        if (origStroke) {
          return { ...origStroke, x: (origStroke.x || 0) + deltaX, y: (origStroke.y || 0) + deltaY };
        }
        return s;
      }));
    }
    
    if (orig.texts.length > 0) setTexts(prev => prev.map(t => orig.texts.find(ot => ot.id === t.id) ? { ...t, x: orig.texts.find(ot => ot.id === t.id).x + deltaX, y: orig.texts.find(ot => ot.id === t.id).y + deltaY } : t));
    if (orig.images.length > 0) setImages(prev => prev.map(i => orig.images.find(oi => oi.id === i.id) ? { ...i, x: orig.images.find(oi => oi.id === i.id).x + deltaX, y: orig.images.find(oi => oi.id === i.id).y + deltaY } : i));
    if (orig.videos.length > 0) setVideos(prev => prev.map(v => orig.videos.find(ov => ov.id === v.id) ? { ...v, x: orig.videos.find(ov => ov.id === v.id).x + deltaX, y: orig.videos.find(ov => ov.id === v.id).y + deltaY } : v));
    if (orig.files.length > 0) setFiles(prev => prev.map(f => orig.files.find(of => of.id === f.id) ? { ...f, x: orig.files.find(of => of.id === f.id).x + deltaX, y: orig.files.find(of => of.id === f.id).y + deltaY } : f));
    if (orig.audios.length > 0) setAudios(prev => prev.map(a => orig.audios.find(oa => oa.id === a.id) ? { ...a, x: orig.audios.find(oa => oa.id === a.id).x + deltaX, y: orig.audios.find(oa => oa.id === a.id).y + deltaY } : a));
    if (orig.shapes.length > 0) setShapes(prev => prev.map(s => orig.shapes.find(os => os.id === s.id) ? { ...s, x: orig.shapes.find(os => os.id === s.id).x + deltaX, y: orig.shapes.find(os => os.id === s.id).y + deltaY } : s));
  }, [setStrokes, setTexts, setImages, setVideos, setFiles, setAudios, setShapes]);

  const handleDragSelectionEnd = useCallback(() => {
    if (backgroundStyle === 'ruled' || backgroundStyle === 'grid') {
      setTexts(prev => prev.map(t => ({
        ...t,
        y: Math.round(t.y / 32) * 32
      })));
    }
    originalSelectionRef.current = null;
  }, [backgroundStyle, setTexts]);

  const findIntersectingIds = useCallback((minX: number, maxX: number, minY: number, maxY: number) => {
    const foundIds: string[] = [];

    // Find strokes
    strokes.forEach(stroke => {
      const ox = (stroke.x || 0) + (stroke.blockId && blockOffsetMap && blockOffsetMap[stroke.blockId] ? blockOffsetMap[stroke.blockId].x : 0);
      const oy = (stroke.y || 0) + (stroke.blockId && blockOffsetMap && blockOffsetMap[stroke.blockId] ? blockOffsetMap[stroke.blockId].y : 0);
      
      let sMinX = Infinity, sMinY = Infinity, sMaxX = -Infinity, sMaxY = -Infinity;
      let hasPointInside = false;
      for (const p of stroke.points) {
        const px = p[0] + ox;
        const py = p[1] + oy;
        if (px >= minX && px <= maxX && py >= minY && py <= maxY) {
          hasPointInside = true;
        }
        if (px < sMinX) sMinX = px;
        if (px > sMaxX) sMaxX = px;
        if (py < sMinY) sMinY = py;
        if (py > sMaxY) sMaxY = py;
      }
      const boxOverlap = Math.max(sMinX, minX) <= Math.min(sMaxX, maxX) &&
                         Math.max(sMinY, minY) <= Math.min(sMaxY, maxY);
      if (hasPointInside || boxOverlap) {
        foundIds.push(stroke.id);
      }
    });

    // Find texts
    texts.forEach(t => {
      const tw = t.width || 600;
      let th = 80;
      if (typeof document !== 'undefined') {
        const el = document.getElementById(`text-node-${t.id}`);
        if (el) th = el.offsetHeight;
      }
      if (Math.max(t.x, minX) <= Math.min(t.x + tw, maxX) && Math.max(t.y, minY) <= Math.min(t.y + th, maxY)) {
        foundIds.push(t.id);
      }
    });

    // Find images
    images?.forEach(i => {
      const iw = i.width || 400;
      const ih = i.height || 300;
      if (Math.max(i.x, minX) <= Math.min(i.x + iw, maxX) && Math.max(i.y, minY) <= Math.min(i.y + ih, maxY)) {
        foundIds.push(i.id);
      }
    });

    // Find videos
    videos?.forEach(v => {
      const vw = v.width || 480;
      const vh = v.height || 270;
      if (Math.max(v.x, minX) <= Math.min(v.x + vw, maxX) && Math.max(v.y, minY) <= Math.min(v.y + vh, maxY)) {
        foundIds.push(v.id);
      }
    });

    // Find files
    files?.forEach(f => {
      const fw = f.width || 256;
      const fh = f.height || 80;
      if (Math.max(f.x, minX) <= Math.min(f.x + fw, maxX) && Math.max(f.y, minY) <= Math.min(f.y + fh, maxY)) {
        foundIds.push(f.id);
      }
    });

    // Find audios
    audios?.forEach(a => {
      const aw = a.width || 500;
      let ah = 140;
      if (typeof document !== 'undefined') {
        const el = document.getElementById(`audio-node-${a.id}`);
        if (el) ah = el.offsetHeight;
      }
      if (Math.max(a.x, minX) <= Math.min(a.x + aw, maxX) && Math.max(a.y, minY) <= Math.min(a.y + ah, maxY)) {
        foundIds.push(a.id);
      }
    });

    // Find shapes
    shapes?.forEach(s => {
      if (Math.max(s.x, minX) <= Math.min(s.x + s.width, maxX) && Math.max(s.y, minY) <= Math.min(s.y + s.height, maxY)) {
        foundIds.push(s.id);
      }
    });

    return foundIds;
  }, [strokes, texts, images, videos, files, audios, shapes, blockOffsetMap]);

  const handleSelectionBoxChange = useCallback((minX: number, maxX: number, minY: number, maxY: number) => {
    const ids = findIntersectingIds(minX, maxX, minY, maxY);
    setSelectedIds(ids);
  }, [findIntersectingIds]);

  const handleSelectionBoxComplete = useCallback((minX: number, maxX: number, minY: number, maxY: number) => {
    const ids = findIntersectingIds(minX, maxX, minY, maxY);
    setSelectedIds(ids);
  }, [findIntersectingIds]);

  const handleDeleteSelection = useCallback(() => {
    if (selectedIds.length === 0) return;
    setStrokes(prev => prev.filter(s => !selectedIds.includes(s.id)));
    setTexts(prev => prev.filter(t => !selectedIds.includes(t.id)));
    if (setImages) setImages(prev => prev.filter(i => !selectedIds.includes(i.id)));
    if (setVideos) setVideos(prev => prev.filter(v => !selectedIds.includes(v.id)));
    if (setFiles) setFiles(prev => prev.filter(f => !selectedIds.includes(f.id)));
    if (setAudios) setAudios(prev => prev.filter(a => !selectedIds.includes(a.id)));
    setShapes(prev => prev.filter(s => !selectedIds.includes(s.id)));
    setConnectors(prev => prev.filter(c => !selectedIds.includes(c.fromShapeId || '') && !selectedIds.includes(c.toShapeId || '')));
    setSelectedIds([]);
  }, [selectedIds, setStrokes, setTexts, setImages, setVideos, setFiles, setAudios, setShapes, setConnectors, setSelectedIds]);

  const [isDraggingToolbar, setIsDraggingToolbar] = useState(false);
  const toolbarDragRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!isDraggingToolbar) return;

    const handlePointerMove = (e: PointerEvent) => {
      if (!toolbarDragRef.current) return;
      const deltaX = (e.clientX - toolbarDragRef.current.x) / zoom;
      const deltaY = (e.clientY - toolbarDragRef.current.y) / zoom;
      handleDragSelectionMove(deltaX, deltaY);
    };

    const handlePointerUp = () => {
      setIsDraggingToolbar(false);
      toolbarDragRef.current = null;
      handleDragSelectionEnd();
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isDraggingToolbar, zoom, handleDragSelectionMove, handleDragSelectionEnd]);

  const handleLassoComplete = useCallback((minX: number, maxX: number, minY: number, maxY: number, path: number[][]) => {
    const foundIds = findIntersectingIds(minX, maxX, minY, maxY);
    if (foundIds.length > 0) {
      setSelectedIds(foundIds);
      setTool('home'); // Switch to home tool so selection UI becomes visible and interactable
    } else {
      setSelectedIds([]);
    }
  }, [findIntersectingIds]);


  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  // Audio Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recorderRef = useRef<WebAudioRecorder | null>(null);
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

  const handleOpenMeetingWorkspace = useCallback((audioId?: string) => {
    if (audioId) {
      setMeetingWorkspaceAudioId(audioId);
    } else {
      const existing = (audios || []).find(a => a.isLiveRecording) || (audios && audios.length > 0 ? audios[audios.length - 1] : null);
      if (existing) {
        setMeetingWorkspaceAudioId(existing.id);
      } else {
        const center = getCanvasCenter();
        const newId = uuidv4();
        const newAudio: AudioNode = {
          id: newId,
          x: center.x - 220,
          y: isJournal ? 80 : center.y - 100,
          width: 500,
          url: "",
          title: `Meeting - ${format(new Date(), 'MMM d, yyyy')}`,
          summary: "",
          transcript: "",
          notes: "",
          audioCreatedAt: Date.now(),
          isAudioSavedPermanently: true,
        };
        setAudios(prev => [...(prev || []), newAudio]);
        setMeetingWorkspaceAudioId(newId);
      }
    }
    setIsMeetingWorkspaceOpen(true);
  }, [audios, getCanvasCenter, isJournal, setAudios]);

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
      toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} uploaded successfully!`, { id: toastId });
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
      const recorder = new WebAudioRecorder();
      await recorder.start();
      recorderRef.current = recorder;

      // Start live speech recognizer AFTER mic stream is successfully established
      try {
        liveSpeechRecognizer.start();
      } catch (speechErr) {
        console.warn("Live speech recognizer not started:", speechErr);
      }

      const center = getCanvasCenter();
      const nodeId = uuidv4();
      activeRecordingNodeIdRef.current = nodeId;
      setMeetingWorkspaceAudioId(nodeId);

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

      setIsRecording(true);
      setIsPaused(false);
      setRecordingDuration(0);

      timerIntervalRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);

    } catch (err: any) {
      console.error("Error accessing microphone:", err);
      toast.error(err?.message || "Could not access microphone.");
      setIsRecording(false);
      setIsPaused(false);
    }
  };

  const pauseRecording = () => {
    if (recorderRef.current && recorderRef.current.isRecording()) {
      recorderRef.current.pause();
      liveSpeechRecognizer.pause();
      setIsPaused(true);
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    }
  };

  const resumeRecording = () => {
    if (recorderRef.current && recorderRef.current.isPaused()) {
      recorderRef.current.resume();
      liveSpeechRecognizer.resume();
      setIsPaused(false);
      timerIntervalRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    }
  };

  const uploadAndTranscribeRecording = async (result: RecordingResult, existingNodeId?: string, liveTranscript?: string) => {
    const toastId = toast.loading("Transcribing...");
    setIsTranscribing(true);
    const nodeId = existingNodeId || activeRecordingNodeIdRef.current || uuidv4();

    // Mark node as transcribing
    setAudios(prev => prev.map(a => a.id === nodeId ? { ...a, isLiveRecording: false, isTranscribing: true } : a));

    let audioUrl = "";
    try {
      // 1. Upload audio to Cloudflare R2 or Supabase Storage
      const audioFile = new File([result.blob], `meeting_${Date.now()}.${result.fileExt}`, { type: result.mimeType });
      try {
        const uploadResult = await uploadMediaFile(audioFile, pageId);
        audioUrl = uploadResult.url;
      } catch (uploadErr) {
        console.warn("Audio upload warning:", uploadErr);
      }

      // 2. Transcribe with Gemini 3.8 Flash (dual failover: /api/transcribe -> Supabase Edge Function)
      const transcriptionResult = await processAudioTranscription({
        audioBase64: (result.blob.size < 4 * 1024 * 1024) ? result.base64 : undefined,
        audioUrl: audioUrl || undefined,
        mimeType: result.mimeType,
        isJournal: Boolean(isJournal),
        liveTranscript: liveTranscript || result.liveTranscript,
      });

      const transcript = transcriptionResult.transcript || liveTranscript || result.liveTranscript || "";
      const summary = transcriptionResult.summary || "Summary completed.";

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

      toast.success(isJournal ? "Journal entry processed!" : "Meeting note generated!", { id: toastId });

    } catch (error: any) {
      console.error("Recording processing failed:", error);
      const errMsg = error?.message || "Processing failed";
      toast.error(`Recording processing failed: ${errMsg}`, { id: toastId, duration: 7000 });
      setAudios(prev => prev.map(a => a.id === nodeId ? { 
        ...a, 
        isLiveRecording: false, 
        isTranscribing: false, 
        url: audioUrl,
        summary: `### Audio Saved\n\nAI Transcription failed: ${errMsg}\n\nYou can still listen to your recording above.`
      } : a));
    } finally {
      setIsTranscribing(false);
    }
  };

  const stopRecording = async () => {
    if (!recorderRef.current || !isRecording) return;
    
    setIsRecording(false);
    setIsPaused(false);
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }

    const liveTranscript = liveSpeechRecognizer.stop();
    const nodeId = activeRecordingNodeIdRef.current || uuidv4();
    try {
      const result = await recorderRef.current.stop();
      await uploadAndTranscribeRecording(result, nodeId, liveTranscript);
    } catch (err: any) {
      console.error("Error stopping recording:", err);
      toast.error(err?.message || "Recording stopped unexpectedly.");
      setAudios(prev => prev.map(a => a.id === nodeId ? { 
        ...a, 
        isLiveRecording: false, 
        isTranscribing: false,
        summary: `### Recording Error\n\n${err?.message || 'Recording stopped unexpectedly.'}`
      } : a));
    } finally {
      recorderRef.current = null;
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
    // If in shape placer mode, clicking canvas places the active shape
    if (tool === "shape") {
      const isRound = activeShapeType === 'circle';
      const isDiamond = activeShapeType === 'diamond';
      const newShape: ShapeNode = {
        id: uuidv4(),
        type: activeShapeType,
        x: Math.round(x - (isRound ? 45 : isDiamond ? 70 : 80)),
        y: Math.round(y - (isRound ? 45 : isDiamond ? 45 : 40)),
        width: isRound ? 90 : isDiamond ? 140 : 160,
        height: isRound ? 90 : isDiamond ? 90 : 80,
        text: "",
        fillColor: activeShapeType === 'note' ? 'rgba(251, 191, 36, 0.14)' : 'rgba(59, 130, 246, 0.08)',
        strokeColor: activeShapeType === 'note' ? '#f59e0b' : '#3b82f6',
        strokeWidth: 2,
        strokeStyle: 'solid',
        fontSize: 14,
        textAlign: 'center'
      };
      setShapes(prev => [...prev, newShape]);
      setSelectedShapeId(newShape.id);
      setSelectedConnectorId(null);
      setTool("home");
      return;
    }

    // In 'home' mode, clicking the canvas creates a text block
    if (tool === "home") {
      setSelectedShapeId(null);
      setSelectedConnectorId(null);
      if (typeof document !== 'undefined' && document.activeElement) {
        (document.activeElement as HTMLElement)?.blur?.();
      }

      const snapY = backgroundStyle === 'ruled' || backgroundStyle === 'grid' ? Math.round(y / 32) * 32 : y;
      const newId = uuidv4();
      const newNode: TextNode = {
        id: newId,
        x,
        y: snapY,
        width: 600,
        content: "<p></p>"
      };
      
      setTexts(prev => {
        // Discard any previous empty unedited text nodes
        const cleaned = prev.filter(t => {
          if (!t.content || t.content === '<p></p>' || t.content === '<p><br></p>' || t.content === '<p> </p>') {
            return false;
          }
          return true;
        });
        return [...cleaned, newNode];
      });
      setSelectedIds([newId]);
    }
  }, [tool, activeShapeType, setShapes, setSelectedShapeId, setSelectedConnectorId, setTool, setTexts, backgroundStyle, setSelectedIds]);

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

    const handleLiveTranscriptBroadcast = (e: Event) => {
      const customEvent = e as CustomEvent<{ transcript: string; interim: string }>;
      const { transcript } = customEvent.detail;
      setAudios(prev => prev.map(a => a.isLiveRecording ? { ...a, transcript } : a));
    };

    window.addEventListener('start-recording-node', handleStartRecordingNode);
    window.addEventListener('inject-transcribing', handleInjectTranscribing);
    window.addEventListener('inject-summary', handleInjectSummary);
    window.addEventListener('inject-audio', handleInjectAudio);
    window.addEventListener('jump-to-coordinates', handleJumpToCoordinates);
    window.addEventListener('live-transcript-broadcast', handleLiveTranscriptBroadcast);

    return () => {
      window.removeEventListener('start-recording-node', handleStartRecordingNode);
      window.removeEventListener('inject-transcribing', handleInjectTranscribing);
      window.removeEventListener('inject-summary', handleInjectSummary);
      window.removeEventListener('inject-audio', handleInjectAudio);
      window.removeEventListener('jump-to-coordinates', handleJumpToCoordinates);
      window.removeEventListener('live-transcript-broadcast', handleLiveTranscriptBroadcast);
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
      if (audio) updateBounds(audio.x, audio.y, audio.width || 400, audio.isCollapsed ? 52 : 450);
      
      const video = videos?.find(v => v.id === id);
      if (video) updateBounds(video.x, video.y, video.width || 480, video.height || 270);

      const shape = shapes?.find(s => s.id === id);
      if (shape) updateBounds(shape.x, shape.y, shape.width, shape.height);
    });

    if (minX === Infinity) return null;

    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }, [selectedIds, strokes, texts, images, files, audios, videos, shapes]);

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
  const [isSpacePanning, setIsSpacePanning] = useState(false);
  const [isSpaceDragging, setIsSpaceDragging] = useState(false);
  const [isDraggingFilesOver, setIsDraggingFilesOver] = useState(false);
  const mousePosRef = useRef<{ x: number, y: number } | null>(null);
  const spaceDragStartRef = useRef<{ x: number, y: number, panX: number, panY: number } | null>(null);

  // Center-anchored zoom helpers (for buttons, shortcuts, etc.)
  const handleZoomIn = useCallback(() => {
    const container = canvasContainerRef.current;
    const oldScale = zoomRef.current;
    const newScale = Math.min(5.0, oldScale * 1.2);
    if (newScale === oldScale) return;

    const cx = (container?.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 1000)) / 2;
    const cy = (container?.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 800)) / 2;
    const worldX = (cx - panRef.current.x) / oldScale;
    const worldY = (cy - panRef.current.y) / oldScale;

    const newPan = {
      x: cx - worldX * newScale,
      y: cy - worldY * newScale,
    };
    zoomRef.current = newScale;
    panRef.current = newPan;
    setZoom(newScale);
    setPan(newPan);
  }, []);

  const handleZoomOut = useCallback(() => {
    const container = canvasContainerRef.current;
    const oldScale = zoomRef.current;
    const newScale = Math.max(0.1, oldScale / 1.2);
    if (newScale === oldScale) return;

    const cx = (container?.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 1000)) / 2;
    const cy = (container?.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 800)) / 2;
    const worldX = (cx - panRef.current.x) / oldScale;
    const worldY = (cy - panRef.current.y) / oldScale;

    const newPan = {
      x: cx - worldX * newScale,
      y: cy - worldY * newScale,
    };
    zoomRef.current = newScale;
    panRef.current = newPan;
    setZoom(newScale);
    setPan(newPan);
  }, []);

  const handleResetZoom = useCallback(() => {
    const container = canvasContainerRef.current;
    const oldScale = zoomRef.current;
    const newScale = 1.0;

    const cx = (container?.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 1000)) / 2;
    const cy = (container?.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 800)) / 2;
    const worldX = (cx - panRef.current.x) / oldScale;
    const worldY = (cy - panRef.current.y) / oldScale;

    const newPan = {
      x: cx - worldX * newScale,
      y: cy - worldY * newScale,
    };
    zoomRef.current = newScale;
    panRef.current = newPan;
    setZoom(newScale);
    setPan(newPan);
  }, []);

  // Non-passive native wheel listener to isolate canvas zoom/pan from browser-level page zoom
  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;

    const onWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement | null;

      // Don't pan or zoom canvas if scrolling inside top ribbon, a modal dialog, or dropdowns
      if (
        target?.closest('[role="dialog"]') ||
        target?.closest('[data-modal="true"]') ||
        (ribbonRef.current && ribbonRef.current.contains(target))
      ) {
        return;
      }

      // If scrolling inside an editable text area that has its own vertical scroll overflow, let it scroll
      const editorEl = target?.closest('.ProseMirror') as HTMLElement | null;
      if (editorEl && !e.ctrlKey && !e.metaKey && editorEl.scrollHeight > editorEl.clientHeight) {
        return;
      }

      // Block native browser page zoom and document scroll
      e.preventDefault();
      e.stopPropagation();

      const rect = container.getBoundingClientRect();
      const pointerX = e.clientX - rect.left;
      const pointerY = e.clientY - rect.top;

      // Trackpad Pinch-to-Zoom OR Ctrl/Cmd + Mouse Wheel
      if (e.ctrlKey || e.metaKey) {
        const oldScale = zoomRef.current;
        const currentPan = panRef.current;

        // Position in canvas world space under the cursor
        const mousePointTo = {
          x: (pointerX - currentPan.x) / oldScale,
          y: (pointerY - currentPan.y) / oldScale,
        };

        // Normalize delta based on deltaMode (pixel vs line vs page)
        let delta = -e.deltaY;
        if (e.deltaMode === 1) {
          delta *= 24;
        } else if (e.deltaMode === 2) {
          delta *= 100;
        }

        // Clamp delta magnitude to prevent huge jumps from fast flicks
        const clampedDelta = Math.max(-120, Math.min(120, delta));

        // Smooth calibrated exponential scaling (~10-15% per mouse wheel notch, continuous for trackpad)
        const zoomFactor = Math.exp(clampedDelta * 0.0015);
        const newScale = Math.max(0.1, Math.min(5.0, oldScale * zoomFactor));

        // Pan adjustment keeps the exact world point under the cursor unchanged
        const newPan = {
          x: pointerX - mousePointTo.x * newScale,
          y: pointerY - mousePointTo.y * newScale,
        };

        zoomRef.current = newScale;
        panRef.current = newPan;

        setZoom(newScale);
        setPan(newPan);
      } else {
        // Trackpad 2-finger pan or regular mouse wheel scroll
        let dx = e.shiftKey ? e.deltaY : e.deltaX;
        let dy = e.shiftKey ? 0 : e.deltaY;

        if (e.deltaMode === 1) {
          dx *= 24;
          dy *= 24;
        } else if (e.deltaMode === 2) {
          dx *= 100;
          dy *= 100;
        }

        const newPan = {
          x: panRef.current.x - dx,
          y: panRef.current.y - dy,
        };

        panRef.current = newPan;
        setPan(newPan);
      }
    };

    const preventGesture = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };

    container.addEventListener('wheel', onWheel, { passive: false });
    container.addEventListener('gesturestart', preventGesture, { passive: false });
    container.addEventListener('gesturechange', preventGesture, { passive: false });
    container.addEventListener('gestureend', preventGesture, { passive: false });
    window.addEventListener('gesturestart', preventGesture, { passive: false });
    window.addEventListener('gesturechange', preventGesture, { passive: false });

    return () => {
      container.removeEventListener('wheel', onWheel);
      container.removeEventListener('gesturestart', preventGesture);
      container.removeEventListener('gesturechange', preventGesture);
      container.removeEventListener('gestureend', preventGesture);
      window.removeEventListener('gesturestart', preventGesture);
      window.removeEventListener('gesturechange', preventGesture);
    };
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button === 1 || isSpacePanning) { // Middle click or Spacebar pan
      e.preventDefault();
      setIsMiddleClickPanning(true);
      if (isSpacePanning) {
        setIsSpaceDragging(true);
        spaceDragStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
      }
      document.body.style.cursor = 'grabbing';
    }
  }, [isSpacePanning, pan.x, pan.y]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    mousePosRef.current = { x: e.clientX, y: e.clientY };

    if (isSpaceDragging && spaceDragStartRef.current) {
      const dx = e.clientX - spaceDragStartRef.current.x;
      const dy = e.clientY - spaceDragStartRef.current.y;
      setPan({
        x: spaceDragStartRef.current.panX + dx,
        y: spaceDragStartRef.current.panY + dy,
      });
      return;
    }

    if (isMiddleClickPanning) {
      setPan(prev => ({
        x: prev.x + e.movementX,
        y: prev.y + e.movementY
      }));
    }
  }, [isMiddleClickPanning, isSpaceDragging]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (isSpaceDragging) {
      setIsSpaceDragging(false);
      spaceDragStartRef.current = null;
      document.body.style.cursor = isSpacePanning ? 'grab' : '';
      return;
    }

    if (e.button === 1 || isMiddleClickPanning) {
      setIsMiddleClickPanning(false);
      document.body.style.cursor = isSpacePanning ? 'grab' : '';
    }
  }, [isMiddleClickPanning, isSpaceDragging, isSpacePanning]);

  // Spacebar pan key listeners
  useEffect(() => {
    const handleSpaceKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        const activeEl = document.activeElement;
        const isInputFocused = activeEl && (
          activeEl.tagName === 'INPUT' || 
          activeEl.tagName === 'TEXTAREA' || 
          (activeEl as HTMLElement).isContentEditable
        );
        if (!isInputFocused && !e.repeat) {
          setIsSpacePanning(true);
          document.body.style.cursor = 'grab';
        }
      }
    };

    const handleSpaceKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePanning(false);
        setIsSpaceDragging(false);
        spaceDragStartRef.current = null;
        document.body.style.cursor = '';
      }
    };

    window.addEventListener('keydown', handleSpaceKeyDown);
    window.addEventListener('keyup', handleSpaceKeyUp);
    return () => {
      window.removeEventListener('keydown', handleSpaceKeyDown);
      window.removeEventListener('keyup', handleSpaceKeyUp);
    };
  }, []);

  // Global Clipboard Paste (Cmd+V / Ctrl+V) for images and text directly onto canvas
  useEffect(() => {
    const handleGlobalPaste = async (e: ClipboardEvent) => {
      const activeEl = document.activeElement;
      const isInputFocused = activeEl && (
        activeEl.tagName === 'INPUT' || 
        activeEl.tagName === 'TEXTAREA' || 
        (activeEl as HTMLElement).isContentEditable
      );
      if (isInputFocused) return; // Allow normal paste inside inputs and TipTap editors

      const items = e.clipboardData?.items;
      if (!items) return;

      // Calculate paste position on canvas
      const screenPos = mousePosRef.current || { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      const worldX = (screenPos.x - pan.x) / zoom;
      const worldY = (screenPos.y - pan.y) / zoom;

      // Check for image in clipboard
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            e.preventDefault();
            const toastId = toast.loading("Pasting image...");
            try {
              const result = await uploadMediaFile(file, pageId);
              setImages(prev => [...(prev || []), {
                id: uuidv4(),
                x: worldX - 150,
                y: worldY - 150,
                url: result.url,
              }]);
              toast.success("Image pasted!", { id: toastId });
            } catch (err: any) {
              toast.error("Failed to paste image: " + err.message, { id: toastId });
            }
            return;
          }
        }
      }

      // Check for plain text
      const pastedText = e.clipboardData?.getData('text/plain');
      if (pastedText && pastedText.trim().length > 0) {
        e.preventDefault();
        const snapY = backgroundStyle === 'ruled' || backgroundStyle === 'grid' ? Math.round(worldY / 32) * 32 : worldY;
        const newId = uuidv4();
        const htmlContent = pastedText.split('\n').map(line => `<p>${line || '<br>'}</p>`).join('');
        setTexts(prev => [...prev, {
          id: newId,
          x: worldX,
          y: snapY,
          width: 600,
          content: htmlContent,
        }]);
        setSelectedIds([newId]);
        toast.success("Text pasted!");
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, [pan.x, pan.y, zoom, pageId, backgroundStyle, setImages, setTexts, setSelectedIds]);

  // Drag-and-drop file upload directly onto canvas
  const handleCanvasDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFilesOver(false);

    const filesList = Array.from(e.dataTransfer.files);
    if (filesList.length === 0) return;

    const dropX = (e.clientX - pan.x) / zoom;
    const dropY = (e.clientY - pan.y) / zoom;

    for (let i = 0; i < filesList.length; i++) {
      const file = filesList[i];
      const offsetX = i * 30;
      const offsetY = i * 30;

      if (file.type.startsWith('image/')) {
        const toastId = toast.loading(`Uploading image ${file.name}...`);
        try {
          const res = await uploadMediaFile(file, pageId);
          setImages(prev => [...(prev || []), {
            id: uuidv4(),
            x: dropX - 150 + offsetX,
            y: dropY - 150 + offsetY,
            url: res.url,
          }]);
          toast.success(`Image ${file.name} added!`, { id: toastId });
        } catch (err: any) {
          toast.error(`Upload failed: ${err.message}`, { id: toastId });
        }
      } else if (file.type.startsWith('audio/')) {
        const toastId = toast.loading(`Uploading audio ${file.name}...`);
        try {
          const res = await uploadMediaFile(file, pageId);
          setAudios(prev => [...(prev || []), {
            id: uuidv4(),
            x: dropX - 160 + offsetX,
            y: dropY - 40 + offsetY,
            url: res.url,
            title: file.name,
          }]);
          toast.success(`Audio ${file.name} added!`, { id: toastId });
        } catch (err: any) {
          toast.error(`Upload failed: ${err.message}`, { id: toastId });
        }
      } else {
        const toastId = toast.loading(`Uploading file ${file.name}...`);
        try {
          const res = await uploadMediaFile(file, pageId);
          setFiles(prev => [...(prev || []), {
            id: uuidv4(),
            x: dropX - 128 + offsetX,
            y: dropY - 32 + offsetY,
            url: res.url,
            filename: file.name,
          }]);
          toast.success(`File ${file.name} added!`, { id: toastId });
        } catch (err: any) {
          toast.error(`Upload failed: ${err.message}`, { id: toastId });
        }
      }
    }
  }, [pan.x, pan.y, zoom, pageId, setImages, setAudios, setFiles]);

  // Keyboard Shortcuts for Undo/Redo and Deletion
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInputFocused = activeEl && (
        activeEl.tagName === 'INPUT' || 
        activeEl.tagName === 'TEXTAREA' || 
        (activeEl as HTMLElement).isContentEditable
      );

      if (e.key === 'Escape') {
        setSelectedIds([]);
        if (typeof document !== 'undefined' && document.activeElement) {
          (document.activeElement as HTMLElement)?.blur?.();
        }
      }

      if (!isInputFocused && (e.key === 'Delete' || e.key === 'Backspace')) {
        if (selectedIds.length > 0) {
          e.preventDefault();
          handleDeleteSelection();
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
      if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        handleZoomIn();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === '-' || e.key === '_')) {
        e.preventDefault();
        handleZoomOut();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault();
        handleResetZoom();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, selectedIds, setStrokes, setTexts, setImages, setVideos, setFiles, setAudios, setSelectedIds, handleZoomIn, handleZoomOut, handleResetZoom]);

  if (loading) {
    return <div className="w-full h-full flex items-center justify-center text-zinc-500">Loading canvas...</div>;
  }

  return (
    <div 
      ref={canvasContainerRef}
      className={`w-full h-full relative overflow-hidden ${pageColor === 'default' ? 'bg-[#fafafa] dark:bg-zinc-900' : ''}`}
      style={{ touchAction: 'none', backgroundColor: pageColor === 'default' ? undefined : pageColor }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setIsDraggingFilesOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setIsDraggingFilesOver(false);
        }
      }}
      onDrop={handleCanvasDrop}
    >
      
      {/* Top Ribbon Container */}
      <div 
        ref={ribbonRef}
        className="absolute top-0 left-0 w-full bg-[#f3f2f1] dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 z-50 flex flex-col pointer-events-auto"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        {/* Tab Headers and Quick Access Toolbar */}
        <div className="flex items-end px-2 pt-1 gap-4">
          
          {/* Inject headerControls here on the left */}
          {headerControls && (
            <div className="flex items-center pb-1 mr-2 gap-1 border-r border-zinc-300 dark:border-zinc-700 pr-2">
              {headerControls}
            </div>
          )}

          <div className="flex gap-1">
            {(["Home", "Insert", "Record", "Draw", "Flowchart", "History", "View"] as RibbonTab[]).map(tab => (
              <button
                key={tab}
                onClick={() => {
                  setActiveTab(tab);
                  setIsRibbonExpanded(true);
                  if (tab === "Draw") setTool("pen");
                  else if (tab === "Flowchart") setTool("home");
                  else setTool("home");
                }}
                onDoubleClick={() => {
                  setIsRibbonExpanded(prev => !prev);
                }}
                title="Click to switch tab, double-click to toggle ribbon"
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

          <div className="ml-auto mb-1 flex items-center gap-2">
            {audios && audios.length > 0 && (
              <button
                onClick={() => toggleCollapseAllAudios()}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 rounded-full transition-colors border border-zinc-200 dark:border-zinc-700 shadow-2xs"
                title={areAllAudiosCollapsed ? "Expand all cards on canvas" : "Collapse all cards on canvas"}
              >
                {areAllAudiosCollapsed ? <Maximize2 size={12} /> : <Minimize2 size={12} />}
                <span>{areAllAudiosCollapsed ? "Expand All Cards" : "Collapse All Cards"}</span>
                <span className="text-[10px] bg-zinc-200 dark:bg-zinc-700 px-1.5 py-0.2 rounded-full font-bold text-zinc-700 dark:text-zinc-300">
                  {audios.length}
                </span>
              </button>
            )}
            <button
              onClick={() => handleOpenMeetingWorkspace()}
              className="flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-700 hover:to-indigo-700 text-white rounded-full text-xs font-semibold shadow-xs transition-transform active:scale-95"
              title="Open Foresight & Granola Meeting Workspace"
            >
              <Sparkles size={13} className="text-amber-200" />
              <span>Meeting Workspace</span>
            </button>
          </div>
        </div>
        
        {/* Ribbon Content */}
        {isRibbonExpanded && (
          <div className="h-[48px] bg-white dark:bg-zinc-900 flex items-center px-3 gap-2 shadow-sm border-b border-zinc-200 dark:border-zinc-800 overflow-x-auto no-scrollbar">
            {activeTab === "Home" && (
              <div className="flex items-center gap-1.5 h-full py-1">
                {/* 1. Selection Tool */}
                <button
                  onClick={() => setTool("home")}
                  className={`flex flex-col items-center justify-center h-full px-2.5 rounded ${tool === "home" ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300'}`}
                  title="Select / Pointer"
                >
                  <MousePointer2 size={16} strokeWidth={2} />
                  <span className="text-[9px] font-medium mt-0.5">Select</span>
                </button>
                
                <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-700 mx-1 flex-shrink-0" />

                {/* 2. Styles / Heading Dropdown */}
                <CustomSelect
                  width="w-28"
                  dropdownWidth="w-36"
                  placeholder="Style"
                  options={STYLE_OPTIONS}
                  disabled={!activeEditor}
                  value={getCurrentStyle(activeEditor)}
                  onChange={(val) => {
                    if (activeEditor) applyStyle(activeEditor, val);
                  }}
                />

                <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-700 mx-1 flex-shrink-0" />

                {/* 3. Font Family & Size */}
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
                  
                  {/* Quick Increase / Decrease Font Size Buttons */}
                  <button
                    onMouseDown={(e) => {
                      e.preventDefault();
                      if (!activeEditor) return;
                      const currentSizeStr = activeEditor.getAttributes('textStyle')?.fontSize || '16px';
                      const currentNum = parseInt(currentSizeStr) || 16;
                      const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72];
                      const nextSize = SIZES.find(s => s > currentNum) || (currentNum + 4);
                      (activeEditor.chain().focus() as any).setFontSize(`${nextSize}px`).run();
                    }}
                    disabled={!activeEditor}
                    className={`px-1.5 py-1 text-xs font-bold rounded transition-colors flex items-center gap-0.5 ${!activeEditor ? 'opacity-40 cursor-not-allowed text-zinc-400' : 'text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                    title="Increase Font Size (A▲)"
                  >
                    <span>A</span><span className="text-[8px] leading-none">▲</span>
                  </button>
                  <button
                    onMouseDown={(e) => {
                      e.preventDefault();
                      if (!activeEditor) return;
                      const currentSizeStr = activeEditor.getAttributes('textStyle')?.fontSize || '16px';
                      const currentNum = parseInt(currentSizeStr) || 16;
                      const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72];
                      const prevSize = [...SIZES].reverse().find(s => s < currentNum) || Math.max(8, currentNum - 2);
                      (activeEditor.chain().focus() as any).setFontSize(`${prevSize}px`).run();
                    }}
                    disabled={!activeEditor}
                    className={`px-1.5 py-1 text-xs font-bold rounded transition-colors flex items-center gap-0.5 ${!activeEditor ? 'opacity-40 cursor-not-allowed text-zinc-400' : 'text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                    title="Decrease Font Size (A▼)"
                  >
                    <span>A</span><span className="text-[8px] leading-none">▼</span>
                  </button>

                  {/* Clear Formatting */}
                  <button
                    onMouseDown={(e) => {
                      e.preventDefault();
                      if (activeEditor) clearFormatting(activeEditor);
                    }}
                    disabled={!activeEditor}
                    className={`p-1.5 rounded transition-colors ${!activeEditor ? 'opacity-40 cursor-not-allowed text-zinc-400' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                    title="Clear All Formatting (Remove styles, fonts, sizes)"
                  >
                    <RemoveFormatting size={14} />
                  </button>
                </div>

                <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-700 mx-1 flex-shrink-0" />

                {/* 4. Bold, Italic, Underline, Strikethrough, Sub, Sup */}
                <div className="flex items-center">
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => activeEditor?.chain().focus().toggleBold().run()}
                    disabled={!activeEditor}
                    className={`p-1.5 rounded transition-colors ${activeEditor?.isActive('bold') ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-white' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'} ${!activeEditor ? 'opacity-40 cursor-not-allowed' : ''}`}
                    title="Bold (Ctrl+B)"
                  >
                    <Bold size={14} />
                  </button>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => activeEditor?.chain().focus().toggleItalic().run()}
                    disabled={!activeEditor}
                    className={`p-1.5 rounded transition-colors ${activeEditor?.isActive('italic') ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-white' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'} ${!activeEditor ? 'opacity-40 cursor-not-allowed' : ''}`}
                    title="Italic (Ctrl+I)"
                  >
                    <Italic size={14} />
                  </button>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => activeEditor?.chain().focus().toggleUnderline().run()}
                    disabled={!activeEditor}
                    className={`p-1.5 rounded transition-colors ${activeEditor?.isActive('underline') ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-white' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'} ${!activeEditor ? 'opacity-40 cursor-not-allowed' : ''}`}
                    title="Underline (Ctrl+U)"
                  >
                    <UnderlineIcon size={14} />
                  </button>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => activeEditor?.chain().focus().toggleStrike().run()}
                    disabled={!activeEditor}
                    className={`p-1.5 rounded transition-colors ${activeEditor?.isActive('strike') ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-white' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'} ${!activeEditor ? 'opacity-40 cursor-not-allowed' : ''}`}
                    title="Strikethrough"
                  >
                    <Strikethrough size={14} />
                  </button>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => (activeEditor?.chain().focus() as any)?.toggleSubscript().run()}
                    disabled={!activeEditor}
                    className={`p-1.5 rounded transition-colors ${(activeEditor as any)?.isActive('subscript') ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-white' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'} ${!activeEditor ? 'opacity-40 cursor-not-allowed' : ''}`}
                    title="Subscript (X₂)"
                  >
                    <SubscriptIcon size={14} />
                  </button>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => (activeEditor?.chain().focus() as any)?.toggleSuperscript().run()}
                    disabled={!activeEditor}
                    className={`p-1.5 rounded transition-colors ${(activeEditor as any)?.isActive('superscript') ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-white' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'} ${!activeEditor ? 'opacity-40 cursor-not-allowed' : ''}`}
                    title="Superscript (X²)"
                  >
                    <SuperscriptIcon size={14} />
                  </button>
                </div>

                <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-700 mx-1 flex-shrink-0" />

                {/* 5. Text Color & Highlight Color */}
                <div className="flex items-center gap-0.5">
                  <div className="flex items-center relative">
                    <button
                      disabled={!activeEditor}
                      title={!activeEditor ? "Click inside a text block first" : "Text Color"}
                      className={`w-7 h-7 p-0 border-0 rounded flex flex-col items-center justify-center transition-opacity relative ${!activeEditor ? 'opacity-40 cursor-not-allowed' : 'opacity-100 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                      style={{ color: activeEditor?.getAttributes('textStyle')?.color || '#000000' }}
                      onClick={() => setOpenColorMenu(openColorMenu === 'text' ? null : 'text')}
                    >
                      <div className="font-serif text-xs font-bold leading-none">A</div>
                      <div className="w-4 h-[3px] mt-0.5 rounded-xs" style={{ backgroundColor: activeEditor?.getAttributes('textStyle')?.color || '#000000' }}></div>
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

                  {/* Highlighter dropdown palette */}
                  <HighlightDropdown 
                    editor={activeEditor}
                    isOpen={openColorMenu === 'highlight'}
                    onToggle={() => setOpenColorMenu(openColorMenu === 'highlight' ? null : 'highlight')}
                    onClose={() => setOpenColorMenu(null)}
                  />
                </div>

                <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-700 mx-1 flex-shrink-0" />

                {/* 6. Alignment, Indent & Line Spacing */}
                <div className="flex items-center">
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => activeEditor?.chain().focus().setTextAlign('left').run()}
                    disabled={!activeEditor}
                    className={`p-1.5 rounded transition-colors ${activeEditor?.isActive({ textAlign: 'left' }) ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-white' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'} ${!activeEditor ? 'opacity-40 cursor-not-allowed' : ''}`}
                    title="Align Left"
                  >
                    <AlignLeft size={14} />
                  </button>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => activeEditor?.chain().focus().setTextAlign('center').run()}
                    disabled={!activeEditor}
                    className={`p-1.5 rounded transition-colors ${activeEditor?.isActive({ textAlign: 'center' }) ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-white' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'} ${!activeEditor ? 'opacity-40 cursor-not-allowed' : ''}`}
                    title="Align Center"
                  >
                    <AlignCenter size={14} />
                  </button>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => activeEditor?.chain().focus().setTextAlign('right').run()}
                    disabled={!activeEditor}
                    className={`p-1.5 rounded transition-colors ${activeEditor?.isActive({ textAlign: 'right' }) ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-white' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'} ${!activeEditor ? 'opacity-40 cursor-not-allowed' : ''}`}
                    title="Align Right"
                  >
                    <AlignRight size={14} />
                  </button>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => activeEditor?.chain().focus().setTextAlign('justify').run()}
                    disabled={!activeEditor}
                    className={`p-1.5 rounded transition-colors ${activeEditor?.isActive({ textAlign: 'justify' }) ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-white' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'} ${!activeEditor ? 'opacity-40 cursor-not-allowed' : ''}`}
                    title="Justify"
                  >
                    <AlignJustify size={14} />
                  </button>

                  <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-0.5" />

                  {/* Indent / Outdent */}
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => activeEditor && executeOutdent(activeEditor)}
                    disabled={!activeEditor}
                    className={`p-1.5 rounded transition-colors text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 ${!activeEditor ? 'opacity-40 cursor-not-allowed' : ''}`}
                    title="Decrease Indent (Shift+Tab)"
                  >
                    <OutdentIcon size={14} />
                  </button>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => activeEditor && executeIndent(activeEditor)}
                    disabled={!activeEditor}
                    className={`p-1.5 rounded transition-colors text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 ${!activeEditor ? 'opacity-40 cursor-not-allowed' : ''}`}
                    title="Increase Indent (Tab)"
                  >
                    <IndentIcon size={14} />
                  </button>

                  <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-0.5" />

                  {/* Line Spacing Adjuster */}
                  <LineSpacingDropdown 
                    editor={activeEditor}
                  />
                </div>

                <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-700 mx-1 flex-shrink-0" />

                {/* 7. Lists */}
                <div className="flex items-center">
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => activeEditor?.chain().focus().toggleBulletList().run()}
                    disabled={!activeEditor}
                    className={`p-1.5 rounded transition-colors ${activeEditor?.isActive('bulletList') ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-white' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'} ${!activeEditor ? 'opacity-40 cursor-not-allowed' : ''}`}
                    title="Bullet List"
                  >
                    <List size={14} />
                  </button>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => activeEditor?.chain().focus().toggleOrderedList().run()}
                    disabled={!activeEditor}
                    className={`p-1.5 rounded transition-colors ${activeEditor?.isActive('orderedList') ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-white' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'} ${!activeEditor ? 'opacity-40 cursor-not-allowed' : ''}`}
                    title="Numbered List"
                  >
                    <ListOrdered size={14} />
                  </button>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => (activeEditor?.chain().focus() as any)?.toggleTaskList().run()}
                    disabled={!activeEditor}
                    className={`p-1.5 rounded transition-colors ${(activeEditor as any)?.isActive('taskList') ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-white' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'} ${!activeEditor ? 'opacity-40 cursor-not-allowed' : ''}`}
                    title="To-Do Checklist"
                  >
                    <CheckSquare size={14} />
                  </button>
                </div>

                <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-700 mx-1 flex-shrink-0" />

                {/* 8. Insert Extras: Quote, Code, Horizontal Line, Link */}
                <div className="flex items-center">
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => activeEditor?.chain().focus().toggleBlockquote().run()}
                    disabled={!activeEditor}
                    className={`p-1.5 rounded transition-colors ${activeEditor?.isActive('blockquote') ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-white' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'} ${!activeEditor ? 'opacity-40 cursor-not-allowed' : ''}`}
                    title="Blockquote"
                  >
                    <Quote size={14} />
                  </button>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => activeEditor?.chain().focus().toggleCode().run()}
                    disabled={!activeEditor}
                    className={`p-1.5 rounded transition-colors ${activeEditor?.isActive('code') ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-white' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'} ${!activeEditor ? 'opacity-40 cursor-not-allowed' : ''}`}
                    title="Inline Code"
                  >
                    <Code size={14} />
                  </button>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => activeEditor?.chain().focus().setHorizontalRule().run()}
                    disabled={!activeEditor}
                    className={`p-1.5 rounded transition-colors text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 ${!activeEditor ? 'opacity-40 cursor-not-allowed' : ''}`}
                    title="Horizontal Line / Divider"
                  >
                    <Minus size={14} />
                  </button>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => activeEditor && handleToggleLink(activeEditor)}
                    disabled={!activeEditor}
                    className={`p-1.5 rounded transition-colors ${activeEditor?.isActive('link') ? 'bg-primary-100 dark:bg-primary-900/50 text-primary-600 dark:text-primary-400' : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'} ${!activeEditor ? 'opacity-40 cursor-not-allowed' : ''}`}
                    title={activeEditor?.isActive('link') ? "Remove Link" : "Insert Hyperlink"}
                  >
                    <Link2 size={14} />
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
                        Start Meeting
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

                  <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-700" />

                  <button
                    onClick={() => handleOpenMeetingWorkspace()}
                    className="flex flex-col items-center justify-center h-full px-3 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-primary-600 dark:text-primary-400 transition-colors"
                    title="Open Granola & Foresight style Meeting Workspace"
                  >
                    <Sparkles size={16} strokeWidth={2} />
                    <span className="text-[10px] font-bold mt-0.5">Meeting Workspace</span>
                  </button>

                  {audios && audios.length > 0 && (
                    <>
                      <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-700" />

                      <button
                        onClick={() => toggleCollapseAllAudios()}
                        className="flex flex-col items-center justify-center h-full px-3 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 transition-colors"
                        title={areAllAudiosCollapsed ? "Expand all meeting & recording cards" : "Collapse all meeting & recording cards"}
                      >
                        {areAllAudiosCollapsed ? <Maximize2 size={16} strokeWidth={2} /> : <Minimize2 size={16} strokeWidth={2} />}
                        <span className="text-[10px] font-medium mt-0.5">
                          {areAllAudiosCollapsed ? "Expand All Cards" : "Collapse All Cards"}
                        </span>
                      </button>
                    </>
                  )}
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
            {activeTab === "Flowchart" && (
              <div className="flex items-center gap-3 h-full py-1 overflow-x-auto no-scrollbar">
                {/* Pointer / Navigation Tools */}
                <div className="flex items-center gap-1 h-full">
                  <button
                    onClick={() => setTool("home")}
                    className={`flex flex-col items-center justify-center h-full px-2.5 rounded transition-colors ${tool === "home" ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 font-semibold' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300'}`}
                    title="Select & Move (Home)"
                  >
                    <MousePointer2 size={15} />
                    <span className="text-[10px] font-medium leading-none mt-1">Select</span>
                  </button>
                </div>

                <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-700 mx-0.5" />

                {/* Connector Tools */}
                <div className="flex items-center gap-1 h-full">
                  <button
                    onClick={() => {
                      setTool("connector");
                      setConnectorRouting("curved");
                    }}
                    className={`flex flex-col items-center justify-center h-full px-2.5 rounded transition-colors ${tool === "connector" && connectorRouting === "curved" ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-semibold ring-1 ring-blue-400/50' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300'}`}
                    title="Curved Bezier Connector (Default)"
                  >
                    <Spline size={15} />
                    <span className="text-[10px] font-medium leading-none mt-1">Curved</span>
                  </button>
                  <button
                    onClick={() => {
                      setTool("connector");
                      setConnectorRouting("orthogonal");
                    }}
                    className={`flex flex-col items-center justify-center h-full px-2.5 rounded transition-colors ${tool === "connector" && connectorRouting === "orthogonal" ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-semibold ring-1 ring-blue-400/50' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300'}`}
                    title="Elbow (Orthogonal 90° Connector)"
                  >
                    <CornerDownRight size={15} />
                    <span className="text-[10px] font-medium leading-none mt-1">Elbow</span>
                  </button>
                  <button
                    onClick={() => {
                      setTool("connector");
                      setConnectorRouting("straight");
                    }}
                    className={`flex flex-col items-center justify-center h-full px-2.5 rounded transition-colors ${tool === "connector" && connectorRouting === "straight" ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-semibold ring-1 ring-blue-400/50' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300'}`}
                    title="Straight Connector"
                  >
                    <MoveRight size={15} />
                    <span className="text-[10px] font-medium leading-none mt-1">Straight</span>
                  </button>
                </div>

                <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-700 mx-0.5" />

                {/* Shape Palette (Click to insert) */}
                <div className="flex items-center gap-1 h-full">
                  {[
                    { type: 'rectangle', icon: <Square size={14} />, label: 'Process' },
                    { type: 'rounded', icon: <div className="w-4 h-2.5 rounded-full border border-current" />, label: 'Start/End' },
                    { type: 'diamond', icon: <RotateCw size={13} className="rotate-45" />, label: 'Decision' },
                    { type: 'circle', icon: <CircleIcon size={14} />, label: 'Event' },
                    { type: 'cylinder', icon: <Database size={14} />, label: 'Database' },
                    { type: 'note', icon: <StickyNote size={14} />, label: 'Note' },
                  ].map(sh => (
                    <button
                      key={sh.type}
                      onClick={() => handleInsertShape(sh.type as FlowchartShapeType, sh.label)}
                      className="flex flex-col items-center justify-center h-full px-2 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 transition-colors"
                      title={`Insert ${sh.label}`}
                    >
                      {sh.icon}
                      <span className="text-[10px] font-medium leading-none mt-1">{sh.label}</span>
                    </button>
                  ))}
                </div>

                <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-700 mx-0.5" />

                {/* Quick Presets */}
                <div className="flex items-center gap-1 h-full">
                  <button
                    onClick={() => handleInsertPresetWorkflow('linear')}
                    className="flex flex-col items-center justify-center h-full px-2.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 transition-colors"
                    title="Insert 3-Step Linear Process"
                  >
                    <span className="text-xs font-bold leading-none">1→2→3</span>
                    <span className="text-[10px] font-medium leading-none mt-1">Process</span>
                  </button>
                  <button
                    onClick={() => handleInsertPresetWorkflow('decision')}
                    className="flex flex-col items-center justify-center h-full px-2.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 transition-colors"
                    title="Insert Decision Tree Template"
                  >
                    <span className="text-xs font-bold leading-none">◇⇄</span>
                    <span className="text-[10px] font-medium leading-none mt-1">Decision</span>
                  </button>
                </div>

                <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-700 mx-0.5" />

                {/* AI Flowchart Generator (gemini-3.8-flash) */}
                <div className="flex items-center h-full">
                  <button
                    onClick={() => setIsAiFlowchartModalOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium text-xs shadow-xs transition-transform active:scale-95"
                    title="Generate Flowchart with Gemini 3.8 Flash"
                  >
                    <Workflow size={14} className="text-blue-100" />
                    <span>AI Flowchart</span>
                  </button>
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
                    onClick={handleZoomIn}
                    className="flex flex-col items-center justify-center h-full px-3 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
                    title="Zoom In (Cmd/Ctrl +)"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-0.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
                    <span className="text-[10px] font-medium leading-none mt-0.5">Zoom In</span>
                  </button>
                  <button
                    onClick={handleZoomOut}
                    className="flex flex-col items-center justify-center h-full px-3 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
                    title="Zoom Out (Cmd/Ctrl -)"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-0.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
                    <span className="text-[10px] font-medium leading-none mt-0.5">Zoom Out</span>
                  </button>
                  <button
                    onClick={handleResetZoom}
                    className="flex flex-col items-center justify-center h-full px-3 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
                    title="Reset to 100% (Cmd/Ctrl 0)"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-0.5"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 10.5 12 7l3 3.5"/><path d="M9 13.5 12 17l3-3.5"/></svg>
                    <span className="text-[10px] font-medium leading-none mt-0.5">{Math.round(zoom * 100)}%</span>
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
              : backgroundStyle === 'grid'
              ? `linear-gradient(to right, var(--line-color) 1px, transparent 1px), linear-gradient(to bottom, var(--line-color) 1px, transparent 1px)`
              : `radial-gradient(var(--line-color) calc(1.5px * ${zoom}), transparent calc(1.5px * ${zoom}))`,
            backgroundSize: backgroundStyle === 'ruled'
              ? `100% calc(32px * ${zoom})`
              : backgroundStyle === 'grid'
              ? `calc(32px * ${zoom}) calc(32px * ${zoom})`
              : `calc(24px * ${zoom}) calc(24px * ${zoom})`,
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
        <div className="flex items-center gap-3 w-[600px]">
          <input
            type="text"
            value={pageTitle}
            onChange={(e) => onUpdatePageTitle(e.target.value)}
            placeholder="Page Title"
            className="bg-transparent text-4xl font-bold text-zinc-900 dark:text-zinc-100 border-none outline-none focus:ring-0 placeholder:text-zinc-300 dark:placeholder:text-zinc-700 flex-1 min-w-0 pointer-events-auto"
          />
          {isJournal && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-xs font-bold text-amber-700 dark:text-amber-300 pointer-events-auto shadow-xs flex-shrink-0">
              <Flame size={14} className="text-amber-500 fill-amber-500/50" />
              <span>{streakCount} {streakCount === 1 ? 'Day' : 'Days'}</span>
            </div>
          )}
        </div>
        {/* Decorative OneNote-style underline */}
        <div className="w-[600px] h-[1px] bg-gradient-to-r from-zinc-300 to-transparent dark:from-zinc-700 mt-2"></div>
        {pageCreatedAt && (
          <div className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 whitespace-pre flex items-center gap-2">
            {isJournal && (
              <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold text-xs">
                <BookOpen size={13} />
                <span>Journal</span>
                <span>•</span>
              </span>
            )}
            <span>{format(new Date(pageCreatedAt), "EEEE, MMMM d, yyyy     h:mm a")}</span>
            {audios && audios.length > 0 && (
              <button
                type="button"
                onClick={() => toggleCollapseAllAudios()}
                className="pointer-events-auto inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-semibold rounded-full bg-white/90 dark:bg-zinc-800/90 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 shadow-xs border border-zinc-200 dark:border-zinc-700 transition-colors ml-3"
                title={areAllAudiosCollapsed ? "Expand all cards" : "Collapse all cards"}
              >
                {areAllAudiosCollapsed ? <Maximize2 size={11} /> : <Minimize2 size={11} />}
                <span>{areAllAudiosCollapsed ? "Expand All Cards" : "Collapse All Cards"}</span>
                <span className="text-[10px] bg-zinc-100 dark:bg-zinc-700 px-1.5 py-0.2 rounded-full font-bold">
                  {audios.length}
                </span>
              </button>
            )}
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
          onSelectionBoxChange={handleSelectionBoxChange}
          onSelectionBoxComplete={handleSelectionBoxComplete}
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
          onOpenMeetingWorkspace={(audioId) => handleOpenMeetingWorkspace(audioId)}
          onToggleCollapseAll={toggleCollapseAllAudios}
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
        <FlowchartOverlay
          shapes={shapes || []}
          setShapes={setShapes}
          connectors={connectors || []}
          setConnectors={setConnectors}
          pan={pan}
          zoom={zoom}
          tool={tool}
          setTool={setTool}
          selectedShapeId={selectedShapeId}
          setSelectedShapeId={setSelectedShapeId}
          selectedConnectorId={selectedConnectorId}
          setSelectedConnectorId={setSelectedConnectorId}
          activeShapeType={activeShapeType}
          defaultRouting={connectorRouting}
          onDragSelectionStart={handleDragSelectionStart}
          onDragSelectionMove={handleDragSelectionMove}
          onDragSelectionEnd={handleDragSelectionEnd}
        />
      </div>

      {selectedIds.length > 1 && getSelectionBounds() && (() => {
        const bounds = getSelectionBounds()!;
        const screenX = (bounds.x * zoom) + pan.x;
        const screenY = (bounds.y * zoom) + pan.y;
        const screenW = bounds.width * zoom;
        const screenH = bounds.height * zoom;
        
        return (
          <>
            {/* Dashed Selection Bounding Outline */}
            <div 
              className="absolute pointer-events-none border-2 border-dashed border-primary-500/80 rounded-lg z-30 transition-all duration-75"
              style={{ 
                left: screenX - 6, 
                top: screenY - 6,
                width: screenW + 12,
                height: screenH + 12,
                boxShadow: '0 0 0 1px rgba(59, 130, 246, 0.15), inset 0 0 0 1px rgba(59, 130, 246, 0.05)'
              }}
            />

            {/* Floating Selection Action Toolbar */}
            <div 
              className="absolute z-50 pointer-events-auto flex items-center gap-1.5 bg-white/95 dark:bg-zinc-800/95 backdrop-blur-md px-2.5 py-1.5 rounded-full shadow-xl border border-zinc-200 dark:border-zinc-700 animate-in fade-in zoom-in-95 duration-100"
              style={{ 
                left: Math.max(16, screenX), 
                top: Math.max(68, screenY - 48),
              }}
            >
              {/* Move Handle */}
              <div
                className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400 cursor-grab active:cursor-grabbing px-1.5 py-0.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors select-none"
                title="Drag to move all selected items"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleDragSelectionStart(selectedIds[0]);
                  setIsDraggingToolbar(true);
                  toolbarDragRef.current = { x: e.clientX, y: e.clientY };
                }}
              >
                <GripVertical size={13} className="text-zinc-400" />
                <span className="font-semibold text-[11px] text-zinc-700 dark:text-zinc-200">
                  {selectedIds.length === 1 ? '1 item' : `${selectedIds.length} items`}
                </span>
              </div>

              <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 my-auto" />

              {/* Delete Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteSelection();
                }}
                className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded transition-colors"
                title="Delete selected (Delete or Backspace)"
              >
                <Trash2 size={13} />
                <span>Delete</span>
              </button>

              {/* Organize Chaos button (if more than 1 item) */}
              {selectedIds.length > 1 && (
                <>
                  <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 my-auto" />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOrganize();
                    }}
                    className="flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700 rounded-full shadow-sm transition-all active:scale-95"
                    title="Synthesize selected items with AI"
                  >
                    <Sparkles size={13} />
                    <span>Organize</span>
                  </button>
                </>
              )}

              <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 my-auto" />

              {/* Deselect / Close Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedIds([]);
                }}
                className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                title="Deselect"
              >
                <X size={12} />
              </button>
            </div>
          </>
        );
      })()}

      {/* Drag & Drop Overlay */}
      {isDraggingFilesOver && (
        <div className="absolute inset-0 z-50 bg-primary-500/10 dark:bg-primary-500/20 backdrop-blur-xs border-4 border-dashed border-primary-500 rounded-lg flex flex-col items-center justify-center pointer-events-none transition-all">
          <div className="bg-white dark:bg-zinc-900 shadow-2xl rounded-2xl p-6 flex flex-col items-center gap-3 border border-primary-200 dark:border-primary-800">
            <div className="w-12 h-12 rounded-full bg-primary-100 dark:bg-primary-900/50 flex items-center justify-center text-primary-600 dark:text-primary-400">
              <Upload size={24} />
            </div>
            <p className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Drop files anywhere to add to canvas</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Supports images, audio recordings, documents, and PDFs</p>
          </div>
        </div>
      )}

      {showMinimap && (
        <Minimap
          strokes={strokes || []}
          texts={texts || []}
          images={images || []}
          files={files || []}
          videos={videos || []}
          audios={audios || []}
          shapes={shapes || []}
          pan={pan}
          zoom={zoom}
          setPan={setPan}
        />
      )}

      {/* Floating Canvas Zoom Controls */}
      <div 
        className={`absolute z-40 pointer-events-auto flex items-center bg-white/95 dark:bg-zinc-800/95 backdrop-blur-md border border-zinc-200/80 dark:border-zinc-700/80 rounded-full shadow-lg p-0.5 text-zinc-700 dark:text-zinc-200 select-none text-xs transition-all ${showMinimap ? 'bottom-56 right-6' : 'bottom-6 right-6'}`}
        style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <button
          onClick={handleZoomOut}
          title="Zoom Out (Cmd/Ctrl -)"
          className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-700 active:scale-95 transition-all text-zinc-600 dark:text-zinc-300"
        >
          <Minus size={13} />
        </button>
        <button
          onClick={handleResetZoom}
          title="Reset Zoom to 100% (Cmd/Ctrl 0)"
          className="px-2 h-7 font-medium text-[11px] hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-full transition-colors tabular-nums"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          onClick={handleZoomIn}
          title="Zoom In (Cmd/Ctrl +)"
          className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-700 active:scale-95 transition-all text-zinc-600 dark:text-zinc-300"
        >
          <Plus size={13} />
        </button>
      </div>

      {/* Foresight & Granola Meeting Workspace Modal */}
      <MeetingWorkspace 
        isOpen={isMeetingWorkspaceOpen}
        onClose={() => setIsMeetingWorkspaceOpen(false)}
        activeAudioNode={activeMeetingAudio}
        updateAudioField={updateAudioField}
        isLiveRecording={isRecording}
        recordingDuration={recordingDuration}
        isRecordingPaused={isPaused}
        onPauseRecording={pauseRecording}
        onResumeRecording={resumeRecording}
        onStopRecording={stopRecording}
        onStartRecording={startRecording}
        audios={audios || []}
        onSelectAudioNode={(id) => setMeetingWorkspaceAudioId(id)}
        onExplodeToCanvas={(notesText, summaryText) => {
          setIsMeetingWorkspaceOpen(false);
          const worldX = (-pan.x + window.innerWidth / 3) / zoom;
          const worldY = (-pan.y + window.innerHeight / 3) / zoom;
          if (notesText?.trim()) {
            const htmlNotes = notesText.split('\n').map(l => `<p>${l || '<br>'}</p>`).join('');
            setTexts(prev => [...prev, { id: uuidv4(), x: worldX, y: worldY, width: 500, content: htmlNotes }]);
          }
          if (summaryText?.trim()) {
            const htmlSummary = summaryText.split('\n').map(l => `<p>${l || '<br>'}</p>`).join('');
            setTexts(prev => [...prev, { id: uuidv4(), x: worldX + 540, y: worldY, width: 500, content: htmlSummary }]);
          }
          toast.success("Meeting takeaways exploded onto your canvas!");
        }}
        pageTitle={pageTitle}
      />

      {/* AI Flowchart Generator Modal (Powered by Gemini 3.8 Flash) */}
      {isAiFlowchartModalOpen && (
        <div 
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 pointer-events-auto animate-in fade-in duration-150"
          onClick={() => !isGeneratingFlowchart && setIsAiFlowchartModalOpen(false)}
        >
          <div 
            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl max-w-lg w-full p-6 flex flex-col gap-4 text-zinc-900 dark:text-zinc-100"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <Workflow size={20} />
                </div>
                <div>
                  <h3 className="font-semibold text-base">AI Flowchart Generator</h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Powered by Google Gemini 3.8 Flash</p>
                </div>
              </div>
              <button
                disabled={isGeneratingFlowchart}
                onClick={() => setIsAiFlowchartModalOpen(false)}
                className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Prompt input */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Describe the workflow, decision tree, or process:
              </label>
              <textarea
                autoFocus
                disabled={isGeneratingFlowchart}
                rows={4}
                value={aiFlowchartPrompt}
                onChange={(e) => setAiFlowchartPrompt(e.target.value)}
                placeholder="e.g. User onboarding flow: Sign up, verify email, if verified take to dashboard, else send reminder and allow resend..."
                className="w-full text-xs p-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 focus:outline-none focus:ring-2 focus:ring-blue-500 text-zinc-900 dark:text-zinc-100 resize-none"
              />
            </div>

            {/* Quick Suggestions */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] text-zinc-500 font-medium">Quick Suggestions:</span>
              <div className="flex flex-wrap gap-1.5">
                {[
                  "User Sign-Up & Verification",
                  "Customer Refund Decision Tree",
                  "Bug Triage & Resolution Cycle",
                  "Product Launch Roadmap"
                ].map((sug) => (
                  <button
                    key={sug}
                    type="button"
                    disabled={isGeneratingFlowchart}
                    onClick={() => setAiFlowchartPrompt(sug)}
                    className="text-[11px] px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-zinc-700 dark:text-zinc-300 hover:text-blue-600 dark:hover:text-blue-400 border border-transparent hover:border-blue-400 transition-colors"
                  >
                    {sug}
                  </button>
                ))}
              </div>
            </div>

            {/* Context from Page Notes & Audios */}
            {((texts && texts.length > 0) || (audios && audios.length > 0)) && (
              <div className="p-3 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-900/40 rounded-xl flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-blue-900 dark:text-blue-200">Current Page Notes Available</p>
                  <p className="text-[11px] text-blue-700/80 dark:text-blue-400">Generate directly from your meeting transcript and notes</p>
                </div>
                <button
                  type="button"
                  disabled={isGeneratingFlowchart}
                  onClick={() => handleGenerateAiFlowchart(undefined, true)}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors whitespace-nowrap"
                >
                  Use Page Notes
                </button>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <button
                type="button"
                disabled={isGeneratingFlowchart}
                onClick={() => setIsAiFlowchartModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isGeneratingFlowchart || !aiFlowchartPrompt.trim()}
                onClick={() => handleGenerateAiFlowchart(aiFlowchartPrompt, false)}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl shadow-xs transition-transform active:scale-95"
              >
                {isGeneratingFlowchart ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Generating with Gemini 3.8 Flash...</span>
                  </>
                ) : (
                  <>
                    <Workflow size={14} />
                    <span>Generate Flowchart</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
