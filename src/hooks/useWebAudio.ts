import { useState, useRef, useCallback } from 'react';

export function useWebAudio() {
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1, // Mono voice capture (half the raw uncompressed data)
          noiseSuppression: true,
          echoCancellation: true,
          autoGainControl: true,
        },
      });

      const mimeType = typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 28000, // 28 kbps Opus = crystal clear voice at ~12 MB/hour
      });

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Failed to start web audio recording:", err);
    }
  }, []);

  const stopRecording = useCallback((): Promise<{ base64: string, mimeType: string }> => {
    return new Promise((resolve, reject) => {
      if (!mediaRecorderRef.current) {
        reject("No active recording");
        return;
      }

      const recorder = mediaRecorderRef.current;
      
      recorder.onstop = () => {
        const actualMimeType = recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: actualMimeType });
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = () => {
          const base64data = reader.result as string;
          // Extract just the base64 part, stripping the data URL prefix
          const base64Content = base64data.split(',')[1];
          resolve({ base64: base64Content, mimeType: actualMimeType } as any); // Type cast since we change return signature
        };
        reader.onerror = () => reject("Failed to read audio blob");
        
        // Stop all tracks to release microphone
        recorder.stream.getTracks().forEach(track => track.stop());
        setIsRecording(false);
      };

      recorder.stop();
    });
  }, []);

  return { isRecording, startRecording, stopRecording };
}
