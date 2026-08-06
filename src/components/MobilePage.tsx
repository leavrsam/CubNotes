"use client";

import React, { useMemo, useEffect, useState } from "react";
import { useCanvasData } from "@/hooks/useCanvasData";
import { v4 as uuidv4 } from "uuid";
import { TipTapEditor } from "./TipTapEditor";
import { Trash2, Plus, File, Download } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { format } from "date-fns";

// Render a static representation of the strokes overlaid
function StrokesOverlay({ strokes }: { strokes: any[] }) {
  // Find boundaries to give the SVG a reasonable height on mobile
  const maxStrokeY = strokes.reduce((max, stroke) => {
    const strokeMaxY = stroke.points.reduce((maxY: number, p: number[]) => Math.max(maxY, p[1]), 0);
    return Math.max(max, strokeMaxY);
  }, 0);

  const svgHeight = Math.max(maxStrokeY + 200, window.innerHeight);

  return (
    <svg 
      className="absolute top-0 left-0 w-full pointer-events-none" 
      style={{ height: svgHeight, zIndex: 0 }}
    >
      {strokes.map((stroke) => {
        // Simplified SVG path generation for mobile viewing
        if (!stroke.points || stroke.points.length === 0) return null;
        
        let d = `M ${stroke.points[0][0]} ${stroke.points[0][1]}`;
        for (let i = 1; i < stroke.points.length; i++) {
          d += ` L ${stroke.points[i][0]} ${stroke.points[i][1]}`;
        }

        return (
          <path
            key={stroke.id}
            d={d}
            stroke={stroke.color}
            strokeWidth={stroke.size}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      })}
    </svg>
  );
}

interface MobilePageProps {
  pageId: string;
  pageTitle: string;
  pageCreatedAt: string;
  onUpdatePageTitle: (title: string) => void;
}

export function MobilePage({ pageId, pageTitle, pageCreatedAt, onUpdatePageTitle }: MobilePageProps) {
  const { loading, strokes, texts, setTexts, audios, setAudios, images, setImages, files, setFiles, videos, setVideos } = useCanvasData(pageId);
  const [bottomY, setBottomY] = useState(0);

  // Combine and sort texts and audios by Y then X
  const sortedBlocks = useMemo(() => {
    const blocks = [
      ...texts.map(t => ({ ...t, type: 'text' as const })),
      ...(audios || []).map(a => ({ ...a, type: 'audio' as const })),
      ...(images || []).map(i => ({ ...i, type: 'image' as const })),
      ...(files || []).map(f => ({ ...f, type: 'file' as const })),
      ...(videos || []).map(v => ({ ...v, type: 'video' as const }))
    ];
    return blocks.sort((a, b) => {
      if (Math.abs(a.y - b.y) > 10) return a.y - b.y; // 10px tolerance for vertical alignment
      return a.x - b.x;
    });
  }, [texts, audios, images, files, videos]);

  useEffect(() => {
    if (sortedBlocks.length > 0) {
      setBottomY(sortedBlocks[sortedBlocks.length - 1].y + 200);
    } else {
      setBottomY(100);
    }
  }, [sortedBlocks]);

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
    <div className="w-full h-full flex flex-col bg-[#fafafa] dark:bg-zinc-900 relative">
      <div className="flex-1 overflow-y-auto px-4 py-6 pb-32 relative">
        <StrokesOverlay strokes={strokes} />
        
        {/* Title */}
        <input
          type="text"
          value={pageTitle}
          onChange={(e) => onUpdatePageTitle(e.target.value)}
          placeholder="Page Title"
          className="bg-transparent text-3xl font-bold text-zinc-900 dark:text-zinc-100 border-none outline-none focus:ring-0 placeholder:text-zinc-300 dark:placeholder:text-zinc-700 w-full mb-2 relative z-10"
        />
        {/* Decorative OneNote-style underline */}
        <div className="w-full h-[1px] bg-gradient-to-r from-zinc-300 to-transparent dark:from-zinc-700 mb-1"></div>
        {pageCreatedAt && (
          <div className="text-sm text-zinc-500 dark:text-zinc-400 mb-6 whitespace-pre">
            {format(new Date(pageCreatedAt), "EEEE, MMMM d, yyyy     h:mm a")}
          </div>
        )}

        {/* Linear feed of blocks */}
        <div className="flex flex-col gap-6 w-full relative z-10">
          {sortedBlocks.map(block => {
            if (block.type === 'text') {
              return (
                <div key={block.id} className="w-full min-h-[50px] bg-white/50 dark:bg-zinc-800/50 rounded backdrop-blur-sm">
                  <TipTapEditor 
                    content={block.content}
                    onChange={(content) => {
                      setTexts(prev => prev.map(t => t.id === block.id ? { ...t, content } : t));
                    }}
                    onDelete={() => {
                      setTexts(prev => prev.filter(t => t.id !== block.id));
                    }}
                  />
                </div>
              );
            } else if (block.type === 'audio') {
              return (
                <div key={block.id} className="w-full bg-white dark:bg-zinc-800 p-4 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-700 backdrop-blur-sm">
                  <div className="flex justify-between items-center mb-2">
                    <input 
                      type="text"
                      value={block.title || "Meeting Recording"}
                      onChange={(e) => {
                        setAudios(prev => prev.map(a => a.id === block.id ? { ...a, title: e.target.value } : a));
                      }}
                      className="font-bold text-sm text-zinc-800 dark:text-zinc-100 bg-transparent border-none outline-none w-full"
                    />
                    <button 
                      onClick={() => setAudios(prev => prev.filter(a => a.id !== block.id))}
                      className="text-red-500 p-1"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  
                  <audio controls className="w-full h-10 outline-none rounded-md">
                    <source src={block.url} type="audio/webm" />
                  </audio>

                  {block.summary && (
                    <details open className="mt-4">
                      <summary className="text-xs font-semibold text-zinc-500 uppercase tracking-wider cursor-pointer list-none mb-2 flex items-center gap-2">
                        <span className="transform transition-transform">▶</span> Summary
                      </summary>
                      <div className="text-sm text-zinc-700 dark:text-zinc-300 prose prose-sm dark:prose-invert bg-zinc-50 dark:bg-zinc-900/50 p-3 rounded-lg">
                        <ReactMarkdown>{block.summary}</ReactMarkdown>
                      </div>
                    </details>
                  )}
                  {block.transcript && (
                    <details className="mt-4 border-t border-zinc-200 dark:border-zinc-700 pt-2">
                      <summary className="text-xs font-semibold text-zinc-500 uppercase tracking-wider cursor-pointer list-none mb-2 flex items-center gap-2">
                        <span className="transform transition-transform">▶</span> Transcript
                      </summary>
                      <div className="text-sm text-zinc-600 dark:text-zinc-400 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar whitespace-pre-wrap bg-zinc-50 dark:bg-zinc-900/50 p-3 rounded-lg">
                        {block.transcript}
                      </div>
                    </details>
                  )}
                </div>
              );
            } else if (block.type === 'image') {
              return (
                <div key={block.id} className="relative w-full rounded shadow-sm border border-zinc-200 dark:border-zinc-700 overflow-hidden bg-white dark:bg-zinc-800">
                  <img src={block.url} alt="Canvas Image" className="w-full h-auto object-contain" />
                  <button 
                    onClick={() => setImages(prev => prev.filter(n => n.id !== block.id))}
                    className="absolute top-2 right-2 w-8 h-8 bg-white/80 dark:bg-black/50 backdrop-blur rounded-full flex items-center justify-center text-red-500 hover:text-red-600"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            } else if (block.type === 'file') {
              return (
                <div key={block.id} className="relative w-full bg-white dark:bg-zinc-800 p-4 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-700 flex items-center justify-between">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <File size={24} className="text-indigo-500 flex-shrink-0" />
                    <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">{block.filename}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <a href={block.url} download target="_blank" rel="noopener noreferrer" className="p-2 text-indigo-600 dark:text-indigo-400">
                      <Download size={18} />
                    </a>
                    <button onClick={() => setFiles(prev => prev.filter(n => n.id !== block.id))} className="p-2 text-red-500">
                      <Trash2 size={18} />
                    </button>
                  </div>
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
                <div key={block.id} className="relative w-full rounded shadow-sm border border-zinc-200 dark:border-zinc-700 overflow-hidden bg-black aspect-video">
                  <iframe 
                    src={embedUrl} 
                    title="YouTube video player" 
                    frameBorder="0" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                    allowFullScreen
                    className="w-full h-full"
                  ></iframe>
                  <button 
                    onClick={() => setVideos(prev => prev.filter(n => n.id !== block.id))}
                    className="absolute top-2 right-2 w-8 h-8 bg-white/80 dark:bg-black/50 backdrop-blur rounded-full flex items-center justify-center text-red-500 hover:text-red-600"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            }
          })}
        </div>
      </div>

      {/* Floating Action Button */}
      <div className="absolute bottom-6 right-6 z-50">
        <button 
          onClick={addTextBlock}
          className="w-14 h-14 bg-indigo-600 text-white rounded-full shadow-xl flex items-center justify-center hover:bg-indigo-700 transition-colors"
        >
          <Plus size={24} />
        </button>
      </div>
    </div>
  );
}
