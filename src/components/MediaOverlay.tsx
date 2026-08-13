"use client";

import React, { useCallback, useRef, useState, useEffect } from "react";
import type { ImageNode, FileNode, VideoNode, ToolType } from "./CustomCanvas";
import { Trash2, GripVertical, File, Download } from "lucide-react";

interface MediaOverlayProps {
  images: ImageNode[];
  setImages: React.Dispatch<React.SetStateAction<ImageNode[]>>;
  files: FileNode[];
  setFiles: React.Dispatch<React.SetStateAction<FileNode[]>>;
  videos: VideoNode[];
  setVideos: React.Dispatch<React.SetStateAction<VideoNode[]>>;
  pan: { x: number; y: number };
  zoom: number;
  tool: ToolType;
  selectedIds?: string[];
  setSelectedIds?: React.Dispatch<React.SetStateAction<string[]>>;
  onDragSelectionStart?: (id: string) => void;
  onDragSelectionMove?: (deltaX: number, deltaY: number) => void;
  onDragSelectionEnd?: () => void;
  onAnnotate?: (id: string) => void;
}

type DragType = 'image' | 'file' | 'video';

export function MediaOverlay({ 
  images, setImages, 
  files, setFiles,
  videos, setVideos,
  pan, zoom, tool,
  selectedIds = [], setSelectedIds,
  onDragSelectionStart, onDragSelectionMove, onDragSelectionEnd,
  onAnnotate
}: MediaOverlayProps) {
  
  const [dragging, setDragging] = useState<{ id: string, type: DragType } | null>(null);
  const dragStartRef = useRef<{ x: number, y: number, nodeX: number, nodeY: number } | null>(null);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (dragging && dragStartRef.current) {
      const deltaX = (e.clientX - dragStartRef.current.x) / zoom;
      const deltaY = (e.clientY - dragStartRef.current.y) / zoom;
      onDragSelectionMove?.(deltaX, deltaY);
    }
  }, [dragging, zoom, onDragSelectionMove]);

  const handlePointerUp = useCallback(() => {
    if (dragging) {
      onDragSelectionEnd?.();
    }
    setDragging(null);
    dragStartRef.current = null;
  }, [dragging, onDragSelectionEnd]);

  useEffect(() => {
    if (dragging) {
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    }
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [dragging, handlePointerMove, handlePointerUp]);

  const onDragStart = (e: React.PointerEvent, id: string, type: DragType, currentX: number, currentY: number) => {
    e.stopPropagation();
    if (tool !== "home") return;
    onDragSelectionStart?.(id);
    setDragging({ id, type });
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      nodeX: currentX,
      nodeY: currentY
    };
  };

  const getEmbedUrl = (url: string) => {
    let videoId = "";
    if (url.includes("youtube.com/watch")) {
      videoId = new URL(url).searchParams.get("v") || "";
    } else if (url.includes("youtu.be/")) {
      videoId = url.split("youtu.be/")[1]?.split("?")[0];
    }
    return videoId ? `https://www.youtube.com/embed/${videoId}` : url;
  };

  return (
    <>
      {/* IMAGES */}
      {images.map(img => (
        <div
          key={img.id}
          className="absolute"
          style={{
            transform: `translate(${img.x * zoom + pan.x}px, ${img.y * zoom + pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
            pointerEvents: tool === "home" ? "auto" : "none",
            zIndex: selectedIds.includes(img.id) ? 50 : 10,
          }}
          onClick={(e) => { e.stopPropagation(); setSelectedIds?.([img.id]); }}
        >
          <div className={`relative group border-2 ${selectedIds.includes(img.id) ? 'border-primary-500 shadow-xl' : 'border-transparent hover:border-zinc-300 dark:hover:border-zinc-700'}`}>
            <img src={img.url} alt="Canvas Image" className="max-w-[400px] object-contain select-none" draggable={false} />
            
            {tool === "home" && (
              <div 
                className="absolute -top-4 -left-4 w-8 h-8 bg-white dark:bg-zinc-800 rounded-full shadow border border-zinc-200 dark:border-zinc-700 flex items-center justify-center cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                onPointerDown={(e) => onDragStart(e, img.id, 'image', img.x, img.y)}
              >
                <GripVertical size={16} />
              </div>
            )}

            {tool === "home" && (
              <button 
                className="absolute -top-4 left-6 w-8 h-8 bg-white dark:bg-zinc-800 rounded-full shadow border border-zinc-200 dark:border-zinc-700 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-indigo-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 z-10"
                onClick={(e) => { e.stopPropagation(); onAnnotate?.(img.id); }}
                title="Annotate Image"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"></path><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path><path d="M2 2l7.586 7.586"></path><circle cx="11" cy="11" r="2"></circle></svg>
              </button>
            )}
            
            {tool === "home" && (
              <button 
                className="absolute -top-4 -right-4 w-8 h-8 bg-white dark:bg-zinc-800 rounded-full shadow border border-zinc-200 dark:border-zinc-700 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                onClick={(e) => { e.stopPropagation(); setImages(prev => prev.filter(n => n.id !== img.id)); }}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>
      ))}

      {/* FILES */}
      {files.map(file => (
        <div
          key={file.id}
          className="absolute"
          style={{
            transform: `translate(${file.x * zoom + pan.x}px, ${file.y * zoom + pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
            pointerEvents: tool === "home" ? "auto" : "none",
            zIndex: selectedIds.includes(file.id) ? 50 : 10,
          }}
          onClick={(e) => { e.stopPropagation(); setSelectedIds?.([file.id]); }}
        >
          <div className={`relative group bg-white dark:bg-zinc-800 rounded-lg p-4 shadow-sm border-2 ${selectedIds.includes(file.id) ? 'border-primary-500 shadow-md' : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600'} w-64 flex flex-col gap-2 items-center text-center`}>
            <File size={32} className="text-primary-500" />
            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate w-full" title={file.filename}>{file.filename}</span>
            <a href={file.url} download target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary-600 dark:text-primary-400 hover:underline mt-2">
              <Download size={14} /> Download
            </a>
            
            {tool === "home" && (
              <div 
                className="absolute -top-3 -left-3 w-6 h-6 bg-white dark:bg-zinc-800 rounded-full shadow border border-zinc-200 dark:border-zinc-700 flex items-center justify-center cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                onPointerDown={(e) => onDragStart(e, file.id, 'file', file.x, file.y)}
              >
                <GripVertical size={12} />
              </div>
            )}

            {tool === "home" && (
              <button 
                className="absolute -top-3 left-5 w-6 h-6 bg-white dark:bg-zinc-800 rounded-full shadow border border-zinc-200 dark:border-zinc-700 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-indigo-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 z-10"
                onClick={(e) => { e.stopPropagation(); onAnnotate?.(file.id); }}
                title="Annotate File"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"></path><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path><path d="M2 2l7.586 7.586"></path><circle cx="11" cy="11" r="2"></circle></svg>
              </button>
            )}
            
            {tool === "home" && (
              <button 
                className="absolute -top-3 -right-3 w-6 h-6 bg-white dark:bg-zinc-800 rounded-full shadow border border-zinc-200 dark:border-zinc-700 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                onClick={(e) => { e.stopPropagation(); setFiles(prev => prev.filter(n => n.id !== file.id)); }}
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        </div>
      ))}

      {/* VIDEOS */}
      {videos.map(video => (
        <div
          key={video.id}
          className="absolute"
          style={{
            transform: `translate(${video.x * zoom + pan.x}px, ${video.y * zoom + pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
            pointerEvents: tool === "home" ? "auto" : "none",
            zIndex: selectedIds.includes(video.id) ? 50 : 10,
          }}
          onClick={(e) => { e.stopPropagation(); setSelectedIds?.([video.id]); }}
        >
          <div className={`relative group border-2 rounded ${selectedIds.includes(video.id) ? 'border-primary-500 shadow-xl' : 'border-transparent hover:border-zinc-300 dark:hover:border-zinc-700'} bg-black overflow-hidden`}>
            <iframe 
              width={video.width || 480} 
              height={video.height || 270} 
              src={getEmbedUrl(video.url)} 
              title="YouTube video player" 
              frameBorder="0" 
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
              allowFullScreen
              className="pointer-events-auto"
            ></iframe>
            
            {tool === "home" && (
              <div 
                className="absolute -top-4 -left-4 w-8 h-8 bg-white dark:bg-zinc-800 rounded-full shadow border border-zinc-200 dark:border-zinc-700 flex items-center justify-center cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 z-10"
                onPointerDown={(e) => onDragStart(e, video.id, 'video', video.x, video.y)}
              >
                <GripVertical size={16} />
              </div>
            )}

            {tool === "home" && (
              <button 
                className="absolute -top-4 left-6 w-8 h-8 bg-white dark:bg-zinc-800 rounded-full shadow border border-zinc-200 dark:border-zinc-700 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-indigo-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 z-10"
                onClick={(e) => { e.stopPropagation(); onAnnotate?.(video.id); }}
                title="Annotate Video"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"></path><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path><path d="M2 2l7.586 7.586"></path><circle cx="11" cy="11" r="2"></circle></svg>
              </button>
            )}
            
            {tool === "home" && (
              <button 
                className="absolute -top-4 -right-4 w-8 h-8 bg-white dark:bg-zinc-800 rounded-full shadow border border-zinc-200 dark:border-zinc-700 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 z-10"
                onClick={(e) => { e.stopPropagation(); setVideos(prev => prev.filter(n => n.id !== video.id)); }}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>
      ))}
    </>
  );
}
