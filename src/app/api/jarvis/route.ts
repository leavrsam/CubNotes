import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";

// CORS headers to enable seamless invocations from external services (n8n, voice assistants, webhooks)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-jarvis-key, Authorization",
  "Access-Control-Max-Age": "86400",
};

/**
 * Handle CORS preflight requests
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

/**
 * Initializes a Supabase client using Service Role key (if set) or Anon key
 */
function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SECRET_KEY;
  const key = serviceKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Supabase is not configured on server (missing URL or API key)");
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Formats database errors with actionable guidance
 */
function formatErrorMessage(error: any): string {
  if (
    error?.code === "42501" ||
    (typeof error?.message === "string" && error.message.includes("row-level security policy"))
  ) {
    return "Database error: row-level security policy violation. To resolve this, run the updated 'supabase/user_api_keys.sql' script in your Supabase SQL Editor (which provides SECURITY DEFINER bypass functions), or add SUPABASE_SERVICE_ROLE_KEY to your Vercel Environment Variables.";
  }
  if (
    error?.code === "PGRST205" ||
    (typeof error?.message === "string" && (error.message.includes("motif_notes") || error.message.includes("user_api_keys")))
  ) {
    return "Required database tables not found. Please run 'supabase/motif_notes.sql' and 'supabase/user_api_keys.sql' in your Supabase SQL Editor.";
  }
  return error?.message || String(error) || "An unexpected database error occurred";
}

/**
 * Helper to clean HTML markup into readable plain text for voice synthesis
 */
function cleanHtmlToPlainText(html: string): string {
  if (!html) return "";
  return html
    .replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, "\n### $1\n")
    .replace(/<li[^>]*>(.*?)<\/li>/gi, "\n- $1")
    .replace(/<p[^>]*>(.*?)<\/p>/gi, "\n$1")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Helper to escape HTML characters when writing into Canvas text cards
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Validates request authentication:
 * 1. Checks user-scoped API key in `user_api_keys` table.
 * 2. Fallback: Checks global `process.env.JARVIS_API_KEY`.
 */
async function authenticateRequest(
  req: NextRequest,
  supabase: ReturnType<typeof getSupabaseClient>
): Promise<{ authorized: boolean; userId?: string }> {
  const headerKey = req.headers.get("x-jarvis-key")?.trim();
  const authHeader = req.headers.get("authorization")?.trim();
  const bearerToken = authHeader?.replace(/^Bearer\s+/i, "").trim();

  const token = headerKey || bearerToken;
  if (!token) {
    return { authorized: false };
  }

  // 1. Check user-scoped API keys table
  try {
    const { data: keyRow, error: keyError } = await supabase
      .from("user_api_keys")
      .select("id, user_id")
      .eq("api_key", token)
      .maybeSingle();

    if (!keyError && keyRow?.user_id) {
      // Asynchronously update last_used_at
      supabase
        .from("user_api_keys")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", keyRow.id)
        .then(() => {}, () => {});

      return { authorized: true, userId: keyRow.user_id };
    }
  } catch (err) {
    console.warn("[Jarvis API] user_api_keys check skipped or table missing:", err);
  }

  // 2. Check global master key
  const masterKey = process.env.JARVIS_API_KEY?.trim();
  if (masterKey && token === masterKey) {
    try {
      const { data: primaryKey } = await supabase
        .from("user_api_keys")
        .select("user_id")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (primaryKey?.user_id) {
        return { authorized: true, userId: primaryKey.user_id };
      }
    } catch {}

    return { authorized: true };
  }

  return { authorized: false };
}

/**
 * Ensures user has at least one Notebook and Section to place new Canvas notes
 */
async function getOrCreateTargetSection(
  supabase: ReturnType<typeof getSupabaseClient>,
  userId: string
): Promise<string> {
  // 1. Try calling the SECURITY DEFINER RPC function first (bypasses RLS)
  try {
    const { data: rpcSectionId, error: rpcErr } = await supabase.rpc(
      "jarvis_get_or_create_section",
      { p_user_id: userId }
    );
    if (!rpcErr && rpcSectionId) {
      return rpcSectionId as string;
    }
  } catch (err) {
    console.warn("[Jarvis API] jarvis_get_or_create_section RPC fallback:", err);
  }

  // 2. Fallback to direct table queries
  let { data: notebooks } = await supabase
    .from("notebooks")
    .select("id, title")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  let notebookId = notebooks && notebooks.length > 0 ? notebooks[0].id : null;

  if (!notebookId) {
    const { data: newNotebook, error: nbError } = await supabase
      .from("notebooks")
      .insert({
        user_id: userId,
        title: "Voice Notes",
        is_journal: false,
      })
      .select("id")
      .single();

    if (nbError) throw nbError;
    notebookId = newNotebook.id;
  }

  let { data: sections } = await supabase
    .from("sections")
    .select("id, title")
    .eq("notebook_id", notebookId)
    .order("sort_order", { ascending: true });

  let sectionId = sections && sections.length > 0 ? sections[0].id : null;

  if (!sectionId) {
    const { data: newSection, error: secError } = await supabase
      .from("sections")
      .insert({
        notebook_id: notebookId,
        title: "Inbox",
        sort_order: 0,
      })
      .select("id")
      .single();

    if (secError) throw secError;
    sectionId = newSection.id;
  }

  return sectionId;
}

/**
 * GET /api/jarvis - List or search notes
 */
export async function GET(req: NextRequest) {
  const supabase = getSupabaseClient();
  const auth = await authenticateRequest(req, supabase);

  if (!auth.authorized) {
    return NextResponse.json(
      { success: false, error: "Unauthorized: Missing or invalid API key" },
      { status: 401, headers: corsHeaders }
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const query = (
      searchParams.get("search") ||
      searchParams.get("query") ||
      searchParams.get("title") ||
      ""
    ).trim();

    const limitParam = parseInt(searchParams.get("limit") || "15", 10);
    const limit = isNaN(limitParam) ? 15 : Math.min(Math.max(limitParam, 1), 50);

    // If request is authenticated for a specific user, prioritize their real Motif Canvas Pages
    if (auth.userId) {
      // Try calling RPC function first (bypasses RLS)
      const { data: rpcPages, error: rpcError } = await supabase.rpc("jarvis_get_user_pages", {
        p_user_id: auth.userId,
        p_search: query,
        p_limit: limit,
      });

      if (!rpcError && Array.isArray(rpcPages) && rpcPages.length > 0) {
        return NextResponse.json(
          {
            success: true,
            count: rpcPages.length,
            notes: (rpcPages as any[]).map((p: any) => ({
              id: p.page_id,
              title: p.title,
              content_preview: p.content_preview?.slice(0, 150) || "",
              notebook: p.notebook_title,
              section: p.section_title,
              updated_at: p.created_at,
            })),
          },
          { status: 200, headers: corsHeaders }
        );
      }

      // Direct query fallback for user pages
      const { data: notebooks } = await supabase
        .from("notebooks")
        .select("id")
        .eq("user_id", auth.userId);

      if (notebooks && notebooks.length > 0) {
        const nbIds = notebooks.map((n) => n.id);
        const { data: sections } = await supabase
          .from("sections")
          .select("id")
          .in("notebook_id", nbIds);

        if (sections && sections.length > 0) {
          const secIds = sections.map((s) => s.id);
          let pageQuery = supabase
            .from("pages")
            .select("id, title, document_state, created_at")
            .in("section_id", secIds)
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .limit(limit);

          if (query) {
            pageQuery = pageQuery.ilike("title", `%${query}%`);
          }

          const { data: pages } = await pageQuery;
          if (pages && pages.length > 0) {
            return NextResponse.json(
              {
                success: true,
                count: pages.length,
                notes: pages.map((p) => {
                  const texts = p.document_state?.texts || [];
                  const rawPreview = texts.map((t: any) => cleanHtmlToPlainText(t.content || "")).join(" ");
                  return {
                    id: p.id,
                    title: p.title,
                    content_preview: rawPreview.slice(0, 150),
                    updated_at: p.created_at,
                  };
                }),
              },
              { status: 200, headers: corsHeaders }
            );
          }
        }
      }
    }

    // Fallback: Query motif_notes table
    let queryBuilder = supabase
      .from("motif_notes")
      .select("id, title, content, note_type, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (auth.userId) {
      queryBuilder = queryBuilder.or(`user_id.eq.${auth.userId},user_id.is.null`);
    }

    if (query) {
      queryBuilder = queryBuilder.or(`title.ilike.%${query}%,content.ilike.%${query}%`);
    }

    const { data: notes, error } = await queryBuilder;
    if (error) throw error;

    return NextResponse.json(
      {
        success: true,
        count: notes?.length || 0,
        notes: notes || [],
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (error: any) {
    console.error("[Jarvis API] GET error:", error);
    return NextResponse.json(
      { success: false, error: formatErrorMessage(error) },
      { status: 500, headers: corsHeaders }
    );
  }
}

/**
 * POST /api/jarvis - Create, append, read, or list notes
 */
export async function POST(req: NextRequest) {
  const supabase = getSupabaseClient();
  const auth = await authenticateRequest(req, supabase);

  if (!auth.authorized) {
    return NextResponse.json(
      { success: false, error: "Unauthorized: Missing or invalid API key" },
      { status: 401, headers: corsHeaders }
    );
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "Invalid JSON request body" },
        { status: 400, headers: corsHeaders }
      );
    }

    const { action, title, text, content, note_type } = body;
    const normalizedAction = String(action || "").toLowerCase().trim();
    const textContent = (text !== undefined ? text : content ?? "").toString().trim();
    const cleanTitle = typeof title === "string" ? title.trim() : "";
    const isList = (note_type || "").toString().toLowerCase().trim() === "list" || cleanTitle.toLowerCase().includes("list");

    // --------------------------------------------------------------------------
    // ACTION: "read"
    // --------------------------------------------------------------------------
    if (normalizedAction === "read") {
      if (!cleanTitle) {
        return NextResponse.json(
          { success: false, error: "Missing required 'title' field for reading note" },
          { status: 400, headers: corsHeaders }
        );
      }

      // Step A: Search user's real Motif Canvas Pages
      if (auth.userId) {
        // Try RPC first (bypasses RLS)
        const { data: rawRpcPage } = await supabase
          .rpc("jarvis_read_user_page", {
            p_user_id: auth.userId,
            p_title: cleanTitle,
          })
          .maybeSingle();

        const rpcPage = rawRpcPage as any;
        if (rpcPage && rpcPage.title) {
          return NextResponse.json(
            {
              success: true,
              note: {
                id: rpcPage.page_id,
                title: rpcPage.title,
                content: rpcPage.content,
                source: "motif_canvas_page",
                updated_at: rpcPage.created_at,
              },
            },
            { status: 200, headers: corsHeaders }
          );
        }

        // Direct query for Canvas Page
        const { data: notebooks } = await supabase
          .from("notebooks")
          .select("id")
          .eq("user_id", auth.userId);

        if (notebooks && notebooks.length > 0) {
          const nbIds = notebooks.map((n) => n.id);
          const { data: sections } = await supabase
            .from("sections")
            .select("id")
            .in("notebook_id", nbIds);

          if (sections && sections.length > 0) {
            const secIds = sections.map((s) => s.id);
            let { data: pages } = await supabase
              .from("pages")
              .select("id, title, document_state, created_at")
              .in("section_id", secIds)
              .is("deleted_at", null)
              .ilike("title", cleanTitle)
              .order("created_at", { ascending: false })
              .limit(1);

            if (!pages || pages.length === 0) {
              const { data: fuzzyPages } = await supabase
                .from("pages")
                .select("id, title, document_state, created_at")
                .in("section_id", secIds)
                .is("deleted_at", null)
                .ilike("title", `%${cleanTitle}%`)
                .order("created_at", { ascending: false })
                .limit(1);
              pages = fuzzyPages;
            }

            if (pages && pages.length > 0) {
              const page = pages[0];
              const texts = page.document_state?.texts || [];
              const plainContent = texts
                .map((t: any) => cleanHtmlToPlainText(t.content || ""))
                .filter(Boolean)
                .join("\n\n");

              return NextResponse.json(
                {
                  success: true,
                  note: {
                    id: page.id,
                    title: page.title,
                    content: plainContent,
                    source: "motif_canvas_page",
                    updated_at: page.created_at,
                  },
                },
                { status: 200, headers: corsHeaders }
              );
            }
          }
        }
      }

      // Step B: Search motif_notes table
      let noteQuery = supabase
        .from("motif_notes")
        .select("id, title, content, note_type, created_at, updated_at")
        .ilike("title", cleanTitle)
        .order("updated_at", { ascending: false })
        .limit(1);

      if (auth.userId) {
        noteQuery = noteQuery.or(`user_id.eq.${auth.userId},user_id.is.null`);
      }

      let { data: notes } = await noteQuery;
      if (!notes || notes.length === 0) {
        let fuzzyQuery = supabase
          .from("motif_notes")
          .select("id, title, content, note_type, created_at, updated_at")
          .ilike("title", `%${cleanTitle}%`)
          .order("updated_at", { ascending: false })
          .limit(1);

        if (auth.userId) {
          fuzzyQuery = fuzzyQuery.or(`user_id.eq.${auth.userId},user_id.is.null`);
        }
        const { data: fuzzyNotes } = await fuzzyQuery;
        notes = fuzzyNotes;
      }

      if (!notes || notes.length === 0) {
        return NextResponse.json(
          { success: false, message: "Note not found" },
          { status: 404, headers: corsHeaders }
        );
      }

      const note = notes[0];
      return NextResponse.json(
        {
          success: true,
          note: {
            id: note.id,
            title: note.title,
            content: note.content,
            note_type: note.note_type,
            updated_at: note.updated_at,
          },
        },
        { status: 200, headers: corsHeaders }
      );
    }

    // --------------------------------------------------------------------------
    // ACTION: "append"
    // --------------------------------------------------------------------------
    if (normalizedAction === "append") {
      if (!cleanTitle) {
        return NextResponse.json(
          { success: false, error: "Missing required 'title' field for appending to note" },
          { status: 400, headers: corsHeaders }
        );
      }

      // A. If user is authenticated, prioritize real Canvas Pages
      if (auth.userId) {
        // 1. Try atomic SECURITY DEFINER RPC first (bypasses RLS safely even without service role key)
        try {
          const { data: rpcResult, error: rpcErr } = await supabase.rpc(
            "jarvis_append_or_create_page",
            {
              p_user_id: auth.userId,
              p_title: cleanTitle,
              p_text: textContent,
              p_is_list: isList,
            }
          );

          if (!rpcErr && rpcResult && (rpcResult as any).success) {
            const res = rpcResult as any;
            const isCreated = res.action === "created";
            const payload = {
              id: res.page_id,
              title: cleanTitle,
              content: textContent,
              source: "motif_canvas_page",
            };

            return NextResponse.json(
              {
                success: true,
                [isCreated ? "createdNote" : "updatedNote"]: payload,
              },
              { status: isCreated ? 201 : 200, headers: corsHeaders }
            );
          }
        } catch (rpcErr) {
          console.warn("[Jarvis API] jarvis_append_or_create_page RPC fallback:", rpcErr);
        }

        // 2. Direct table queries fallback (when service role key is configured)
        const { data: notebooks } = await supabase
          .from("notebooks")
          .select("id")
          .eq("user_id", auth.userId);

        if (notebooks && notebooks.length > 0) {
          const nbIds = notebooks.map((n) => n.id);
          const { data: sections } = await supabase
            .from("sections")
            .select("id")
            .in("notebook_id", nbIds);

          if (sections && sections.length > 0) {
            const secIds = sections.map((s) => s.id);
            let { data: pages } = await supabase
              .from("pages")
              .select("id, title, document_state, created_at")
              .in("section_id", secIds)
              .is("deleted_at", null)
              .ilike("title", cleanTitle)
              .order("created_at", { ascending: false })
              .limit(1);

            if (!pages || pages.length === 0) {
              const { data: fuzzyPages } = await supabase
                .from("pages")
                .select("id, title, document_state, created_at")
                .in("section_id", secIds)
                .is("deleted_at", null)
                .ilike("title", `%${cleanTitle}%`)
                .order("created_at", { ascending: false })
                .limit(1);
              pages = fuzzyPages;
            }

            // Existing page found -> append directly to canvas note card
            if (pages && pages.length > 0) {
              const page = pages[0];
              const docState = page.document_state || {};
              const texts = Array.isArray(docState.texts) ? [...docState.texts] : [];

              const formattedItem = isList
                ? textContent.startsWith("- ") ? textContent : `- ${textContent}`
                : textContent;

              if (texts.length > 0) {
                const currentContent = texts[0].content || "";
                if (currentContent.includes("<p>") || currentContent.includes("<li>")) {
                  const htmlItem = `<p>${escapeHtml(formattedItem)}</p>`;
                  texts[0].content = `${currentContent}${htmlItem}`;
                } else {
                  texts[0].content = `${currentContent.trimEnd()}\n${formattedItem}`;
                }
              } else {
                texts.push({
                  id: uuidv4(),
                  x: 100,
                  y: 100,
                  width: 380,
                  content: isList ? `<p>${escapeHtml(formattedItem)}</p>` : `<p>${escapeHtml(textContent)}</p>`,
                });
              }

              const { error: pageUpdateError } = await supabase
                .from("pages")
                .update({ document_state: { ...docState, texts } })
                .eq("id", page.id);

              if (pageUpdateError) throw pageUpdateError;

              return NextResponse.json(
                {
                  success: true,
                  updatedNote: {
                    id: page.id,
                    title: page.title,
                    appendedText: textContent,
                    source: "motif_canvas_page",
                  },
                },
                { status: 200, headers: corsHeaders }
              );
            }
          }
        }

        // Page not found -> Automatically create new page in user's notebook!
        const targetSectionId = await getOrCreateTargetSection(supabase, auth.userId);
        const newPageId = uuidv4();
        const initialText = isList
          ? textContent.startsWith("- ") ? textContent : `- ${textContent}`
          : textContent;

        const initialHtml = `<p>${escapeHtml(initialText)}</p>`;
        const newPageRecord = {
          id: newPageId,
          section_id: targetSectionId,
          title: cleanTitle,
          document_state: {
            texts: [
              {
                id: uuidv4(),
                x: 100,
                y: 100,
                width: 380,
                content: initialHtml,
              },
            ],
          },
        };

        const { error: insertPageError } = await supabase.from("pages").insert(newPageRecord);
        if (insertPageError) throw insertPageError;

        return NextResponse.json(
          {
            success: true,
            createdNote: {
              id: newPageId,
              title: cleanTitle,
              content: textContent,
              source: "motif_canvas_page",
            },
          },
          { status: 201, headers: corsHeaders }
        );
      }

      // B. Fallback to motif_notes table if no user_id resolved
      let { data: matches } = await supabase
        .from("motif_notes")
        .select("*")
        .ilike("title", cleanTitle)
        .order("updated_at", { ascending: false })
        .limit(1);

      if (!matches || matches.length === 0) {
        const { data: fuzzyMatches } = await supabase
          .from("motif_notes")
          .select("*")
          .ilike("title", `%${cleanTitle}%`)
          .order("updated_at", { ascending: false })
          .limit(1);
        matches = fuzzyMatches;
      }

      const existingNote = matches && matches.length > 0 ? matches[0] : null;

      if (existingNote) {
        const isNoteList = existingNote.note_type === "list" || isList;
        const existingContent = existingNote.content || "";
        const item = textContent;

        let updatedContent = existingContent;
        if (!existingContent.trim()) {
          updatedContent = isNoteList ? (item.startsWith("- ") ? item : `- ${item}`) : item;
        } else if (isNoteList) {
          const formattedItem = item.startsWith("- ") ? item : `- ${item}`;
          updatedContent = `${existingContent.trimEnd()}\n${formattedItem}`;
        } else {
          updatedContent = `${existingContent.trimEnd()}\n\n${item}`;
        }

        const now = new Date().toISOString();
        const { data: updatedNote, error: updateError } = await supabase
          .from("motif_notes")
          .update({ content: updatedContent, updated_at: now })
          .eq("id", existingNote.id)
          .select("id, title, content, note_type, created_at, updated_at")
          .single();

        if (updateError) throw updateError;
        return NextResponse.json({ success: true, updatedNote }, { status: 200, headers: corsHeaders });
      } else {
        const now = new Date().toISOString();
        const formattedItem = isList ? (textContent.startsWith("- ") ? textContent : `- ${textContent}`) : textContent;
        const { data: createdNote, error: createError } = await supabase
          .from("motif_notes")
          .insert({
            title: cleanTitle,
            content: formattedItem,
            note_type: isList ? "list" : "note",
            created_at: now,
            updated_at: now,
          })
          .select("id, title, content, note_type, created_at, updated_at")
          .single();

        if (createError) throw createError;
        return NextResponse.json({ success: true, createdNote }, { status: 201, headers: corsHeaders });
      }
    }

    // --------------------------------------------------------------------------
    // ACTION: "create"
    // --------------------------------------------------------------------------
    if (normalizedAction === "create") {
      if (!cleanTitle) {
        return NextResponse.json(
          { success: false, error: "Missing required 'title' field for creating note" },
          { status: 400, headers: corsHeaders }
        );
      }

      // If user is authenticated, prioritize real Canvas Pages
      if (auth.userId) {
        // 1. Try atomic SECURITY DEFINER RPC first (bypasses RLS)
        try {
          const { data: rpcResult, error: rpcErr } = await supabase.rpc(
            "jarvis_create_page",
            {
              p_user_id: auth.userId,
              p_title: cleanTitle,
              p_text: textContent,
            }
          );

          if (!rpcErr && rpcResult && (rpcResult as any).success) {
            const res = rpcResult as any;
            return NextResponse.json(
              {
                success: true,
                note: {
                  id: res.page_id,
                  title: cleanTitle,
                  content: textContent,
                  source: "motif_canvas_page",
                },
              },
              { status: 201, headers: corsHeaders }
            );
          }
        } catch (rpcErr) {
          console.warn("[Jarvis API] jarvis_create_page RPC fallback:", rpcErr);
        }

        // 2. Direct table queries fallback (when service role key is configured)
        const targetSectionId = await getOrCreateTargetSection(supabase, auth.userId);
        const newPageId = uuidv4();
        const initialHtml = `<p>${escapeHtml(textContent)}</p>`;

        const { error: insertPageError } = await supabase.from("pages").insert({
          id: newPageId,
          section_id: targetSectionId,
          title: cleanTitle,
          document_state: {
            texts: [
              {
                id: uuidv4(),
                x: 100,
                y: 100,
                width: 380,
                content: initialHtml,
              },
            ],
          },
        });

        if (insertPageError) throw insertPageError;

        return NextResponse.json(
          {
            success: true,
            note: {
              id: newPageId,
              title: cleanTitle,
              content: textContent,
              source: "motif_canvas_page",
            },
          },
          { status: 201, headers: corsHeaders }
        );
      }

      // Fallback: create in motif_notes table
      const now = new Date().toISOString();
      const { data: note, error: insertError } = await supabase
        .from("motif_notes")
        .insert({
          title: cleanTitle,
          content: textContent,
          note_type: isList ? "list" : "note",
          created_at: now,
          updated_at: now,
        })
        .select("id, title, content, note_type, created_at, updated_at")
        .single();

      if (insertError) throw insertError;
      return NextResponse.json({ success: true, note }, { status: 201, headers: corsHeaders });
    }

    // --------------------------------------------------------------------------
    // ACTION: "list"
    // --------------------------------------------------------------------------
    if (normalizedAction === "list") {
      return GET(req);
    }

    return NextResponse.json(
      {
        success: false,
        error: `Invalid action '${action || ""}'. Supported actions: 'create', 'append', 'read', 'list'`,
      },
      { status: 400, headers: corsHeaders }
    );
  } catch (error: any) {
    console.error("[Jarvis API] POST error:", error);
    return NextResponse.json(
      { success: false, error: formatErrorMessage(error) },
      { status: 500, headers: corsHeaders }
    );
  }
}
