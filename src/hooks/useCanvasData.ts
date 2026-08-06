import { useState, useEffect, useCallback } from "react";
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
        } else {
          setStrokes([]);
          setTexts([]);
          setAudios([]);
          setImages([]);
          setFiles([]);
          setVideos([]);
        }
        setLoading(false);
      }
    }
    
    loadData();
    
    return () => {
      isMounted = false;
    };
  }, [pageId, supabase]);

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

  return {
    loading,
    strokes, setStrokes,
    texts, setTexts,
    audios, setAudios,
    images, setImages,
    files, setFiles,
    videos, setVideos,
  };
}
