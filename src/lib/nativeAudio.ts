import { Capacitor } from '@capacitor/core';
import { RecordingResult } from './audioRecorder';

export const isNativeAndroid = () => {
  if (typeof window === 'undefined') return false;
  try {
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') return true;
    const cap = (window as any).Capacitor;
    if (cap && (cap.getPlatform?.() === 'android' || cap.platform === 'android')) return true;
    if (cap?.isNativePlatform?.() && cap?.getPlatform?.() === 'android') return true;
  } catch {}
  return false;
};

export const isTauri = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    if ('__TAURI_INTERNALS__' in window || '__TAURI__' in window) return true;
    if ((window as any).__TAURI_INTERNALS__ != null || (window as any).__TAURI__ != null) return true;
    if ((window as any).__TAURI_IPC__ != null || (window as any).__TAURI_METADATA__ != null) return true;
    const ua = (window.navigator?.userAgent || '').toLowerCase();
    if (ua.includes('tauri')) return true;
    const loc = window.location;
    if (loc) {
      if (loc.protocol === 'tauri:' || loc.protocol === 'asset:') return true;
      if (loc.hostname === 'tauri.localhost' || (loc.origin && loc.origin.includes('tauri.localhost'))) return true;
    }
  } catch {}
  return false;
};

export const isNativeApp = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    // 1. Desktop standalone app (Tauri on Windows or macOS)
    if (isTauri()) return true;

    // 2. Mobile standalone app (Capacitor on Android or iOS)
    if (Capacitor.isNativePlatform()) return true;
    const cap = (window as any).Capacitor;
    if (cap && (cap.platform === 'android' || cap.platform === 'ios')) return true;
    if (cap?.isNativePlatform?.()) return true;

    // 3. Standalone installed PWA
    if (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) return true;
    if ((window.navigator as any).standalone === true) return true;
  } catch {}
  return false;
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
    durationMs: res.duration || 0,
    fileExt: res.fileExt || 'm4a',
  };
}

export async function pauseNativeRecording(): Promise<void> {
  const { NativeAudioService } = (Capacitor as any).Plugins || {};
  if (!NativeAudioService) {
    throw new Error('NativeAudioService plugin is not available');
  }
  await NativeAudioService.pauseRecording();
}

export async function resumeNativeRecording(): Promise<void> {
  const { NativeAudioService } = (Capacitor as any).Plugins || {};
  if (!NativeAudioService) {
    throw new Error('NativeAudioService plugin is not available');
  }
  await NativeAudioService.resumeRecording();
}

export async function checkNativeRecordingStatus(): Promise<{ isRecording: boolean; isPaused: boolean }> {
  try {
    const { NativeAudioService } = (Capacitor as any).Plugins || {};
    if (!NativeAudioService) return { isRecording: false, isPaused: false };
    const res = await NativeAudioService.isRecording();
    return {
      isRecording: Boolean(res?.isRecording),
      isPaused: Boolean(res?.isPaused),
    };
  } catch {
    return { isRecording: false, isPaused: false };
  }
}

export function addNativeRecordingListener(callback: (isRecording: boolean, isPaused?: boolean) => void) {
  try {
    const { NativeAudioService } = (Capacitor as any).Plugins || {};
    if (!NativeAudioService || !NativeAudioService.addListener) return () => {};
    
    const handle = NativeAudioService.addListener('recordingStateChanged', (data: any) => {
      callback(Boolean(data?.isRecording), Boolean(data?.isPaused));
    });

    return () => {
      if (handle && handle.remove) handle.remove();
    };
  } catch {
    return () => {};
  }
}
