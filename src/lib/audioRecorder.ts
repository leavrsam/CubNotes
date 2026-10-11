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

  public isRecording(): boolean {
    return !!this.mediaRecorder && (this.mediaRecorder.state === 'recording' || this.mediaRecorder.state === 'paused');
  }

  public isPaused(): boolean {
    return !!this.mediaRecorder && this.mediaRecorder.state === 'paused';
  }

  public async start(): Promise<void> {
    // 1. Get user media with fallback for mobile
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 24000,
          noiseSuppression: true,
          echoCancellation: true,
          autoGainControl: true,
        },
      });
    } catch (constraintErr) {
      console.warn('Microphone constraints failed, falling back to basic audio:', constraintErr);
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }
    this.stream = stream;

    // 2. Select compatible MIME type
    const { mimeType, fileExt } = getPreferredMimeType();
    this.chosenMimeType = mimeType;
    this.chosenExt = fileExt;

    // Voice-optimized bitrate: 28-32 kbps mono gives crystal clear speech while keeping 1 hour < 14MB
    const targetBits = mimeType.includes('webm') ? 28000 : 32000;
    const recorderOptions: MediaRecorderOptions = {};
    if (mimeType) {
      recorderOptions.mimeType = mimeType;
    }
    recorderOptions.audioBitsPerSecond = targetBits;

    let recorder: MediaRecorder;
    try {
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

    // Use 1000ms timeslice so data arrives progressively on all platforms
    recorder.start(1000);
  }

  public pause(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.pause();
    }
  }

  public resume(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
      this.mediaRecorder.resume();
    }
  }

  public stop(): Promise<RecordingResult> {
    return new Promise((resolve, reject) => {
      const recorder = this.mediaRecorder;
      if (!recorder) {
        reject(new Error('No active recording.'));
        return;
      }

      const durationMs = Date.now() - this.startTime;

      recorder.onstop = async () => {
        try {
          // Stop all stream tracks to turn off the microphone indicator
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

          const rawMimeType = recorder.mimeType || this.chosenMimeType || 'audio/webm';
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

          // Audio validation: reject empty or corrupt recordings (< 1KB or < 500ms)
          if (blob.size < 1000 || durationMs < 500) {
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
      };

      try {
        if (recorder.state !== 'inactive') {
          recorder.stop();
        }
      } catch (err: any) {
        reject(err);
      }
    });
  }
}
