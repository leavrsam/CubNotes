// src/lib/liveSpeech.ts

export type LiveSpeechStatus = 
  | 'idle' 
  | 'listening' 
  | 'speaking' 
  | 'mic_busy' 
  | 'permission_denied' 
  | 'unsupported' 
  | 'error';

export type LiveSpeechCallback = (result: {
  transcript: string;
  interim: string;
  isFinal: boolean;
  status: LiveSpeechStatus;
  statusMessage?: string;
}) => void;

/**
 * Service providing real-time, zero-token on-device speech-to-text streaming
 * using the browser's built-in Web Speech API (Chrome, Android, Safari, Edge).
 */
export class LiveSpeechRecognizer {
  private recognition: any = null;
  private isListening: boolean = false;
  private isPaused: boolean = false;
  private baseTranscript: string = '';
  private currentSessionFinal: string = '';
  private interimTranscript: string = '';
  private onUpdate: LiveSpeechCallback | null = null;
  private restartTimeout: any = null;
  public status: LiveSpeechStatus = 'idle';
  public statusMessage: string = '';

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
      this.status = 'unsupported';
      this.statusMessage = 'Web Speech not supported in this browser';
      this.broadcastUpdate('', '', false);
      return false;
    }

    this.stop(); // Clear any previous active recognition
    this.baseTranscript = initialTranscript;
    this.currentSessionFinal = '';
    this.interimTranscript = '';
    this.onUpdate = onUpdate || null;
    this.isListening = true;
    this.isPaused = false;
    this.status = 'listening';
    this.statusMessage = 'Listening for speech...';

    this.broadcastUpdate(this.baseTranscript, '', false);
    this.initRecognition();
    return true;
  }

  private initRecognition(): void {
    if (!this.isListening || this.isPaused || typeof window === 'undefined') return;

    try {
      const SpeechRecognitionClass =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (!SpeechRecognitionClass) {
        this.status = 'unsupported';
        this.broadcastUpdate('', '', false);
        return;
      }

      const recognition = new SpeechRecognitionClass();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      // Safe BCP 47 language code
      let lang = 'en-US';
      if (typeof navigator !== 'undefined' && navigator.language) {
        const navLang = navigator.language;
        if (navLang.startsWith('en')) {
          lang = 'en-US';
        } else if (navLang.includes('-')) {
          lang = navLang;
        } else if (navLang.length === 2) {
          lang = `${navLang}-${navLang.toUpperCase()}`;
        }
      }
      recognition.lang = lang;

      recognition.onstart = () => {
        if (this.isListening) {
          this.status = 'listening';
          this.statusMessage = 'Listening live...';
          this.broadcastUpdate(this.getFullTranscript(), '', false);
        }
      };

      recognition.onspeechstart = () => {
        if (this.isListening) {
          this.status = 'speaking';
          this.statusMessage = 'Voice detected';
          this.broadcastUpdate(this.getFullTranscript(), this.interimTranscript, false);
        }
      };

      recognition.onresult = (event: any) => {
        let sessionFinal = '';
        let interimText = '';

        for (let i = 0; i < event.results.length; ++i) {
          const res = event.results[i];
          const text = res[0]?.transcript || '';
          if (res.isFinal) {
            sessionFinal += (sessionFinal ? ' ' : '') + text.trim();
          } else {
            interimText += text;
          }
        }

        this.currentSessionFinal = sessionFinal;
        this.interimTranscript = interimText;
        this.status = interimText.trim() || sessionFinal.trim() ? 'speaking' : 'listening';
        this.statusMessage = 'Transcribing live...';

        this.broadcastUpdate(this.getFullTranscript(), this.interimTranscript, false);
      };

      recognition.onerror = (event: any) => {
        const err = event.error;
        if (err === 'not-allowed') {
          this.status = 'permission_denied';
          this.statusMessage = 'Microphone permission needed for speech recognition';
          this.isListening = false;
        } else if (err === 'audio-capture') {
          this.status = 'mic_busy';
          this.statusMessage = 'Device microphone in use by audio recorder';
        } else if (err === 'network') {
          this.status = 'error';
          this.statusMessage = 'Speech recognition network required on this device';
        } else if (err !== 'no-speech' && err !== 'aborted') {
          this.status = 'error';
          this.statusMessage = `Speech status: ${err}`;
        }

        this.broadcastUpdate(this.getFullTranscript(), this.interimTranscript, false);
      };

      recognition.onend = () => {
        // Accumulate this session's final transcript into base
        if (this.currentSessionFinal) {
          this.baseTranscript = (this.baseTranscript ? `${this.baseTranscript} ` : '') + this.currentSessionFinal;
          this.currentSessionFinal = '';
          this.interimTranscript = '';
        }

        // Chrome & Android automatically end recognition sessions on brief silence.
        // Automatically restart if recording is still active and no permanent error occurred
        if (this.isListening && !this.isPaused && this.status !== 'permission_denied' && this.status !== 'mic_busy') {
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
    } catch (err: any) {
      console.warn('SpeechRecognition failed to start:', err);
      this.status = 'error';
      this.statusMessage = 'Could not start live speech recognition';
      this.broadcastUpdate(this.getFullTranscript(), '', false);
    }
  }

  private getFullTranscript(): string {
    const parts = [this.baseTranscript, this.currentSessionFinal, this.interimTranscript]
      .map(p => p.trim())
      .filter(Boolean);
    return parts.join(' ');
  }

  private broadcastUpdate(transcript: string, interim: string, isFinal: boolean): void {
    if (this.onUpdate) {
      this.onUpdate({
        transcript,
        interim,
        isFinal,
        status: this.status,
        statusMessage: this.statusMessage,
      });
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('live-transcript-broadcast', {
          detail: {
            transcript,
            interim,
            isFinal,
            status: this.status,
            statusMessage: this.statusMessage,
          },
        })
      );
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

    const fullResult = this.getFullTranscript();
    this.status = 'idle';
    this.statusMessage = '';
    this.broadcastUpdate(fullResult, '', true);

    return fullResult;
  }

  public getTranscript(): string {
    return this.getFullTranscript();
  }

  public isActive(): boolean {
    return this.isListening && !this.isPaused;
  }
}

export const liveSpeechRecognizer = new LiveSpeechRecognizer();
