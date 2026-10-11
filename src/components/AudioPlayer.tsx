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

    // If duration was unknown or less than currentTime, update it dynamically
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

  const seekTo = (fraction: number) => {
    const audio = audioRef.current;
    if (!audio || duration <= 0) return;

    const clampedFraction = Math.max(0, Math.min(1, fraction));
    const targetTime = clampedFraction * duration;
    audio.currentTime = targetTime;
    setCurrentTime(targetTime);
  };

  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || duration <= 0) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const fraction = clickX / rect.width;
    seekTo(fraction);
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

  // Progress percentage
  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  return (
    <div className={`flex flex-col gap-1.5 p-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800/90 border border-zinc-200/90 dark:border-zinc-700/80 shadow-xs ${className}`}>
      {/* Hidden native audio tag */}
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

      {/* Main player controls row */}
      <div className="flex items-center gap-2 w-full">
        {/* Play/Pause Button */}
        <button
          type="button"
          onClick={togglePlay}
          className="w-8 h-8 rounded-full bg-primary-600 hover:bg-primary-700 text-white flex items-center justify-center shrink-0 transition-transform active:scale-95 shadow-sm"
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <Pause size={14} fill="currentColor" />
          ) : (
            <Play size={14} fill="currentColor" className="ml-0.5" />
          )}
        </button>

        {/* Skip -10s */}
        <button
          type="button"
          onClick={() => handleSkip(-10)}
          className="p-1 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
          title="Rewind 10 seconds"
        >
          <RotateCcw size={13} />
        </button>

        {/* Skip +10s */}
        <button
          type="button"
          onClick={() => handleSkip(10)}
          className="p-1 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
          title="Fast forward 10 seconds"
        >
          <RotateCw size={13} />
        </button>

        {/* Scrubber Progress Bar */}
        <div
          ref={progressBarRef}
          onClick={handleProgressBarClick}
          className="relative flex-1 h-6 flex items-center cursor-pointer group"
          title="Click to seek"
        >
          {/* Background track */}
          <div className="w-full h-1.5 rounded-full bg-zinc-300 dark:bg-zinc-700 overflow-hidden relative">
            {/* Fill track */}
            <div
              className="h-full bg-primary-500 rounded-full transition-all duration-75"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Scrubber Knob */}
          <div
            className="absolute w-3.5 h-3.5 rounded-full bg-white dark:bg-zinc-100 border-2 border-primary-500 shadow-md transform -translate-x-1/2 opacity-90 group-hover:scale-125 transition-transform pointer-events-none"
            style={{ left: `${progressPercent}%` }}
          />
        </div>

        {/* Time display */}
        <div className="text-[11px] font-mono text-zinc-600 dark:text-zinc-300 font-medium shrink-0 select-none">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>

        {/* Playback speed toggle */}
        <button
          type="button"
          onClick={cyclePlaybackRate}
          className="px-1.5 py-0.5 rounded text-[10px] font-semibold font-mono bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-600 transition-colors shrink-0"
          title="Change playback speed"
        >
          {playbackRate}x
        </button>

        {/* Mute button */}
        <button
          type="button"
          onClick={toggleMute}
          className="p-1 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors shrink-0"
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? <VolumeX size={14} className="text-red-500" /> : <Volume2 size={14} />}
        </button>
      </div>
    </div>
  );
}
