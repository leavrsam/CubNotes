import { Capacitor } from '@capacitor/core';
import { isNativeAndroid } from './nativeAudio';

export interface AppVersionInfo {
  versionCode: number;
  versionName: string;
  apkUrl: string;
  title: string;
  description: string;
  changelog?: string;
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
    let res = await fetch(`/version.json?_t=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' }
    }).catch(() => null);

    if (!res || !res.ok) {
      res = await fetch(`https://motif.wolfcubventures.com/version.json?_t=${Date.now()}`, {
        cache: 'no-store'
      }).catch(() => null);
    }

    if (!res || !res.ok) {
      return { hasUpdate: false, installedVersionCode: 1, installedVersionName: '1.0' };
    }

    const data = await res.json();
    const serverInfo: AppVersionInfo = {
      versionCode: data.versionCode ?? data.version_code ?? 0,
      versionName: data.versionName ?? data.version_name ?? "1.0",
      apkUrl: data.apkUrl ?? data.apk_url ?? "https://motif.wolfcubventures.com/Motif.apk",
      title: data.title ?? "Motif Update Available",
      description: data.description ?? "",
      changelog: data.changelog ?? data.description ?? "",
      releaseDate: data.releaseDate ?? data.release_date,
    };

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

export async function downloadAndInstallApk(apkUrl: string = "https://motif.wolfcubventures.com/Motif.apk", versionName: string = "1.0.4") {
  const directApkUrl = apkUrl || "https://motif.wolfcubventures.com/Motif.apk";

  // 1. Try native auto-installer plugin method (available in updated APK builds)
  try {
    const { NativeAudioService } = (Capacitor as any).Plugins || {};
    if (NativeAudioService && typeof NativeAudioService.downloadAndInstallUpdate === 'function') {
      const res = await NativeAudioService.downloadAndInstallUpdate({ url: directApkUrl, versionName: versionName || "1.0.4" });
      if (res && res.success) {
        return { success: true, method: 'native' };
      }
    }
    if (NativeAudioService && typeof NativeAudioService.openUrl === 'function') {
      await NativeAudioService.openUrl({ url: directApkUrl });
      return { success: true, method: 'native_open_url' };
    }
  } catch (e) {
    console.warn("NativeAudioService update method failed, trying Browser plugin:", e);
  }

  // 2. Try @capacitor/browser plugin (opens Chrome / default system browser to handle file download)
  try {
    const { Browser } = await import('@capacitor/browser');
    if (Browser && typeof Browser.open === 'function') {
      await Browser.open({ url: directApkUrl });
      return { success: true, method: 'browser_plugin' };
    }
  } catch (e) {
    console.warn("Capacitor Browser plugin failed, trying Android intent scheme:", e);
  }

  // 3. Fallback: Android Intent URL scheme
  // In Android WebViews, navigating to intent:// forces Android OS to hand off the URL
  // to the external browser (Chrome / Samsung Internet), bypassing internal WebView navigation!
  try {
    const cleanUrl = directApkUrl.replace(/^https?:\/\//, '');
    const intentUrl = `intent://${cleanUrl}#Intent;scheme=https;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end;`;
    window.location.href = intentUrl;
    return { success: true, method: 'intent_uri' };
  } catch (e) {
    console.warn("Intent navigation failed:", e);
  }

  // 4. Final Fallback: window.open with _system
  try {
    window.open(directApkUrl, '_system');
  } catch {
    window.location.href = directApkUrl;
  }
}
