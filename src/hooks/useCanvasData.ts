import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import debounce from "lodash/debounce";
import { v4 as uuidv4 } from "uuid";
import { 
  getCachedPageState, 
  setCachedPageState, 
  queueOfflineSync, 
  getPendingSyncActions, 
  removeSyncAction 
} from "@/lib/offlineStore";
import { Stroke, TextNode, AudioNode, ImageNode, FileNode, VideoNode, ShapeNode, ConnectorNode, DocumentState } from "@/components/CustomCanvas";

export function useCanvasData(pageId: string) {
  const [loading, setLoading] = useState(true);
  const [supabase] = useState(() => createClient());

  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [texts, setTexts] = useState<TextNode[]>([]);
  const [audios, setAudios] = useState<AudioNode[]>([]);
  const [images, setImages] = useState<ImageNode[]>([]);
  const [files, setFiles] = useState<FileNode[]>([]);
  const [videos, setVideos] = useState<VideoNode[]>([]);
  const [shapes, setShapes] = useState<ShapeNode[]>([]);
  const [connectors, setConnectors] = useState<ConnectorNode[]>([]);

  // History state
  const [past, setPast] = useState<DocumentState[]>([]);
  const [future, setFuture] = useState<DocumentState[]>([]);
  const pastRef = useRef<DocumentState[]>([]);
  const futureRef = useRef<DocumentState[]>([]);
  const lastSavedStateRef = useRef<DocumentState | null>(null);
  const isUndoingRef = useRef(false);
  const lastSnapshotHashRef = useRef<string>("");
  const lastSnapshotTimeRef = useRef<number>(0);

  // Load state: Instant local cache first, then sync with DB
  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      // 1. Instant load from local IndexedDB cache (0ms latency, works offline)
      try {
        const cached = await getCachedPageState(pageId);
        if (cached && isMounted) {
          setStrokes(cached.strokes || []);
          setTexts(cached.texts || []);
          setAudios(cached.audios || []);
          setImages(cached.images || []);
          setFiles(cached.files || []);
          setVideos(cached.videos || []);
          setShapes(cached.shapes || []);
          setConnectors(cached.connectors || []);
          lastSavedStateRef.current = cached;
          lastSnapshotHashRef.current = JSON.stringify(cached);
          lastSnapshotTimeRef.current = Date.now();
          setLoading(false);
        }
      } catch (cacheErr) {
        console.warn("Could not read local cached page state:", cacheErr);
      }

      // If offline, stop here
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        if (isMounted) setLoading(false);
        return;
      }

      // 2. Fetch fresh state from Supabase
      try {
        const { data, error } = await supabase
          .from("pages")
          .select("document_state")
          .eq("id", pageId)
          .single();
          
        if (error) {
          console.warn("Supabase fetch failed (possibly offline):", error);
        } else if (isMounted && data?.document_state) {
          const state = data.document_state as DocumentState;
          setStrokes(state.strokes || []);
          setTexts(state.texts || []);
          setAudios(state.audios || []);
          setImages(state.images || []);
          setFiles(state.files || []);
          setVideos(state.videos || []);
          setShapes(state.shapes || []);
          setConnectors(state.connectors || []);
          lastSavedStateRef.current = state;
          lastSnapshotHashRef.current = JSON.stringify(state);
          lastSnapshotTimeRef.current = Date.now();
          // Update local cache with fresh state
          setCachedPageState(pageId, state, false);
        }
      } catch (networkErr) {
        console.warn("Network error loading canvas state:", networkErr);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }
    
    loadData();
    
    return () => {
      isMounted = false;
    };
  }, [pageId, supabase]);

  // Debounced history snapshot
  useEffect(() => {
    if (loading) return;
    if (isUndoingRef.current) {
      isUndoingRef.current = false;
      return;
    }
    
    const timeoutId = setTimeout(() => {
      const currentState: DocumentState = { strokes, texts, audios, images, files, videos, shapes, connectors };
      
      if (!lastSavedStateRef.current) {
        lastSavedStateRef.current = currentState;
        return;
      }

      if (JSON.stringify(lastSavedStateRef.current) !== JSON.stringify(currentState)) {
        pastRef.current.push(lastSavedStateRef.current);
        if (pastRef.current.length > 50) pastRef.current.shift();
        setPast([...pastRef.current]);
        lastSavedStateRef.current = currentState;
        futureRef.current = [];
        setFuture([]);
      }
    }, 300);
    
    return () => clearTimeout(timeoutId);
  }, [strokes, texts, audios, images, files, videos, shapes, connectors, loading]);

  // Save state: Write locally immediately, debounced sync to Supabase
  const saveToSupabase = useCallback(
    // eslint-disable-next-line react-hooks/exhaustive-deps
    debounce(async (
      newStrokes: Stroke[], newTexts: TextNode[], newAudios: AudioNode[],
      newImages: ImageNode[], newFiles: FileNode[], newVideos: VideoNode[],
      newShapes: ShapeNode[], newConnectors: ConnectorNode[]
    ) => {
      const state: DocumentState = { 
        strokes: newStrokes, texts: newTexts, audios: newAudios,
        images: newImages, files: newFiles, videos: newVideos,
        shapes: newShapes, connectors: newConnectors
      };

      const isOfflineNow = typeof navigator !== 'undefined' && !navigator.onLine;

      // Always save to local IndexedDB immediately
      await setCachedPageState(pageId, state, isOfflineNow);

      if (isOfflineNow) {
        // Queue for background sync when back online
        await queueOfflineSync({
          id: `sync_${pageId}`,
          action: 'save_canvas',
          pageId,
          payload: state,
          timestamp: Date.now(),
        });
        return;
      }

      try {
        const { error } = await supabase
          .from('pages')
          .update({ document_state: state })
          .eq('id', pageId);

        if (error) {
          console.warn("Supabase update error, queuing offline sync:", error);
          await queueOfflineSync({
            id: `sync_${pageId}`,
            action: 'save_canvas',
            pageId,
            payload: state,
            timestamp: Date.now(),
          });
        }
      } catch (err) {
        console.warn("Network error during save, queued locally:", err);
        await queueOfflineSync({
          id: `sync_${pageId}`,
          action: 'save_canvas',
          pageId,
          payload: state,
          timestamp: Date.now(),
        });
      }
    }, 1500),
    [pageId, supabase]
  );

  // Background Sync on Reconnection
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleReconnected = async () => {
      console.log("Device reconnected to internet. Replaying pending sync actions...");
      try {
        const pending = await getPendingSyncActions();
        for (const action of pending) {
          if (action.action === 'save_canvas') {
            const { error } = await supabase
              .from('pages')
              .update({ document_state: action.payload })
              .eq('id', action.pageId);
            if (!error) {
              await removeSyncAction(action.id);
            }
          }
        }
      } catch (syncErr) {
        console.warn("Background sync error:", syncErr);
      }
    };

    window.addEventListener('online', handleReconnected);
    return () => window.removeEventListener('online', handleReconnected);
  }, [supabase]);

  // Save version snapshot to DB (tiered retention, debounced)
  const saveVersionToSupabase = useCallback(
    // eslint-disable-next-line react-hooks/exhaustive-deps
    debounce(async (
      newStrokes: Stroke[], newTexts: TextNode[], newAudios: AudioNode[],
      newImages: ImageNode[], newFiles: FileNode[], newVideos: VideoNode[],
      newShapes: ShapeNode[], newConnectors: ConnectorNode[]
    ) => {
      const state: DocumentState = { 
        strokes: newStrokes, texts: newTexts, audios: newAudios,
        images: newImages, files: newFiles, videos: newVideos,
        shapes: newShapes, connectors: newConnectors
      };
      
      // Don't save empty states as versions
      if (
        newStrokes.length === 0 && newTexts.length === 0 && newImages.length === 0 && 
        newFiles.length === 0 && newVideos.length === 0 && newAudios.length === 0 &&
        newShapes.length === 0 && newConnectors.length === 0
      ) {
        return;
      }

      const stateHash = JSON.stringify(state);
      if (stateHash === lastSnapshotHashRef.current) {
        return;
      }

      // Rate limit automatic snapshots to at most once every 3 minutes
      if (Date.now() - lastSnapshotTimeRef.current < 180000 && lastSnapshotHashRef.current !== "") {
        return;
      }
      
      try {
        const { error } = await supabase
          .from('page_versions')
          .insert({ page_id: pageId, document_state: state });

        if (!error) {
          lastSnapshotHashRef.current = stateHash;
          lastSnapshotTimeRef.current = Date.now();
          await prunePageVersions(supabase, pageId);
        }
      } catch (e) {
        console.warn("Could not save page version:", e);
      }
    }, 300000, { maxWait: 900000 }), // Save version after 5 minutes of quiet time, or at most 15 min during active editing
    [pageId, supabase]
  );

  // Manual checkpoint snapshot
  const saveManualSnapshot = useCallback(async (): Promise<boolean> => {
    const state: DocumentState = { 
      strokes, texts, audios, images, files, videos, shapes, connectors 
    };

    if (
      strokes.length === 0 && texts.length === 0 && images.length === 0 && 
      files.length === 0 && videos.length === 0 && audios.length === 0 &&
      shapes.length === 0 && connectors.length === 0
    ) {
      return false;
    }

    const stateHash = JSON.stringify(state);
    try {
      const { error } = await supabase
        .from('page_versions')
        .insert({ page_id: pageId, document_state: state });

      if (!error) {
        lastSnapshotHashRef.current = stateHash;
        lastSnapshotTimeRef.current = Date.now();
        await prunePageVersions(supabase, pageId);
        await fetchVersions();
        return true;
      }
    } catch (e) {
      console.warn("Manual snapshot error:", e);
    }
    return false;
  }, [strokes, texts, audios, images, files, videos, shapes, connectors, pageId, supabase, fetchVersions]);

  // Continuous autosave (debounced 1500ms) and version snapshot scheduling
  useEffect(() => {
    if (!loading) {
      saveToSupabase(strokes, texts, audios, images, files, videos, shapes, connectors);
      saveVersionToSupabase(strokes, texts, audios, images, files, videos, shapes, connectors);
    }
  }, [strokes, texts, audios, images, files, videos, shapes, connectors, loading, saveToSupabase, saveVersionToSupabase]);

  // Flush live autosave when leaving page or unmounting
  useEffect(() => {
    return () => {
      saveToSupabase.flush();
      if (Date.now() - lastSnapshotTimeRef.current >= 300000) {
        saveVersionToSupabase.flush();
      } else {
        saveVersionToSupabase.cancel();
      }
    };
  }, [pageId, saveToSupabase, saveVersionToSupabase]);

  // Fetch Page Versions
  const [pageVersions, setPageVersions] = useState<any[]>([]);
  
  const fetchVersions = useCallback(async () => {
    const { data, error } = await supabase
      .from('page_versions')
      .select('id, created_at, document_state')
      .eq('page_id', pageId)
      .order('created_at', { ascending: false });
      
    if (!error && data) {
      setPageVersions(data);
    }
  }, [pageId, supabase]);

  const restoreVersion = useCallback((versionState: DocumentState) => {
    // Push current state to past before restoring, so we can undo the restore
    const currentState: DocumentState = { strokes, texts, audios, images, files, videos, shapes, connectors };
    pastRef.current.push(currentState);
    if (pastRef.current.length > 50) pastRef.current.shift();
    setPast([...pastRef.current]);
    lastSavedStateRef.current = versionState;
    futureRef.current = [];
    setFuture([]);
    
    setStrokes(versionState.strokes || []);
    setTexts(versionState.texts || []);
    setAudios(versionState.audios || []);
    setImages(versionState.images || []);
    setFiles(versionState.files || []);
    setVideos(versionState.videos || []);
    setShapes(versionState.shapes || []);
    setConnectors(versionState.connectors || []);
    
    isUndoingRef.current = true;
  }, [strokes, texts, audios, images, files, videos, shapes, connectors]);

  const undo = useCallback(() => {
    const currentState: DocumentState = { strokes, texts, audios, images, files, videos, shapes, connectors };
    const isUncommitted = lastSavedStateRef.current && JSON.stringify(currentState) !== JSON.stringify(lastSavedStateRef.current);
    
    if (isUncommitted && lastSavedStateRef.current) {
      pastRef.current.push(lastSavedStateRef.current);
      if (pastRef.current.length > 50) pastRef.current.shift();
      lastSavedStateRef.current = currentState;
    }
    
    if (pastRef.current.length === 0) return;
    
    const stateToRestore = pastRef.current.pop()!;
    futureRef.current.unshift(lastSavedStateRef.current || currentState);
    if (futureRef.current.length > 50) futureRef.current.pop();
    
    setPast([...pastRef.current]);
    setFuture([...futureRef.current]);
    lastSavedStateRef.current = stateToRestore;
    
    setStrokes(stateToRestore.strokes || []);
    setTexts(stateToRestore.texts || []);
    setAudios(stateToRestore.audios || []);
    setImages(stateToRestore.images || []);
    setFiles(stateToRestore.files || []);
    setVideos(stateToRestore.videos || []);
    setShapes(stateToRestore.shapes || []);
    setConnectors(stateToRestore.connectors || []);
    
    isUndoingRef.current = true;
  }, [strokes, texts, audios, images, files, videos, shapes, connectors]);

  const redo = useCallback(() => {
    if (futureRef.current.length === 0) return;
    
    const currentState: DocumentState = { strokes, texts, audios, images, files, videos, shapes, connectors };
    const stateToRestore = futureRef.current.shift()!;
    
    pastRef.current.push(lastSavedStateRef.current || currentState);
    if (pastRef.current.length > 50) pastRef.current.shift();
    
    setPast([...pastRef.current]);
    setFuture([...futureRef.current]);
    lastSavedStateRef.current = stateToRestore;
    
    setStrokes(stateToRestore.strokes || []);
    setTexts(stateToRestore.texts || []);
    setAudios(stateToRestore.audios || []);
    setImages(stateToRestore.images || []);
    setFiles(stateToRestore.files || []);
    setVideos(stateToRestore.videos || []);
    setShapes(stateToRestore.shapes || []);
    setConnectors(stateToRestore.connectors || []);
    
    isUndoingRef.current = true;
  }, [strokes, texts, audios, images, files, videos, shapes, connectors]);

  return {
    loading,
    strokes, setStrokes,
    texts, setTexts,
    audios, setAudios,
    images, setImages,
    files, setFiles,
    videos, setVideos,
    shapes, setShapes,
    connectors, setConnectors,
    undo, redo,
    canUndo: past.length > 0 || (lastSavedStateRef.current !== null && JSON.stringify({ strokes, texts, audios, images, files, videos, shapes, connectors }) !== JSON.stringify(lastSavedStateRef.current)),
    canRedo: future.length > 0,
    pageVersions,
    fetchVersions,
    restoreVersion,
    saveManualSnapshot
  };
}

/**
 * Tiered Retention Policy for Page Version Snapshots:
 * - Same day (Today): Up to 10 snapshots
 * - Last 7 days (Days 1 - 7): Up to 5 snapshots per calendar day
 * - Month 1 to Month 2 (Days 8 - 60): Up to 1 snapshot per calendar day
 * - Older than 2 months (> 60 days): Purged completely
 */
export async function prunePageVersions(supabase: any, pageId: string) {
  try {
    const { data: versions, error } = await supabase
      .from('page_versions')
      .select('id, created_at')
      .eq('page_id', pageId)
      .order('created_at', { ascending: false });

    if (error || !versions || versions.length === 0) return;

    const now = new Date();
    const nowMs = now.getTime();
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    const SIXTY_DAYS_MS = 60 * ONE_DAY_MS;

    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const idsToDelete: string[] = [];
    let todayCount = 0;
    const recentDaysMap = new Map<string, number>(); // YYYY-MM-DD -> count (days 1-7, max 5)
    const olderDaysMap = new Map<string, number>();  // YYYY-MM-DD -> count (days 8-60, max 1)

    for (const v of versions) {
      const vDate = new Date(v.created_at);
      const vTime = vDate.getTime();
      const diffMs = nowMs - vTime;

      // 1. Purge snapshots older than 2 months (> 60 days)
      if (diffMs > SIXTY_DAYS_MS) {
        idsToDelete.push(v.id);
        continue;
      }

      const dayKey = `${vDate.getFullYear()}-${String(vDate.getMonth() + 1).padStart(2, '0')}-${String(vDate.getDate()).padStart(2, '0')}`;

      // 2. Same day (today): Up to 10 snapshots
      if (dayKey === todayKey) {
        todayCount++;
        if (todayCount > 10) {
          idsToDelete.push(v.id);
        }
        continue;
      }

      // Age in calendar days
      const diffDays = Math.max(1, Math.floor(diffMs / ONE_DAY_MS));

      // 3. Last 7 days (days 1 to 7): Up to 5 snapshots per day
      if (diffDays <= 7) {
        const count = recentDaysMap.get(dayKey) || 0;
        if (count >= 5) {
          idsToDelete.push(v.id);
        } else {
          recentDaysMap.set(dayKey, count + 1);
        }
        continue;
      }

      // 4. Month 1 to Month 2 (days 8 to 60): Up to 1 snapshot per day
      if (diffDays <= 60) {
        const count = olderDaysMap.get(dayKey) || 0;
        if (count >= 1) {
          idsToDelete.push(v.id);
        } else {
          olderDaysMap.set(dayKey, count + 1);
        }
        continue;
      }
    }

    if (idsToDelete.length > 0) {
      for (let i = 0; i < idsToDelete.length; i += 50) {
        const chunk = idsToDelete.slice(i, i + 50);
        await supabase.from('page_versions').delete().in('id', chunk);
      }
    }
  } catch (err) {
    console.warn("Could not prune old page versions:", err);
  }
}

