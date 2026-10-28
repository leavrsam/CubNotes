/**
 * Relative Audio-Block Timing Architecture (Phase 3)
 *
 * Timestamps must NEVER use raw wall-clock time.
 * They represent active recording elapsed time (excluding pause intervals)
 * relative to a specific AudioBlock.
 */

export interface ActiveRecordingState {
  audioBlockId: string | null;
  startedAt: number;          // Epoch ms when recording started
  accumulatedActiveMs: number; // Sum of prior active intervals
  pausedAt: number | null;    // Epoch ms when pause was hit, null if running
  isRecording: boolean;
}

class ActiveRecordingManager {
  private state: ActiveRecordingState = {
    audioBlockId: null,
    startedAt: 0,
    accumulatedActiveMs: 0,
    pausedAt: null,
    isRecording: false,
  };

  private listeners: Set<(state: ActiveRecordingState) => void> = new Set();

  public getState(): ActiveRecordingState {
    return { ...this.state };
  }

  public getActiveAudioBlockId(): string | null {
    return this.state.isRecording ? this.state.audioBlockId : null;
  }

  public getActiveElapsedMs(): number {
    if (!this.state.isRecording) return 0;
    if (this.state.pausedAt !== null) {
      return this.state.accumulatedActiveMs;
    }
    return this.state.accumulatedActiveMs + (Date.now() - this.state.startedAt);
  }

  public start(audioBlockId: string) {
    this.state = {
      audioBlockId,
      startedAt: Date.now(),
      accumulatedActiveMs: 0,
      pausedAt: null,
      isRecording: true,
    };
    this.notify();
  }

  public pause() {
    if (!this.state.isRecording || this.state.pausedAt !== null) return;
    const now = Date.now();
    this.state.accumulatedActiveMs += (now - this.state.startedAt);
    this.state.pausedAt = now;
    this.notify();
  }

  public resume() {
    if (!this.state.isRecording || this.state.pausedAt === null) return;
    this.state.startedAt = Date.now();
    this.state.pausedAt = null;
    this.notify();
  }

  public stop() {
    this.state = {
      audioBlockId: null,
      startedAt: 0,
      accumulatedActiveMs: 0,
      pausedAt: null,
      isRecording: false,
    };
    this.notify();
  }

  public subscribe(listener: (state: ActiveRecordingState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const copy = this.getState();
    this.listeners.forEach((listener) => {
      try {
        listener(copy);
      } catch (err) {
        console.error("ActiveRecordingManager listener error:", err);
      }
    });

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("motif-recording-state-change", { detail: copy })
      );
    }
  }
}

export const activeRecordingManager = new ActiveRecordingManager();
