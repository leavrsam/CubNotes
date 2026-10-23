"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import Image from "next/image";
import { Download, Sparkles, X, ArrowUpCircle, CheckCircle2, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";
import { checkAppUpdate, downloadAndInstallApk, type AppVersionInfo } from "@/lib/appUpdate";

export function AppUpdatePrompt() {
  const [updateInfo, setUpdateInfo] = useState<AppVersionInfo | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadTriggered, setDownloadTriggered] = useState(false);
  const isCheckingRef = useRef(false);

  const performCheck = useCallback(async (isManual: boolean = false) => {
    if (isCheckingRef.current) return;
    isCheckingRef.current = true;

    try {
      const result = await checkAppUpdate();
      if (result.hasUpdate && result.serverInfo) {
        setUpdateInfo(result.serverInfo);
        
        // If it's a manual check or hasn't been temporarily postponed in the last 30 minutes
        const postponedUntil = sessionStorage.getItem("postpone_update_until");
        const now = Date.now();
        if (isManual || !postponedUntil || now > parseInt(postponedUntil, 10)) {
          setIsOpen(true);
        }
      }
    } catch (err) {
      console.warn("Update check error:", err);
    } finally {
      isCheckingRef.current = false;
    }
  }, []);

  useEffect(() => {
    // 1. Initial check on startup (matches LaunchedEffect in Fledge)
    performCheck(false);

    // 2. Check every 15 minutes (matches while(true) delay(900000) in Fledge)
    const intervalId = setInterval(() => {
      performCheck(false);
    }, 15 * 60 * 1000);

    // 3. Check on app resume / visibility change (matches Lifecycle.Event.ON_RESUME in Fledge)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        performCheck(false);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleVisibilityChange);

    // 4. Capacitor App plugin listener if available
    let removeAppListener: (() => void) | undefined;
    (async () => {
      try {
        const { App } = await import("@capacitor/app");
        if (App && typeof App.addListener === "function") {
          const sub = await App.addListener("appStateChange", (state) => {
            if (state.isActive) {
              performCheck(false);
            }
          });
          removeAppListener = () => {
            if (sub && typeof sub.remove === "function") {
              sub.remove();
            }
          };
        }
      } catch {
        // Not in native Capacitor environment
      }
    })();

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleVisibilityChange);
      if (removeAppListener) removeAppListener();
    };
  }, [performCheck]);

  const handleDismiss = () => {
    setIsOpen(false);
    // Postpone for 30 minutes so user can finish their immediate task without interruptions
    sessionStorage.setItem("postpone_update_until", (Date.now() + 30 * 60 * 1000).toString());
  };

  const handleUpdate = async () => {
    if (!updateInfo) return;
    setIsDownloading(true);
    setDownloadTriggered(true);

    toast.loading("Starting download of Motif update...", { id: "app-update" });

    try {
      await downloadAndInstallApk(updateInfo.apkUrl);
      toast.success("Download started! Check your notification bar to install.", {
        id: "app-update",
        duration: 7000,
      });
    } catch (e: any) {
      console.error("Update trigger failed:", e);
      toast.error("Could not trigger download. Opening download link directly...", {
        id: "app-update",
      });
      window.open(updateInfo.apkUrl, "_blank");
    } finally {
      setIsDownloading(false);
    }
  };

  // If no update is available or modal is dismissed, render persistent unobtrusive pill if update is waiting
  if (!updateInfo) {
    return null;
  }

  // When modal is dismissed by "Later", render a tiny subtle badge in bottom-right so the user can easily re-open
  if (!isOpen) {
    return (
      <div
        className="fixed bottom-4 right-4 z-40 pointer-events-auto"
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
      >
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary-600/90 hover:bg-primary-500 text-white shadow-lg backdrop-blur-md border border-primary-400/30 text-xs font-semibold transition-all transform hover:scale-105 active:scale-95"
          title="Update available"
        >
          <ArrowUpCircle size={15} className="animate-pulse" />
          <span>Update v{updateInfo.versionName}</span>
        </button>
      </div>
    );
  }

  // Parse changelog lines
  const changelogContent = updateInfo.changelog || updateInfo.description || "";
  const changelogLines = changelogContent
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-sm sm:max-w-md bg-zinc-900 border border-zinc-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col p-5 text-zinc-100 animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-dialog-title"
      >
        {/* Close icon */}
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute top-4 right-4 text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition-colors"
          title="Close dialog"
        >
          <X size={18} />
        </button>

        {/* Dialog Header matching Fledge */}
        <div className="flex items-center gap-3.5 mb-4">
          <div className="w-12 h-12 rounded-xl bg-primary-500/20 border border-primary-500/30 flex items-center justify-center shrink-0 overflow-hidden shadow-inner">
            <Image
              src="/icon.png"
              alt="Motif Icon"
              width={48}
              height={48}
              className="w-full h-full object-cover"
            />
          </div>
          <div>
            <h2 id="update-dialog-title" className="text-base sm:text-lg font-bold text-white tracking-tight">
              Motif Update
            </h2>
            <p className="text-xs text-primary-400 font-medium">
              Version {updateInfo.versionName} (Build {updateInfo.versionCode})
            </p>
          </div>
        </div>

        {/* Subhead */}
        <p className="text-sm text-zinc-300 mb-3">
          A new version of Motif is ready to install.
        </p>

        {/* What's New Box */}
        {changelogLines.length > 0 && (
          <div className="mb-4 p-3 bg-zinc-950/60 border border-zinc-800 rounded-xl max-h-48 overflow-y-auto">
            <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">
              What's New:
            </p>
            <ul className="space-y-1.5 text-xs text-zinc-300">
              {changelogLines.map((line, index) => {
                const cleanLine = line.replace(/^[•\-\*]\s*/, "");
                return (
                  <li key={index} className="flex items-start gap-2">
                    <span className="text-primary-400 mt-0.5">•</span>
                    <span className="leading-snug">{cleanLine}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Post-Download Help Notice */}
        {downloadTriggered && (
          <div className="mb-4 p-3 rounded-xl bg-primary-950/40 border border-primary-500/30 text-xs text-zinc-300 flex flex-col gap-1.5">
            <p className="font-semibold text-primary-300 flex items-center gap-2">
              <CheckCircle2 size={16} className="text-primary-400" />
              Download initiated in background
            </p>
            <p className="text-[11px] text-zinc-400">
              Check your Android notification bar. When download completes, tap the notification to install the update.
            </p>
            <a
              href={updateInfo.apkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-primary-400 underline font-medium mt-0.5"
            >
              Direct download link (if download didn't start)
            </a>
          </div>
        )}

        {/* Dialog Actions matching Fledge */}
        <div className="flex items-center justify-end gap-2.5 mt-2">
          <button
            type="button"
            onClick={handleDismiss}
            className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white font-medium text-xs sm:text-sm transition-colors"
          >
            Later
          </button>

          <button
            type="button"
            onClick={handleUpdate}
            disabled={isDownloading}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-500 active:scale-[0.98] text-white font-semibold text-xs sm:text-sm transition-all shadow-md shadow-primary-900/40 disabled:opacity-70"
          >
            {isDownloading ? (
              <>
                <RefreshCw size={15} className="animate-spin" />
                <span>Downloading...</span>
              </>
            ) : (
              <>
                <Download size={15} />
                <span>{downloadTriggered ? "Download Again" : "Update Now"}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
