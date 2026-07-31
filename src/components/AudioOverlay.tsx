"use client";

import React, { useCallback } from "react";
import type { AudioNode } from "./CustomCanvas";
import { Trash2 } from "lucide-react";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'react-markdown';

interface AudioOverlayProps {
  audios: AudioNode[];
  setAudios: React.Dispatch<React.SetStateAction<AudioNode[]>>;
  pan: { x: number; y: number };
  zoom: number;
}

export function AudioOverlay({ audios, setAudios, pan, zoom }: AudioOverlayProps) {
  
  const deleteAudioNode = useCallback((id: string) => {
    setAudios(prev => prev.filter(a => a.id !== id));
  }, [setAudios]);

  const updateAudioTitle = useCallback((id: string, newTitle: string) => {
    setAudios(prev => prev.map(a => a.id === id ? { ...a, title: newTitle } : a));
  }, [setAudios]);

  return (
    <div 
      className="absolute inset-0 z-20 pointer-events-none"
      style={{
        transformOrigin: '0 0',
        transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`
      }}
    >
      {audios.map(node => (
        <div 
          key={node.id}
          className="absolute pointer-events-auto group bg-white/95 dark:bg-zinc-800/95 backdrop-blur-md p-4 rounded-xl shadow-xl border border-zinc-200 dark:border-zinc-700 flex flex-col gap-3 transition-all hover:ring-2 hover:ring-indigo-500 max-h-[80vh] overflow-y-auto"
          style={{
            left: node.x,
            top: node.y,
            width: 400,
          }}
        >
          <div className="flex justify-between items-center px-1">
            <input 
              type="text"
              value={node.title || "Meeting Recording"}
              onChange={(e) => updateAudioTitle(node.id, e.target.value)}
              className="text-sm font-bold text-zinc-800 dark:text-zinc-100 bg-transparent border-none outline-none hover:bg-black/5 dark:hover:bg-white/5 px-1 py-0.5 rounded transition-colors w-full"
              placeholder="Recording Name..."
            />
            <button 
              onClick={() => deleteAudioNode(node.id)}
              className="text-red-500 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity p-1 ml-2 flex-shrink-0"
              title="Delete Recording"
            >
              <Trash2 size={16} />
            </button>
          </div>
          
          <audio controls className="w-full h-10 outline-none rounded-md">
            <source src={node.url} type="audio/webm" />
            Your browser does not support the audio element.
          </audio>

          {node.summary && (
            <div className="mt-2 text-sm text-zinc-700 dark:text-zinc-300 prose prose-sm dark:prose-invert prose-p:leading-relaxed prose-pre:bg-zinc-100 dark:prose-pre:bg-zinc-900 overflow-hidden">
              <ReactMarkdown>{node.summary}</ReactMarkdown>
            </div>
          )}

          {node.transcript && (
            <details className="mt-2 border-t border-zinc-200 dark:border-zinc-700 pt-2 group/details">
              <summary className="text-xs font-semibold text-zinc-500 uppercase tracking-wider cursor-pointer hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors list-none flex items-center gap-2">
                <span className="transform transition-transform group-open/details:rotate-90">▶</span>
                View Transcript
              </summary>
              <div className="mt-3 text-sm text-zinc-600 dark:text-zinc-400 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar whitespace-pre-wrap leading-relaxed">
                {node.transcript}
              </div>
            </details>
          )}
        </div>
      ))}
    </div>
  );
}
