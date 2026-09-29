import { Capacitor } from '@capacitor/core';
import { RecordingResult } from './audioRecorder';

export const isNativeAndroid = () => {
  return typeof window !== 'undefined' && Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
};

export async function startNativeRecording(): Promise<void> {
  const { NativeAudioService } = (Capacitor as any).Plugins || {};
  if (!NativeAudioService) {
    throw new Error('NativeAudioService plugin is not available');
  }
  const res = await NativeAudioService.startRecording();
  if (res && res.error) {
    throw new Error(res.error);
  }
}

export async function stopNativeRecording(): Promise<RecordingResult> {
  const { NativeAudioService } = (Capacitor as any).Plugins || {};
  if (!NativeAudioService) {
    throw new Error('NativeAudioService plugin is not available');
  }

  const res = await NativeAudioService.stopRecording();
  if (!res || !res.base64) {
    throw new Error(res?.message || 'No audio recorded from native service');
  }

  const cleanMime = res.mimeType || 'audio/mp4';
  const byteChars = atob(res.base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteNumbers[i] = byteChars.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: cleanMime });

  return {
    blob,
    mimeType: cleanMime,
    base64: res.base64,
    duration: res.duration || 0,
    fileExt: res.fileExt || 'm4a',
  };
}

export async function checkNativeRecordingStatus(): Promise<boolean> {
  try {
    const { NativeAudioService } = (Capacitor as any).Plugins || {};
    if (!NativeAudioService) return false;
    const res = await NativeAudioService.isRecording();
    return Boolean(res?.isRecording);
  } catch {
    return false;
  }
}

export function addNativeRecordingListener(callback: (isRecording: boolean) => void) {
  try {
    const { NativeAudioService } = (Capacitor as any).Plugins || {};
    if (!NativeAudioService || !NativeAudioService.addListener) return () => {};
    
    const handle = NativeAudioService.addListener('recordingStateChanged', (data: any) => {
      callback(Boolean(data?.isRecording));
    });

    return () => {
      if (handle && handle.remove) handle.remove();
    };
  } catch {
    return () => {};
  }
}
