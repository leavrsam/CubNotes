import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { format } from 'date-fns';
import debounce from 'lodash/debounce';

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
  const [userId, setUserId] = useState<string | null>(null);
  const [supabase] = useState(() => createClient());
  const isFetching = useRef(false);

  const fetchNotebooks = useCallback(async () => {
    // Prevent concurrent fetches from causing cascading re-renders
    if (isFetching.current) return;
    isFetching.current = true;
    
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      setUserId(userData.user.id);

      // Fetch all hierarchy data — exclude document_state from pages to avoid huge payloads
      const [nbRes, secRes, pRes] = await Promise.all([
        supabase.from('notebooks').select('*').order('created_at', { ascending: true }),
        supabase.from('sections').select('*').order('sort_order', { ascending: true }),
        supabase.from('pages').select('id, section_id, title, date, is_journal_entry, created_at').order('created_at', { ascending: false }),
      ]);

      if (nbRes.error || secRes.error || pRes.error) {
        console.error('Error fetching data:', nbRes.error || secRes.error || pRes.error);
        return;
      }

      const pages = pRes.data as Page[];
      const sections = secRes.data.map(sec => ({
        ...sec,
        pages: pages.filter(p => p.section_id === sec.id),
      })) as Section[];

      const notebooksData = nbRes.data.map(nb => ({
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
        // We re-fetch to get the new structure including the DB-generated IDs
        // eslint-disable-next-line no-use-before-define
        await fetchNotebooks();
      } else {
        setNotebooks(notebooksData);
      }
    } catch (e) {
      console.error(e);
    } finally {
      isFetching.current = false;
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchNotebooks();

    // Setup realtime listeners — do NOT listen to 'pages' because
    // the canvas auto-save writes to pages every 1.5s, which would
    // trigger a full refetch and remount the canvas in an infinite loop.
    const channel = supabase.channel('schema-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notebooks' }, fetchNotebooks)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sections' }, fetchNotebooks)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchNotebooks, supabase]);

  const addNotebook = async (title: string, is_journal: boolean = false) => {
    if (!userId) return null;
    
    // Create the notebook
    const { data: nbData, error: nbError } = await supabase
      .from('notebooks')
      .insert({ user_id: userId, title, is_journal })
      .select()
      .single();
      
    if (nbError) {
      console.error("Error creating notebook:", nbError);
      return null;
    }
    
    let createdPageId: string | null = null;
    if (nbData) {
      // Auto-create a default section
      const { data: secData, error: secError } = await supabase
        .from('sections')
        .insert({ notebook_id: nbData.id, title: 'Main' })
        .select()
        .single();
        
      if (!secError && secData) {
        // Auto-create a default page
        const { data: pageData } = await supabase
          .from('pages')
          .insert({ section_id: secData.id, title: 'Untitled Page', document_state: {} })
          .select()
          .single();
        if (pageData) createdPageId = pageData.id;
      }
    }
    
    await fetchNotebooks();
    return { notebook: nbData, pageId: createdPageId };
  };

  const updateNotebook = async (id: string, title: string) => {
    await supabase.from('notebooks').update({ title }).eq('id', id);
    await fetchNotebooks();
  };

  const deleteNotebook = async (id: string) => {
    await supabase.from('notebooks').delete().eq('id', id);
    await fetchNotebooks();
  };

  const addSection = async (notebook_id: string, title: string) => {
    const { data, error } = await supabase.from('sections').insert({ notebook_id, title }).select().single();
    if (error) console.error("Error creating section:", error);
    await fetchNotebooks();
    return data as Section | null;
  };

  const updateSection = async (id: string, title: string) => {
    await supabase.from('sections').update({ title }).eq('id', id);
    await fetchNotebooks();
  };

  const deleteSection = async (id: string) => {
    await supabase.from('sections').delete().eq('id', id);
    await fetchNotebooks();
  };

  const addPage = async (section_id: string, title: string) => {
    const { data, error } = await supabase.from('pages').insert({ section_id, title, document_state: {} }).select().single();
    if (error) console.error("Error creating page:", error);
    await fetchNotebooks();
    return data as Page | null;
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedUpdatePage = useCallback(
    debounce(async (id: string, title: string) => {
      await supabase.from('pages').update({ title }).eq('id', id);
    }, 1000),
    [supabase]
  );

  const updatePage = useCallback((id: string, title: string) => {
    // Optimistic UI update
    setNotebooks(prev => prev.map(nb => ({
      ...nb,
      sections: nb.sections.map(sec => ({
        ...sec,
        pages: sec.pages.map(p => p.id === id ? { ...p, title } : p)
      }))
    })));
    
    // Debounced DB update
    debouncedUpdatePage(id, title);
  }, [debouncedUpdatePage]);

  const toggleJournalMode = async (id: string, is_journal: boolean) => {
    // Optimistic update
    setNotebooks(prev => prev.map(nb => nb.id === id ? { ...nb, is_journal } : nb));
    await supabase.from('notebooks').update({ is_journal }).eq('id', id);
    await fetchNotebooks();
  };

  const deletePage = async (id: string) => {
    await supabase.from('pages').delete().eq('id', id);
    await fetchNotebooks();
  };

  const movePage = async (pageId: string, targetSectionId: string) => {
    // Optimistic update
    setNotebooks(prev => {
      let movedPage: Page | null = null;
      // Remove from current section
      const updated = prev.map(nb => ({
        ...nb,
        sections: nb.sections.map(sec => {
          const found = sec.pages.find(p => p.id === pageId);
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
      return updated.map(nb => ({
        ...nb,
        sections: nb.sections.map(sec => {
          if (sec.id === targetSectionId) {
            return {
              ...sec,
              pages: [movedPage!, ...sec.pages]
            };
          }
          return sec;
        })
      }));
    });

    const { error } = await supabase.from('pages').update({ section_id: targetSectionId }).eq('id', pageId);
    if (error) {
      console.error("Error moving page:", error);
    }
    await fetchNotebooks();
  };

  const moveSection = async (sectionId: string, targetNotebookId: string) => {
    // Optimistic update
    setNotebooks(prev => {
      let movedSection: Section | null = null;
      const updated = prev.map(nb => {
        const found = nb.sections.find(s => s.id === sectionId);
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
      return updated.map(nb => {
        if (nb.id === targetNotebookId) {
          return {
            ...nb,
            sections: [...nb.sections, movedSection!]
          };
        }
        return nb;
      });
    });

    const { error } = await supabase.from('sections').update({ notebook_id: targetNotebookId }).eq('id', sectionId);
    if (error) {
      console.error("Error moving section:", error);
    }
    await fetchNotebooks();
  };

  return { 
    notebooks, loading, userId,
    addNotebook, updateNotebook, deleteNotebook, toggleJournalMode,
    addSection, updateSection, deleteSection, moveSection,
    addPage, updatePage, deletePage, movePage
  };
}
