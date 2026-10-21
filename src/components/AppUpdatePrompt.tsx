"use client";

import React, { useEffect, useState } from "react";
import { Download, Sparkles, X, ArrowUpCircle } from "lucide-react";
import toast from "react-hot-toast";
import { checkAppUpdate, downloadAndInstallApk, type AppVersionInfo } from "@/lib/appUpdate";

export function AppUpdatePrompt() {
  const [updateInfo, setUpdateInfo] = useState<AppVersionInfo | null>(null);
  const [isDismissed, setIsDismissed] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    // Check if dismissed recently (within 2 hours)
    const dismissedTime = localStorage.getItem("dismissed_update_time");
    if (dismissedTime && Date.now() - parseInt(dismissedTime, 10) < 2 * 60 * 60 * 1000) {
      return;
    }

    checkAppUpdate().then((result) => {
      if (result.hasUpdate && result.serverInfo) {
        setUpdateInfo(result.serverInfo);
        setIsDismissed(false);
      }
    });
  }, []);

  const handleDismiss = () => {
    setIsDismissed(true);
    localStorage.setItem("dismissed_update_time", Date.now().toString());
  };

  const handleUpdate = async () => {
    if (!updateInfo) return;
    setIsDownloading(true);
    toast.loading("Starting download of Motif.apk...", { id: "app-update" });

    try {
      await downloadAndInstallApk(updateInfo.apkUrl);
      toast.success("Download started! Tap the download notification to update Motif.", {
        id: "app-update",
        duration: 7000,
      });
      setIsDismissed(true);
    } catch (e: any) {
      toast.error("Could not trigger download. Please check internet connection.", {
        id: "app-update",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  if (isDismissed || !updateInfo) {
    return null;
  }

  return (
    <div 
      className="fixed bottom-4 left-4 right-4 z-50 max-w-md mx-auto animate-in fade-in slide-in-from-bottom-5 duration-300 pointer-events-auto"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
    >
      <div className="bg-zinc-900/95 dark:bg-zinc-900/95 text-white backdrop-blur-md border border-zinc-700/80 rounded-2xl shadow-2xl p-4 flex flex-col gap-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary-500/20 text-primary-400 border border-primary-500/30 flex items-center justify-center shrink-0">
              <ArrowUpCircle size={20} className="animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold tracking-tight text-white">
                  App Update Available
                </span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary-500/25 text-primary-300 border border-primary-500/40">
                  v{updateInfo.versionName}
                </span>
              </div>
              <p className="text-xs text-zinc-300 mt-0.5 line-clamp-2 leading-relaxed">
                {updateInfo.description || "A new native Android update is available with recording pause controls and lock screen notifications."}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDismiss}
            className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition-colors shrink-0 -mr-1 -mt-1"
            title="Dismiss for now"
          >
            <X size={16} />
          </button>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 mt-1">
          <button
            type="button"
            onClick={handleUpdate}
            disabled={isDownloading}
            className="flex-1 flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-500 active:scale-[0.98] text-white font-semibold text-xs transition-all shadow-md shadow-primary-900/30"
          >
            <Download size={14} className={isDownloading ? "animate-bounce" : ""} />
            <span>{isDownloading ? "Starting Download..." : "Update Now"}</span>
          </button>

          <button
            type="button"
            onClick={handleDismiss}
            className="px-3.5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-750 text-zinc-300 hover:text-white font-medium text-xs transition-colors"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
