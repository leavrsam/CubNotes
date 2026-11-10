import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  parseListLine,
  parseTextNodeItems,
  type JarvisItemMeta,
  type JarvisStructuredItem,
} from "@/lib/listItems";
import { appendToDoc, docUpdatedAt, readItems, stampDoc, updateItemInDoc } from "@/lib/jarvisDoc";

export type { JarvisItemMeta, JarvisStructuredItem };

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
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}


/**
 * Extracts all structured items and clean plain-text content across a page's document_state
 */
function extractStructuredItemsFromDocState(docState: any): {
  items: JarvisStructuredItem[];
  plainContent: string;
} {
  const texts = Array.isArray(docState?.texts) ? docState.texts : [];
  const docLevelMeta = Array.isArray(docState?.itemsMeta) ? docState.itemsMeta : undefined;

  const allItems: JarvisStructuredItem[] = [];
  const allCleanLines: string[] = [];

  for (const t of texts) {
    const { items, cleanLines } = parseTextNodeItems(t, docLevelMeta);
    allItems.push(...items);
    allCleanLines.push(...cleanLines);
  }

  return {
    items: allItems,
    plainContent: allCleanLines.join("\n"),
  };
}

/**
 * Loads the page that a Jarvis request refers to.
 *
 * If several pages in the notebook have exactly this title (duplicates), the
 * OLDEST one is used every time — that is the note the user created and sees
 * in the editor — so read/append/check never drift to a newer copy. Otherwise
 * the previous matching applies (exact title first, then partial match).
 */
async function loadJarvisPage(
  supabase: ReturnType<typeof getSupabaseClient>,
  userId: string,
  title: string,
  notebook: string | null
): Promise<{ page: any | null; error: any | null }> {
  const wanted = title.trim().toLowerCase();
  const listRes = await supabase.rpc("jarvis_get_user_pages", {
    p_user_id: userId,
    p_search: title.trim(),
    p_limit: 50,
    p_notebook_name: notebook,
  });
  if (!listRes.error && Array.isArray(listRes.data)) {
    const exact = (listRes.data as any[])
      .filter((p) => typeof p?.title === "string" && p.title.trim().toLowerCase() === wanted)
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    if (exact.length > 0) {
      if (exact.length > 1) {
        console.warn(
          `[Jarvis API] ${exact.length} pages titled "${title}" found; using the oldest (${exact[0].page_id}). ` +
            "Run supabase/repairs/2026-11-10_merge_duplicate_shopping_lists.sql (or the generic merge) to combine them."
        );
      }
      return { page: { content: "", ...exact[0] }, error: null };
    }
  }

  const rpcRes = await supabase.rpc("jarvis_read_user_page", {
    p_user_id: userId,
    p_title: title,
    p_notebook_name: notebook,
  });
  if (rpcRes.error) return { page: null, error: rpcRes.error };
  const pages = Array.isArray(rpcRes.data) ? rpcRes.data : rpcRes.data ? [rpcRes.data] : [];
  return { page: pages.length > 0 && pages[0]?.title ? pages[0] : null, error: null };
}

/**
 * Saves a changed document to the page (the document the editor renders),
 * stamping its update time, then reads it back to confirm the write landed.
 * Only reports ok when the saved page really contains the new document.
 */
async function saveJarvisPage(
  supabase: ReturnType<typeof getSupabaseClient>,
  userId: string,
  page: any,
  doc: any,
  lookup: { title: string; notebook: string | null }
): Promise<{ ok: true; doc: any } | { ok: false; error: string }> {
  const stamped = stampDoc(doc);
  const updateRes = await supabase.rpc("jarvis_update_page_document_state", {
    p_user_id: userId,
    p_page_id: page.page_id,
    p_document_state: stamped,
  });
  if (updateRes.error || !updateRes.data) {
    console.error("[Jarvis API] jarvis_update_page_document_state error:", updateRes.error);
    return {
      ok: false,
      error: updateRes.error ? formatErrorMessage(updateRes.error) : "The note could not be saved. Please try again.",
    };
  }
  const check = await loadJarvisPage(supabase, userId, lookup.title, lookup.notebook);
  const saved = check.page?.page_id === page.page_id ? check.page.raw_document_state : null;
  if (!saved || JSON.stringify(saved.texts || []) !== JSON.stringify(stamped.texts || [])) {
    console.error("[Jarvis API] write verification failed for page", page.page_id);
    return { ok: false, error: "The note was changed but the change could not be confirmed. Please try again." };
  }
  return { ok: true, doc: saved };
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
  const { query = "", limit = 15, targetNotebook } = options;

  if (auth.userId) {
    const rpcRes = await supabase.rpc("jarvis_get_user_pages", {
      p_user_id: auth.userId,
      p_search: query,
      p_limit: limit,
      p_notebook_name: targetNotebook,
    });

    if (rpcRes.error) {
      console.error("[Jarvis API] jarvis_get_user_pages RPC error:", rpcRes.error);
      const msg = formatErrorMessage(rpcRes.error);
      return NextResponse.json(
        { success: false, error: msg, message: msg },
        { status: 500, headers: corsHeaders }
      );
    }

    const pages = (rpcRes.data as any[]) || [];

    return NextResponse.json(
      {
        success: true,
        count: pages.length,
        notes: pages.map((p: any) => {
          const structured = extractStructuredItemsFromDocState(p.raw_document_state);
          const rawPreview = structured.plainContent
            ? structured.plainContent.replace(/\n+/g, " ")
            : (p.content_preview || "").replace(/\[Added by [^\]]+\]\s*/gi, "");

          return {
            id: p.page_id,
            title: p.title,
            content_preview: rawPreview.slice(0, 150),
            items: structured.items,
            notebook: p.notebook_title || targetNotebook || "Notebook",
            section: p.section_title || "Inbox",
            updated_at: docUpdatedAt(p.raw_document_state, p.updated_at || p.created_at),
          };
        }),
      },
      { status: 200, headers: corsHeaders }
    );
  }

  // Fallback only when no user_id is associated with the key
  let queryBuilder = supabase
    .from("motif_notes")
    .select("id, title, content, note_type, notebook, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (targetNotebook) {
    queryBuilder = queryBuilder.ilike("notebook", targetNotebook);
  }

  if (query) {
    queryBuilder = queryBuilder.or(`title.ilike.%${query}%,content.ilike.%${query}%`);
  }

  const { data: notes, error } = await queryBuilder;
  if (error) {
    const msg = formatErrorMessage(error);
    return NextResponse.json(
      { success: false, error: msg, message: msg },
      { status: 500, headers: corsHeaders }
    );
  }

  return NextResponse.json(
    {
      success: true,
      count: notes?.length || 0,
      notes: notes || [],
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
 * POST /api/jarvis - Create, append, read, list, check, or remove notes/items with Guest Privacy & Metadata
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
      item: rawItem,
      checked: rawChecked,
      note_type,
    } = body;

    // Only treat as guest if isAuthorizedOwner is explicitly false.
    // If undefined or true, treat as authorized key owner.
    const isAuthorizedOwner = rawIsAuthorizedOwner !== false;
    const speakerName = typeof speaker === "string" && speaker.trim() ? speaker.trim() : null;
    const addedBy = isAuthorizedOwner ? speakerName : speakerName || "Guest";
    const addedByOwner = isAuthorizedOwner;

    const normalizedAction = String(action || "").toLowerCase().trim();
    const rawTextContent = (text !== undefined ? text : content ?? "").toString().trim();
    // Strip any accidental inline "[Added by ...]" prefix from incoming text so item text is stored clean
    const parsedIncoming = parseListLine(rawTextContent);
    const textContent = parsedIncoming.inlineAddedBy
      ? parsedIncoming.hasBullet
        ? `- ${parsedIncoming.coreText}`
        : parsedIncoming.coreText
      : rawTextContent;

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

    const isListNote = isList;
    const notFoundMessage = () =>
      targetNotebook ? `Note not found in ${targetNotebook} notebook` : "Note not found";
    const notePayloadFor = (page: any, doc: any) => {
      const { items, plainContent } = readItems(doc, page.title, isListNote);
      return {
        payload: {
          id: page.page_id,
          title: page.title,
          content: plainContent,
          items,
          notebook: page.notebook_title || targetNotebook || "Notebook",
          source: "motif_canvas_page",
          updated_at: docUpdatedAt(doc, page.updated_at || page.created_at),
        },
        items,
        plainContent,
      };
    };

    // --------------------------------------------------------------------------
    // ACTION: "read" — returns exactly what the page shows
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

      if (auth.userId) {
        const { page, error } = await loadJarvisPage(supabase, auth.userId, cleanTitle, targetNotebook);
        if (error) {
          console.error("[Jarvis API] jarvis_read_user_page RPC error:", error);
          const msg = formatErrorMessage(error);
          return NextResponse.json({ success: false, error: msg, message: msg }, { status: 500, headers: corsHeaders });
        }
        if (page) {
          const { payload, items } = notePayloadFor(page, page.raw_document_state || {});
          if (!payload.content) payload.content = cleanHtmlToPlainText(page.content || "");
          return NextResponse.json(
            { success: true, note: payload, items },
            { status: 200, headers: corsHeaders }
          );
        }
      }

      const notFoundMsg = notFoundMessage();
      return NextResponse.json(
        { success: false, error: notFoundMsg, message: notFoundMsg },
        { status: 404, headers: corsHeaders }
      );
    }

    // --------------------------------------------------------------------------
    // ACTION: "check" | "uncheck" | "remove"
    // --------------------------------------------------------------------------
    if (
      normalizedAction === "check" ||
      normalizedAction === "uncheck" ||
      normalizedAction === "remove"
    ) {
      if (!cleanTitle) {
        return NextResponse.json(
          {
            success: false,
            error: `Missing required 'title' field for '${normalizedAction}' action`,
            message: `Missing required 'title' field for '${normalizedAction}' action`,
          },
          { status: 400, headers: corsHeaders }
        );
      }

      const itemInput =
        rawItem !== undefined
          ? String(rawItem).trim()
          : text !== undefined
          ? String(text).trim()
          : "";

      const targetCore = parseListLine(itemInput).coreText.toLowerCase();
      if (!itemInput || !targetCore) {
        return NextResponse.json(
          {
            success: false,
            error: `Missing required 'item' field for '${normalizedAction}' action`,
            message: `Missing required 'item' field for '${normalizedAction}' action`,
          },
          { status: 400, headers: corsHeaders }
        );
      }

      const checked =
        normalizedAction === "uncheck"
          ? false
          : typeof rawChecked === "boolean"
          ? rawChecked
          : typeof rawChecked === "string"
          ? rawChecked.toLowerCase().trim() !== "false"
          : true;

      if (!auth.userId) {
        return NextResponse.json(
          {
            success: false,
            error: `Unable to resolve user account for '${normalizedAction}' operation`,
            message: `Unable to resolve user account for '${normalizedAction}' operation`,
          },
          { status: 500, headers: corsHeaders }
        );
      }

      const { page, error } = await loadJarvisPage(supabase, auth.userId, cleanTitle, targetNotebook);
      if (error) {
        console.error("[Jarvis API] jarvis_read_user_page RPC error:", error);
        const msg = formatErrorMessage(error);
        return NextResponse.json({ success: false, error: msg, message: msg }, { status: 500, headers: corsHeaders });
      }
      if (!page) {
        const notFoundMsg = notFoundMessage();
        return NextResponse.json(
          { success: false, error: notFoundMsg, message: notFoundMsg },
          { status: 404, headers: corsHeaders }
        );
      }

      const { doc: updatedDoc, matched } = updateItemInDoc(page.raw_document_state || {}, {
        pageTitle: page.title,
        isListNote,
        itemText: itemInput,
        action: normalizedAction === "remove" ? "remove" : "check",
        checked,
      });

      if (!matched) {
        const itemNotFoundMsg = `Item '${itemInput}' not found in ${page.title}`;
        return NextResponse.json(
          { success: false, error: itemNotFoundMsg, message: itemNotFoundMsg },
          { status: 404, headers: corsHeaders }
        );
      }

      const saved = await saveJarvisPage(supabase, auth.userId, page, updatedDoc, {
        title: cleanTitle,
        notebook: targetNotebook,
      });
      if (!saved.ok) {
        return NextResponse.json(
          { success: false, error: saved.error, message: saved.error },
          { status: 500, headers: corsHeaders }
        );
      }

      const { payload, items, plainContent } = notePayloadFor(page, saved.doc);
      return NextResponse.json(
        {
          success: true,
          note: payload,
          updatedNote: payload,
          content: plainContent,
          items,
        },
        { status: 200, headers: corsHeaders }
      );
    }

    // --------------------------------------------------------------------------
    // ACTION: "append" — writes into the page the editor renders
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
      if (!textContent) {
        return NextResponse.json(
          {
            success: false,
            error: "Missing required 'text' field for appending to note",
            message: "Missing required 'text' field for appending to note",
          },
          { status: 400, headers: corsHeaders }
        );
      }

      if (auth.userId) {
        const { page, error } = await loadJarvisPage(supabase, auth.userId, cleanTitle, targetNotebook);
        if (error) {
          console.error("[Jarvis API] jarvis_read_user_page RPC error:", error);
          const msg = formatErrorMessage(error);
          return NextResponse.json({ success: false, error: msg, message: msg }, { status: 500, headers: corsHeaders });
        }

        if (page) {
          const { doc: updatedDoc, outcome } = appendToDoc(page.raw_document_state || {}, {
            pageTitle: page.title,
            isListNote,
            text: textContent,
            addedBy,
            addedByOwner,
          });
          const saved = await saveJarvisPage(supabase, auth.userId, page, updatedDoc, {
            title: cleanTitle,
            notebook: targetNotebook,
          });
          if (!saved.ok) {
            return NextResponse.json(
              { success: false, error: saved.error, message: saved.error },
              { status: 500, headers: corsHeaders }
            );
          }
          const { payload, items } = notePayloadFor(page, saved.doc);
          const message =
            outcome === "movedFromChecked"
              ? "Moved back from Checked"
              : outcome === "alreadyOnList"
              ? "Already on the list"
              : undefined;
          return NextResponse.json(
            {
              success: true,
              updatedNote: { ...payload, addedBy, addedByOwner },
              items,
              ...(message
                ? { outcome, movedFromChecked: outcome === "movedFromChecked", message }
                : {}),
            },
            { status: 200, headers: corsHeaders }
          );
        }

        // No such page yet: create it (in the requested notebook) with this first item
        const rpcRes = await supabase.rpc("jarvis_append_or_create_page", {
          p_user_id: auth.userId,
          p_title: cleanTitle,
          p_text: isListNote ? `- [ ] ${parseListLine(textContent).coreText}` : textContent,
          p_is_list: isListNote,
          p_notebook_name: targetNotebook,
          p_added_by: addedBy,
          p_added_by_owner: addedByOwner,
        });

        if (rpcRes.error) {
          console.error("[Jarvis API] jarvis_append_or_create_page RPC error:", rpcRes.error);
          const msg = formatErrorMessage(rpcRes.error);
          return NextResponse.json({ success: false, error: msg, message: msg }, { status: 500, headers: corsHeaders });
        }

        const res = rpcRes.data as any;
        if (res && res.success && res.page_id) {
          // Confirm the new page is really there before reporting success
          const created = await loadJarvisPage(supabase, auth.userId, cleanTitle, targetNotebook);
          if (created.page?.page_id === res.page_id) {
            const { payload, items } = notePayloadFor(created.page, created.page.raw_document_state || {});
            const isCreated = res.action === "created";
            return NextResponse.json(
              {
                success: true,
                [isCreated ? "createdNote" : "updatedNote"]: { ...payload, addedBy, addedByOwner },
                items,
              },
              { status: isCreated ? 201 : 200, headers: corsHeaders }
            );
          }
          return NextResponse.json(
            {
              success: false,
              error: "The note was created but could not be confirmed. Please try again.",
              message: "The note was created but could not be confirmed. Please try again.",
            },
            { status: 500, headers: corsHeaders }
          );
        }
      }

      return NextResponse.json(
        {
          success: false,
          error: "Unable to resolve user account for append operation",
          message: "Unable to resolve user account for append operation",
        },
        { status: 500, headers: corsHeaders }
      );
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

      if (auth.userId) {
        const rpcRes = await supabase.rpc("jarvis_create_page", {
          p_user_id: auth.userId,
          p_title: cleanTitle,
          p_text: textContent,
          p_notebook_name: targetNotebook,
          p_added_by: addedBy,
          p_added_by_owner: addedByOwner,
        });

        if (rpcRes.error) {
          console.error("[Jarvis API] jarvis_create_page RPC error:", rpcRes.error);
          const msg = formatErrorMessage(rpcRes.error);
          return NextResponse.json(
            { success: false, error: msg, message: msg },
            { status: 500, headers: corsHeaders }
          );
        }

        if (rpcRes.data && (rpcRes.data as any).success) {
          const res = rpcRes.data as any;
          const structured = extractStructuredItemsFromDocState(res.document_state);
          return NextResponse.json(
            {
              success: true,
              note: {
                id: res.page_id,
                title: cleanTitle,
                content: textContent,
                addedBy,
                addedByOwner,
                items: structured.items,
                notebook: res.notebook || targetNotebook || "Notebook",
                source: "motif_canvas_page",
              },
              items: structured.items,
            },
            { status: 201, headers: corsHeaders }
          );
        }
      }

      return NextResponse.json(
        {
          success: false,
          error: "Unable to resolve user account for create operation",
          message: "Unable to resolve user account for create operation",
        },
        { status: 500, headers: corsHeaders }
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

    const invalidActionMsg = `Invalid action '${action || ""}'. Supported actions: 'create', 'append', 'read', 'list', 'check', 'remove'`;
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
