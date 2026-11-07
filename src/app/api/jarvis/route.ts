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
    (typeof error?.message === "string" &&
      (error.message.includes("motif_notes") || error.message.includes("user_api_keys")))
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
 * Helper to call Supabase RPC with automatic graceful fallback if new overloaded signature is not found
 */
async function callRpcWithFallback(
  supabase: ReturnType<typeof getSupabaseClient>,
  fnName: string,
  preferredArgs: Record<string, any>,
  fallbackArgs?: Record<string, any>
) {
  const res = await supabase.rpc(fnName, preferredArgs);
  if (
    res.error &&
    fallbackArgs &&
    (res.error.code === "PGRST202" ||
      res.error.message?.includes("schema cache") ||
      res.error.message?.includes("Could not find the function"))
  ) {
    return await supabase.rpc(fnName, fallbackArgs);
  }
  return res;
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
        .then(
          () => {},
          () => {}
        );

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
 * Shared helper to list notes with strict privacy enforcement
 */
async function listNotesInternal(
  supabase: ReturnType<typeof getSupabaseClient>,
  auth: { authorized: boolean; userId?: string },
  options: {
    query?: string;
    limit?: number;
    targetNotebook: string | null;
    isAuthorizedOwner: boolean;
  }
) {
  const { query = "", limit = 15, targetNotebook, isAuthorizedOwner } = options;

  // If request is authenticated for a specific user, prioritize their real Motif Canvas Pages
  if (auth.userId) {
    try {
      const rpcRes = await callRpcWithFallback(
        supabase,
        "jarvis_get_user_pages",
        {
          p_user_id: auth.userId,
          p_search: query,
          p_limit: limit,
          p_notebook_name: targetNotebook,
        },
        {
          p_user_id: auth.userId,
          p_search: query,
          p_limit: targetNotebook ? 50 : limit,
        }
      );

      if (!rpcRes.error && Array.isArray(rpcRes.data)) {
        let pages = rpcRes.data as any[];

        // If targetNotebook is requested and fallback 3-arg RPC was used, filter in memory
        if (targetNotebook) {
          pages = pages.filter(
            (p) =>
              p.notebook_title &&
              p.notebook_title.toLowerCase() === targetNotebook.toLowerCase()
          );
        }

        pages = pages.slice(0, limit);

        return NextResponse.json(
          {
            success: true,
            count: pages.length,
            notes: pages.map((p: any) => ({
              id: p.page_id,
              title: p.title,
              content_preview: p.content_preview?.slice(0, 150) || "",
              notebook: p.notebook_title || targetNotebook || "Notebook",
              section: p.section_title || "Inbox",
              updated_at: p.created_at,
            })),
          },
          { status: 200, headers: corsHeaders }
        );
      }
    } catch (err) {
      console.warn("[Jarvis API] jarvis_get_user_pages error:", err);
    }

    // Direct table query fallback (only if service role key is configured)
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        let nbQuery = supabase
          .from("notebooks")
          .select("id, title")
          .eq("user_id", auth.userId);

        if (targetNotebook) {
          nbQuery = nbQuery.ilike("title", targetNotebook);
        }

        const { data: notebooks } = await nbQuery;

        if (notebooks && notebooks.length > 0) {
          const nbIds = notebooks.map((n) => n.id);
          const nbTitleMap = new Map(notebooks.map((n) => [n.id, n.title]));

          const { data: sections } = await supabase
            .from("sections")
            .select("id, notebook_id, title")
            .in("notebook_id", nbIds);

          if (sections && sections.length > 0) {
            const secIds = sections.map((s) => s.id);
            const secMap = new Map(sections.map((s) => [s.id, s]));

            let pageQuery = supabase
              .from("pages")
              .select("id, section_id, title, document_state, created_at")
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
                    const rawPreview = texts
                      .map((t: any) => cleanHtmlToPlainText(t.content || ""))
                      .join(" ");
                    const sec = secMap.get(p.section_id);
                    return {
                      id: p.id,
                      title: p.title,
                      content_preview: rawPreview.slice(0, 150),
                      notebook: sec
                        ? nbTitleMap.get(sec.notebook_id) || "Notebook"
                        : "Notebook",
                      section: sec?.title || "Inbox",
                      updated_at: p.created_at,
                    };
                  }),
                },
                { status: 200, headers: corsHeaders }
              );
            }
          }
        }
      } catch (directErr) {
        console.warn("[Jarvis API] Direct query fallback error:", directErr);
      }
    }

    // If guest was restricted to Household and no Household notes exist
    if (!isAuthorizedOwner) {
      return NextResponse.json(
        {
          success: true,
          count: 0,
          notes: [],
        },
        { status: 200, headers: corsHeaders }
      );
    }
  }

  // Fallback: Query motif_notes table
  try {
    let queryBuilder = supabase
      .from("motif_notes")
      .select("id, title, content, note_type, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (auth.userId) {
      queryBuilder = queryBuilder.or(`user_id.eq.${auth.userId},user_id.is.null`);
    }

    if (targetNotebook) {
      queryBuilder = queryBuilder.ilike("notebook", targetNotebook);
    }

    if (query) {
      queryBuilder = queryBuilder.or(`title.ilike.%${query}%,content.ilike.%${query}%`);
    }

    const { data: notes, error } = await queryBuilder;
    if (!error && notes) {
      return NextResponse.json(
        {
          success: true,
          count: notes.length,
          notes,
        },
        { status: 200, headers: corsHeaders }
      );
    }
  } catch {}

  return NextResponse.json(
    {
      success: true,
      count: 0,
      notes: [],
    },
    { status: 200, headers: corsHeaders }
  );
}

/**
 * GET /api/jarvis - List or search notes with privacy enforcement
 */
export async function GET(req: NextRequest) {
  const supabase = getSupabaseClient();
  const auth = await authenticateRequest(req, supabase);

  if (!auth.authorized) {
    return NextResponse.json(
      {
        success: false,
        error: "Unauthorized: Missing or invalid API key",
        message: "Unauthorized: Missing or invalid API key",
      },
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

    const isAuthorizedOwnerParam = searchParams.get("isAuthorizedOwner");
    const isAuthorizedOwner = isAuthorizedOwnerParam !== "false";
    const requestedNotebook = searchParams.get("notebook")?.trim() || "";

    // Access & Privacy Enforcement:
    // Only if isAuthorizedOwner is explicitly false, force notebook to "Household"
    let targetNotebook: string | null = null;
    if (!isAuthorizedOwner) {
      targetNotebook = "Household";
    } else if (requestedNotebook) {
      targetNotebook = requestedNotebook;
    }

    return await listNotesInternal(supabase, auth, {
      query,
      limit,
      targetNotebook,
      isAuthorizedOwner,
    });
  } catch (error: any) {
    console.error("[Jarvis API] GET error:", error);
    const msg = formatErrorMessage(error);
    return NextResponse.json(
      { success: false, error: msg, message: msg },
      { status: 500, headers: corsHeaders }
    );
  }
}

/**
 * POST /api/jarvis - Create, append, read, or list notes with Guest Privacy & Tagging
 */
export async function POST(req: NextRequest) {
  const supabase = getSupabaseClient();
  const auth = await authenticateRequest(req, supabase);

  if (!auth.authorized) {
    return NextResponse.json(
      {
        success: false,
        error: "Unauthorized: Missing or invalid API key",
        message: "Unauthorized: Missing or invalid API key",
      },
      { status: 401, headers: corsHeaders }
    );
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid JSON request body",
          message: "Invalid JSON request body",
        },
        { status: 400, headers: corsHeaders }
      );
    }

    // 1. Request Payload Extraction
    const {
      speaker,
      isAuthorizedOwner: rawIsAuthorizedOwner,
      notebook: rawNotebook,
      action,
      title,
      text,
      content,
      note_type,
    } = body;

    // Only treat as guest if isAuthorizedOwner is explicitly false.
    // If undefined or true, treat as authorized key owner.
    const isAuthorizedOwner = rawIsAuthorizedOwner !== false;
    const speakerName = typeof speaker === "string" ? speaker.trim() : "";
    const normalizedAction = String(action || "").toLowerCase().trim();
    let textContent = (text !== undefined ? text : content ?? "").toString().trim();
    const cleanTitle = typeof title === "string" ? title.trim() : "";
    const isList =
      (note_type || "").toString().toLowerCase().trim() === "list" ||
      cleanTitle.toLowerCase().includes("list");

    // 2. Access & Privacy Enforcement:
    // If isAuthorizedOwner is explicitly false: Force notebook to "Household"
    let targetNotebook: string | null = null;
    if (!isAuthorizedOwner) {
      targetNotebook = "Household";
    } else if (typeof rawNotebook === "string" && rawNotebook.trim()) {
      targetNotebook = rawNotebook.trim();
    }

    // 3. Guest Tagging:
    // When a note or list item is created or appended with isAuthorizedOwner === false,
    // prepend "[Added by " + (speaker || "Guest") + "] "
    if (!isAuthorizedOwner && textContent) {
      const guestTag = `[Added by ${speakerName || "Guest"}] `;
      if (!textContent.startsWith("[Added by ")) {
        textContent = `${guestTag}${textContent}`;
      }
    }

    // --------------------------------------------------------------------------
    // ACTION: "read"
    // --------------------------------------------------------------------------
    if (normalizedAction === "read") {
      if (!cleanTitle) {
        return NextResponse.json(
          {
            success: false,
            error: "Missing required 'title' field for reading note",
            message: "Missing required 'title' field for reading note",
          },
          { status: 400, headers: corsHeaders }
        );
      }

      // Step A: Search user's real Motif Canvas Pages
      if (auth.userId) {
        try {
          const rpcRes = await callRpcWithFallback(
            supabase,
            "jarvis_read_user_page",
            {
              p_user_id: auth.userId,
              p_title: cleanTitle,
              p_notebook_name: targetNotebook,
            },
            {
              p_user_id: auth.userId,
              p_title: cleanTitle,
            }
          );

          const pages = Array.isArray(rpcRes.data)
            ? rpcRes.data
            : rpcRes.data
            ? [rpcRes.data]
            : [];

          if (pages.length > 0 && pages[0]?.title) {
            const page = pages[0];
            let notebookTitle = page.notebook_title;

            // If 2-arg RPC was used, notebook_title might not be in the row
            if (!notebookTitle && targetNotebook) {
              const listRes = await supabase.rpc("jarvis_get_user_pages", {
                p_user_id: auth.userId,
                p_search: cleanTitle,
                p_limit: 5,
              });
              const match = (listRes.data || []).find(
                (p: any) => p.page_id === page.page_id
              );
              if (match) {
                notebookTitle = match.notebook_title;
              }
            }

            // Verify notebook matching if targetNotebook is enforced
            if (
              targetNotebook &&
              notebookTitle &&
              notebookTitle.toLowerCase() !== targetNotebook.toLowerCase()
            ) {
              const notFoundMsg = `Note not found in ${targetNotebook} notebook`;
              return NextResponse.json(
                { success: false, error: notFoundMsg, message: notFoundMsg },
                { status: 404, headers: corsHeaders }
              );
            }

            let plainContent = cleanHtmlToPlainText(page.content || "");
            if (!plainContent && page.raw_document_state?.texts) {
              plainContent = page.raw_document_state.texts
                .map((t: any) => cleanHtmlToPlainText(t.content || ""))
                .join("\n\n");
            }

            return NextResponse.json(
              {
                success: true,
                note: {
                  id: page.page_id,
                  title: page.title,
                  content: plainContent,
                  notebook: notebookTitle || targetNotebook || "Notebook",
                  source: "motif_canvas_page",
                  updated_at: page.created_at,
                },
              },
              { status: 200, headers: corsHeaders }
            );
          }
        } catch (rpcErr) {
          console.warn("[Jarvis API] jarvis_read_user_page error:", rpcErr);
        }
      }

      // Step B: Search motif_notes table (if authorized owner or household)
      try {
        let noteQuery = supabase
          .from("motif_notes")
          .select("id, title, content, note_type, created_at, updated_at")
          .ilike("title", cleanTitle)
          .order("updated_at", { ascending: false })
          .limit(1);

        if (auth.userId) {
          noteQuery = noteQuery.or(`user_id.eq.${auth.userId},user_id.is.null`);
        }
        if (targetNotebook) {
          noteQuery = noteQuery.ilike("notebook", targetNotebook);
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
          if (targetNotebook) {
            fuzzyQuery = fuzzyQuery.ilike("notebook", targetNotebook);
          }
          const { data: fuzzyNotes } = await fuzzyQuery;
          notes = fuzzyNotes;
        }

        if (notes && notes.length > 0) {
          const note = notes[0];
          return NextResponse.json(
            {
              success: true,
              note: {
                id: note.id,
                title: note.title,
                content: note.content,
                note_type: note.note_type,
                notebook: targetNotebook || "Notebook",
                updated_at: note.updated_at,
              },
            },
            { status: 200, headers: corsHeaders }
          );
        }
      } catch {}

      const notFoundMsg = targetNotebook
        ? `Note not found in ${targetNotebook} notebook`
        : "Note not found";

      return NextResponse.json(
        { success: false, error: notFoundMsg, message: notFoundMsg },
        { status: 404, headers: corsHeaders }
      );
    }

    // --------------------------------------------------------------------------
    // ACTION: "append"
    // --------------------------------------------------------------------------
    if (normalizedAction === "append") {
      if (!cleanTitle) {
        return NextResponse.json(
          {
            success: false,
            error: "Missing required 'title' field for appending to note",
            message: "Missing required 'title' field for appending to note",
          },
          { status: 400, headers: corsHeaders }
        );
      }

      const activeNotebookName = targetNotebook || "Voice Notes";

      // A. If user is authenticated, prioritize real Canvas Pages via SECURITY DEFINER RPC
      if (auth.userId) {
        try {
          const rpcRes = await callRpcWithFallback(
            supabase,
            "jarvis_append_or_create_page",
            {
              p_user_id: auth.userId,
              p_title: cleanTitle,
              p_text: textContent,
              p_is_list: isList,
              p_notebook_name: activeNotebookName,
            },
            {
              p_user_id: auth.userId,
              p_title: cleanTitle,
              p_text: textContent,
              p_is_list: isList,
            }
          );

          if (!rpcRes.error && rpcRes.data && (rpcRes.data as any).success) {
            const res = rpcRes.data as any;
            const isCreated = res.action === "created";
            const payload = {
              id: res.page_id,
              title: cleanTitle,
              content: textContent,
              notebook: res.notebook || activeNotebookName,
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

          if (rpcRes.error) {
            console.error("[Jarvis API] jarvis_append_or_create_page RPC error:", rpcRes.error);
            const msg = formatErrorMessage(rpcRes.error);
            return NextResponse.json(
              { success: false, error: msg, message: msg },
              { status: 500, headers: corsHeaders }
            );
          }
        } catch (rpcErr) {
          console.error("[Jarvis API] jarvis_append_or_create_page exception:", rpcErr);
          const msg = formatErrorMessage(rpcErr);
          return NextResponse.json(
            { success: false, error: msg, message: msg },
            { status: 500, headers: corsHeaders }
          );
        }
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
          updatedContent = isNoteList
            ? item.startsWith("- ")
              ? item
              : `- ${item}`
            : item;
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
        return NextResponse.json(
          { success: true, updatedNote },
          { status: 200, headers: corsHeaders }
        );
      } else {
        const now = new Date().toISOString();
        const formattedItem = isList
          ? textContent.startsWith("- ")
            ? textContent
            : `- ${textContent}`
          : textContent;
        const { data: createdNote, error: createError } = await supabase
          .from("motif_notes")
          .insert({
            title: cleanTitle,
            content: formattedItem,
            note_type: isList ? "list" : "note",
            notebook: activeNotebookName,
            created_at: now,
            updated_at: now,
          })
          .select("id, title, content, note_type, created_at, updated_at")
          .single();

        if (createError) throw createError;
        return NextResponse.json(
          { success: true, createdNote },
          { status: 201, headers: corsHeaders }
        );
      }
    }

    // --------------------------------------------------------------------------
    // ACTION: "create"
    // --------------------------------------------------------------------------
    if (normalizedAction === "create") {
      if (!cleanTitle) {
        return NextResponse.json(
          {
            success: false,
            error: "Missing required 'title' field for creating note",
            message: "Missing required 'title' field for creating note",
          },
          { status: 400, headers: corsHeaders }
        );
      }

      const activeNotebookName = targetNotebook || "Voice Notes";

      // If user is authenticated, prioritize real Canvas Pages via SECURITY DEFINER RPC
      if (auth.userId) {
        try {
          const rpcRes = await callRpcWithFallback(
            supabase,
            "jarvis_create_page",
            {
              p_user_id: auth.userId,
              p_title: cleanTitle,
              p_text: textContent,
              p_notebook_name: activeNotebookName,
            },
            {
              p_user_id: auth.userId,
              p_title: cleanTitle,
              p_text: textContent,
            }
          );

          if (!rpcRes.error && rpcRes.data && (rpcRes.data as any).success) {
            const res = rpcRes.data as any;
            return NextResponse.json(
              {
                success: true,
                note: {
                  id: res.page_id,
                  title: cleanTitle,
                  content: textContent,
                  notebook: res.notebook || activeNotebookName,
                  source: "motif_canvas_page",
                },
              },
              { status: 201, headers: corsHeaders }
            );
          }

          if (rpcRes.error) {
            console.error("[Jarvis API] jarvis_create_page RPC error:", rpcRes.error);
            const msg = formatErrorMessage(rpcRes.error);
            return NextResponse.json(
              { success: false, error: msg, message: msg },
              { status: 500, headers: corsHeaders }
            );
          }
        } catch (rpcErr) {
          console.error("[Jarvis API] jarvis_create_page exception:", rpcErr);
          const msg = formatErrorMessage(rpcErr);
          return NextResponse.json(
            { success: false, error: msg, message: msg },
            { status: 500, headers: corsHeaders }
          );
        }
      }

      // Fallback: create in motif_notes table
      const now = new Date().toISOString();
      const { data: note, error: insertError } = await supabase
        .from("motif_notes")
        .insert({
          title: cleanTitle,
          content: textContent,
          note_type: isList ? "list" : "note",
          notebook: activeNotebookName,
          created_at: now,
          updated_at: now,
        })
        .select("id, title, content, note_type, created_at, updated_at")
        .single();

      if (insertError) throw insertError;
      return NextResponse.json(
        { success: true, note },
        { status: 201, headers: corsHeaders }
      );
    }

    // --------------------------------------------------------------------------
    // ACTION: "list"
    // --------------------------------------------------------------------------
    if (normalizedAction === "list") {
      const limitParam = parseInt(body.limit || "15", 10);
      const limit = isNaN(limitParam) ? 15 : Math.min(Math.max(limitParam, 1), 50);
      const query = (body.search || body.query || body.title || "").trim();

      return await listNotesInternal(supabase, auth, {
        query,
        limit,
        targetNotebook,
        isAuthorizedOwner,
      });
    }

    const invalidActionMsg = `Invalid action '${action || ""}'. Supported actions: 'create', 'append', 'read', 'list'`;
    return NextResponse.json(
      {
        success: false,
        error: invalidActionMsg,
        message: invalidActionMsg,
      },
      { status: 400, headers: corsHeaders }
    );
  } catch (error: any) {
    console.error("[Jarvis API] POST error:", error);
    const msg = formatErrorMessage(error);
    return NextResponse.json(
      { success: false, error: msg, message: msg },
      { status: 500, headers: corsHeaders }
    );
  }
}
