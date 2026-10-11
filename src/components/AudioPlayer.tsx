'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, Volume2, VolumeX, RotateCcw, RotateCw } from 'lucide-react';

export interface AudioPlayerProps {
  url: string;
  initialDurationMs?: number;
  className?: string;
  onEnded?: () => void;
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds) || seconds < 0) return '0:00';
  const totalSecs = Math.floor(seconds);
  const hrs = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function AudioPlayer({ url, initialDurationMs, className = '', onEnded }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressBarRef = useRef<HTMLDivElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number>(() => {
    return initialDurationMs && initialDurationMs > 0 ? initialDurationMs / 1000 : 0;
  });
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [scrubFraction, setScrubFraction] = useState<number | null>(null);

  // Sync duration if initialDurationMs updates
  useEffect(() => {
    if (initialDurationMs && initialDurationMs > 0 && duration === 0) {
      setDuration(initialDurationMs / 1000);
    }
  }, [initialDurationMs, duration]);

  // Audio metadata loading & WebM duration resolution trick
  const handleLoadedMetadata = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isFinite(audio.duration) && audio.duration > 0) {
      setDuration(audio.duration);
    } else if (audio.duration === Infinity) {
      // Chromium WebM MediaRecorder quirk: duration is reported as Infinity.
      // Seeking to a high timestamp forces the browser to scan to the end and calculate duration.
      audio.currentTime = 1e101;
      audio.ontimeupdate = () => {
        if (!audioRef.current) return;
        audioRef.current.ontimeupdate = null;
        if (isFinite(audioRef.current.duration) && audioRef.current.duration > 0) {
          setDuration(audioRef.current.duration);
        } else if (audioRef.current.currentTime > 0) {
          setDuration(audioRef.current.currentTime);
        }
        audioRef.current.currentTime = 0;
      };
    }
  }, []);

  const handleTimeUpdate = () => {
    if (isDragging) return;
    const audio = audioRef.current;
    if (!audio) return;

    setCurrentTime(audio.currentTime);

    // If duration was unknown or less than currentTime, update dynamically
    if (audio.currentTime > duration && isFinite(audio.currentTime)) {
      setDuration(audio.currentTime);
    }
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().then(() => setIsPlaying(true)).catch((err) => {
        console.warn('Playback error:', err);
        setIsPlaying(false);
      });
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
    if (onEnded) onEnded();
  };

  // Helper to get fraction from mouse or touch pointer
  const getFractionFromPointer = (e: React.PointerEvent<HTMLDivElement>): number => {
    if (!progressBarRef.current) return 0;
    const rect = progressBarRef.current.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    const clickX = e.clientX - rect.left;
    return Math.max(0, Math.min(1, clickX / rect.width));
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (duration <= 0) return;
    e.preventDefault();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
    setIsDragging(true);
    const fraction = getFractionFromPointer(e);
    setScrubFraction(fraction);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || duration <= 0) return;
    e.preventDefault();
    const fraction = getFractionFromPointer(e);
    setScrubFraction(fraction);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    e.preventDefault();
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
    const fraction = getFractionFromPointer(e);
    const targetTime = fraction * duration;
    if (audioRef.current && isFinite(targetTime)) {
      audioRef.current.currentTime = targetTime;
      setCurrentTime(targetTime);
    }
    setIsDragging(false);
    setScrubFraction(null);
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
    setIsDragging(false);
    setScrubFraction(null);
  };

  const handleSkip = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const newTime = Math.max(0, Math.min(duration || audio.currentTime + seconds, audio.currentTime + seconds));
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const cyclePlaybackRate = () => {
    const rates = [1, 1.25, 1.5, 2];
    const nextIdx = (rates.indexOf(playbackRate) + 1) % rates.length;
    const nextRate = rates[nextIdx];
    setPlaybackRate(nextRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    const newMuted = !isMuted;
    audioRef.current.muted = newMuted;
    setIsMuted(newMuted);
  };

  // Determine active fraction & display time (live scrub updates instantly!)
  const currentFraction = scrubFraction !== null ? scrubFraction : (duration > 0 ? currentTime / duration : 0);
  const displayCurrentTime = scrubFraction !== null ? scrubFraction * duration : currentTime;
  const progressPercent = Math.min(100, Math.max(0, currentFraction * 100));

  return (
    <div className={`flex flex-col gap-2 p-2 sm:p-2.5 rounded-2xl bg-zinc-100/90 dark:bg-zinc-800/90 border border-zinc-200/90 dark:border-zinc-700/80 shadow-xs select-none ${className}`}>
      {/* Hidden native audio element */}
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
      />

      {/* Row 1: Full-Width Slider (Takes the entire width!) */}
      <div className="w-full flex flex-col gap-0.5">
        {/* Scrubber Touch Area */}
        <div
          ref={progressBarRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          className="relative w-full h-7 flex items-center cursor-pointer touch-none group"
          title="Drag or tap to seek"
        >
          {/* Background Track */}
          <div className="w-full h-2 rounded-full bg-zinc-200 dark:bg-zinc-700/80 overflow-hidden relative transition-all group-hover:h-2.5">
            {/* Filled Progress Track */}
            <div
              className="h-full bg-primary-500 rounded-full transition-all duration-75"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Scrubber Knob */}
          <div
            className={`absolute top-1/2 w-4 h-4 rounded-full bg-white dark:bg-zinc-100 border-2 border-primary-500 shadow-md transform -translate-y-1/2 -translate-x-1/2 transition-transform pointer-events-none ${
              isDragging ? 'scale-125 ring-4 ring-primary-500/20' : 'group-hover:scale-110'
            }`}
            style={{ left: `${progressPercent}%` }}
          />
        </div>

        {/* Timestamps Row: Left = Elapsed, Right = Total Duration */}
        <div className="flex items-center justify-between px-1 text-[11px] font-mono font-medium text-zinc-500 dark:text-zinc-400 -mt-1 select-none">
          <span>{formatTime(displayCurrentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Row 2: Controls Row (Below the slider!) */}
      <div className="flex items-center justify-between w-full pt-0.5 px-0.5">
        {/* Left: Playback speed pill */}
        <button
          type="button"
          onClick={cyclePlaybackRate}
          className="px-2 py-1 rounded-lg text-[11px] font-semibold font-mono bg-zinc-200/80 dark:bg-zinc-700/70 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-600 transition-colors shrink-0 shadow-xs active:scale-95"
          title="Change playback speed"
        >
          {playbackRate}x
        </button>

        {/* Center: Rewind, Play/Pause, Fast-Forward */}
        <div className="flex items-center gap-2.5 sm:gap-3.5">
          {/* Rewind -10s */}
          <button
            type="button"
            onClick={() => handleSkip(-10)}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-zinc-200/70 dark:hover:bg-zinc-700/70 text-zinc-600 dark:text-zinc-300 active:scale-95 transition-all"
            title="Rewind 10 seconds"
          >
            <RotateCcw size={15} />
          </button>

          {/* Play/Pause Button */}
          <button
            type="button"
            onClick={togglePlay}
            className="w-10 h-10 rounded-full bg-primary-600 hover:bg-primary-700 text-white flex items-center justify-center shadow-md hover:shadow-lg transition-transform active:scale-95 shrink-0"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause size={17} fill="currentColor" />
            ) : (
              <Play size={17} fill="currentColor" className="ml-0.5" />
            )}
          </button>

          {/* Fast-Forward +10s */}
          <button
            type="button"
            onClick={() => handleSkip(10)}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-zinc-200/70 dark:hover:bg-zinc-700/70 text-zinc-600 dark:text-zinc-300 active:scale-95 transition-all"
            title="Fast forward 10 seconds"
          >
            <RotateCw size={15} />
          </button>
        </div>

        {/* Right: Mute / Volume */}
        <button
          type="button"
          onClick={toggleMute}
          className="p-1.5 rounded-lg hover:bg-zinc-200/70 dark:hover:bg-zinc-700/70 text-zinc-600 dark:text-zinc-300 active:scale-95 transition-all shrink-0"
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? <VolumeX size={16} className="text-red-500" /> : <Volume2 size={16} />}
        </button>
      </div>
    </div>
  );
}
