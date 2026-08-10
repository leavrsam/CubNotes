import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import debounce from "lodash/debounce";
import { Stroke, TextNode, AudioNode, ImageNode, FileNode, VideoNode, DocumentState } from "@/components/CustomCanvas";

export function useCanvasData(pageId: string) {
  const [loading, setLoading] = useState(true);
  const [supabase] = useState(() => createClient());

  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [texts, setTexts] = useState<TextNode[]>([]);
  const [audios, setAudios] = useState<AudioNode[]>([]);
  const [images, setImages] = useState<ImageNode[]>([]);
  const [files, setFiles] = useState<FileNode[]>([]);
  const [videos, setVideos] = useState<VideoNode[]>([]);

  // History state
  const [past, setPast] = useState<DocumentState[]>([]);
  const [future, setFuture] = useState<DocumentState[]>([]);
  const lastSavedStateRef = useRef<DocumentState | null>(null);
  const isUndoingRef = useRef(false);

  // Load state from DB
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      setLoading(true);
      const { data, error } = await supabase
        .from("pages")
        .select("document_state")
        .eq("id", pageId)
        .single();
        
      if (error) {
        console.error("Failed to load canvas state:", error);
      } 
      
      if (isMounted) {
        if (data?.document_state) {
          const state = data.document_state as DocumentState;
          setStrokes(state.strokes || []);
          setTexts(state.texts || []);
          setAudios(state.audios || []);
          setImages(state.images || []);
          setFiles(state.files || []);
          setVideos(state.videos || []);
          lastSavedStateRef.current = {
            strokes: state.strokes || [],
            texts: state.texts || [],
            audios: state.audios || [],
            images: state.images || [],
            files: state.files || [],
            videos: state.videos || []
          };
        } else {
          setStrokes([]);
          setTexts([]);
          setAudios([]);
          setImages([]);
          setFiles([]);
          setVideos([]);
          lastSavedStateRef.current = { strokes: [], texts: [], audios: [], images: [], files: [], videos: [] };
        }
        setLoading(false);
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
      const currentState: DocumentState = { strokes, texts, audios, images, files, videos };
      
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
  }, [strokes, texts, audios, images, files, videos, loading]);

  // Save state to DB
  const saveToSupabase = useCallback(
    // eslint-disable-next-line react-hooks/exhaustive-deps
    debounce(async (
      newStrokes: Stroke[], newTexts: TextNode[], newAudios: AudioNode[],
      newImages: ImageNode[], newFiles: FileNode[], newVideos: VideoNode[]
    ) => {
      const state: DocumentState = { 
        strokes: newStrokes, texts: newTexts, audios: newAudios,
        images: newImages, files: newFiles, videos: newVideos
      };
      await supabase
        .from('pages')
        .update({ document_state: state })
        .eq('id', pageId);
    }, 1500),
    [pageId, supabase]
  );

  useEffect(() => {
    if (!loading) {
      saveToSupabase(strokes, texts, audios, images, files, videos);
    }
    
    return () => {
      saveToSupabase.flush();
    };
  }, [strokes, texts, audios, images, files, videos, loading, saveToSupabase]);

  const undo = useCallback(() => {
    const currentState: DocumentState = { strokes, texts, audios, images, files, videos };
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
    
    isUndoingRef.current = true;
  }, [past, strokes, texts, audios, images, files, videos]);

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
    undo, redo,
    canUndo: past.length > 0 || (lastSavedStateRef.current !== null && JSON.stringify({ strokes, texts, audios, images, files, videos }) !== JSON.stringify(lastSavedStateRef.current)),
    canRedo: future.length > 0,
  };
}
