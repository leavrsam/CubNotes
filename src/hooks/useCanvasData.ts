import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import debounce from "lodash/debounce";
import { v4 as uuidv4 } from "uuid";
import { 
  getCachedPageState, 
  getCachedPageRecord,
  setCachedPageState, 
  queueOfflineSync, 
  getPendingSyncActions, 
  removeSyncAction,
  replayPendingSync,
  CachedPageRecord
} from "@/lib/offlineStore";
import { Stroke, TextNode, AudioNode, ImageNode, FileNode, VideoNode, ShapeNode, ConnectorNode, DocumentState } from "@/components/CustomCanvas";
import { TagPinNode } from "@/lib/tags";
import { mergeDocStates, resolveLoadedState, stateKey } from "@/lib/docSync";

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
  const [pageTags, setPageTags] = useState<string[]>([]);
  const [tagPins, setTagPins] = useState<TagPinNode[]>([]);

  // History state
  const [past, setPast] = useState<DocumentState[]>([]);
  const [future, setFuture] = useState<DocumentState[]>([]);
  const pastRef = useRef<DocumentState[]>([]);
  const futureRef = useRef<DocumentState[]>([]);
  const lastSavedStateRef = useRef<DocumentState | null>(null);
  const isUndoingRef = useRef(false);
  // Fingerprint of the last state we loaded/received (not typed). Autosave
  // skips it so loading a page is never mistaken for an edit.
  const skipAutosaveKeyRef = useRef<string | null>(null);
  // Last state known to match the server; used as the base for 3-way merges.
  const serverBaseRef = useRef<DocumentState | null>(null);
  const isDirtyRef = useRef(false);
  const lastLocalEditTimeRef = useRef(0);
  const isFlushingRef = useRef(false);
  const lastSnapshotHashRef = useRef<string>("");
  const lastSnapshotTimeRef = useRef<number>(0);
  const currentStateRef = useRef<DocumentState>({
    strokes: [],
    texts: [],
    audios: [],
    images: [],
    files: [],
    videos: [],
    shapes: [],
    connectors: [],
    pageTags: [],
    tagPins: []
  });

  useEffect(() => {
    currentStateRef.current = { strokes, texts, audios, images, files, videos, shapes, connectors, pageTags, tagPins };
  }, [strokes, texts, audios, images, files, videos, shapes, connectors, pageTags, tagPins]);

  /**
   * Put a document on screen. `asEdit: false` (loaded/received state) does not
   * trigger autosave; `asEdit: true` (merged state that the server lacks) does.
   */
  const applyDocState = useCallback((state: DocumentState, opts: { asEdit?: boolean } = {}) => {
    if (!opts.asEdit) {
      skipAutosaveKeyRef.current = stateKey(state);
      lastSavedStateRef.current = state;
      lastSnapshotHashRef.current = JSON.stringify(state);
      lastSnapshotTimeRef.current = Date.now();
    }
    currentStateRef.current = state;
    setStrokes(state.strokes || []);
    setTexts(state.texts || []);
    setAudios(state.audios || []);
    setImages(state.images || []);
    setFiles(state.files || []);
    setVideos(state.videos || []);
    setShapes(state.shapes || []);
    setConnectors(state.connectors || []);
    setPageTags(state.pageTags || []);
    setTagPins(state.tagPins || []);
  }, []);

  /**
   * Handle a newer copy of the page from the server (live update or refetch).
   * Clean editor -> show it. Unsaved local edits -> merge server changes in.
   */
  const handleRemoteDocState = useCallback((remoteState: DocumentState) => {
    const remoteKey = stateKey(remoteState);
    if (remoteKey === stateKey(currentStateRef.current)) {
      serverBaseRef.current = remoteState;
      return;
    }
    if (serverBaseRef.current && remoteKey === stateKey(serverBaseRef.current)) {
      return; // nothing new on the server (e.g. echo of our own save)
    }
    const isEditing = isDirtyRef.current || (Date.now() - lastLocalEditTimeRef.current < 5000);
    if (isEditing) {
      const merged = mergeDocStates(serverBaseRef.current, currentStateRef.current as any, remoteState as any) as DocumentState;
      serverBaseRef.current = remoteState;
      if (stateKey(merged) !== stateKey(currentStateRef.current)) {
        applyDocState(merged, { asEdit: true }); // autosave pushes the merged result
      }
      return;
    }
    serverBaseRef.current = remoteState;
    applyDocState(remoteState);
    setCachedPageState(pageId, remoteState, false).catch(() => {});
  }, [applyDocState, pageId]);


  // Load state: Instant local cache first, then sync with DB
  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      // 0. Replay any pending offline sync actions if online
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        replayPendingSync(supabase).catch(e => console.warn("Replay sync error:", e));
      }

      // 1. Instant load from local IndexedDB cache (0ms latency, works offline)
      let localRecord: CachedPageRecord | null = null;
      try {
        localRecord = await getCachedPageRecord(pageId);
        if (localRecord?.documentState && isMounted) {
          applyDocState(localRecord.documentState);
          setLoading(false);
        }
      } catch (cacheErr) {
        console.warn("Could not read local cached page state:", cacheErr);
      }

      // Check if there are pending offline sync actions for this page
      const pendingSyncs = await getPendingSyncActions();
      const hasPendingSync = pendingSyncs.some(a => a.pageId === pageId);

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
          const remoteState = data.document_state as DocumentState;
          // The server copy is the source of truth. The local cache only wins
          // when it holds real unsaved edits, and then server-side changes
          // (e.g. items added by Jarvis) are merged in rather than overwritten.
          const hasUnsavedLocalEdits = isDirtyRef.current || hasPendingSync || Boolean(localRecord?.isDirty);
          const { state, needsSave } = resolveLoadedState({
            remote: remoteState as any,
            local: hasUnsavedLocalEdits ? (currentStateRef.current as any) : null,
            hasUnsavedLocalEdits,
          });
          serverBaseRef.current = remoteState;
          if (needsSave) {
            applyDocState(state as DocumentState, { asEdit: true }); // autosave pushes merged state
          } else {
            applyDocState(remoteState);
            isDirtyRef.current = false;
            await setCachedPageState(pageId, remoteState, false);
            if (hasPendingSync) await removeSyncAction(`sync_${pageId}`);
          }
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

  // Debounced history snapshot for Undo/Redo
  useEffect(() => {
    if (loading) return;
    if (isUndoingRef.current) {
      isUndoingRef.current = false;
      return;
    }
    
    const timeoutId = setTimeout(() => {
      const currentState: DocumentState = { strokes, texts, audios, images, files, videos, shapes, connectors, pageTags, tagPins };
      
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
  }, [strokes, texts, audios, images, files, videos, shapes, connectors, pageTags, tagPins, loading]);

  // Debounced network sync to Supabase (1500ms) to avoid saturating HTTP connection while typing
  const debouncedSyncToSupabase = useCallback(
    // eslint-disable-next-line react-hooks/exhaustive-deps
    debounce(async (state: DocumentState) => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
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

        if (!error) {
          isDirtyRef.current = false;
          serverBaseRef.current = state;
          await setCachedPageState(pageId, state, false);
          await removeSyncAction(`sync_${pageId}`);
        } else {
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

  // Immediate flush of in-flight changes (called on unmount, page hide, screen lock, or navigation)
  const flushSave = useCallback(async () => {
    debouncedSyncToSupabase.cancel();
    if (!isDirtyRef.current || isFlushingRef.current) return;
    isFlushingRef.current = true;

    const stateToSave: DocumentState = {
      ...currentStateRef.current,
      _clientUpdatedAt: lastLocalEditTimeRef.current || Date.now()
    } as any;

    // 1. Ensure IndexedDB has it saved immediately
    await setCachedPageState(pageId, stateToSave, true);

    // 2. Push to Supabase if online
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      try {
        const { error } = await supabase
          .from('pages')
          .update({ document_state: stateToSave })
          .eq('id', pageId);

        if (!error) {
          isDirtyRef.current = false;
          serverBaseRef.current = stateToSave;
          await setCachedPageState(pageId, stateToSave, false);
          await removeSyncAction(`sync_${pageId}`);
        } else {
          await queueOfflineSync({
            id: `sync_${pageId}`,
            action: 'save_canvas',
            pageId,
            payload: stateToSave,
            timestamp: Date.now(),
          });
        }
      } catch (err) {
        await queueOfflineSync({
          id: `sync_${pageId}`,
          action: 'save_canvas',
          pageId,
          payload: stateToSave,
          timestamp: Date.now(),
        });
      }
    } else {
      await queueOfflineSync({
        id: `sync_${pageId}`,
        action: 'save_canvas',
        pageId,
        payload: stateToSave,
        timestamp: Date.now(),
      });
    }
    isFlushingRef.current = false;
  }, [pageId, supabase, debouncedSyncToSupabase]);

  // Background Sync on Reconnection
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleReconnected = async () => {
      console.log("Device reconnected to internet. Replaying pending sync actions...");
      await replayPendingSync(supabase);
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

  // Manual checkpoint snapshot
  const saveManualSnapshot = useCallback(async (): Promise<boolean> => {
    const state: DocumentState = { 
      strokes, texts, audios, images, files, videos, shapes, connectors, pageTags, tagPins 
    };

    if (
      strokes.length === 0 && texts.length === 0 && images.length === 0 && 
      files.length === 0 && videos.length === 0 && audios.length === 0 &&
      shapes.length === 0 && connectors.length === 0 && pageTags.length === 0 && tagPins.length === 0
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

  // Continuous autosave:
  // 1) IMMEDIATELY save to local IndexedDB (zero debounce, instant persistence)
  // 2) Debounced network sync to Supabase (1500ms)
  // 3) Scheduled version snapshots
  useEffect(() => {
    if (loading) return;
    const currentKey = stateKey({ strokes, texts, audios, images, files, videos, shapes, connectors, pageTags, tagPins });
    if (skipAutosaveKeyRef.current !== null) {
      if (currentKey === skipAutosaveKeyRef.current) return; // loaded/received state, not an edit
      skipAutosaveKeyRef.current = null;
    }

    const now = Date.now();
    lastLocalEditTimeRef.current = now;
    isDirtyRef.current = true;

    const stateToSave: DocumentState = {
      strokes,
      texts,
      audios,
      images,
      files,
      videos,
      shapes,
      connectors,
      pageTags,
      tagPins,
      _clientUpdatedAt: now
    } as any;

    // 1. Instant local persistence to IndexedDB
    setCachedPageState(pageId, stateToSave, true).catch(err => 
      console.warn("Failed immediate local cache save:", err)
    );

    // 2. Debounced network sync
    debouncedSyncToSupabase(stateToSave);

    // 3. Version snapshot
    saveVersionToSupabase(strokes, texts, audios, images, files, videos, shapes, connectors);
  }, [strokes, texts, audios, images, files, videos, shapes, connectors, pageTags, tagPins, loading, debouncedSyncToSupabase, saveVersionToSupabase, pageId]);

  // Lifecycle listeners to flush immediately on background/screen-off/unmount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushSave();
      }
    };

    const handlePageHide = () => {
      flushSave();
    };

    const handleBeforeUnload = () => {
      flushSave();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      flushSave();
      if (Date.now() - lastSnapshotTimeRef.current >= 300000) {
        saveVersionToSupabase.flush();
      } else {
        saveVersionToSupabase.cancel();
      }
    };
  }, [flushSave, saveVersionToSupabase]);

  const handleRemoteDocStateRef = useRef(handleRemoteDocState);
  handleRemoteDocStateRef.current = handleRemoteDocState;

  // Refetch on focus / when the tab becomes visible, so changes made elsewhere
  // (e.g. Jarvis adding list items) show up even if a live update was missed.
  useEffect(() => {
    if (!pageId || typeof window === 'undefined') return;
    let lastFetch = 0;
    const refetch = async () => {
      if (document.visibilityState === 'hidden' || !navigator.onLine) return;
      if (Date.now() - lastFetch < 2000) return;
      lastFetch = Date.now();
      try {
        const { data, error } = await supabase
          .from('pages')
          .select('document_state')
          .eq('id', pageId)
          .single();
        if (!error && data?.document_state) {
          handleRemoteDocStateRef.current(data.document_state as DocumentState);
        }
      } catch {}
    };
    window.addEventListener('focus', refetch);
    document.addEventListener('visibilitychange', refetch);
    return () => {
      window.removeEventListener('focus', refetch);
      document.removeEventListener('visibilitychange', refetch);
    };
  }, [pageId, supabase]);

  // Realtime subscription for collaborative updates on the current page
  useEffect(() => {
    if (!pageId) return;

    const channel = supabase
      .channel(`canvas-realtime-${pageId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'pages',
          filter: `id=eq.${pageId}`,
        },
        (payload: any) => {
          if (!payload.new || !payload.new.document_state) return;
          handleRemoteDocStateRef.current(payload.new.document_state as DocumentState);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [pageId, supabase]);

  const restoreVersion = useCallback((versionState: DocumentState) => {
    // Push current state to past before restoring, so we can undo the restore
    const currentState: DocumentState = { strokes, texts, audios, images, files, videos, shapes, connectors, pageTags, tagPins };
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
    setPageTags(versionState.pageTags || []);
    setTagPins(versionState.tagPins || []);
    
    isUndoingRef.current = true;
  }, [strokes, texts, audios, images, files, videos, shapes, connectors, pageTags, tagPins]);

  const undo = useCallback(() => {
    const currentState: DocumentState = { strokes, texts, audios, images, files, videos, shapes, connectors, pageTags, tagPins };
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
    setPageTags(stateToRestore.pageTags || []);
    setTagPins(stateToRestore.tagPins || []);
    
    isUndoingRef.current = true;
  }, [strokes, texts, audios, images, files, videos, shapes, connectors, pageTags, tagPins]);

  const redo = useCallback(() => {
    if (futureRef.current.length === 0) return;
    
    const currentState: DocumentState = { strokes, texts, audios, images, files, videos, shapes, connectors, pageTags, tagPins };
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
    setPageTags(stateToRestore.pageTags || []);
    setTagPins(stateToRestore.tagPins || []);
    
    isUndoingRef.current = true;
  }, [strokes, texts, audios, images, files, videos, shapes, connectors, pageTags, tagPins]);

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
    pageTags, setPageTags,
    tagPins, setTagPins,
    undo, redo,
    canUndo: past.length > 0 || (lastSavedStateRef.current !== null && JSON.stringify({ strokes, texts, audios, images, files, videos, shapes, connectors, pageTags, tagPins }) !== JSON.stringify(lastSavedStateRef.current)),
    canRedo: future.length > 0,
    pageVersions,
    fetchVersions,
    restoreVersion,
    saveManualSnapshot,
    flushSave
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

