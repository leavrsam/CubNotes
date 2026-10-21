"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { 
  Download, 
  Smartphone, 
  Apple, 
  Monitor, 
  Globe, 
  Sparkles, 
  CheckCircle2, 
  WifiOff, 
  Mic, 
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  Layers,
  Zap
} from "lucide-react";

export default function DownloadPage() {
  const [detectedOS, setDetectedOS] = useState<"mac" | "windows" | "android" | "ios" | "unknown">("unknown");
  const [isMacSilicon, setIsMacSilicon] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("android")) {
      setDetectedOS("android");
    } else if (ua.includes("mac") || ua.includes("darwin")) {
      setDetectedOS("mac");
      // Modern Macs (M1/M2/M3/M4) or Intel
      setIsMacSilicon(true);
    } else if (ua.includes("win")) {
      setDetectedOS("windows");
    } else if (ua.includes("iphone") || ua.includes("ipad")) {
      setDetectedOS("ios");
    } else {
      setDetectedOS("unknown");
    }
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col selection:bg-primary-500/30 selection:text-white">
      {/* Background ambient lighting */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-primary-600/15 rounded-full blur-[140px]" />
        <div className="absolute top-1/3 -right-40 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[140px]" />
        <div className="absolute bottom-10 -left-40 w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-[140px]" />
      </div>

      {/* Navigation Bar */}
      <header className="relative z-10 w-full max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="relative w-10 h-10 rounded-xl overflow-hidden shadow-lg shadow-primary-500/10 ring-1 ring-white/10 group-hover:scale-105 transition-transform">
            <Image
              src="/logo.png"
              alt="Motif Logo"
              fill
              className="object-cover"
              priority
            />
          </div>
          <div>
            <span className="font-bold text-lg tracking-tight text-white flex items-center gap-1.5">
              Motif
            </span>
            <span className="text-[11px] text-zinc-400 block -mt-1">Spatial Workspace</span>
          </div>
        </Link>

        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="px-4 py-2 text-xs font-semibold text-zinc-300 hover:text-white bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 rounded-xl transition-all shadow-xs"
          >
            Sign In / Web App
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1 max-w-5xl mx-auto px-6 py-10 w-full flex flex-col items-center">
        {/* Hero Section */}
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary-500/10 border border-primary-500/20 text-primary-400 text-xs font-semibold mb-4">
            <Sparkles size={13} className="text-primary-400" />
            <span>Native Apps for Every Platform</span>
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-white mb-4 leading-tight">
            Download Motif for All Your Devices
          </h1>
          <p className="text-sm sm:text-base text-zinc-400 leading-relaxed">
            Record meetings with the screen off, organize notes on an infinite spatial whiteboard, and sync your work in real-time across phone, tablet, Mac, and Windows.
          </p>
        </div>

        {/* Dynamic Detected Platform Hero Card */}
        {detectedOS !== "unknown" && (
          <div className="w-full max-w-xl mb-12 p-6 rounded-3xl bg-gradient-to-b from-zinc-900/90 to-zinc-900/50 border border-zinc-800/80 shadow-2xl backdrop-blur-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-48 h-48 bg-primary-500/10 rounded-full blur-3xl pointer-events-none" />
            
            <div className="flex items-center justify-between mb-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-primary-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-primary-400 animate-pulse" />
                Detected for your device
              </span>
              <span className="text-[11px] text-zinc-500 font-medium">Auto-Updates Over-the-Air</span>
            </div>

            {detectedOS === "mac" && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-zinc-800/80 border border-zinc-700/80 flex items-center justify-center shrink-0">
                    <Apple size={26} className="text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-white">Motif for macOS</h3>
                    <p className="text-xs text-zinc-400">Apple Silicon (M1–M4) &amp; Intel • DMG</p>
                  </div>
                </div>

                <div className="flex flex-col sm:items-end gap-2 shrink-0">
                  <a
                    href={isMacSilicon ? "/api/download?platform=mac-arm64" : "/api/download?platform=mac-intel"}
                    download
                    className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-primary-600 hover:bg-primary-500 active:scale-95 text-white font-bold text-sm shadow-lg shadow-primary-900/40 transition-all"
                  >
                    <Download size={16} />
                    <span>Download for Mac (.dmg)</span>
                  </a>
                  <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                    <a href="/api/download?platform=mac-arm64" className="hover:text-zinc-300 underline">Apple Silicon</a>
                    <span>•</span>
                    <a href="/api/download?platform=mac-intel" className="hover:text-zinc-300 underline">Intel Mac</a>
                  </div>
                </div>
              </div>
            )}

            {detectedOS === "windows" && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center shrink-0">
                    <Monitor size={26} className="text-blue-400" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-white">Motif for Windows</h3>
                    <p className="text-xs text-zinc-400">Windows 10 / 11 (64-bit) • Installer (.exe)</p>
                  </div>
                </div>

                <a
                  href="/api/download?platform=windows"
                  download
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-primary-600 hover:bg-primary-500 active:scale-95 text-white font-bold text-sm shadow-lg shadow-primary-900/40 transition-all shrink-0"
                >
                  <Download size={16} />
                  <span>Download for Windows (.exe)</span>
                </a>
              </div>
            )}

            {detectedOS === "android" && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0">
                    <Smartphone size={26} className="text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-white">Motif for Android</h3>
                    <p className="text-xs text-zinc-400">Direct APK Download • Background Audio</p>
                  </div>
                </div>

                <a
                  href="/Motif.apk"
                  download="Motif.apk"
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-sm shadow-lg shadow-emerald-950/40 transition-all shrink-0"
                >
                  <Download size={16} />
                  <span>Download Android App (.apk)</span>
                </a>
              </div>
            )}

            {detectedOS === "ios" && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-zinc-800/80 border border-zinc-700/80 flex items-center justify-center shrink-0">
                    <Globe size={26} className="text-primary-400" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-white">Motif for iOS &amp; Web</h3>
                    <p className="text-xs text-zinc-400">Tap &ldquo;Share&rdquo; &rarr; &ldquo;Add to Home Screen&rdquo; in Safari</p>
                  </div>
                </div>

                <Link
                  href="/login"
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-primary-600 hover:bg-primary-500 active:scale-95 text-white font-bold text-sm shadow-lg shadow-primary-900/40 transition-all shrink-0"
                >
                  <ArrowRight size={16} />
                  <span>Launch Web App</span>
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Platform Grid */}
        <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          {/* Android Card */}
          <div className="p-6 rounded-3xl bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700 transition-all flex flex-col justify-between group">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
                  <Smartphone size={22} />
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Background Audio
                </span>
              </div>
              <h2 className="text-lg font-bold text-white mb-1">Android</h2>
              <p className="text-xs text-zinc-400 leading-relaxed mb-4">
                Record long meetings and lectures with your screen locked. Lock screen controls and 0ms offline sync.
              </p>
              <div className="text-[11px] text-zinc-500 space-y-1 mb-6">
                <p className="flex items-center gap-1.5 text-zinc-400">
                  <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
                  <span>Direct APK file (~7.5 MB)</span>
                </p>
                <p className="flex items-center gap-1.5 text-zinc-400">
                  <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
                  <span>Auto-updates over the air</span>
                </p>
                <p className="flex items-center gap-1.5 text-zinc-400">
                  <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
                  <span>Samsung, Pixel &amp; Android 10+</span>
                </p>
              </div>
            </div>

            <a
              href="/Motif.apk"
              download="Motif.apk"
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-emerald-600 text-white font-semibold text-xs border border-zinc-700/80 hover:border-emerald-500 active:scale-95 transition-all shadow-xs"
            >
              <Download size={14} />
              <span>Download Motif.apk</span>
            </a>
          </div>

          {/* macOS Card */}
          <div className="p-6 rounded-3xl bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700 transition-all flex flex-col justify-between group">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-11 h-11 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-white group-hover:scale-110 transition-transform">
                  <Apple size={22} />
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-zinc-800 text-zinc-300 border border-zinc-700">
                  M1–M4 &amp; Intel
                </span>
              </div>
              <h2 className="text-lg font-bold text-white mb-1">macOS</h2>
              <p className="text-xs text-zinc-400 leading-relaxed mb-4">
                Native infinite canvas, smooth trackpad gestures, floating toolbars, and instant live sync.
              </p>
              <div className="text-[11px] text-zinc-500 space-y-1 mb-6">
                <p className="flex items-center gap-1.5 text-zinc-400">
                  <CheckCircle2 size={13} className="text-primary-400 shrink-0" />
                  <span>Universal DMG Installer</span>
                </p>
                <p className="flex items-center gap-1.5 text-zinc-400">
                  <CheckCircle2 size={13} className="text-primary-400 shrink-0" />
                  <span>Over-the-air auto-updating</span>
                </p>
                <p className="flex items-center gap-1.5 text-zinc-400">
                  <CheckCircle2 size={13} className="text-primary-400 shrink-0" />
                  <span>macOS Monterey, Sonoma, Sequoia</span>
                </p>
              </div>
            </div>

            <div className="space-y-1.5 w-full">
              <a
                href="/api/download?platform=mac-arm64"
                download
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-primary-600 text-white font-semibold text-xs border border-zinc-700/80 hover:border-primary-500 active:scale-95 transition-all shadow-xs"
              >
                <Download size={14} />
                <span>Apple Silicon (.dmg)</span>
              </a>
              <a
                href="/api/download?platform=mac-intel"
                download
                className="w-full text-center block text-[11px] text-zinc-500 hover:text-zinc-300 py-1 transition-colors"
              >
                Download for Intel Mac (.dmg)
              </a>
            </div>
          </div>

          {/* Windows Card */}
          <div className="p-6 rounded-3xl bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700 transition-all flex flex-col justify-between group">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="w-11 h-11 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
                  <Monitor size={22} />
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  Windows 10 / 11
                </span>
              </div>
              <h2 className="text-lg font-bold text-white mb-1">Windows</h2>
              <p className="text-xs text-zinc-400 leading-relaxed mb-4">
                Hardware-accelerated whiteboard, pen and mouse input, offline storage, and automatic sync.
              </p>
              <div className="text-[11px] text-zinc-500 space-y-1 mb-6">
                <p className="flex items-center gap-1.5 text-zinc-400">
                  <CheckCircle2 size={13} className="text-blue-400 shrink-0" />
                  <span>Standalone Setup Installer (.exe)</span>
                </p>
                <p className="flex items-center gap-1.5 text-zinc-400">
                  <CheckCircle2 size={13} className="text-blue-400 shrink-0" />
                  <span>Live over-the-air sync</span>
                </p>
                <p className="flex items-center gap-1.5 text-zinc-400">
                  <CheckCircle2 size={13} className="text-blue-400 shrink-0" />
                  <span>Windows 10 and Windows 11</span>
                </p>
              </div>
            </div>

            <a
              href="/api/download?platform=windows"
              download
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-blue-600 text-white font-semibold text-xs border border-zinc-700/80 hover:border-blue-500 active:scale-95 transition-all shadow-xs"
            >
              <Download size={14} />
              <span>Download Windows (.exe)</span>
            </a>
          </div>
        </div>

        {/* Feature Highlights Grid */}
        <div className="w-full max-w-4xl pt-8 border-t border-zinc-900 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 text-center sm:text-left mb-16">
          <div className="p-4 rounded-2xl bg-zinc-900/30 border border-zinc-800/50">
            <div className="w-9 h-9 rounded-xl bg-primary-500/10 text-primary-400 flex items-center justify-center mb-3 mx-auto sm:mx-0">
              <RefreshCw size={18} />
            </div>
            <h4 className="font-bold text-sm text-white mb-1">Over-the-Air Updates</h4>
            <p className="text-xs text-zinc-400 leading-relaxed">
              New features and improvements apply automatically. You never have to manually reinstall.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-zinc-900/30 border border-zinc-800/50">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-3 mx-auto sm:mx-0">
              <Mic size={18} />
            </div>
            <h4 className="font-bold text-sm text-white mb-1">Lock Screen Audio</h4>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Keep recording meetings and classes even when your phone screen is off in your pocket.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-zinc-900/30 border border-zinc-800/50">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center mb-3 mx-auto sm:mx-0">
              <WifiOff size={18} />
            </div>
            <h4 className="font-bold text-sm text-white mb-1">Offline-First</h4>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Every edit, stroke, and note is saved locally instantly. Edits sync to the cloud when reconnected.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-zinc-900/30 border border-zinc-800/50">
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center mb-3 mx-auto sm:mx-0">
              <Zap size={18} />
            </div>
            <h4 className="font-bold text-sm text-white mb-1">Gemini 3.8 Flash</h4>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Instant transcripts, structured executive summaries, and interactive meeting chat.
            </p>
          </div>
        </div>

        {/* Direct PWA Install instructions */}
        <div className="w-full max-w-2xl p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800/60 text-center">
          <h3 className="font-bold text-sm text-white mb-1">Prefer running directly in your browser?</h3>
          <p className="text-xs text-zinc-400 mb-4 max-w-lg mx-auto leading-relaxed">
            Motif also works as a Progressive Web App (PWA) in Chrome, Edge, and Safari. Click &ldquo;Install App&rdquo; in your browser&apos;s address bar to pin it to your desktop Dock or Taskbar.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-medium text-xs border border-zinc-700 transition-colors"
          >
            <span>Launch Web App</span>
            <ArrowRight size={13} />
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full py-8 border-t border-zinc-900 text-center text-xs text-zinc-600">
        <p>&copy; {new Date().getFullYear()} Motif • Wolf Cub Ventures. All rights reserved.</p>
      </footer>
    </div>
  );
}
