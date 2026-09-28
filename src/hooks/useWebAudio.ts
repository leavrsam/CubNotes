import { useState, useRef, useCallback } from 'react';
import { WebAudioRecorder, RecordingResult } from '@/lib/audioRecorder';

export function useWebAudio() {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const recorderRef = useRef<WebAudioRecorder | null>(null);

  const startRecording = useCallback(async () => {
    try {
      const recorder = new WebAudioRecorder();
      await recorder.start();
      recorderRef.current = recorder;
      setIsRecording(true);
      setIsPaused(false);
    } catch (err) {
      console.error("Failed to start web audio recording:", err);
      setIsRecording(false);
      setIsPaused(false);
      throw err;
    }
  }, []);

  const pauseRecording = useCallback(() => {
    if (recorderRef.current) {
      recorderRef.current.pause();
      setIsPaused(true);
    }
  }, []);

  const resumeRecording = useCallback(() => {
    if (recorderRef.current) {
      recorderRef.current.resume();
      setIsPaused(false);
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<RecordingResult> => {
    if (!recorderRef.current) {
      setIsRecording(false);
      setIsPaused(false);
      throw new Error("No active recording");
    }

    try {
      const result = await recorderRef.current.stop();
      return result;
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
