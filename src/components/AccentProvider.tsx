"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

export type AccentColor = "indigo" | "emerald" | "rose" | "amber" | "blue" | "purple";

interface AccentContextType {
  accentColor: AccentColor;
  setAccentColor: (color: AccentColor) => void;
}

const AccentContext = createContext<AccentContextType | undefined>(undefined);

export const ACCENT_COLORS: Record<AccentColor, Record<string | number, string>> = {
  indigo: {
    50: "#eef2ff",
    100: "#e0e7ff",
    200: "#c7d2fe",
    300: "#a5b4fc",
    400: "#818cf8",
    500: "#6366f1",
    600: "#4f46e5",
    700: "#4338ca",
    800: "#3730a3",
    900: "#312e81",
    950: "#1e1b4b",
  },
  emerald: {
    50: "#ecfdf5",
    100: "#d1fae5",
    200: "#a7f3d0",
    300: "#6ee7b7",
    400: "#34d399",
    500: "#10b981",
    600: "#059669",
    700: "#047857",
    800: "#065f46",
    900: "#064e3b",
    950: "#022c22",
  },
  rose: {
    50: "#fff1f2",
    100: "#ffe4e6",
    200: "#fecdd3",
    300: "#fda4af",
    400: "#fb7185",
    500: "#f43f5e",
    600: "#e11d48",
    700: "#be123c",
    800: "#9f1239",
    900: "#881337",
    950: "#4c0519",
  },
  amber: {
    50: "#fffbeb",
    100: "#fef3c7",
    200: "#fde68a",
    300: "#fcd34d",
    400: "#fbbf24",
    500: "#f59e0b",
    600: "#d97706",
    700: "#b45309",
    800: "#92400e",
    900: "#78350f",
    950: "#451a03",
  },
  blue: {
    50: "#eff6ff",
    100: "#dbeafe",
    200: "#bfdbfe",
    300: "#93c5fd",
    400: "#60a5fa",
    500: "#3b82f6",
    600: "#2563eb",
    700: "#1d4ed8",
    800: "#1e40af",
    900: "#1e3a8a",
    950: "#172554",
  },
  purple: {
    50: "#faf5ff",
    100: "#f3e8ff",
    200: "#e9d5ff",
    300: "#d8b4fe",
    400: "#c084fc",
    500: "#a855f7",
    600: "#9333ea",
    700: "#7e22ce",
    800: "#6b21a8",
    900: "#581c87",
    950: "#3b0764",
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
    
    Object.entries(colors).forEach(([weight, hex]) => {
      root.style.setProperty(`--primary-${weight}`, hex);
    });
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
