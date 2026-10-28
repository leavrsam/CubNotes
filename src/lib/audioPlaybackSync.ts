/**
 * Bidirectional Audio-Visual Synchronization Bus (Phase 4)
 * Coordinates audio playback positions with 2D spatial canvas shapes and 1D mobile blocks.
 */

export interface PlaybackState {
  activeAudioBlockId: string | null;
  currentTimeMs: number;
  durationMs: number;
  isPlaying: boolean;
}

class AudioPlaybackSyncBus {
  private state: PlaybackState = {
    activeAudioBlockId: null,
    currentTimeMs: 0,
    durationMs: 0,
    isPlaying: false,
  };

  private listeners: Set<(state: PlaybackState) => void> = new Set();
  private seekListeners: Set<(audioBlockId: string, timestampMs: number) => void> = new Set();

  public getState(): PlaybackState {
    return { ...this.state };
  }

  public updatePlayback(audioBlockId: string, currentTimeMs: number, durationMs: number, isPlaying: boolean) {
    this.state = {
      activeAudioBlockId: audioBlockId,
      currentTimeMs,
      durationMs,
      isPlaying,
    };
    this.notify();
  }

  public clearPlayback(audioBlockId?: string) {
    if (!audioBlockId || this.state.activeAudioBlockId === audioBlockId) {
      this.state = {
        activeAudioBlockId: null,
        currentTimeMs: 0,
        durationMs: 0,
        isPlaying: false,
      };
      this.notify();
    }
  }

  public seek(audioBlockId: string, timestampMs: number) {
    this.seekListeners.forEach((listener) => {
      try {
        listener(audioBlockId, timestampMs);
      } catch (err) {
        console.error("Seek listener error:", err);
      }
    });

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("motif-audio-seek", {
          detail: { audioBlockId, timestampMs },
        })
      );
    }
  }

  public subscribe(listener: (state: PlaybackState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  public onSeek(listener: (audioBlockId: string, timestampMs: number) => void): () => void {
    this.seekListeners.add(listener);
    return () => {
      this.seekListeners.delete(listener);
    };
  }

  private notify() {
    const copy = this.getState();
    this.listeners.forEach((listener) => {
      try {
        listener(copy);
      } catch (err) {
        console.error("Playback listener error:", err);
      }
    });
  }
}

export const audioPlaybackSyncBus = new AudioPlaybackSyncBus();
