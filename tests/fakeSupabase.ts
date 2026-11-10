/**
 * In-memory stand-in for the Supabase RPCs used by /api/jarvis. It behaves
 * like the SQL functions in supabase/user_api_keys.sql: pages live in
 * `pages.document_state`, which is also what the canvas editor loads.
 */
export interface FakePage {
  id: string;
  title: string;
  notebook: string;
  created_at: string;
  document_state: any;
}

export function createFakeDb(pages: FakePage[]) {
  const db = { pages: pages.map((p) => ({ ...p, document_state: structuredClone(p.document_state) })), failNextUpdate: false };

  const findPage = (title: string, notebook: string | null) => {
    const t = title.toLowerCase();
    const candidates = db.pages.filter(
      (p) =>
        (!notebook || p.notebook.toLowerCase() === notebook.toLowerCase()) &&
        (p.title.toLowerCase() === t || p.title.toLowerCase().includes(t))
    );
    // Same order as the SQL: exact title first, then newest first
    candidates.sort(
      (a, b) =>
        Number(b.title.toLowerCase() === t) - Number(a.title.toLowerCase() === t) ||
        b.created_at.localeCompare(a.created_at)
    );
    return candidates[0] || null;
  };

  const rpc = async (fn: string, args: any) => {
    switch (fn) {
      case "jarvis_read_user_page": {
        const p = findPage(args.p_title, args.p_notebook_name);
        return {
          data: p
            ? [{ page_id: p.id, title: p.title, date: null, created_at: p.created_at, notebook_title: p.notebook, content: "", raw_document_state: structuredClone(p.document_state) }]
            : [],
          error: null,
        };
      }
      case "jarvis_get_user_pages": {
        const q = String(args.p_search || "").toLowerCase();
        const nb = args.p_notebook_name as string | null;
        const rows = db.pages
          .filter((p) => (!nb || p.notebook.toLowerCase() === nb.toLowerCase()) && (!q || p.title.toLowerCase().includes(q)))
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .slice(0, args.p_limit || 15)
          .map((p) => ({ page_id: p.id, title: p.title, date: null, created_at: p.created_at, notebook_title: p.notebook, section_title: "Inbox", content_preview: "", raw_document_state: structuredClone(p.document_state) }));
        return { data: rows, error: null };
      }
      case "jarvis_update_page_document_state": {
        if (db.failNextUpdate) {
          db.failNextUpdate = false;
          return { data: false, error: null };
        }
        const p = db.pages.find((x) => x.id === args.p_page_id);
        if (!p) return { data: false, error: null };
        p.document_state = structuredClone(args.p_document_state);
        return { data: true, error: null };
      }
      case "jarvis_append_or_create_page": {
        const id = `page-${db.pages.length + 1}`;
        const html = args.p_is_list ? `<p>${args.p_text.startsWith("- ") ? args.p_text : `- ${args.p_text}`}</p>` : `<p>${args.p_text}</p>`;
        const clean = args.p_text.replace(/^[-*•]\s*(\[[ xX]?\]\s*)?/, "");
        const doc = { texts: [{ id: "t-new", x: 64, y: 280, width: 480, content: html, itemsMeta: [{ text: clean, addedBy: args.p_added_by, addedByOwner: args.p_added_by_owner }] }] };
        db.pages.push({ id, title: args.p_title, notebook: args.p_notebook_name || "Notebook", created_at: new Date().toISOString(), document_state: doc });
        return { data: { success: true, action: "created", page_id: id, title: args.p_title, notebook: args.p_notebook_name, document_state: doc }, error: null };
      }
      default:
        return { data: null, error: { message: `rpc ${fn} not faked` } };
    }
  };

  // supabase.from("user_api_keys").select(...).eq(...).maybeSingle() / .update(...).eq(...).then(...)
  const from = (table: string) => {
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      limit: () => chain,
      update: () => chain,
      maybeSingle: async () => (table === "user_api_keys" ? { data: { id: "key-1", user_id: "user-1" }, error: null } : { data: null, error: null }),
      then: (res: any, rej: any) => Promise.resolve({ data: null, error: null }).then(res, rej),
    };
    return chain;
  };

  return { db, client: { rpc, from } };
}
