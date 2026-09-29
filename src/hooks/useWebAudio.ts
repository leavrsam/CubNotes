import { useState, useRef, useCallback, useEffect } from 'react';
import { WebAudioRecorder, RecordingResult } from '@/lib/audioRecorder';
import { liveSpeechRecognizer } from '@/lib/liveSpeech';
import {
  isNativeAndroid,
  startNativeRecording,
  stopNativeRecording,
  checkNativeRecordingStatus,
  addNativeRecordingListener
} from '@/lib/nativeAudio';

export function useWebAudio() {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const recorderRef = useRef<WebAudioRecorder | null>(null);

  // Sync state with native Android background service if running on device
  useEffect(() => {
    if (!isNativeAndroid()) return;

    checkNativeRecordingStatus().then((active) => {
      setIsRecording(active);
    });

    const cleanup = addNativeRecordingListener((active) => {
      setIsRecording(active);
    });

    return () => {
      cleanup();
    };
  }, []);

  const startRecording = useCallback(async () => {
    // 1. Start live speech recognition synchronously to preserve user-gesture activation
    try {
      liveSpeechRecognizer.start();
    } catch (speechErr) {
      console.warn("Live speech recognition not started:", speechErr);
    }

    try {
      if (isNativeAndroid()) {
        await startNativeRecording();
        setIsRecording(true);
        setIsPaused(false);
        return;
      }

      const recorder = new WebAudioRecorder();
      await recorder.start();
      recorderRef.current = recorder;
      setIsRecording(true);
      setIsPaused(false);
    } catch (err) {
      console.error("Failed to start audio recording:", err);
      liveSpeechRecognizer.stop();
      setIsRecording(false);
      setIsPaused(false);
      throw err;
    }
  }, []);

  const pauseRecording = useCallback(() => {
    if (recorderRef.current) {
      recorderRef.current.pause();
      liveSpeechRecognizer.pause();
      setIsPaused(true);
    }
  }, []);

  const resumeRecording = useCallback(() => {
    if (recorderRef.current) {
      recorderRef.current.resume();
      liveSpeechRecognizer.resume();
      setIsPaused(false);
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<RecordingResult> => {
    const liveTranscript = liveSpeechRecognizer.stop();

    if (isNativeAndroid()) {
      try {
        const result = await stopNativeRecording();
        setIsRecording(false);
        setIsPaused(false);
        return { ...result, liveTranscript };
      } catch (err) {
        setIsRecording(false);
        setIsPaused(false);
        throw err;
      }
    }

    if (!recorderRef.current) {
      setIsRecording(false);
      setIsPaused(false);
      throw new Error("No active recording");
    }

    try {
      const result = await recorderRef.current.stop();
      return { ...result, liveTranscript };
    } finally {
      recorderRef.current = null;
      setIsRecording(false);
      setIsPaused(false);
    }
  }, []);

  return { 
    isRecording, 
    isPaused,
    startRecording, 
    pauseRecording,
    resumeRecording,
    stopRecording 
  };
}
