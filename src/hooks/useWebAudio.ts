import { useState, useRef, useCallback } from 'react';

export function useWebAudio() {
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
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

  const stopRecording = useCallback((): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!mediaRecorderRef.current) {
        reject("No active recording");
        return;
      }

      const recorder = mediaRecorderRef.current;
      
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = () => {
          const base64data = reader.result as string;
          // Extract just the base64 part, stripping the data URL prefix
          const base64Content = base64data.split(',')[1];
          resolve(base64Content);
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
