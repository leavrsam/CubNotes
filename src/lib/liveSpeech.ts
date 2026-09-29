// src/lib/liveSpeech.ts

export type LiveSpeechCallback = (result: {
  transcript: string;
  interim: string;
  isFinal: boolean;
}) => void;

/**
 * Service providing real-time, zero-token on-device speech-to-text streaming
 * using the browser's built-in Web Speech API (Chrome, Android, Safari, Edge).
 */
export class LiveSpeechRecognizer {
  private recognition: any = null;
  private isListening: boolean = false;
  private isPaused: boolean = false;
  private finalTranscript: string = '';
  private interimTranscript: string = '';
  private onUpdate: LiveSpeechCallback | null = null;
  private restartTimeout: any = null;

  public static isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return Boolean(
      (window as any).SpeechRecognition || 
      (window as any).webkitSpeechRecognition
    );
  }

  public start(
    onUpdate?: LiveSpeechCallback,
    initialTranscript: string = ''
  ): boolean {
    if (!LiveSpeechRecognizer.isSupported()) {
      console.warn('Web Speech API is not supported in this browser.');
      return false;
    }

    this.stop(); // Clear any previous active recognition
    this.finalTranscript = initialTranscript;
    this.interimTranscript = '';
    this.onUpdate = onUpdate || null;
    this.isListening = true;
    this.isPaused = false;

    this.initRecognition();
    return true;
  }

  private initRecognition(): void {
    if (!this.isListening || this.isPaused || typeof window === 'undefined') return;

    try {
      const SpeechRecognitionClass =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (!SpeechRecognitionClass) return;

      const recognition = new SpeechRecognitionClass();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.lang = typeof navigator !== 'undefined' ? (navigator.language || 'en-US') : 'en-US';

      recognition.onresult = (event: any) => {
        let interimText = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const res = event.results[i];
          const text = res[0]?.transcript || '';
          if (res.isFinal) {
            this.finalTranscript = (this.finalTranscript ? `${this.finalTranscript} ` : '') + text.trim();
          } else {
            interimText += text;
          }
        }
        this.interimTranscript = interimText;

        const combined = (this.finalTranscript + (this.interimTranscript ? ` ${this.interimTranscript}` : '')).trim();

        if (this.onUpdate) {
          this.onUpdate({
            transcript: combined,
            interim: this.interimTranscript,
            isFinal: false,
          });
        }

        // Global event dispatch for all active cards / components
        window.dispatchEvent(
          new CustomEvent('live-transcript-broadcast', {
            detail: {
              transcript: combined,
              interim: this.interimTranscript,
            },
          })
        );
      };

      recognition.onerror = (event: any) => {
        // "no-speech" and "aborted" are standard events during natural speech pauses
        if (event.error === 'not-allowed') {
          console.warn('Speech recognition permission denied.');
          this.isListening = false;
        } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
          console.warn('Speech recognition status:', event.error);
        }
      };

      recognition.onend = () => {
        // Chrome & Android automatically end recognition sessions on brief silence.
        // Automatically restart if the meeting/recording is still active.
        if (this.isListening && !this.isPaused) {
          clearTimeout(this.restartTimeout);
          this.restartTimeout = setTimeout(() => {
            if (this.isListening && !this.isPaused) {
              this.initRecognition();
            }
          }, 200);
        }
      };

      recognition.start();
      this.recognition = recognition;
    } catch (err) {
      console.warn('SpeechRecognition could not start:', err);
    }
  }

  public pause(): void {
    this.isPaused = true;
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {}
    }
  }

  public resume(): void {
    if (this.isListening) {
      this.isPaused = false;
      this.initRecognition();
    }
  }

  public stop(): string {
    this.isListening = false;
    this.isPaused = false;
    clearTimeout(this.restartTimeout);

    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {}
      this.recognition = null;
    }

    const fullResult = (this.finalTranscript + (this.interimTranscript ? ` ${this.interimTranscript}` : '')).trim();
    if (this.onUpdate) {
      this.onUpdate({
        transcript: fullResult,
        interim: '',
        isFinal: true,
      });
    }

    return fullResult;
  }

  public getTranscript(): string {
    return (this.finalTranscript + (this.interimTranscript ? ` ${this.interimTranscript}` : '')).trim();
  }

  public isActive(): boolean {
    return this.isListening && !this.isPaused;
  }
}

export const liveSpeechRecognizer = new LiveSpeechRecognizer();
