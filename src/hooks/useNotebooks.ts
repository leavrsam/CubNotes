import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { format } from 'date-fns';

export interface Page {
  id: string;
  section_id: string;
  title: string;
  date: string | null;
  is_journal_entry: boolean;
  document_state: any;
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
  const supabase = createClient();

  const fetchNotebooks = useCallback(async () => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      setUserId(userData.user.id);

      // Fetch all hierarchy data
      const [nbRes, secRes, pRes] = await Promise.all([
        supabase.from('notebooks').select('*').order('created_at', { ascending: true }),
        supabase.from('sections').select('*').order('sort_order', { ascending: true }),
        supabase.from('pages').select('*').order('created_at', { ascending: false }),
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
        await fetchNotebooks();
      } else {
        setNotebooks(notebooksData);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchNotebooks();

    // Setup realtime listeners
    const channel = supabase.channel('schema-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notebooks' }, fetchNotebooks)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sections' }, fetchNotebooks)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pages' }, fetchNotebooks)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchNotebooks, supabase]);

  const addNotebook = async (title: string, is_journal: boolean = false) => {
    if (!userId) return;
    await supabase.from('notebooks').insert({ user_id: userId, title, is_journal });
  };

  const addSection = async (notebook_id: string, title: string) => {
    await supabase.from('sections').insert({ notebook_id, title });
  };

  const addPage = async (section_id: string, title: string) => {
    await supabase.from('pages').insert({ section_id, title, document_state: {} });
  };

  return { notebooks, loading, addNotebook, addSection, addPage, userId };
}
