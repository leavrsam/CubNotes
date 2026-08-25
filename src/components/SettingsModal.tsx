import React, { useState, useRef, useEffect } from "react";
import { useTheme } from "next-themes";
import { useAccent, AccentColor } from "./AccentProvider";
import { X, Moon, Sun, Monitor, LogOut, Check, User as UserIcon, Upload, Loader2, Trash2, BookOpen, Folder, Edit2, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "react-hot-toast";
import { useMinimapSettings } from "@/hooks/useMinimapSettings";
import { Notebook } from "@/hooks/useNotebooks";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail?: string;
  user?: any;
  onSignOut: () => void;
  notebooks?: Notebook[];
  onUpdateNotebook?: (id: string, title: string) => Promise<void> | void;
  onDeleteNotebook?: (id: string) => Promise<void> | void;
  onToggleJournalMode?: (id: string, is_journal: boolean) => Promise<void> | void;
  activeNotebookId?: string | null;
  activeSectionId?: string | null;
  activePageId?: string | null;
  activePageTitle?: string;
  onUpdatePageTitle?: (title: string) => void;
  onDeletePage?: (id: string) => Promise<void>;
}

export function SettingsModal({ 
  isOpen, 
  onClose, 
  userEmail, 
  user, 
  onSignOut,
  notebooks = [],
  onUpdateNotebook,
  onDeleteNotebook,
  onToggleJournalMode,
  activePageId,
  activePageTitle,
  onUpdatePageTitle,
  onDeletePage
}: SettingsModalProps) {
  const { theme, setTheme } = useTheme();
  const { accentColor, setAccentColor } = useAccent();
  const { showMinimap, setShowMinimap } = useMinimapSettings();
  const [activeTab, setActiveTab] = useState<"profile" | "appearance" | "notebooks" | "account">("profile");
  const [editingNotebookId, setEditingNotebookId] = useState<string | null>(null);
  const [editNotebookTitle, setEditNotebookTitle] = useState("");
  
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
              onClick={() => setActiveTab("notebooks")}
              className={`px-3.5 py-2 text-xs sm:text-sm font-medium rounded-xl text-center sm:text-left transition-all shrink-0 flex items-center justify-center sm:justify-start gap-1.5 ${
                activeTab === "notebooks"
                  ? "bg-white dark:bg-zinc-800 text-primary-600 dark:text-primary-400 shadow-sm font-semibold"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/60 dark:hover:bg-zinc-800/50"
              }`}
            >
              <BookOpen size={14} />
              <span>Notebooks</span>
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

            {activeTab === "notebooks" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1">Notebook Settings</h3>
                  <p className="text-xs text-zinc-500 mb-4">
                    Configure notebook modes and organization. Journal mode enables reflection prompts, date-organized notes, and persistent recordings.
                  </p>

                  {/* Active Note Card if available */}
                  {activePageTitle && (
                    <div className="mb-5 p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/80 dark:border-zinc-700/60 flex items-center justify-between">
                      <div className="flex items-center gap-2.5 min-w-0 pr-2">
                        <div className="w-8 h-8 rounded-lg bg-primary-50 dark:bg-primary-950/50 flex items-center justify-center flex-shrink-0">
                          <FileText size={16} className="text-primary-600 dark:text-primary-400" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs text-zinc-400 font-medium">Currently Active Note</div>
                          <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                            {activePageTitle}
                          </div>
                        </div>
                      </div>
                      {onDeletePage && activePageId && (
                        <button
                          onClick={async () => {
                            if (window.confirm(`Delete "${activePageTitle}"?`)) {
                              await onDeletePage(activePageId);
                              onClose();
                            }
                          }}
                          className="p-1.5 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors flex-shrink-0"
                          title="Delete active note"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Notebooks List */}
                  <div className="space-y-3">
                    {notebooks.length === 0 ? (
                      <p className="text-xs text-zinc-400 italic">No notebooks found.</p>
                    ) : (
                      notebooks.map((nb) => {
                        const totalFolders = (nb.sections || []).length;
                        const totalNotes = (nb.sections || []).reduce((acc, s) => acc + (s.pages || []).length, 0);
                        const isEditingThis = editingNotebookId === nb.id;

                        return (
                          <div 
                            key={nb.id}
                            className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 shadow-sm space-y-3"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                  nb.is_journal ? 'bg-amber-500/15 text-amber-500' : 'bg-primary-50 dark:bg-primary-950/50 text-primary-600 dark:text-primary-400'
                                }`}>
                                  {nb.is_journal ? <BookOpen size={16} /> : <Folder size={16} />}
                                </div>

                                {isEditingThis ? (
                                  <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <input
                                      type="text"
                                      value={editNotebookTitle}
                                      onChange={(e) => setEditNotebookTitle(e.target.value)}
                                      className="px-2.5 py-1 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-white w-full"
                                      autoFocus
                                    />
                                    <button
                                      onClick={async () => {
                                        if (onUpdateNotebook && editNotebookTitle.trim()) {
                                          await onUpdateNotebook(nb.id, editNotebookTitle.trim());
                                          toast.success("Notebook renamed");
                                        }
                                        setEditingNotebookId(null);
                                      }}
                                      className="px-2.5 py-1 bg-primary-600 text-white rounded-lg text-xs font-semibold"
                                    >
                                      Save
                                    </button>
                                    <button
                                      onClick={() => setEditingNotebookId(null)}
                                      className="px-2 py-1 text-xs text-zinc-400 hover:text-zinc-600"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">
                                        {nb.title}
                                      </span>
                                      <button
                                        onClick={() => {
                                          setEditingNotebookId(nb.id);
                                          setEditNotebookTitle(nb.title);
                                        }}
                                        className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                                        title="Rename notebook"
                                      >
                                        <Edit2 size={12} />
                                      </button>
                                    </div>
                                    <div className="text-[11px] text-zinc-400">
                                      {totalFolders} {totalFolders === 1 ? 'folder' : 'folders'} • {totalNotes} {totalNotes === 1 ? 'note' : 'notes'}
                                    </div>
                                  </div>
                                )}
                              </div>

                              {onDeleteNotebook && !isEditingThis && (
                                <button
                                  onClick={async () => {
                                    if (window.confirm(`Delete notebook "${nb.title}" and all its contents?`)) {
                                      await onDeleteNotebook(nb.id);
                                    }
                                  }}
                                  className="p-1.5 text-zinc-400 hover:text-red-500 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                                  title="Delete notebook"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>

                            {/* Journal Mode Switch */}
                            {onToggleJournalMode && (
                              <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <BookOpen size={14} className={nb.is_journal ? "text-amber-500" : "text-zinc-400"} />
                                  <div>
                                    <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">Journal Mode</div>
                                    <div className="text-[10px] text-zinc-400">Daily prompts & permanent audio storage</div>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await onToggleJournalMode(nb.id, !nb.is_journal);
                                    toast.success(!nb.is_journal ? `"${nb.title}" switched to Journal mode` : `"${nb.title}" switched to Standard mode`);
                                  }}
                                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                                    nb.is_journal ? 'bg-amber-500' : 'bg-zinc-200 dark:bg-zinc-700'
                                  }`}
                                >
                                  <span
                                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                                      nb.is_journal ? 'translate-x-4' : 'translate-x-0.5'
                                    }`}
                                  />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "account" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">Signed in as</h3>
                  <div className="text-lg font-medium text-zinc-900 dark:text-zinc-100">{userEmail || "Loading..."}</div>
                </div>
                
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
          </div>
        </div>
      </div>
    </div>
  );
}
