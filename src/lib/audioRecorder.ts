/**
 * Universal cross-platform audio recorder for Desktop and Mobile (iOS Safari, Android Chrome, Desktop Chrome/Firefox/Safari).
 */

export interface RecordingResult {
  blob: Blob;
  base64: string;
  mimeType: string;
  fileExt: string;
  durationMs: number;
  liveTranscript?: string;
}

export function getPreferredMimeType(): { mimeType: string; fileExt: string } {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') {
    return { mimeType: 'audio/webm', fileExt: 'webm' };
  }

  // Check candidate formats in priority order
  const candidates: Array<{ mime: string; ext: string }> = [
    { mime: 'audio/webm;codecs=opus', ext: 'webm' },
    { mime: 'audio/webm', ext: 'webm' },
    { mime: 'audio/mp4;codecs=mp4a.40.2', ext: 'mp4' },
    { mime: 'audio/mp4', ext: 'mp4' },
    { mime: 'audio/aac', ext: 'aac' },
    { mime: 'audio/ogg;codecs=opus', ext: 'ogg' },
    { mime: 'audio/wav', ext: 'wav' },
  ];

  for (const candidate of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(candidate.mime)) {
        return { mimeType: candidate.mime, fileExt: candidate.ext };
      }
    } catch {
      // isTypeSupported can throw on some older WebKit versions
    }
  }

  return { mimeType: '', fileExt: 'webm' };
}

export class WebAudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private startTime = 0;
  private chosenMimeType = '';
  private chosenExt = 'webm';

  private isStopping = false;

  public isRecording(): boolean {
    return !!this.mediaRecorder && (this.mediaRecorder.state === 'recording' || this.mediaRecorder.state === 'paused');
  }

  public isPaused(): boolean {
    return !!this.mediaRecorder && this.mediaRecorder.state === 'paused';
  }

  public async start(): Promise<void> {
    this.isStopping = false;

    // 1. Get user media with robust cross-browser fallback (ideal constraints instead of exact)
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: { ideal: 1 },
          noiseSuppression: { ideal: true },
          echoCancellation: { ideal: true },
          autoGainControl: { ideal: true },
        },
      });
    } catch (constraintErr) {
      console.warn('Microphone ideal constraints failed, falling back to basic audio:', constraintErr);
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }
    this.stream = stream;

    // 2. Select compatible MIME type
    const { mimeType, fileExt } = getPreferredMimeType();
    this.chosenMimeType = mimeType;
    this.chosenExt = fileExt;

    // Detect Firefox to avoid custom bitrate encoding stalls
    const isFirefox = typeof navigator !== 'undefined' && /firefox/i.test(navigator.userAgent);

    let recorder: MediaRecorder;
    try {
      const recorderOptions: MediaRecorderOptions = {};
      if (mimeType) {
        recorderOptions.mimeType = mimeType;
      }
      // On Chromium/Safari, set voice-optimized bitrate. On Firefox, omit audioBitsPerSecond to prevent MediaRecorder stalls.
      if (!isFirefox) {
        recorderOptions.audioBitsPerSecond = mimeType.includes('webm') ? 32000 : 48000;
      }
      recorder = new MediaRecorder(stream, recorderOptions);
    } catch (recErr) {
      console.warn('MediaRecorder constructor with options failed, falling back to basic mimeType:', recErr);
      try {
        recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      } catch {
        recorder = new MediaRecorder(stream);
      }
    }

    this.mediaRecorder = recorder;
    this.chunks = [];
    this.startTime = Date.now();

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this.chunks.push(e.data);
      }
    };

    recorder.onerror = (e) => {
      console.warn('MediaRecorder runtime error:', e);
    };

    // Use 1000ms timeslice so data arrives progressively on all platforms
    try {
      recorder.start(1000);
    } catch (startErr) {
      console.warn('MediaRecorder start(1000) failed, attempting start():', startErr);
      recorder.start();
    }
  }

  public pause(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      try {
        this.mediaRecorder.pause();
      } catch (err) {
        console.warn('MediaRecorder pause error:', err);
      }
    }
  }

  public resume(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
      try {
        this.mediaRecorder.resume();
      } catch (err) {
        console.warn('MediaRecorder resume error:', err);
      }
    }
  }

  /**
   * Completely discards the ongoing recording, shuts off the microphone,
   * and prevents any transcription or saving.
   */
  public discard(): void {
    this.isStopping = true;
    if (this.stream) {
      this.stream.getTracks().forEach((track) => {
        try {
          track.stop();
          track.enabled = false;
        } catch {}
      });
      this.stream = null;
    }

    if (this.mediaRecorder) {
      try {
        this.mediaRecorder.ondataavailable = null;
        this.mediaRecorder.onstop = null;
        this.mediaRecorder.onerror = null;
        if (this.mediaRecorder.state !== 'inactive') {
          this.mediaRecorder.stop();
        }
      } catch {}
      this.mediaRecorder = null;
    }

    this.chunks = [];
  }

  public stop(): Promise<RecordingResult> {
    return new Promise((resolve, reject) => {
      const recorder = this.mediaRecorder;
      if (!recorder) {
        // If chunks were already collected from an earlier stop
        if (this.chunks.length > 0) {
          this.processChunksAndResolve(resolve, reject, Date.now() - this.startTime);
          return;
        }
        reject(new Error('No active recording.'));
        return;
      }

      if (this.isStopping) {
        return;
      }
      this.isStopping = true;

      const durationMs = Math.max(0, Date.now() - this.startTime);
      let isCompleted = false;

      const finishStop = () => {
        if (isCompleted) return;
        isCompleted = true;
        clearTimeout(safetyTimeout);

        try {
          // 1. Immediately turn off mic stream tracks
          if (this.stream) {
            this.stream.getTracks().forEach((track) => {
              try {
                track.stop();
                track.enabled = false;
              } catch {}
            });
            this.stream = null;
          }

          this.mediaRecorder = null;
          this.isStopping = false;

          this.processChunksAndResolve(resolve, reject, durationMs, recorder.mimeType);
        } catch (err: any) {
          reject(err);
        }
      };

      // Safety timeout: If Firefox or any browser stalls onstop, forcefully finish within 2000ms
      const safetyTimeout = setTimeout(() => {
        console.warn('[WebAudioRecorder] onstop did not fire within 2000ms, forcefully finishing recording');
        finishStop();
      }, 2000);

      recorder.onstop = () => {
        finishStop();
      };

      recorder.onerror = (e) => {
        console.warn('[WebAudioRecorder] MediaRecorder error event during stop:', e);
        finishStop();
      };

      // Request final buffered audio chunk if still recording
      try {
        if (recorder.state === 'recording' || recorder.state === 'paused') {
          recorder.requestData();
        }
      } catch {}

      try {
        if (recorder.state !== 'inactive') {
          recorder.stop();
        } else {
          finishStop();
        }
      } catch (err: any) {
        console.warn('[WebAudioRecorder] recorder.stop() threw, finishing gracefully:', err);
        finishStop();
      }
    });
  }

  private processChunksAndResolve(
    resolve: (val: RecordingResult) => void,
    reject: (err: any) => void,
    durationMs: number,
    recordedMime?: string
  ) {
    try {
      const rawMimeType = recordedMime || this.chosenMimeType || 'audio/webm';
      const cleanMimeType = rawMimeType.split(';')[0].trim();
      
      let fileExt = this.chosenExt;
      if (cleanMimeType.includes('mp4') || cleanMimeType.includes('aac')) {
        fileExt = 'mp4';
      } else if (cleanMimeType.includes('ogg')) {
        fileExt = 'ogg';
      } else if (cleanMimeType.includes('wav')) {
        fileExt = 'wav';
      } else {
        fileExt = 'webm';
      }

      const blob = new Blob(this.chunks, { type: cleanMimeType });

      // Audio validation: reject empty or corrupt recordings (< 500 bytes or < 500ms)
      if (blob.size < 500 || (durationMs < 500 && blob.size < 1000)) {
        reject(new Error('Recording was too short or no audio was captured. Please speak into your microphone and try again.'));
        return;
      }

      // Convert Blob to Base64
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(',')[1] || '';
        resolve({
          blob,
          base64,
          mimeType: cleanMimeType,
          fileExt,
          durationMs,
        });
      };
      reader.onerror = () => reject(new Error('Failed to read recorded audio data.'));
    } catch (err: any) {
      reject(err);
    }
  }
}
