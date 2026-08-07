import React, { useState } from "react";
import { useTheme } from "next-themes";
import { useAccent, AccentColor } from "./AccentProvider";
import { X, Moon, Sun, Monitor, LogOut, Check } from "lucide-react";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail?: string;
  onSignOut: () => void;
}

export function SettingsModal({ isOpen, onClose, userEmail, onSignOut }: SettingsModalProps) {
  const { theme, setTheme } = useTheme();
  const { accentColor, setAccentColor } = useAccent();
  const [activeTab, setActiveTab] = useState<"account" | "appearance">("appearance");

  if (!isOpen) return null;

  const accentColors: { id: AccentColor; label: string; hex: string }[] = [
    { id: "indigo", label: "Indigo", hex: "#6366f1" },
    { id: "emerald", label: "Emerald", hex: "#10b981" },
    { id: "rose", label: "Rose", hex: "#f43f5e" },
    { id: "amber", label: "Amber", hex: "#f59e0b" },
    { id: "blue", label: "Blue", hex: "#3b82f6" },
    { id: "purple", label: "Purple", hex: "#a855f7" },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-auto">
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm" 
        onClick={onClose}
      />
      <div className="relative bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl w-[600px] h-[400px] overflow-hidden flex flex-col pointer-events-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-950/50">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Settings</h2>
          <button 
            onClick={onClose}
            className="p-1 rounded-md text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-48 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-100/50 dark:bg-zinc-900/50 p-2 flex flex-col gap-1">
            <button
              onClick={() => setActiveTab("appearance")}
              className={`px-3 py-2 text-sm font-medium rounded-md text-left transition-colors ${
                activeTab === "appearance"
                  ? "bg-white dark:bg-zinc-800 text-primary-600 dark:text-primary-400 shadow-sm"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800/50"
              }`}
            >
              Appearance
            </button>
            <button
              onClick={() => setActiveTab("account")}
              className={`px-3 py-2 text-sm font-medium rounded-md text-left transition-colors ${
                activeTab === "account"
                  ? "bg-white dark:bg-zinc-800 text-primary-600 dark:text-primary-400 shadow-sm"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800/50"
              }`}
            >
              Account
            </button>
          </div>
          {/* Content */}
          <div className="flex-1 p-6 overflow-y-auto">
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
              </div>
            )}
            {activeTab === "account" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">Signed in as</h3>
                  <div className="text-lg font-medium text-zinc-900 dark:text-zinc-100">{userEmail || "Loading..."}</div>
                </div>
                <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800">
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
