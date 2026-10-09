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
  const lastSavedStateRef = useRef<DocumentState | null>(null);
  const isUndoingRef = useRef(false);

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
        setPast(prev => [...prev, lastSavedStateRef.current!]);
        lastSavedStateRef.current = currentState;
        setFuture([]); // Clear future on new action
      }
    }, 500);
    
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

  // Save version snapshot to DB (less frequently)
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
      
      try {
        await supabase
          .from('page_versions')
          .insert({ page_id: pageId, document_state: state });
      } catch (e) {
        // Silently fail if table doesn't exist yet
        console.warn("Could not save page version:", e);
      }
    }, 60000), // Save version after 1 minute of inactivity
    [pageId, supabase]
  );

  useEffect(() => {
    if (!loading) {
      saveToSupabase(strokes, texts, audios, images, files, videos, shapes, connectors);
      saveVersionToSupabase(strokes, texts, audios, images, files, videos, shapes, connectors);
    }
    
    return () => {
      saveToSupabase.flush();
      saveVersionToSupabase.flush();
    };
  }, [strokes, texts, audios, images, files, videos, shapes, connectors, loading, saveToSupabase, saveVersionToSupabase]);

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
    setPast(prev => [...prev, currentState]);
    lastSavedStateRef.current = versionState;
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
    
    let currentPast = past;
    let currentLastSaved = lastSavedStateRef.current;
    
    if (isUncommitted) {
      currentPast = [...past, lastSavedStateRef.current!];
      currentLastSaved = currentState;
      setPast(currentPast);
    }
    
    if (currentPast.length === 0) return;
    
    const newPast = [...currentPast];
    const stateToRestore = newPast.pop()!;
    
    setFuture(prev => [currentLastSaved!, ...prev]);
    setPast(newPast);
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
  }, [past, strokes, texts, audios, images, files, videos, shapes, connectors]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    
    const newFuture = [...future];
    const stateToRestore = newFuture.shift()!; // pop from start
    
    setPast(prev => [...prev, lastSavedStateRef.current!]);
    setFuture(newFuture);
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
  }, [future]);

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
    restoreVersion
  };
}
