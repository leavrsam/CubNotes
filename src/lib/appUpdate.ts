import { Capacitor } from '@capacitor/core';
import { isNativeAndroid } from './nativeAudio';

export interface AppVersionInfo {
  versionCode: number;
  versionName: string;
  apkUrl: string;
  title: string;
  description: string;
  releaseDate?: string;
}

export interface AppUpdateCheckResult {
  hasUpdate: boolean;
  serverInfo?: AppVersionInfo;
  installedVersionCode: number;
  installedVersionName: string;
}

export async function checkAppUpdate(): Promise<AppUpdateCheckResult> {
  if (!isNativeAndroid()) {
    return {
      hasUpdate: false,
      installedVersionCode: 0,
      installedVersionName: 'web'
    };
  }

  try {
    // 1. Fetch latest server version info (never cached)
    const res = await fetch(`/version.json?_t=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' }
    });

    if (!res.ok) {
      return { hasUpdate: false, installedVersionCode: 1, installedVersionName: '1.0' };
    }

    const serverInfo: AppVersionInfo = await res.json();

    // 2. Query local installed versionCode and versionName
    let installedVersionCode = 1;
    let installedVersionName = '1.0';

    try {
      const { NativeAudioService } = (Capacitor as any).Plugins || {};
      if (NativeAudioService && NativeAudioService.getAppVersion) {
        const v = await NativeAudioService.getAppVersion();
        if (v && v.versionCode !== undefined) {
          installedVersionCode = Number(v.versionCode);
          if (v.versionName) installedVersionName = String(v.versionName);
        }
      } else {
        // Fallback to Capacitor App plugin if custom method not present
        const { App } = await import('@capacitor/app');
        const info = await App.getInfo();
        if (info && info.build) {
          installedVersionCode = parseInt(info.build, 10) || 1;
        }
        if (info && info.version) {
          installedVersionName = info.version;
        }
      }
    } catch {
      // If version detection fails on older build, it is build 1
      installedVersionCode = 1;
    }

    const hasUpdate = serverInfo.versionCode > installedVersionCode;

    return {
      hasUpdate,
      serverInfo,
      installedVersionCode,
      installedVersionName
    };
  } catch (err) {
    console.warn("Failed to check for app update:", err);
    return {
      hasUpdate: false,
      installedVersionCode: 1,
      installedVersionName: '1.0'
    };
  }
}

export async function downloadAndInstallApk(apkUrl: string = "https://cub-notes.vercel.app/Motif.apk") {
  // 1. Try native plugin launcher if available
  try {
    const { NativeAudioService } = (Capacitor as any).Plugins || {};
    if (NativeAudioService && NativeAudioService.openUrl) {
      await NativeAudioService.openUrl({ url: apkUrl });
      return;
    }
  } catch (e) {
    console.warn("NativeAudioService.openUrl failed:", e);
  }

  // 2. Fallback to window.open with _system target
  try {
    const opened = window.open(apkUrl, '_system');
    if (opened) return;
  } catch (e) {
    console.warn("window.open(_system) failed:", e);
  }

  // 3. Fallback to hidden anchor tag download
  try {
    const a = document.createElement('a');
    a.href = apkUrl;
    a.download = 'Motif.apk';
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch {
    window.location.href = apkUrl;
  }
}
