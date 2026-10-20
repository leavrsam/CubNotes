import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { format } from 'date-fns';
import debounce from 'lodash/debounce';
import { 
  getCachedNotebooks, 
  setCachedNotebooks, 
  setCachedPageState, 
  getCachedTrash, 
  setCachedTrash, 
  removeCachedPage 
} from '@/lib/offlineStore';
import { v4 as uuidv4 } from 'uuid';
import toast from 'react-hot-toast';

export interface Page {
  id: string;
  section_id: string;
  title: string;
  date: string | null;
  is_journal_entry: boolean;
  created_at: string;
  deleted_at?: string | null;
  document_state?: any;
  isShared?: boolean;
}

export interface Section {
  id: string;
  notebook_id: string;
  title: string;
  sort_order: number;
  deleted_at?: string | null;
  pages: Page[];
  isShared?: boolean;
}

export interface Notebook {
  id: string;
  user_id: string;
  title: string;
  is_journal: boolean;
  deleted_at?: string | null;
  sections: Section[];
  isShared?: boolean;
  isOwner?: boolean;
}

export interface TrashItem {
  id: string;
  type: 'notebook' | 'section' | 'page';
  title: string;
  deletedAt: string; // ISO date string
  notebookId?: string;
  sectionId?: string;
  notebookTitle?: string;
  sectionTitle?: string;
  itemData: Notebook | Section | Page;
}

export function useNotebooks() {
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [trash, setTrash] = useState<TrashItem[]>([]);
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

      let user: any = (await supabase.auth.getUser())?.data?.user;
      if (!user) {
        user = (await supabase.auth.getSession())?.data?.session?.user;
      }
      if (!user) {
        const cached = await getCachedNotebooks();
        if (cached && cached.length > 0) {
          setNotebooks(cached);
          setLoading(false);
        }
        return;
      }
      setUserId(user.id);

      // Fetch all hierarchy data — exclude document_state from pages to avoid huge payloads
      let [nbRes, secRes, pRes]: [any, any, any] = await Promise.all([
        supabase.from('notebooks').select('*').order('created_at', { ascending: true }),
        supabase.from('sections').select('*').order('sort_order', { ascending: true }),
        supabase.from('pages').select('id, section_id, title, date, is_journal_entry, created_at, deleted_at').order('created_at', { ascending: false }),
      ]);

      // If pages.deleted_at does not exist on the database yet, retry pages query without it
      if (pRes.error && (pRes.error.message?.includes('deleted_at') || pRes.error.code === '42703')) {
        pRes = await supabase.from('pages').select('id, section_id, title, date, is_journal_entry, created_at').order('created_at', { ascending: false });
      }

      if (nbRes.error || secRes.error || pRes.error) {
        const err = nbRes.error || secRes.error || pRes.error;
        console.error('Error fetching data from Supabase:', err);
        toast.error(`Database error loading notes: ${err?.message || 'Check connection'}`, { id: 'db-fetch-error' });
        const cached = await getCachedNotebooks();
        if (cached && cached.length > 0) {
          setNotebooks(cached);
        }
        return;
      }

      // Fetch collaborations safely (gracefully handle if table not yet created)
      const sharedPageIds = new Set<string>();
      const sharedSectionIds = new Set<string>();
      const sharedNotebookIds = new Set<string>();

      try {
        const { data: collabData } = await supabase
          .from('collaborations')
          .select('id, resource_type, resource_id');
        if (collabData && Array.isArray(collabData)) {
          for (const c of collabData) {
            if (c.resource_type === 'page') sharedPageIds.add(c.resource_id);
            else if (c.resource_type === 'section') sharedSectionIds.add(c.resource_id);
            else if (c.resource_type === 'notebook') sharedNotebookIds.add(c.resource_id);
          }
        }
      } catch {
        // Safe fallback if table doesn't exist yet
      }

      // Merge server rows with in-flight optimistic creations and deletions, excluding soft-deleted items
      let pages = (((pRes.data || []) as Page[])).filter(p => !inFlightDeletedIdsRef.current.has(p.id) && !p.deleted_at);
      for (const [id, page] of inFlightNewPagesRef.current.entries()) {
        if (!pages.some(p => p.id === id) && !inFlightDeletedIdsRef.current.has(id)) {
          pages.unshift(page);
        }
      }

      let sectionsRaw = (((secRes.data || []) as any[])).filter(s => !inFlightDeletedIdsRef.current.has(s.id) && !s.deleted_at);
      for (const [id, sec] of inFlightNewSectionsRef.current.entries()) {
        if (!sectionsRaw.some(s => s.id === id) && !inFlightDeletedIdsRef.current.has(id)) {
          sectionsRaw.push(sec);
        }
      }

      let notebooksRaw = (((nbRes.data || []) as any[])).filter(nb => !inFlightDeletedIdsRef.current.has(nb.id) && !nb.deleted_at);
      for (const [id, nb] of inFlightNewNotebooksRef.current.entries()) {
        if (!notebooksRaw.some(n => n.id === id) && !inFlightDeletedIdsRef.current.has(id)) {
          notebooksRaw.push(nb);
        }
      }

      const sections = sectionsRaw.map(sec => {
        const secPages = pages.filter(p => p.section_id === sec.id).map(p => ({
          ...p,
          isShared: sharedPageIds.has(p.id) || sharedSectionIds.has(sec.id) || sharedNotebookIds.has(sec.notebook_id),
        }));
        return {
          ...sec,
          isShared: sharedSectionIds.has(sec.id) || sharedNotebookIds.has(sec.notebook_id) || secPages.some(p => p.isShared),
          pages: secPages,
        };
      }) as Section[];

      const notebooksData = notebooksRaw.map(nb => {
        const nbSections = sections.filter(s => s.notebook_id === nb.id);
        const isNbShared = sharedNotebookIds.has(nb.id) || nbSections.some(s => s.isShared);
        return {
          ...nb,
          isShared: isNbShared,
          isOwner: nb.user_id === user.id,
          sections: nbSections,
        };
      }) as Notebook[];

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
  }, [fetchNotebooks]);

  useEffect(() => {
    // 1. Instant zero-latency load from local IndexedDB cache
    getCachedNotebooks().then((cached) => {
      if (cached && cached.length > 0) {
        setNotebooks(cached);
        setLoading(false);
      }
    });

    // 2. Load Trash and purge items older than 30 days
    getCachedTrash().then((cachedTrash) => {
      if (cachedTrash && Array.isArray(cachedTrash)) {
        const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
        const valid = cachedTrash.filter((t: TrashItem) => new Date(t.deletedAt).getTime() > thirtyDaysAgo);
        setTrash(valid);
        if (valid.length !== cachedTrash.length) {
          setCachedTrash(valid).catch(e => console.warn(e));
        }
      }
    });

    // 3. Fetch fresh data from network
    fetchNotebooks();

    // Setup realtime listeners
    const channel = supabase.channel('schema-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notebooks' }, fetchNotebooks)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sections' }, fetchNotebooks)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'collaborations' }, fetchNotebooks)
      .subscribe();

    // Listen to auth state transitions (login, session hydration, token refresh)
    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUserId(session.user.id);
        fetchNotebooks();
      } else if (event === 'SIGNED_OUT') {
        setUserId(null);
        setNotebooks([]);
      }
    });

    return () => {
      supabase.removeChannel(channel);
      authSub.unsubscribe();
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

    const notebookToDelete = notebooks.find(nb => nb.id === id);

    // Instant local state update (0ms latency)
    setNotebooks(prev => {
      const updated = prev.filter(nb => nb.id !== id);
      setCachedNotebooks(updated).catch(e => console.warn(e));
      return updated;
    });

    if (notebookToDelete) {
      const newTrashItem: TrashItem = {
        id: notebookToDelete.id,
        type: 'notebook',
        title: notebookToDelete.title,
        deletedAt: new Date().toISOString(),
        itemData: notebookToDelete,
      };

      setTrash(prev => {
        const updated = [newTrashItem, ...prev.filter(t => t.id !== id)];
        setCachedTrash(updated).catch(e => console.warn(e));
        return updated;
      });
    }

    if (typeof navigator === 'undefined' || navigator.onLine) {
      (async () => {
        try {
          const { error } = await supabase
            .from('notebooks')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', id);
          if (error) {
            console.warn("Supabase notebook soft-delete update:", error.message);
          }
        } catch (err) {
          console.error("Error in deleteNotebook:", err);
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

    let sectionToDelete: Section | null = null;
    let parentNb: Notebook | null = null;

    for (const nb of notebooks) {
      const sec = (nb.sections || []).find(s => s.id === id);
      if (sec) {
        sectionToDelete = sec;
        parentNb = nb;
        break;
      }
    }

    // Instant local update (0ms latency)
    setNotebooks(prev => {
      const updated = prev.map(nb => ({
        ...nb,
        sections: (nb.sections || []).filter(sec => sec.id !== id)
      }));
      setCachedNotebooks(updated).catch(e => console.warn(e));
      return updated;
    });

    if (sectionToDelete) {
      const newTrashItem: TrashItem = {
        id: sectionToDelete.id,
        type: 'section',
        title: sectionToDelete.title,
        deletedAt: new Date().toISOString(),
        notebookId: sectionToDelete.notebook_id,
        notebookTitle: parentNb?.title,
        itemData: sectionToDelete,
      };

      setTrash(prev => {
        const updated = [newTrashItem, ...prev.filter(t => t.id !== id)];
        setCachedTrash(updated).catch(e => console.warn(e));
        return updated;
      });
    }

    if (typeof navigator === 'undefined' || navigator.onLine) {
      (async () => {
        try {
          const { error } = await supabase
            .from('sections')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', id);
          if (error) {
            console.warn("Supabase section soft-delete update:", error.message);
          }
        } catch (err) {
          console.error("Error in deleteSection:", err);
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

    let pageToDelete: Page | null = null;
    let parentNb: Notebook | null = null;
    let parentSec: Section | null = null;

    for (const nb of notebooks) {
      for (const sec of nb.sections || []) {
        const p = (sec.pages || []).find(page => page.id === id);
        if (p) {
          pageToDelete = p;
          parentSec = sec;
          parentNb = nb;
          break;
        }
      }
      if (pageToDelete) break;
    }

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

    if (pageToDelete) {
      const newTrashItem: TrashItem = {
        id: pageToDelete.id,
        type: 'page',
        title: pageToDelete.title,
        deletedAt: new Date().toISOString(),
        sectionId: pageToDelete.section_id,
        notebookId: parentNb?.id,
        notebookTitle: parentNb?.title,
        sectionTitle: parentSec?.title,
        itemData: pageToDelete,
      };

      setTrash(prev => {
        const updated = [newTrashItem, ...prev.filter(t => t.id !== id)];
        setCachedTrash(updated).catch(e => console.warn(e));
        return updated;
      });
    }

    if (typeof navigator === 'undefined' || navigator.onLine) {
      (async () => {
        try {
          const { error } = await supabase
            .from('pages')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', id);
          if (error) {
            console.warn("Supabase page soft-delete update:", error.message);
          }
        } catch (err) {
          console.error("Error in deletePage:", err);
        } finally {
          inFlightDeletedIdsRef.current.delete(id);
        }
      })();
    } else {
      inFlightDeletedIdsRef.current.delete(id);
    }
  };

  const restoreItem = async (trashId: string) => {
    const item = trash.find(t => t.id === trashId);
    if (!item) return false;

    // Remove from trash
    setTrash(prev => {
      const updated = prev.filter(t => t.id !== trashId);
      setCachedTrash(updated).catch(e => console.warn(e));
      return updated;
    });

    if (item.type === 'notebook') {
      const nb = { ...(item.itemData as Notebook), deleted_at: null };
      setNotebooks(prev => {
        const updated = [...prev, nb];
        setCachedNotebooks(updated).catch(e => console.warn(e));
        return updated;
      });

      if (typeof navigator === 'undefined' || navigator.onLine) {
        (async () => {
          try {
            await supabase.from('notebooks').upsert({
              id: nb.id,
              user_id: nb.user_id || userId || 'local-user',
              title: nb.title,
              is_journal: nb.is_journal,
              deleted_at: null
            });
            for (const sec of nb.sections || []) {
              await supabase.from('sections').upsert({
                id: sec.id,
                notebook_id: nb.id,
                title: sec.title,
                sort_order: sec.sort_order || 0,
                deleted_at: null
              });
              for (const page of sec.pages || []) {
                await supabase.from('pages').upsert({
                  id: page.id,
                  section_id: sec.id,
                  title: page.title,
                  date: page.date,
                  is_journal_entry: page.is_journal_entry,
                  deleted_at: null
                });
              }
            }
          } catch (e) {
            console.warn("Error restoring notebook to Supabase:", e);
          }
        })();
      }
      return true;
    }

    if (item.type === 'section') {
      const sec = { ...(item.itemData as Section), deleted_at: null };
      const targetNbId = item.notebookId;

      setNotebooks(prev => {
        const nbExists = prev.some(nb => nb.id === targetNbId);
        const actualNbId = nbExists ? targetNbId : prev[0]?.id;
        if (!actualNbId) return prev;

        const updated = prev.map(nb => {
          if (nb.id === actualNbId) {
            return {
              ...nb,
              sections: [...(nb.sections || []), { ...sec, notebook_id: actualNbId }]
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
            await supabase.from('sections').upsert({
              id: sec.id,
              notebook_id: sec.notebook_id,
              title: sec.title,
              sort_order: sec.sort_order || 0,
              deleted_at: null
            });
            for (const page of sec.pages || []) {
              await supabase.from('pages').upsert({
                id: page.id,
                section_id: sec.id,
                title: page.title,
                date: page.date,
                is_journal_entry: page.is_journal_entry,
                deleted_at: null
              });
            }
          } catch (e) {
            console.warn("Error restoring section to Supabase:", e);
          }
        })();
      }
      return true;
    }

    if (item.type === 'page') {
      const page = { ...(item.itemData as Page), deleted_at: null };
      const targetSecId = item.sectionId;

      setNotebooks(prev => {
        let actualSecId = targetSecId;
        let secExists = false;
        for (const nb of prev) {
          if (nb.sections?.some(s => s.id === actualSecId)) {
            secExists = true;
            break;
          }
        }

        if (!secExists) {
          actualSecId = prev[0]?.sections?.[0]?.id;
        }
        if (!actualSecId) return prev;

        const updated = prev.map(nb => ({
          ...nb,
          sections: (nb.sections || []).map(s => {
            if (s.id === actualSecId) {
              return {
                ...s,
                pages: [{ ...page, section_id: actualSecId! }, ...(s.pages || [])]
              };
            }
            return s;
          })
        }));
        setCachedNotebooks(updated).catch(e => console.warn(e));
        return updated;
      });

      if (typeof navigator === 'undefined' || navigator.onLine) {
        (async () => {
          try {
            await supabase.from('pages').upsert({
              id: page.id,
              section_id: page.section_id,
              title: page.title,
              date: page.date,
              is_journal_entry: page.is_journal_entry,
              deleted_at: null
            });
          } catch (e) {
            console.warn("Error restoring page to Supabase:", e);
          }
        })();
      }
      return true;
    }

    return false;
  };

  const permanentDeleteItem = async (trashId: string) => {
    const item = trash.find(t => t.id === trashId);
    if (!item) return;

    setTrash(prev => {
      const updated = prev.filter(t => t.id !== trashId);
      setCachedTrash(updated).catch(e => console.warn(e));
      return updated;
    });

    if (typeof navigator === 'undefined' || navigator.onLine) {
      try {
        if (item.type === 'notebook') {
          await supabase.from('notebooks').delete().eq('id', item.id);
        } else if (item.type === 'section') {
          await supabase.from('sections').delete().eq('id', item.id);
        } else if (item.type === 'page') {
          await supabase.from('pages').delete().eq('id', item.id);
          removeCachedPage(item.id).catch(e => console.warn(e));
        }
      } catch (err) {
        console.error("Error permanently deleting item:", err);
      }
    }
  };

  const emptyTrash = async () => {
    const itemsToDelete = [...trash];
    setTrash([]);
    setCachedTrash([]).catch(e => console.warn(e));

    for (const item of itemsToDelete) {
      if (typeof navigator === 'undefined' || navigator.onLine) {
        try {
          if (item.type === 'notebook') {
            await supabase.from('notebooks').delete().eq('id', item.id);
          } else if (item.type === 'section') {
            await supabase.from('sections').delete().eq('id', item.id);
          } else if (item.type === 'page') {
            await supabase.from('pages').delete().eq('id', item.id);
            removeCachedPage(item.id).catch(e => console.warn(e));
          }
        } catch (e) {
          console.warn("Error in emptyTrash delete:", e);
        }
      }
    }
  };

  const resurrectOrphanedPages = async (
    orphanedPages: { id: string; title: string; documentState: any }[],
    targetNotebookTitle: string = "CDO"
  ) => {
    let currentUserId = userId;
    if (!currentUserId) {
      const { data: userData } = await supabase.auth.getUser();
      currentUserId = userData?.user?.id || null;
      if (currentUserId) setUserId(currentUserId);
    }

    const nbId = uuidv4();
    const secId = uuidv4();
    const nowIso = new Date().toISOString();

    const recoveredPages: Page[] = orphanedPages.map(op => ({
      id: op.id,
      section_id: secId,
      title: op.title || "Recovered Note",
      date: null,
      is_journal_entry: false,
      created_at: nowIso,
      document_state: op.documentState || {}
    }));

    const recoveredSection: Section = {
      id: secId,
      notebook_id: nbId,
      title: "Recovered Notes",
      sort_order: 0,
      pages: recoveredPages
    };

    const recoveredNotebook: Notebook = {
      id: nbId,
      user_id: currentUserId || 'local-user',
      title: targetNotebookTitle,
      is_journal: false,
      sections: [recoveredSection]
    };

    // 1. Instant local update
    setNotebooks(prev => {
      const updated = [recoveredNotebook, ...prev];
      setCachedNotebooks(updated).catch(e => console.warn(e));
      return updated;
    });

    // 2. Cache document states
    for (const op of orphanedPages) {
      if (op.documentState) {
        setCachedPageState(op.id, op.documentState, false).catch(e => console.warn(e));
      }
    }

    // 3. Sync to Supabase
    if (currentUserId && (typeof navigator === 'undefined' || navigator.onLine)) {
      try {
        await supabase.from('notebooks').insert({
          id: nbId,
          user_id: currentUserId,
          title: targetNotebookTitle,
          is_journal: false
        });

        await supabase.from('sections').insert({
          id: secId,
          notebook_id: nbId,
          title: "Recovered Notes",
          sort_order: 0
        });

        for (const p of recoveredPages) {
          await supabase.from('pages').insert({
            id: p.id,
            section_id: secId,
            title: p.title,
            document_state: p.document_state || {}
          });
        }
      } catch (err) {
        console.error("Error syncing resurrected notebook to Supabase:", err);
      }
    }

    return { notebook: recoveredNotebook, firstPageId: recoveredPages[0]?.id };
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
    addPage, updatePage, deletePage, movePage,
    trash, restoreItem, permanentDeleteItem, emptyTrash, resurrectOrphanedPages,
    refreshNotebooks: fetchNotebooks
  };
}
