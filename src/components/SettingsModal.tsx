import React, { useState, useRef, useEffect } from "react";
import { useTheme } from "next-themes";
import { useAccent, AccentColor } from "./AccentProvider";
import { X, Moon, Sun, Monitor, LogOut, Check, User as UserIcon, Upload, Loader2, Trash2, BookOpen, Folder, Edit2, FileText, Sparkles, Key, RefreshCw, Smartphone, Download } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "react-hot-toast";
import { useMinimapSettings } from "@/hooks/useMinimapSettings";
import { Notebook } from "@/hooks/useNotebooks";
import { DeleteConfirmModal } from "./DeleteConfirmModal";
import { isNativeApp, isNativeAndroid } from "@/lib/nativeAudio";
import { checkAppUpdate, downloadAndInstallApk, type AppUpdateCheckResult } from "@/lib/appUpdate";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail?: string;
  user?: any;
  onSignOut: () => void;
  activePageId?: string | null;
  activePageTitle?: string;
  isJournal?: boolean;
  onToggleJournalMode?: (isJournal: boolean) => Promise<void> | void;
  activeNotebookTitle?: string;
  onUpdatePageTitle?: (title: string) => void;
  onDeletePage?: (id: string) => Promise<void>;
  onOpenTrash?: () => void;
  onOpenRecovery?: () => void;
}

export function SettingsModal({ 
  isOpen, 
  onClose, 
  userEmail, 
  user, 
  onSignOut,
  activePageId,
  activePageTitle,
  isJournal = false,
  onToggleJournalMode,
  activeNotebookTitle,
  onUpdatePageTitle,
  onDeletePage,
  onOpenTrash,
  onOpenRecovery
}: SettingsModalProps) {
  const { theme, setTheme } = useTheme();
  const { accentColor, setAccentColor } = useAccent();
  const { showMinimap, setShowMinimap } = useMinimapSettings();
  const [activeTab, setActiveTab] = useState<"profile" | "appearance" | "page" | "ai" | "account" | "updates">(
    activePageId ? "page" : "profile"
  );
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [isConfirmingDeletePage, setIsConfirmingDeletePage] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const handleCheckUpdates = async () => {
    setIsUpdating(true);
    toast.loading("Checking for updates...", { id: "update-check" });
    try {
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
      }
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          await reg.update();
        }
      }
      toast.success("Updated to the latest version! Reloading...", { id: "update-check" });
      setTimeout(() => {
        window.location.reload();
      }, 700);
    } catch (e: any) {
      toast.error("Failed to update cache: " + (e?.message || "Unknown error"), { id: "update-check" });
      setIsUpdating(false);
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setGeminiApiKey(localStorage.getItem('motif_gemini_api_key') || localStorage.getItem('cubnotes_gemini_api_key') || "");
    }
  }, [isOpen]);

  // App Update State for Android APK
  const [appUpdateStatus, setAppUpdateStatus] = useState<AppUpdateCheckResult | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);

  useEffect(() => {
    if (isOpen && isNativeAndroid()) {
      checkAppUpdate().then(setAppUpdateStatus);
    }
  }, [isOpen]);

  const handleManualUpdateCheck = async () => {
    setIsCheckingUpdate(true);
    const result = await checkAppUpdate();
    setAppUpdateStatus(result);
    setIsCheckingUpdate(false);
    if (result.hasUpdate) {
      toast.success(`Update v${result.serverInfo?.versionName} is available!`);
    } else {
      toast.success("You are on the latest native version.");
    }
  };

  const handleSaveGeminiKey = (key: string) => {
    const trimmed = key.trim();
    setGeminiApiKey(trimmed);
    if (typeof window !== 'undefined') {
      if (trimmed) {
        localStorage.setItem('motif_gemini_api_key', trimmed);
        localStorage.setItem('cubnotes_gemini_api_key', trimmed);
        toast.success("Gemini API key saved!");
      } else {
        localStorage.removeItem('motif_gemini_api_key');
        localStorage.removeItem('cubnotes_gemini_api_key');
        toast.success("Gemini API key removed.");
      }
    }
  };

  // Page Style state (synced with active note)
  const [activeBackgroundStyle, setActiveBackgroundStyle] = useState<'none' | 'ruled' | 'grid' | 'dots'>('none');
  const [activePageColor, setActivePageColor] = useState<string>('default');
  const [customHexColor, setCustomHexColor] = useState<string>('');

  useEffect(() => {
    if (!activePageId || typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem(`cubnotes_page_style_${activePageId}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.backgroundStyle) setActiveBackgroundStyle(parsed.backgroundStyle);
        if (parsed.pageColor) {
          setActivePageColor(parsed.pageColor);
          if (parsed.pageColor !== 'default') setCustomHexColor(parsed.pageColor);
        }
      } else {
        setActiveBackgroundStyle('none');
        setActivePageColor('default');
      }
    } catch {}
  }, [activePageId, isOpen]);

  const handleSetBackgroundStyle = (style: 'none' | 'ruled' | 'grid' | 'dots') => {
    setActiveBackgroundStyle(style);
    if (!activePageId || typeof window === 'undefined') return;
    try {
      localStorage.setItem(`cubnotes_page_style_${activePageId}`, JSON.stringify({
        backgroundStyle: style,
        pageColor: activePageColor
      }));
      window.dispatchEvent(new CustomEvent('cubnotes:page_style_changed', {
        detail: { pageId: activePageId, backgroundStyle: style, pageColor: activePageColor }
      }));
    } catch {}
  };

  const handleSetPageColor = (color: string) => {
    setActivePageColor(color);
    if (color !== 'default') setCustomHexColor(color);
    if (!activePageId || typeof window === 'undefined') return;
    try {
      localStorage.setItem(`cubnotes_page_style_${activePageId}`, JSON.stringify({
        backgroundStyle: activeBackgroundStyle,
        pageColor: color
      }));
      window.dispatchEvent(new CustomEvent('cubnotes:page_style_changed', {
        detail: { pageId: activePageId, backgroundStyle: activeBackgroundStyle, pageColor: color }
      }));
    } catch {}
  };
  
  // Profile State
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [supabase] = useState(() => createClient());

  useEffect(() => {
    if (user?.user_metadata) {
      setDisplayName(user.user_metadata.full_name || "");
      setAvatarUrl(user.user_metadata.avatar_url || "");
    }
  }, [user]);

  if (!isOpen) return null;

  const accentColors: { id: AccentColor; label: string; hex: string }[] = [
    { id: "indigo", label: "Indigo", hex: "#6366f1" },
    { id: "emerald", label: "Emerald", hex: "#10b981" },
    { id: "rose", label: "Rose", hex: "#f43f5e" },
    { id: "amber", label: "Amber", hex: "#f59e0b" },
    { id: "blue", label: "Blue", hex: "#3b82f6" },
    { id: "purple", label: "Purple", hex: "#a855f7" },
  ];

  const handleSaveProfile = async () => {
    setIsSavingProfile(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: { full_name: displayName, avatar_url: avatarUrl }
      });
      if (error) throw error;
      toast.success("Profile updated successfully!");
    } catch (error: any) {
      toast.error(error.message || "Failed to update profile");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    
    setIsUploadingAvatar(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}-${Math.random()}.${fileExt}`;
      const filePath = `${fileName}`;
      
      // Upload image
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file);
        
      if (uploadError) throw uploadError;
      
      // Get public URL
      const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
      
      setAvatarUrl(data.publicUrl);
      
      // Save to user metadata
      await supabase.auth.updateUser({
        data: { avatar_url: data.publicUrl }
      });
      
      toast.success("Avatar uploaded successfully!");
    } catch (error: any) {
      toast.error(error.message || "Error uploading avatar");
    } finally {
      setIsUploadingAvatar(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center p-3 sm:p-6 pointer-events-auto">
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-md transition-opacity" 
        onClick={onClose}
      />
      <div className="relative bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-[620px] max-h-[85vh] sm:h-[540px] overflow-hidden flex flex-col pointer-events-auto animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-950/70 backdrop-blur-md shrink-0">
          <h2 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-zinc-100">Settings</h2>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-full text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex flex-col sm:flex-row flex-1 overflow-hidden min-h-0">
          {/* Tabs: Horizontal scroll on mobile, sidebar on desktop */}
          <div className="flex sm:flex-col flex-row border-b sm:border-b-0 sm:border-r border-zinc-200 dark:border-zinc-800 bg-zinc-100/60 dark:bg-zinc-950/40 p-2 sm:w-44 gap-1.5 shrink-0 overflow-x-auto">
            <button
              onClick={() => setActiveTab("profile")}
              className={`px-3.5 py-2 text-xs sm:text-sm font-medium rounded-xl text-center sm:text-left transition-all shrink-0 ${
                activeTab === "profile"
                  ? "bg-white dark:bg-zinc-800 text-primary-600 dark:text-primary-400 shadow-sm font-semibold"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/60 dark:hover:bg-zinc-800/50"
              }`}
            >
              Profile
            </button>
            <button
              onClick={() => setActiveTab("appearance")}
              className={`px-3.5 py-2 text-xs sm:text-sm font-medium rounded-xl text-center sm:text-left transition-all shrink-0 ${
                activeTab === "appearance"
                  ? "bg-white dark:bg-zinc-800 text-primary-600 dark:text-primary-400 shadow-sm font-semibold"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/60 dark:hover:bg-zinc-800/50"
              }`}
            >
              Appearance
            </button>
            <button
              onClick={() => setActiveTab("page")}
              className={`px-3.5 py-2 text-xs sm:text-sm font-medium rounded-xl text-center sm:text-left transition-all shrink-0 flex items-center justify-center sm:justify-start gap-1.5 ${
                activeTab === "page"
                  ? "bg-white dark:bg-zinc-800 text-primary-600 dark:text-primary-400 shadow-sm font-semibold"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/60 dark:hover:bg-zinc-800/50"
              }`}
            >
              <FileText size={14} />
              <span>Page</span>
            </button>
            <button
              onClick={() => setActiveTab("updates")}
              className={`px-3.5 py-2 text-xs sm:text-sm font-medium rounded-xl text-center sm:text-left transition-all shrink-0 flex items-center justify-center sm:justify-start gap-1.5 ${
                activeTab === "updates"
                  ? "bg-white dark:bg-zinc-800 text-primary-600 dark:text-primary-400 shadow-sm font-semibold"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/60 dark:hover:bg-zinc-800/50"
              }`}
            >
              <RefreshCw size={14} className={isUpdating ? "animate-spin" : ""} />
              <span>{isNativeApp() ? "Updates" : "Updates & App"}</span>
            </button>
            <button
              onClick={() => setActiveTab("ai")}
              className={`px-3.5 py-2 text-xs sm:text-sm font-medium rounded-xl text-center sm:text-left transition-all shrink-0 flex items-center justify-center sm:justify-start gap-1.5 ${
                activeTab === "ai"
                  ? "bg-white dark:bg-zinc-800 text-primary-600 dark:text-primary-400 shadow-sm font-semibold"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/60 dark:hover:bg-zinc-800/50"
              }`}
            >
              <Sparkles size={14} className="text-amber-500" />
              <span>AI</span>
            </button>
            <button
              onClick={() => setActiveTab("account")}
              className={`px-3.5 py-2 text-xs sm:text-sm font-medium rounded-xl text-center sm:text-left transition-all shrink-0 ${
                activeTab === "account"
                  ? "bg-white dark:bg-zinc-800 text-primary-600 dark:text-primary-400 shadow-sm font-semibold"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/60 dark:hover:bg-zinc-800/50"
              }`}
            >
              Account
            </button>
          </div>
          {/* Content */}
          <div className="flex-1 p-4 sm:p-6 overflow-y-auto min-h-0">
            
            {activeTab === "profile" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-3">Profile Picture</h3>
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden flex flex-shrink-0 items-center justify-center border border-zinc-300 dark:border-zinc-700">
                      {avatarUrl ? (
                        <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                      ) : (
                        <UserIcon size={32} className="text-zinc-400 dark:text-zinc-500" />
                      )}
                    </div>
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        <button 
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isUploadingAvatar}
                          className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors text-sm font-medium shadow-sm disabled:opacity-50"
                        >
                          {isUploadingAvatar ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                          Upload
                        </button>
                        {avatarUrl && (
                          <button 
                            onClick={async () => {
                              setAvatarUrl("");
                              await supabase.auth.updateUser({ data: { avatar_url: "" } });
                            }}
                            className="flex items-center gap-2 px-3 py-1.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 rounded-md hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors text-sm font-medium shadow-sm"
                          >
                            <Trash2 size={14} /> Remove
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-zinc-500">Recommended size: 256x256px</p>
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleAvatarUpload}
                        accept="image/*" 
                        className="hidden" 
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-1">Display Name</h3>
                  <p className="text-xs text-zinc-500 mb-3">This name will be shown on your notes and history.</p>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Enter your name"
                    className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                  />
                </div>

                <div className="pt-4 flex justify-end">
                  <button
                    onClick={handleSaveProfile}
                    disabled={isSavingProfile}
                    className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors text-sm font-medium disabled:opacity-50"
                  >
                    {isSavingProfile && <Loader2 size={14} className="animate-spin" />}
                    Save Changes
                  </button>
                </div>
              </div>
            )}

            {activeTab === "appearance" && (
              <div className="space-y-8">
                <div>
                  <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-3">Theme</h3>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setTheme("light")}
                      className={`flex-1 flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-colors ${
                        theme === "light"
                          ? "border-primary-500 bg-primary-500/5"
                          : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
                      }`}
                    >
                      <Sun size={20} className="mb-2" />
                      <span className="text-sm font-medium">Light</span>
                    </button>
                    <button
                      onClick={() => setTheme("dark")}
                      className={`flex-1 flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-colors ${
                        theme === "dark"
                          ? "border-primary-500 bg-primary-500/5"
                          : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
                      }`}
                    >
                      <Moon size={20} className="mb-2" />
                      <span className="text-sm font-medium">Dark</span>
                    </button>
                    <button
                      onClick={() => setTheme("system")}
                      className={`flex-1 flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-colors ${
                        theme === "system"
                          ? "border-primary-500 bg-primary-500/5"
                          : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
                      }`}
                    >
                      <Monitor size={20} className="mb-2" />
                      <span className="text-sm font-medium">System</span>
                    </button>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-3">Accent Color</h3>
                  <div className="flex gap-3 flex-wrap">
                    {accentColors.map((color) => (
                      <button
                        key={color.id}
                        onClick={() => setAccentColor(color.id)}
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                          accentColor === color.id
                            ? "ring-2 ring-offset-2 ring-offset-zinc-50 dark:ring-offset-zinc-900 ring-zinc-400 dark:ring-zinc-600"
                            : "hover:scale-110"
                        }`}
                        style={{ backgroundColor: color.hex }}
                        title={color.label}
                      >
                        {accentColor === color.id && <Check size={16} className="text-white drop-shadow-md" />}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-3">Minimap</h3>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Show Minimap</div>
                      <div className="text-xs text-zinc-500">Display a bird's-eye view of your canvas in the corner</div>
                    </div>
                    <button
                      onClick={() => setShowMinimap(!showMinimap)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-zinc-900 ${
                        showMinimap ? 'bg-primary-600' : 'bg-zinc-200 dark:bg-zinc-700'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          showMinimap ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "page" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1">Page Settings</h3>
                  <p className="text-xs text-zinc-500 mb-4">
                    Configure paper background, color theme, and journal mode for the active note.
                  </p>

                  {activePageTitle ? (
                    <div className="space-y-5">
                      {/* Active Note Card */}
                      <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 shadow-sm space-y-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                              isJournal ? 'bg-amber-500/15 text-amber-500' : 'bg-primary-50 dark:bg-primary-950/50 text-primary-600 dark:text-primary-400'
                            }`}>
                              {isJournal ? <BookOpen size={18} /> : <FileText size={18} />}
                            </div>

                            {isEditingTitle ? (
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <input
                                  type="text"
                                  value={editTitle}
                                  onChange={(e) => setEditTitle(e.target.value)}
                                  className="px-2.5 py-1 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white w-full outline-none focus:ring-2 focus:ring-primary-500"
                                  autoFocus
                                />
                                <button
                                  onClick={() => {
                                    if (onUpdatePageTitle && editTitle.trim()) {
                                      onUpdatePageTitle(editTitle.trim());
                                      toast.success("Page renamed");
                                    }
                                    setIsEditingTitle(false);
                                  }}
                                  className="px-2.5 py-1 bg-primary-600 text-white rounded-lg text-xs font-semibold hover:bg-primary-700 transition-colors"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => setIsEditingTitle(false)}
                                  className="px-2 py-1 text-xs text-zinc-400 hover:text-zinc-600"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">
                                    {activePageTitle}
                                  </span>
                                  {onUpdatePageTitle && (
                                    <button
                                      onClick={() => {
                                        setIsEditingTitle(true);
                                        setEditTitle(activePageTitle);
                                      }}
                                      className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded"
                                      title="Rename page"
                                    >
                                      <Edit2 size={13} />
                                    </button>
                                  )}
                                </div>
                                {activeNotebookTitle && (
                                  <div className="text-[11px] text-zinc-400">
                                    Notebook: {activeNotebookTitle}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Journal Mode Switch Toggle */}
                        {onToggleJournalMode && (
                          <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between">
                            <div className="flex items-center gap-2.5 pr-2">
                              <BookOpen size={16} className={isJournal ? "text-amber-500" : "text-zinc-400"} />
                              <div>
                                <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">Journal Mode</div>
                                <div className="text-[11px] text-zinc-400">Reflection prompts & permanent audio storage</div>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={async () => {
                                await onToggleJournalMode(!isJournal);
                                toast.success(!isJournal ? "Switched to Journal mode" : "Switched to Standard mode");
                              }}
                              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none flex-shrink-0 ${
                                isJournal ? 'bg-amber-500' : 'bg-zinc-200 dark:bg-zinc-700'
                              }`}
                            >
                              <span
                                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                                  isJournal ? 'translate-x-4' : 'translate-x-0.5'
                                }`}
                              />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Paper Pattern & Style */}
                      <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 shadow-sm space-y-3">
                        <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">Paper Style</div>
                        <div className="grid grid-cols-4 gap-2">
                          {/* None (Blank) */}
                          <button
                            type="button"
                            onClick={() => handleSetBackgroundStyle('none')}
                            className={`flex flex-col items-center justify-center p-2.5 rounded-xl border-2 transition-all ${
                              activeBackgroundStyle === 'none'
                                ? 'border-primary-500 bg-primary-500/10 text-primary-600 dark:text-primary-400 font-semibold'
                                : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 text-zinc-600 dark:text-zinc-400'
                            }`}
                          >
                            <div className="w-6 h-6 border border-zinc-400 dark:border-zinc-500 rounded bg-white dark:bg-zinc-950 mb-1.5 shadow-xs" />
                            <span className="text-[11px]">None</span>
                          </button>

                          {/* Ruled (Lined) */}
                          <button
                            type="button"
                            onClick={() => handleSetBackgroundStyle('ruled')}
                            className={`flex flex-col items-center justify-center p-2.5 rounded-xl border-2 transition-all ${
                              activeBackgroundStyle === 'ruled'
                                ? 'border-primary-500 bg-primary-500/10 text-primary-600 dark:text-primary-400 font-semibold'
                                : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 text-zinc-600 dark:text-zinc-400'
                            }`}
                          >
                            <div className="w-6 h-6 border border-zinc-400 dark:border-zinc-500 rounded bg-white dark:bg-zinc-950 mb-1.5 flex flex-col justify-evenly px-0.5 shadow-xs">
                              <div className="w-full h-[1px] bg-zinc-400 dark:bg-zinc-600" />
                              <div className="w-full h-[1px] bg-zinc-400 dark:bg-zinc-600" />
                              <div className="w-full h-[1px] bg-zinc-400 dark:bg-zinc-600" />
                            </div>
                            <span className="text-[11px]">Ruled</span>
                          </button>

                          {/* Grid (Graph) */}
                          <button
                            type="button"
                            onClick={() => handleSetBackgroundStyle('grid')}
                            className={`flex flex-col items-center justify-center p-2.5 rounded-xl border-2 transition-all ${
                              activeBackgroundStyle === 'grid'
                                ? 'border-primary-500 bg-primary-500/10 text-primary-600 dark:text-primary-400 font-semibold'
                                : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 text-zinc-600 dark:text-zinc-400'
                            }`}
                          >
                            <div className="w-6 h-6 border border-zinc-400 dark:border-zinc-500 rounded bg-white dark:bg-zinc-950 mb-1.5 grid grid-cols-2 grid-rows-2 gap-px bg-zinc-300 dark:bg-zinc-700 shadow-xs">
                              <div className="bg-white dark:bg-zinc-950" />
                              <div className="bg-white dark:bg-zinc-950" />
                              <div className="bg-white dark:bg-zinc-950" />
                              <div className="bg-white dark:bg-zinc-950" />
                            </div>
                            <span className="text-[11px]">Grid</span>
                          </button>

                          {/* Dot Grid */}
                          <button
                            type="button"
                            onClick={() => handleSetBackgroundStyle('dots')}
                            className={`flex flex-col items-center justify-center p-2.5 rounded-xl border-2 transition-all ${
                              activeBackgroundStyle === 'dots'
                                ? 'border-primary-500 bg-primary-500/10 text-primary-600 dark:text-primary-400 font-semibold'
                                : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 text-zinc-600 dark:text-zinc-400'
                            }`}
                          >
                            <div className="w-6 h-6 border border-zinc-400 dark:border-zinc-500 rounded bg-white dark:bg-zinc-950 mb-1.5 flex items-center justify-center gap-1 shadow-xs">
                              <div className="w-1 h-1 rounded-full bg-zinc-400 dark:bg-zinc-500" />
                              <div className="w-1 h-1 rounded-full bg-zinc-400 dark:bg-zinc-500" />
                            </div>
                            <span className="text-[11px]">Dots</span>
                          </button>
                        </div>
                      </div>

                      {/* Page Color Settings */}
                      <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 shadow-sm space-y-3">
                        <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">Page Color</div>
                        
                        {/* Preset Swatches */}
                        <div className="flex gap-2 flex-wrap">
                          {[
                            { id: 'default', label: 'Default', hex: 'transparent', border: true },
                            { id: '#fdfbf7', label: 'Cream', hex: '#fdfbf7' },
                            { id: '#f0fdf4', label: 'Mint', hex: '#f0fdf4' },
                            { id: '#fff1f2', label: 'Rose', hex: '#fff1f2' },
                            { id: '#faf5ff', label: 'Lavender', hex: '#faf5ff' },
                            { id: '#f0f9ff', label: 'Sky', hex: '#f0f9ff' },
                            { id: '#18181b', label: 'Charcoal', hex: '#18181b' },
                            { id: '#0f172a', label: 'Slate', hex: '#0f172a' },
                          ].map((c) => {
                            const isSelected = activePageColor.toLowerCase() === c.id.toLowerCase();
                            return (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => handleSetPageColor(c.id)}
                                className={`w-8 h-8 rounded-full border flex items-center justify-center transition-transform ${
                                  isSelected 
                                    ? 'ring-2 ring-offset-2 ring-primary-500 dark:ring-offset-zinc-900 scale-110' 
                                    : 'border-zinc-300 dark:border-zinc-700 hover:scale-105'
                                }`}
                                style={{ backgroundColor: c.hex === 'transparent' ? undefined : c.hex }}
                                title={c.label}
                              >
                                {c.id === 'default' && (
                                  <span className="text-[9px] font-bold text-zinc-500 dark:text-zinc-400">Auto</span>
                                )}
                                {isSelected && c.id !== 'default' && (
                                  <Check size={14} className={c.id === '#18181b' || c.id === '#0f172a' ? 'text-white' : 'text-zinc-800'} />
                                )}
                              </button>
                            );
                          })}
                        </div>

                        {/* Custom Hex Code & Picker */}
                        <div className="pt-2 flex items-center gap-2">
                          <div className="relative flex-1">
                            <input
                              type="text"
                              value={customHexColor}
                              onChange={(e) => {
                                const val = e.target.value;
                                setCustomHexColor(val);
                                if (/^#([0-9A-F]{3}){1,2}$/i.test(val)) {
                                  handleSetPageColor(val);
                                }
                              }}
                              placeholder="#hex color (e.g. #f5f5f4)"
                              className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white outline-none focus:ring-1 focus:ring-primary-500"
                            />
                          </div>

                          <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors">
                            <input
                              type="color"
                              value={activePageColor.startsWith('#') ? activePageColor : '#ffffff'}
                              onChange={(e) => handleSetPageColor(e.target.value)}
                              className="w-4 h-4 rounded cursor-pointer border-none bg-transparent"
                            />
                            <span>Picker</span>
                          </label>
                        </div>
                      </div>

                      {/* APK & Background Recording Callout (Only in browser) */}
                      {!isNativeApp() && (
                        <div className="p-3 bg-zinc-100 dark:bg-zinc-800/60 rounded-xl border border-zinc-200 dark:border-zinc-700/80 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <Smartphone size={16} className="text-primary-500 shrink-0" />
                            <span className="text-zinc-700 dark:text-zinc-300 font-medium">Record with screen off?</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setActiveTab("updates")}
                            className="text-primary-600 dark:text-primary-400 font-bold hover:underline"
                          >
                            Get Android APK →
                          </button>
                        </div>
                      )}

                      {/* Delete Page Option */}
                      {onDeletePage && activePageId && (
                        <div className="pt-2">
                          <button
                            type="button"
                            onClick={() => setIsConfirmingDeletePage(true)}
                            className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 border border-red-200/80 dark:border-red-900/40 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                          >
                            <Trash2 size={14} />
                            <span>Delete this Note</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-8 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 text-center text-zinc-400">
                      <FileText size={32} className="mx-auto mb-2 opacity-40" />
                      <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">No active note selected</p>
                      <p className="text-xs text-zinc-400 mt-1">Open a note to configure its journal mode and settings.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === "ai" && (
              <div className="space-y-6">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Sparkles size={18} className="text-amber-500" />
                    <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">Google Gemini AI</h3>
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    Motif is powered by <strong>Gemini 3.8 Flash</strong> for speaker-diarized audio meeting transcriptions, structured executive summaries, and intelligent note organization.
                  </p>
                </div>

                <div className="p-4 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/80 dark:border-zinc-700/80 rounded-2xl space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5 flex items-center justify-between">
                      <span>Gemini API Key</span>
                      {geminiApiKey ? (
                        <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                          <Check size={12} /> Configured
                        </span>
                      ) : (
                        <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                          Not set (uses server default if in Vercel)
                        </span>
                      )}
                    </label>
                    <div className="flex gap-2">
                      <input 
                        type="password"
                        value={geminiApiKey}
                        onChange={(e) => setGeminiApiKey(e.target.value)}
                        placeholder="AIzaSy..."
                        className="flex-1 px-3 py-2 text-xs font-mono bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl outline-none focus:ring-2 focus:ring-primary-500/40 text-zinc-900 dark:text-white"
                      />
                      <button
                        onClick={() => handleSaveGeminiKey(geminiApiKey)}
                        className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold rounded-xl transition-all shadow-sm shrink-0"
                      >
                        Save
                      </button>
                    </div>
                  </div>

                  <p className="text-[11px] text-zinc-400 dark:text-zinc-500 leading-normal">
                    You can generate a 100% free Gemini API key from{" "}
                    <a 
                      href="https://aistudio.google.com/apikey" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-primary-600 dark:text-primary-400 underline hover:opacity-80"
                    >
                      Google AI Studio
                    </a>. Setting it here allows instant transcription directly from your browser.
                  </p>
                </div>
              </div>
            )}

            {activeTab === "account" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">Signed in as</h3>
                  <div className="text-lg font-medium text-zinc-900 dark:text-zinc-100">{userEmail || "Loading..."}</div>
                </div>
                
                {/* Trash & Data Recovery Options */}
                {(onOpenTrash || onOpenRecovery) && (
                  <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 space-y-2">
                    <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Trash & Data Recovery</h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Motif retains deleted items for 30 days before permanent purging.
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {onOpenTrash && (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onOpenTrash();
                          }}
                          className="flex items-center gap-2 px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-xl text-xs font-semibold transition-colors"
                        >
                          <Trash2 size={14} />
                          <span>View Trash (30 Days)</span>
                        </button>
                      )}
                      {onOpenRecovery && (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onOpenRecovery();
                          }}
                          className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-950/70 text-amber-700 dark:text-amber-400 border border-amber-200/80 dark:border-amber-900/50 rounded-xl text-xs font-semibold transition-colors"
                        >
                          <Sparkles size={14} />
                          <span>Emergency Deep Scan</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
                
                <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800">
                  <h3 className="text-sm font-medium text-red-600 dark:text-red-400 mb-2">Danger Zone</h3>
                  <button
                    onClick={() => {
                      if(window.confirm("Are you sure you want to delete your account? This action cannot be undone.")) {
                         toast.error("Account deletion requires admin privileges or contact support.");
                      }
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/50 rounded-md hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors font-medium text-sm mb-6"
                  >
                    <Trash2 size={16} /> Delete Account
                  </button>

                  <button
                    onClick={onSignOut}
                    className="flex items-center gap-2 px-4 py-2 bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-md hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors font-medium text-sm"
                  >
                    <LogOut size={16} /> Sign out
                  </button>
                </div>
              </div>
            )}

            {activeTab === "updates" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1 flex items-center gap-2">
                    <RefreshCw size={16} className="text-primary-500" />
                    {isNativeApp() ? "App Updates & Cache Refresh" : "Web App & Service Worker Updates"}
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
                    {isNativeApp() 
                      ? "Motif automatically loads the latest live cloud features. Click below to refresh cached assets and sync with the newest build."
                      : "Motif runs as an offline-first PWA. If new features or bug fixes aren't showing up immediately, click below to force-refresh cached assets and sync with the latest build."}
                  </p>
                  <button
                    onClick={handleCheckUpdates}
                    disabled={isUpdating}
                    className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium text-sm rounded-xl shadow-sm transition-all disabled:opacity-50"
                  >
                    <RefreshCw size={15} className={isUpdating ? "animate-spin" : ""} />
                    <span>{isUpdating ? "Checking & Updating..." : "Check for Updates & Reload"}</span>
                  </button>
                </div>

                {isNativeAndroid() ? (
                  <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800">
                    <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/25 border border-emerald-200/80 dark:border-emerald-800/50 rounded-2xl flex items-start gap-3 text-xs text-emerald-800 dark:text-emerald-300">
                      <div className="w-8 h-8 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5">
                        <Smartphone size={18} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <p className="font-bold text-emerald-900 dark:text-emerald-200 text-sm">Motif Android App Active</p>
                          <span className="text-[11px] font-mono font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-100/80 dark:bg-emerald-900/50 px-2 py-0.5 rounded-full">
                            v{appUpdateStatus?.installedVersionName || '1.0'}
                          </span>
                        </div>
                        <p className="text-[11px] text-emerald-700 dark:text-emerald-400/90 mt-0.5">
                          Screen-off audio recording, wake locks, and native background services are running.
                        </p>

                        {/* Update status inside Android App */}
                        <div className="mt-3 pt-3 border-t border-emerald-200/60 dark:border-emerald-800/40 flex items-center justify-between gap-2 flex-wrap">
                          {appUpdateStatus?.hasUpdate ? (
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                                Update available: v{appUpdateStatus.serverInfo?.versionName}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  downloadAndInstallApk(appUpdateStatus.serverInfo?.apkUrl);
                                  toast.success("Downloading update... Tap notification to install.");
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors"
                              >
                                <Download size={13} />
                                <span>Update App</span>
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-emerald-700 dark:text-emerald-300 font-medium flex items-center gap-1">
                                <Check size={13} />
                                Native code is up to date
                              </span>
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={handleManualUpdateCheck}
                            disabled={isCheckingUpdate}
                            className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 p-1 rounded transition-colors flex items-center gap-1 shrink-0"
                            title="Check for updates"
                          >
                            <RefreshCw size={12} className={isCheckingUpdate ? "animate-spin" : ""} />
                            Check
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="pt-5 border-t border-zinc-200 dark:border-zinc-800">
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1 flex items-center gap-2">
                      <Smartphone size={16} className="text-primary-500" />
                      Screen-Off & Background Recording (Android APK)
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
                      Mobile web browsers aggressively pause audio recording when your phone screen turns off or when you switch apps. Install the standalone Motif Android APK to keep recording long lectures, meetings, and voice memos uninterrupted in the background.
                    </p>
                    <div className="p-3 bg-zinc-100 dark:bg-zinc-800/60 rounded-xl border border-zinc-200 dark:border-zinc-700 mb-3 text-xs text-zinc-600 dark:text-zinc-300 space-y-1">
                      <p className="font-semibold text-zinc-800 dark:text-zinc-200">APK Features:</p>
                      <ul className="list-disc list-inside space-y-0.5 ml-1">
                        <li>Continuous recording with screen locked / turned off</li>
                        <li>Background audio capture while using other apps</li>
                        <li>Foreground recording status notification in Android drawer</li>
                        <li>Auto-loads latest live features seamlessly</li>
                      </ul>
                    </div>
                    <a
                      href="/Motif.apk"
                      download="Motif.apk"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 font-medium text-sm rounded-xl shadow-sm transition-all"
                    >
                      <Download size={15} />
                      <span>Download Android App (Motif.apk)</span>
                    </a>
                  </div>
                )}

                <div className="pt-5 border-t border-zinc-200 dark:border-zinc-800">
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1 flex items-center gap-2">
                    <Monitor size={16} className="text-primary-500" />
                    Desktop Apps (macOS & Windows)
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
                    Download standalone native installers for macOS (.dmg) and Windows (.exe / .msi) or install directly from Chrome/Edge as a desktop app. All desktop apps automatically sync over the air with live cloud updates.
                  </p>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <a
                      href="/download"
                      className="inline-flex items-center gap-2 px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 font-medium text-xs rounded-xl shadow-sm transition-all"
                    >
                      <Download size={14} />
                      <span>Open Motif Downloads Hub (/download)</span>
                    </a>
                    <a
                      href="/api/download?platform=mac"
                      download
                      className="inline-flex items-center gap-2 px-3.5 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-medium text-xs rounded-xl transition-all"
                    >
                      <span>macOS (.dmg)</span>
                    </a>
                    <a
                      href="/api/download?platform=windows"
                      download
                      className="inline-flex items-center gap-2 px-3.5 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-medium text-xs rounded-xl transition-all"
                    >
                      <span>Windows (.exe)</span>
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {isConfirmingDeletePage && activePageId && (
        <DeleteConfirmModal
          isOpen={true}
          onClose={() => setIsConfirmingDeletePage(false)}
          onConfirm={async () => {
            setIsConfirmingDeletePage(false);
            if (onDeletePage) {
              await onDeletePage(activePageId);
              onClose();
            }
          }}
          itemType="page"
          itemName={activePageTitle || "this Note"}
          isPermanent={false}
        />
      )}
    </div>
  );
}
