"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

export type AccentColor = "indigo" | "emerald" | "rose" | "amber" | "blue" | "purple";

interface AccentContextType {
  accentColor: AccentColor;
  setAccentColor: (color: AccentColor) => void;
}

const AccentContext = createContext<AccentContextType | undefined>(undefined);

const ACCENT_COLORS = {
  indigo: {
    400: "#818cf8",
    500: "#6366f1",
    600: "#4f46e5",
    900: "#312e81",
  },
  emerald: {
    400: "#34d399",
    500: "#10b981",
    600: "#059669",
    900: "#064e3b",
  },
  rose: {
    400: "#fb7185",
    500: "#f43f5e",
    600: "#e11d48",
    900: "#881337",
  },
  amber: {
    400: "#fbbf24",
    500: "#f59e0b",
    600: "#d97706",
    900: "#78350f",
  },
  blue: {
    400: "#60a5fa",
    500: "#3b82f6",
    600: "#2563eb",
    900: "#1e3a8a",
  },
  purple: {
    400: "#c084fc",
    500: "#a855f7",
    600: "#9333ea",
    900: "#581c87",
  }
};

export function AccentProvider({ children }: { children: React.ReactNode }) {
  const [accentColor, setAccentColorState] = useState<AccentColor>("indigo");

  useEffect(() => {
    // Load saved accent color from localStorage on mount
    const saved = localStorage.getItem("cubnotes-accent-color") as AccentColor;
    if (saved && ACCENT_COLORS[saved]) {
      setAccentColorState(saved);
    }
  }, []);

  const setAccentColor = (color: AccentColor) => {
    setAccentColorState(color);
    localStorage.setItem("cubnotes-accent-color", color);
  };

  // Update CSS variables when accent color changes
  useEffect(() => {
    const root = document.documentElement;
    const colors = ACCENT_COLORS[accentColor];
    
    root.style.setProperty("--primary-400", colors[400]);
    root.style.setProperty("--primary-500", colors[500]);
    root.style.setProperty("--primary-600", colors[600]);
    root.style.setProperty("--primary-900", colors[900]);
  }, [accentColor]);

  return (
    <AccentContext.Provider value={{ accentColor, setAccentColor }}>
      {children}
    </AccentContext.Provider>
  );
}

export function useAccent() {
  const context = useContext(AccentContext);
  if (context === undefined) {
    throw new Error("useAccent must be used within an AccentProvider");
  }
  return context;
}
