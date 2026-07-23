"use client";

import React, { useCallback } from "react";
import type { AudioNode } from "./CustomCanvas";
import { Trash2 } from "lucide-react";

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
          className="absolute pointer-events-auto group bg-white/90 dark:bg-zinc-800/90 backdrop-blur-sm p-3 rounded-xl shadow-lg border border-zinc-200 dark:border-zinc-700 flex flex-col gap-2 transition-all hover:ring-2 hover:ring-indigo-500"
          style={{
            left: node.x,
            top: node.y,
            width: 320,
          }}
        >
          <div className="flex justify-between items-center px-1">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Meeting Recording</span>
            <button 
              onClick={() => deleteAudioNode(node.id)}
              className="text-red-500 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity p-1"
              title="Delete Recording"
            >
              <Trash2 size={14} />
            </button>
          </div>
          <audio controls className="w-full h-10 outline-none rounded-md">
            <source src={node.url} type="audio/webm" />
            Your browser does not support the audio element.
          </audio>
        </div>
      ))}
    </div>
  );
}
