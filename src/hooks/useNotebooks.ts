import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { format } from 'date-fns';
import debounce from 'lodash/debounce';
import { getCachedNotebooks, setCachedNotebooks, setCachedPageState } from '@/lib/offlineStore';
import { v4 as uuidv4 } from 'uuid';
import toast from 'react-hot-toast';

export interface Page {
  id: string;
  section_id: string;
  title: string;
  date: string | null;
  is_journal_entry: boolean;
  created_at: string;
  document_state?: any;
}

export interface Section {
  id: string;
  notebook_id: string;
  title: string;
  sort_order: number;
  pages: Page[];
}

export interface Notebook {
  id: string;
  user_id: string;
  title: string;
  is_journal: boolean;
  sections: Section[];
}

export function useNotebooks() {
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [supabase] = useState(() => createClient());
  const isFetching = useRef(false);

  // In-flight optimistic mutation trackers to prevent background fetches from overwriting local state
  const inFlightNewNotebooksRef = useRef<Map<string, Notebook>>(new Map());
  const inFlightNewSectionsRef = useRef<Map<string, Section>>(new Map());
  const inFlightNewPagesRef = useRef<Map<string, Page>>(new Map());
  const inFlightDeletedIdsRef = useRef<Set<string>>(new Set());

  // Monitor network status
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const updateOnlineStatus = () => {
      const offline = !navigator.onLine;
      setIsOffline(offline);
      if (!offline) {
        // Reconnected to internet, fetch fresh data
        fetchNotebooks();
      }
    };

    setIsOffline(!navigator.onLine);
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }, []);

  const fetchNotebooks = useCallback(async () => {
    // Prevent concurrent fetches from causing cascading re-renders
    if (isFetching.current) return;
    isFetching.current = true;
    
    try {
      // If offline, read immediately from local IndexedDB cache
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        const cached = await getCachedNotebooks();
        if (cached && cached.length > 0) {
          setNotebooks(cached);
          setLoading(false);
          isFetching.current = false;
          return;
        }
      }

      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) {
        const cached = await getCachedNotebooks();
        if (cached && cached.length > 0) {
          setNotebooks(cached);
          setLoading(false);
        }
        return;
      }
      setUserId(userData.user.id);

      // Fetch all hierarchy data — exclude document_state from pages to avoid huge payloads
      const [nbRes, secRes, pRes] = await Promise.all([
        supabase.from('notebooks').select('*').order('created_at', { ascending: true }),
        supabase.from('sections').select('*').order('sort_order', { ascending: true }),
        supabase.from('pages').select('id, section_id, title, date, is_journal_entry, created_at').order('created_at', { ascending: false }),
      ]);

      if (nbRes.error || secRes.error || pRes.error) {
        console.error('Error fetching data from Supabase:', nbRes.error || secRes.error || pRes.error);
        const cached = await getCachedNotebooks();
        if (cached && cached.length > 0) {
          setNotebooks(cached);
        }
        return;
      }

      // Merge server rows with in-flight optimistic creations and deletions
      let pages = (pRes.data as Page[]).filter(p => !inFlightDeletedIdsRef.current.has(p.id));
      for (const [id, page] of inFlightNewPagesRef.current.entries()) {
        if (!pages.some(p => p.id === id) && !inFlightDeletedIdsRef.current.has(id)) {
          pages.unshift(page);
        }
      }

      let sectionsRaw = (secRes.data as any[]).filter(s => !inFlightDeletedIdsRef.current.has(s.id));
      for (const [id, sec] of inFlightNewSectionsRef.current.entries()) {
        if (!sectionsRaw.some(s => s.id === id) && !inFlightDeletedIdsRef.current.has(id)) {
          sectionsRaw.push(sec);
        }
      }

      let notebooksRaw = (nbRes.data as any[]).filter(nb => !inFlightDeletedIdsRef.current.has(nb.id));
      for (const [id, nb] of inFlightNewNotebooksRef.current.entries()) {
        if (!notebooksRaw.some(n => n.id === id) && !inFlightDeletedIdsRef.current.has(id)) {
          notebooksRaw.push(nb);
        }
      }

      const sections = sectionsRaw.map(sec => ({
        ...sec,
        pages: pages.filter(p => p.section_id === sec.id),
      })) as Section[];

      const notebooksData = notebooksRaw.map(nb => ({
        ...nb,
        sections: sections.filter(s => s.notebook_id === nb.id),
      })) as Notebook[];

      // Journal Auto-Generation Logic
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      let needsRefresh = false;

      for (const nb of notebooksData) {
        if (nb.is_journal) {
          const hasTodayPage = nb.sections.some(sec => 
            sec.pages.some(p => p.date === todayStr)
          );

          if (!hasTodayPage) {
            let targetSectionId = nb.sections[0]?.id;
            
            if (!targetSectionId) {
              // Create a default section
              const { data: newSec } = await supabase.from('sections').insert({
                notebook_id: nb.id,
                title: 'Entries'
              }).select().single();
              if (newSec) targetSectionId = newSec.id;
            }

            if (targetSectionId) {
              await supabase.from('pages').insert({
                section_id: targetSectionId,
                title: format(new Date(), "EEEE, MMMM do"),
                date: todayStr,
                is_journal_entry: true,
                document_state: {}
              });
              needsRefresh = true;
            }
          }
        }
      }

      if (needsRefresh) {
        // eslint-disable-next-line no-use-before-define
        await fetchNotebooks();
      } else {
        setNotebooks(notebooksData);
        // Persist fresh notebooks to local IndexedDB
        setCachedNotebooks(notebooksData).catch(err => console.warn("Failed to cache notebooks:", err));
      }
    } catch (e) {
      console.warn("Network request failed, falling back to local offline cache:", e);
      const cached = await getCachedNotebooks();
      if (cached && cached.length > 0) {
        setNotebooks(cached);
      }
    } finally {
      isFetching.current = false;
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    // 1. Instant zero-latency load from local IndexedDB cache
    getCachedNotebooks().then((cached) => {
      if (cached && cached.length > 0) {
        setNotebooks(cached);
        setLoading(false);
      }
    });

    // 2. Fetch fresh data from network
    fetchNotebooks();

    // Setup realtime listeners
    const channel = supabase.channel('schema-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notebooks' }, fetchNotebooks)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sections' }, fetchNotebooks)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchNotebooks, supabase]);

  const addNotebook = async (title: string, is_journal: boolean = false) => {
    let currentUserId = userId;
    if (!currentUserId) {
      const { data: userData } = await supabase.auth.getUser();
      currentUserId = userData?.user?.id || null;
      if (currentUserId) setUserId(currentUserId);
    }

    const newNbId = uuidv4();
    const newSecId = uuidv4();
    const newPageId = uuidv4();
    const nowIso = new Date().toISOString();
    const todayStr = format(new Date(), 'yyyy-MM-dd');

    const newPage: Page = {
      id: newPageId,
      section_id: newSecId,
      title: is_journal ? format(new Date(), "EEEE, MMMM do") : 'Untitled Page',
      date: is_journal ? todayStr : null,
      is_journal_entry: is_journal,
      created_at: nowIso,
      document_state: {}
    };

    const newSec: Section = {
      id: newSecId,
      notebook_id: newNbId,
      title: is_journal ? 'Entries' : 'Main',
      sort_order: 0,
      pages: [newPage]
    };

    const newNb: Notebook = {
      id: newNbId,
      user_id: currentUserId || 'local-user',
      title,
      is_journal,
      sections: [newSec]
    };

    inFlightNewNotebooksRef.current.set(newNbId, newNb);
    inFlightNewSectionsRef.current.set(newSecId, newSec);
    inFlightNewPagesRef.current.set(newPageId, newPage);

    // Instant local state update (0ms latency)
    setNotebooks(prev => {
      const updated = [...prev, newNb];
      setCachedNotebooks(updated).catch(e => console.warn(e));
      return updated;
    });

    setCachedPageState(newPageId, { strokes: [], texts: [], audios: [], images: [], files: [], videos: [] }, false).catch(e => console.warn(e));

    // Background sync to database
    if (currentUserId && (typeof navigator === 'undefined' || navigator.onLine)) {
      (async () => {
        try {
          const { error: nbError } = await supabase
            .from('notebooks')
            .insert({ id: newNbId, user_id: currentUserId, title, is_journal });
          if (nbError) throw nbError;

          const { error: secError } = await supabase
            .from('sections')
            .insert({ id: newSecId, notebook_id: newNbId, title: newSec.title, sort_order: 0 });
          if (secError) throw secError;

          const { error: pageError } = await supabase
            .from('pages')
            .insert({
              id: newPageId,
              section_id: newSecId,
              title: newPage.title,
              date: newPage.date,
              is_journal_entry: newPage.is_journal_entry,
              document_state: {}
            });
          if (pageError) throw pageError;
        } catch (err) {
          console.error("Error creating notebook in Supabase:", err);
          toast.error("Failed to sync new notebook to cloud");
        } finally {
          inFlightNewNotebooksRef.current.delete(newNbId);
          inFlightNewSectionsRef.current.delete(newSecId);
          inFlightNewPagesRef.current.delete(newPageId);
        }
      })();
    } else {
      inFlightNewNotebooksRef.current.delete(newNbId);
      inFlightNewSectionsRef.current.delete(newSecId);
      inFlightNewPagesRef.current.delete(newPageId);
    }

    return { notebook: newNb, pageId: newPageId };
  };

  const updateNotebook = async (id: string, title: string) => {
    // Instant local state update
    setNotebooks(prev => {
      const updated = prev.map(nb => nb.id === id ? { ...nb, title } : nb);
      setCachedNotebooks(updated).catch(e => console.warn(e));
      return updated;
    });

    if (typeof navigator === 'undefined' || navigator.onLine) {
      const { error } = await supabase.from('notebooks').update({ title }).eq('id', id);
      if (error) {
        console.error("Error updating notebook in Supabase:", error);
        fetchNotebooks();
      }
    }
  };

  const deleteNotebook = async (id: string) => {
    inFlightDeletedIdsRef.current.add(id);

    // Instant local state update (0ms latency)
    setNotebooks(prev => {
      const updated = prev.filter(nb => nb.id !== id);
      setCachedNotebooks(updated).catch(e => console.warn(e));
      return updated;
    });

    if (typeof navigator === 'undefined' || navigator.onLine) {
      (async () => {
        try {
          const { error } = await supabase.from('notebooks').delete().eq('id', id);
          if (error) {
            console.error("Error deleting notebook from Supabase:", error);
            fetchNotebooks();
          }
        } catch (err) {
          console.error("Error in deleteNotebook:", err);
          fetchNotebooks();
        } finally {
          inFlightDeletedIdsRef.current.delete(id);
        }
      })();
    } else {
      inFlightDeletedIdsRef.current.delete(id);
    }
  };

  const addSection = async (notebook_id: string, title: string) => {
    const newSecId = uuidv4();
    const newSection: Section = {
      id: newSecId,
      notebook_id,
      title: title || "New Folder",
      sort_order: 0,
      pages: []
    };

    inFlightNewSectionsRef.current.set(newSecId, newSection);

    // Instant local state update (0ms latency)
    setNotebooks(prev => {
      const updated = prev.map(nb => {
        if (nb.id === notebook_id) {
          return {
            ...nb,
            sections: [...(nb.sections || []), newSection]
          };
        }
        return nb;
      });
      setCachedNotebooks(updated).catch(e => console.warn(e));
      return updated;
    });

    if (typeof navigator === 'undefined' || navigator.onLine) {
      (async () => {
        try {
          const { error } = await supabase.from('sections').insert({
            id: newSecId,
            notebook_id,
            title: newSection.title,
            sort_order: 0
          });
          if (error) {
            console.error("Error creating section:", error);
            fetchNotebooks();
          }
        } catch (err) {
          console.error("Error in addSection:", err);
          fetchNotebooks();
        } finally {
          inFlightNewSectionsRef.current.delete(newSecId);
        }
      })();
    } else {
      inFlightNewSectionsRef.current.delete(newSecId);
    }

    return newSection;
  };

  const updateSection = async (id: string, title: string) => {
    // Instant local update
    setNotebooks(prev => {
      const updated = prev.map(nb => ({
        ...nb,
        sections: (nb.sections || []).map(sec => sec.id === id ? { ...sec, title } : sec)
      }));
      setCachedNotebooks(updated).catch(e => console.warn(e));
      return updated;
    });

    if (typeof navigator === 'undefined' || navigator.onLine) {
      const { error } = await supabase.from('sections').update({ title }).eq('id', id);
      if (error) {
        console.error("Error updating section:", error);
        fetchNotebooks();
      }
    }
  };

  const deleteSection = async (id: string) => {
    inFlightDeletedIdsRef.current.add(id);

    // Instant local update (0ms latency)
    setNotebooks(prev => {
      const updated = prev.map(nb => ({
        ...nb,
        sections: (nb.sections || []).filter(sec => sec.id !== id)
      }));
      setCachedNotebooks(updated).catch(e => console.warn(e));
      return updated;
    });

    if (typeof navigator === 'undefined' || navigator.onLine) {
      (async () => {
        try {
          const { error } = await supabase.from('sections').delete().eq('id', id);
          if (error) {
            console.error("Error deleting section from Supabase:", error);
            fetchNotebooks();
          }
        } catch (err) {
          console.error("Error in deleteSection:", err);
          fetchNotebooks();
        } finally {
          inFlightDeletedIdsRef.current.delete(id);
        }
      })();
    } else {
      inFlightDeletedIdsRef.current.delete(id);
    }
  };

  const addPage = async (section_id: string, title: string) => {
    const newPageId = uuidv4();
    const newPage: Page = {
      id: newPageId,
      section_id,
      title: title || "Untitled Note",
      date: null,
      is_journal_entry: false,
      created_at: new Date().toISOString(),
      document_state: {}
    };

    inFlightNewPagesRef.current.set(newPageId, newPage);

    // Instant local state update (0ms latency)
    setNotebooks(prev => {
      const updated = prev.map(nb => ({
        ...nb,
        sections: (nb.sections || []).map(sec => {
          if (sec.id === section_id) {
            return {
              ...sec,
              pages: [newPage, ...(sec.pages || [])]
            };
          }
          return sec;
        })
      }));
      setCachedNotebooks(updated).catch(e => console.warn(e));
      return updated;
    });

    setCachedPageState(newPageId, { strokes: [], texts: [], audios: [], images: [], files: [], videos: [] }, false).catch(e => console.warn(e));

    if (typeof navigator === 'undefined' || navigator.onLine) {
      (async () => {
        try {
          const { error } = await supabase.from('pages').insert({
            id: newPageId,
            section_id,
            title: newPage.title,
            document_state: {}
          });
          if (error) {
            console.error("Error creating page:", error);
            fetchNotebooks();
          }
        } catch (err) {
          console.error("Error in addPage:", err);
          fetchNotebooks();
        } finally {
          inFlightNewPagesRef.current.delete(newPageId);
        }
      })();
    } else {
      inFlightNewPagesRef.current.delete(newPageId);
    }

    return newPage;
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedUpdatePage = useCallback(
    debounce(async (id: string, title: string) => {
      await supabase.from('pages').update({ title }).eq('id', id);
    }, 1000),
    [supabase]
  );

  const updatePage = useCallback((id: string, title: string) => {
    // Optimistic UI update (0ms latency)
    setNotebooks(prev => {
      const updated = prev.map(nb => ({
        ...nb,
        sections: (nb.sections || []).map(sec => ({
          ...sec,
          pages: (sec.pages || []).map(p => p.id === id ? { ...p, title } : p)
        }))
      }));
      setCachedNotebooks(updated).catch(e => console.warn(e));
      return updated;
    });
    
    // Debounced DB update
    debouncedUpdatePage(id, title);
  }, [debouncedUpdatePage]);

  const toggleJournalMode = async (id: string, is_journal: boolean) => {
    // Optimistic update
    setNotebooks(prev => {
      const updated = prev.map(nb => nb.id === id ? { ...nb, is_journal } : nb);
      setCachedNotebooks(updated).catch(e => console.warn(e));
      return updated;
    });
    if (typeof navigator === 'undefined' || navigator.onLine) {
      const { error } = await supabase.from('notebooks').update({ is_journal }).eq('id', id);
      if (error) {
        console.error("Error updating journal mode:", error);
        fetchNotebooks();
      }
    }
  };

  const togglePageJournalMode = async (pageId: string, is_journal_entry: boolean) => {
    // Optimistic update
    setNotebooks(prev => {
      const updated = prev.map(nb => ({
        ...nb,
        sections: (nb.sections || []).map(sec => ({
          ...sec,
          pages: (sec.pages || []).map(p => p.id === pageId ? { ...p, is_journal_entry } : p)
        }))
      }));
      setCachedNotebooks(updated).catch(e => console.warn(e));
      return updated;
    });
    if (typeof navigator === 'undefined' || navigator.onLine) {
      const { error } = await supabase.from('pages').update({ is_journal_entry }).eq('id', pageId);
      if (error) {
        console.error("Error updating page journal mode:", error);
        fetchNotebooks();
      }
    }
  };

  const deletePage = async (id: string) => {
    inFlightDeletedIdsRef.current.add(id);

    // Instant local UI update (0ms latency)
    setNotebooks(prev => {
      const updated = prev.map(nb => ({
        ...nb,
        sections: (nb.sections || []).map(sec => ({
          ...sec,
          pages: (sec.pages || []).filter(p => p.id !== id)
        }))
      }));
      setCachedNotebooks(updated).catch(e => console.warn(e));
      return updated;
    });

    if (typeof navigator === 'undefined' || navigator.onLine) {
      (async () => {
        try {
          const { error } = await supabase.from('pages').delete().eq('id', id);
          if (error) {
            console.error("Error deleting page from Supabase:", error);
            fetchNotebooks();
          }
        } catch (err) {
          console.error("Error in deletePage:", err);
          fetchNotebooks();
        } finally {
          inFlightDeletedIdsRef.current.delete(id);
        }
      })();
    } else {
      inFlightDeletedIdsRef.current.delete(id);
    }
  };

  const movePage = async (pageId: string, targetSectionId: string) => {
    // Optimistic update
    setNotebooks(prev => {
      let movedPage: Page | null = null;
      // Remove from current section
      const updated = prev.map(nb => ({
        ...nb,
        sections: (nb.sections || []).map(sec => {
          const found = (sec.pages || []).find(p => p.id === pageId);
          if (found) {
            movedPage = { ...found, section_id: targetSectionId };
            return {
              ...sec,
              pages: sec.pages.filter(p => p.id !== pageId)
            };
          }
          return sec;
        })
      }));
      if (!movedPage) return prev;
      // Add to target section
      const finalUpdated = updated.map(nb => ({
        ...nb,
        sections: (nb.sections || []).map(sec => {
          if (sec.id === targetSectionId) {
            return {
              ...sec,
              pages: [movedPage!, ...(sec.pages || [])]
            };
          }
          return sec;
        })
      }));
      setCachedNotebooks(finalUpdated).catch(e => console.warn(e));
      return finalUpdated;
    });

    if (typeof navigator === 'undefined' || navigator.onLine) {
      const { error } = await supabase.from('pages').update({ section_id: targetSectionId }).eq('id', pageId);
      if (error) {
        console.error("Error moving page:", error);
        fetchNotebooks();
      }
    }
  };

  const moveSection = async (sectionId: string, targetNotebookId: string) => {
    // Optimistic update
    setNotebooks(prev => {
      let movedSection: Section | null = null;
      const updated = prev.map(nb => {
        const found = (nb.sections || []).find(s => s.id === sectionId);
        if (found) {
          movedSection = { ...found, notebook_id: targetNotebookId };
          return {
            ...nb,
            sections: nb.sections.filter(s => s.id !== sectionId)
          };
        }
        return nb;
      });
      if (!movedSection) return prev;
      const finalUpdated = updated.map(nb => {
        if (nb.id === targetNotebookId) {
          return {
            ...nb,
            sections: [...(nb.sections || []), movedSection!]
          };
        }
        return nb;
      });
      setCachedNotebooks(finalUpdated).catch(e => console.warn(e));
      return finalUpdated;
    });

    if (typeof navigator === 'undefined' || navigator.onLine) {
      const { error } = await supabase.from('sections').update({ notebook_id: targetNotebookId }).eq('id', sectionId);
      if (error) {
        console.error("Error moving section:", error);
        fetchNotebooks();
      }
    }
  };

  return { 
    notebooks, loading, isOffline, userId,
    addNotebook, updateNotebook, deleteNotebook, toggleJournalMode, togglePageJournalMode,
    addSection, updateSection, deleteSection, moveSection,
    addPage, updatePage, deletePage, movePage
  };
}
