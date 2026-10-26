"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import { createClient } from "@/lib/supabase/client";
import { SupabaseYjsProvider, UserPresence } from "./SupabaseYjsProvider";
import { Awareness } from "y-protocols/awareness";

export const COLLAB_COLORS = [
  "#f97316", // orange
  "#06b6d4", // cyan
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#10b981", // emerald
  "#3b82f6", // blue
  "#eab308", // yellow
  "#14b8a6", // teal
  "#a855f7", // purple
  "#f43f5e", // rose
];

export function getUserColor(identifier: string): string {
  let hash = 0;
  for (let i = 0; i < identifier.length; i++) {
    hash = identifier.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLLAB_COLORS[Math.abs(hash) % COLLAB_COLORS.length];
}

export interface YjsRoomState {
  doc: Y.Doc | null;
  provider: SupabaseYjsProvider | null;
  awareness: Awareness | null;
  activeUsers: UserPresence[];
  currentUser: UserPresence;
  isReady: boolean;
}

export function useYjsRoom(pageId: string | null | undefined, currentUser?: any): YjsRoomState {
  const [doc, setDoc] = useState<Y.Doc | null>(null);
  const [provider, setProvider] = useState<SupabaseYjsProvider | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [activeUsers, setActiveUsers] = useState<UserPresence[]>([]);
  const supabase = useMemo(() => createClient(), []);

  const userPresence: UserPresence = useMemo(() => {
    const email = currentUser?.email || "anonymous";
    const name = currentUser?.user_metadata?.full_name || currentUser?.user_metadata?.name || email.split("@")[0] || "User";
    const color = getUserColor(currentUser?.id || email);
    return { name, color, email };
  }, [currentUser]);

  // When userPresence changes, update provider awareness without reconnecting
  useEffect(() => {
    if (provider) {
      provider.setPresence(userPresence);
    }
  }, [provider, userPresence]);

  useEffect(() => {
    if (!pageId || typeof window === "undefined") {
      setDoc(null);
      setProvider(null);
      setIsReady(false);
      setActiveUsers([]);
      return;
    }

    // 1. Initialize Y.Doc for this page
    const ydoc = new Y.Doc({ gc: true });

    // 2. Attach local IndexedDB persistence for offline-first instant loading (defensive)
    let persistence: IndexeddbPersistence | null = null;
    try {
      if (typeof window !== "undefined" && "indexedDB" in window) {
        persistence = new IndexeddbPersistence(`cubnotes_yjs_${pageId}`, ydoc);
      }
    } catch (err) {
      console.warn("IndexedDB persistence could not be initialized:", err);
    }

    // 3. Attach Supabase Realtime Provider for network synchronization (defensive)
    let yProvider: SupabaseYjsProvider | null = null;
    try {
      yProvider = new SupabaseYjsProvider(supabase, pageId, ydoc, userPresence);
    } catch (err) {
      console.warn("Supabase Yjs provider could not be initialized:", err);
    }

    // 4. Track Active Collaborator Presence
    const updateActiveUsers = () => {
      if (!yProvider?.awareness) return;
      try {
        const states = Array.from(yProvider.awareness.getStates().values());
        const users: UserPresence[] = states
          .map((s: any) => s?.user)
          .filter((u): u is UserPresence => Boolean(u && u.name));
        
        // Deduplicate by name/email
        const unique = Array.from(new Map(users.map(u => [u.email || u.name, u])).values());
        setActiveUsers(unique);
      } catch (err) {
        console.warn("Failed to update active users:", err);
      }
    };

    if (yProvider) {
      yProvider.awareness.on("change", updateActiveUsers);
    }

    // 5. When local persistence is loaded from IndexedDB, mark room as ready
    if (persistence) {
      persistence.on("synced", () => {
        setIsReady(true);
        updateActiveUsers();
      });
    } else {
      setIsReady(true);
    }

    // Timeout safety fallback: If IndexedDB takes > 200ms, mark ready anyway
    const timer = setTimeout(() => {
      setIsReady(true);
    }, 200);

    setDoc(ydoc);
    setProvider(yProvider);

    return () => {
      clearTimeout(timer);
      if (yProvider) {
        try {
          yProvider.awareness.off("change", updateActiveUsers);
          yProvider.destroy();
        } catch {}
      }
      if (persistence) {
        try {
          persistence.destroy();
        } catch {}
      }
      try {
        ydoc.destroy();
      } catch {}
      setDoc(null);
      setProvider(null);
      setIsReady(false);
      setActiveUsers([]);
    };
  }, [pageId, supabase]);

  return {
    doc,
    provider,
    awareness: provider?.awareness || null,
    activeUsers,
    currentUser: userPresence,
    isReady,
  };
}
