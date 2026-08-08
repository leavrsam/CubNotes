"use client";

import React, { useMemo, useEffect, useState } from "react";
import { useCanvasData } from "@/hooks/useCanvasData";
import { v4 as uuidv4 } from "uuid";
import { TipTapEditor } from "./TipTapEditor";
import { Trash2, Plus, File, Download } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { format } from "date-fns";

import { Stroke } from "./CustomCanvas";

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
function AttachedStrokes({ strokes, blockBox }: { strokes: Stroke[], blockBox: any }) {
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

  // Use percentages relative to the block width so strokes scale gracefully with text layout on mobile
  const leftPercent = ((minX - blockBox.minX) / blockBox.width) * 100;
  
  return (
    <svg 
      className="absolute pointer-events-none z-20"
      style={{
        left: `${leftPercent}%`, 
        top: 0,
        // Calculate proportional width relative to block box width, ensuring it never goes crazy for standalone drawings
        width: `${Math.min((width / blockBox.width) * 100, 200)}%`,
        height: 'auto',
      }}
      viewBox={`${minX} ${minY} ${width} ${height}`}
      preserveAspectRatio="xMinYMin meet"
    >
      {strokes.map((stroke) => {
        if (!stroke.points || stroke.points.length === 0) return null;
        
        // Use perfect-freehand just like SpatialCanvas
        const strokeData = getStroke(stroke.points, {
          size: stroke.size,
          thinning: 0.5,
          smoothing: 0.5,
          streamline: 0.5,
        });
        const pathData = getSvgPathFromStroke(strokeData);

        // Apply transformations if they exist
        const sX = stroke.scaleX || 1;
        const sY = stroke.scaleY || 1;
        const tX = stroke.x || 0;
        const tY = stroke.y || 0;

        return (
          <path
            key={stroke.id}
            d={pathData}
            fill={stroke.color}
            transform={`translate(${tX}, ${tY}) scale(${sX}, ${sY})`}
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
      const strokeBox = getStrokeBoundingBox(stroke);
      
      let bestBlock = null;
      let maxOverlap = 0;

      baseBlocks.forEach(block => {
        const blockBox = getBlockBoundingBox(block);
        const overlap = getIntersectionArea(strokeBox, blockBox);
        if (overlap > maxOverlap) {
          maxOverlap = overlap;
          bestBlock = block;
        }
      });

      if (bestBlock && maxOverlap > 0) {
        (bestBlock as any).attachedStrokes.push(stroke);
      } else {
        unattachedStrokes.push(stroke);
      }
    });

    const clusters: { type: 'drawing', id: string, x: number, y: number, attachedStrokes: Stroke[], minX: number, minY: number, maxX: number, maxY: number, width: number, height: number }[] = [];
    
    unattachedStrokes.forEach(stroke => {
      const box = getStrokeBoundingBox(stroke);
      const padding = 50;
      const expandedBox = {
        minX: box.minX - padding,
        minY: box.minY - padding,
        maxX: box.maxX + padding,
        maxY: box.maxY + padding
      };
      
      const overlappingCluster = clusters.find(c => getIntersectionArea(expandedBox, c) > 0);
      
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
        clusters.push({
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

    const finalBlocks = [...baseBlocks, ...clusters];
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
    <div className="w-full h-full flex flex-col bg-zinc-50 dark:bg-zinc-950 relative">
      <div className="flex-1 overflow-y-auto px-4 py-6 pt-16 pb-32 relative">
        
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
            const blockBox = getBlockBoundingBox(block);

            if (block.type === 'text') {
              return (
                <div key={block.id} className="w-full min-h-[50px] relative">
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
                <div key={block.id} className="w-full relative bg-white dark:bg-zinc-900 p-4 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800">
                  <div className="flex justify-between items-center mb-2">
                    <input 
                      type="text"
                      value={block.title || "Meeting Recording"}
                      onChange={(e) => {
                        setAudios(prev => prev.map(a => a.id === block.id ? { ...a, title: e.target.value } : a));
                      }}
                      className="font-bold text-sm text-zinc-800 dark:text-zinc-100 bg-transparent border-none outline-none w-full relative z-30"
                    />
                    <button 
                      onClick={() => setAudios(prev => prev.filter(a => a.id !== block.id))}
                      className="text-red-500 p-1 relative z-30"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  
                  <audio controls className="w-full h-10 outline-none rounded-md relative z-30">
                    <source src={block.url} type="audio/webm" />
                  </audio>

                  {block.summary && (
                    <details open className="mt-4 relative z-30">
                      <summary className="text-xs font-semibold text-zinc-500 uppercase tracking-wider cursor-pointer list-none mb-2 flex items-center gap-2">
                        <span className="transform transition-transform">▶</span> Summary
                      </summary>
                      <div className="text-sm text-zinc-700 dark:text-zinc-300 prose prose-sm dark:prose-invert bg-zinc-50 dark:bg-zinc-950/50 p-3 rounded-lg">
                        <ReactMarkdown>{block.summary}</ReactMarkdown>
                      </div>
                    </details>
                  )}
                  {block.transcript && (
                    <details className="mt-4 border-t border-zinc-200 dark:border-zinc-800 pt-2 relative z-30">
                      <summary className="text-xs font-semibold text-zinc-500 uppercase tracking-wider cursor-pointer list-none mb-2 flex items-center gap-2">
                        <span className="transform transition-transform">▶</span> Transcript
                      </summary>
                      <div className="text-sm text-zinc-600 dark:text-zinc-400 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar whitespace-pre-wrap bg-zinc-50 dark:bg-zinc-950/50 p-3 rounded-lg">
                        {block.transcript}
                      </div>
                    </details>
                  )}
                  <AttachedStrokes strokes={block.attachedStrokes} blockBox={blockBox} />
                </div>
              );
            } else if (block.type === 'image') {
              return (
                <div key={block.id} className="relative w-full rounded shadow-sm border border-zinc-200 dark:border-zinc-800 overflow-hidden bg-white dark:bg-zinc-900">
                  <img src={block.url} alt="Canvas Image" className="w-full h-auto object-contain" />
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
                <div key={block.id} className="relative w-full bg-white dark:bg-zinc-900 p-4 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                  <div className="flex items-center gap-3 overflow-hidden relative z-30">
                    <File size={24} className="text-primary-500 flex-shrink-0" />
                    <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">{block.filename}</span>
                  </div>
                  <div className="flex items-center gap-2 relative z-30">
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
                <div key={block.id} className="relative w-full rounded shadow-sm border border-zinc-200 dark:border-zinc-800 overflow-hidden bg-black aspect-video">
                  <iframe 
                    src={embedUrl} 
                    title="YouTube video player" 
                    frameBorder="0" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                    allowFullScreen
                    className="w-full h-full relative z-10"
                  ></iframe>
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
              return (
                <div key={block.id} className="relative w-full min-h-[50px]">
                  <AttachedStrokes strokes={block.attachedStrokes} blockBox={blockBox} />
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
          className="w-14 h-14 bg-primary-600 text-white rounded-full shadow-xl flex items-center justify-center hover:bg-primary-700 transition-colors"
        >
          <Plus size={24} />
        </button>
      </div>
    </div>
  );
}
