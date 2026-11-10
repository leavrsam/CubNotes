import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  linesToHtml,
  parseListLine,
  parseTextNodeItems,
  parseChecklist,
  serializeChecklist,
  itemsMatch,
  type JarvisItemMeta,
  type JarvisStructuredItem,
} from "@/lib/listItems";

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
 * Before appending an item: if the note already has a CHECKED copy of it
 * (matched ignoring case, plurals, leading quantities and parentheses), uncheck
 * that copy instead of adding a duplicate. If an unchecked copy also exists,
 * the checked copies are removed instead. Item metadata is kept.
 * Returns null when nothing was changed (caller appends as usual).
 */
async function moveBackFromCheckedIfPresent(
  supabase: ReturnType<typeof getSupabaseClient>,
  userId: string,
  opts: { title: string; notebook: string | null; itemText: string }
): Promise<{
  page: any;
  items: JarvisStructuredItem[];
  outcome: "movedFromChecked" | "alreadyOnList";
} | null> {
  const coreText = parseListLine(opts.itemText).coreText.trim();
  if (!coreText || /\n/.test(opts.itemText)) return null;

  const rpcRes = await supabase.rpc("jarvis_read_user_page", {
    p_user_id: userId,
    p_title: opts.title,
    p_notebook_name: opts.notebook,
  });
  if (rpcRes.error) return null; // fall back to the normal append path
  const pages = Array.isArray(rpcRes.data) ? rpcRes.data : rpcRes.data ? [rpcRes.data] : [];
  const page = pages[0];
  if (!page?.title) return null;

  const docState = page.raw_document_state || {};
  const texts: any[] = Array.isArray(docState.texts) ? docState.texts : [];
  const docLevelMeta = Array.isArray(docState.itemsMeta) ? docState.itemsMeta : undefined;
  const parsed = texts.map((t) =>
    parseChecklist({ content: t?.content, itemsMeta: Array.isArray(t?.itemsMeta) ? t.itemsMeta : docLevelMeta })
  );

  const hasUncheckedMatch = parsed.some((items) => items.some((it) => !it.checked && itemsMatch(it.text, coreText)));
  const checkedMatches: { node: number; item: number }[] = [];
  parsed.forEach((items, node) =>
    items.forEach((it, item) => {
      if (it.checked && itemsMatch(it.text, coreText)) checkedMatches.push({ node, item });
    })
  );
  if (checkedMatches.length === 0) return null;

  const keep = hasUncheckedMatch ? null : checkedMatches[0];
  const touchedNodes = new Set(checkedMatches.map((m) => m.node));
  const updatedTexts = texts.map((t, nodeIdx) => {
    if (!touchedNodes.has(nodeIdx)) return t;
    const next = parsed[nodeIdx]
      .map((it, itemIdx) =>
        keep && keep.node === nodeIdx && keep.item === itemIdx ? { ...it, checked: false } : it
      )
      .filter(
        (it, itemIdx) =>
          (keep && keep.node === nodeIdx && keep.item === itemIdx) ||
          !(it.checked && itemsMatch(it.text, coreText))
      );
    return { ...t, ...serializeChecklist(next) };
  });

  const updatedDocState = { ...docState, texts: updatedTexts };
  const updateRes = await supabase.rpc("jarvis_update_page_document_state", {
    p_user_id: userId,
    p_page_id: page.page_id,
    p_document_state: updatedDocState,
  });
  if (updateRes.error || !updateRes.data) {
    console.error("[Jarvis API] move-back-from-checked update failed:", updateRes.error);
    return null;
  }

  return {
    page,
    items: extractStructuredItemsFromDocState(updatedDocState).items,
    outcome: keep ? "movedFromChecked" : "alreadyOnList",
  };
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
            updated_at: p.created_at,
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

      if (auth.userId) {
        const rpcRes = await supabase.rpc("jarvis_read_user_page", {
          p_user_id: auth.userId,
          p_title: cleanTitle,
          p_notebook_name: targetNotebook,
        });

        if (rpcRes.error) {
          console.error("[Jarvis API] jarvis_read_user_page RPC error:", rpcRes.error);
          const msg = formatErrorMessage(rpcRes.error);
          return NextResponse.json(
            { success: false, error: msg, message: msg },
            { status: 500, headers: corsHeaders }
          );
        }

        const pages = Array.isArray(rpcRes.data)
          ? rpcRes.data
          : rpcRes.data
          ? [rpcRes.data]
          : [];

        if (pages.length > 0 && pages[0]?.title) {
          const page = pages[0];
          const structured = extractStructuredItemsFromDocState(page.raw_document_state);
          const plainContent =
            structured.plainContent || cleanHtmlToPlainText(page.content || "");

          return NextResponse.json(
            {
              success: true,
              note: {
                id: page.page_id,
                title: page.title,
                content: plainContent,
                items: structured.items,
                notebook: page.notebook_title || targetNotebook || "Notebook",
                source: "motif_canvas_page",
                updated_at: page.created_at,
              },
              items: structured.items,
            },
            { status: 200, headers: corsHeaders }
          );
        }
      }

      const notFoundMsg = targetNotebook
        ? `Note not found in ${targetNotebook} notebook`
        : "Note not found";

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

      const rpcRes = await supabase.rpc("jarvis_read_user_page", {
        p_user_id: auth.userId,
        p_title: cleanTitle,
        p_notebook_name: targetNotebook,
      });

      if (rpcRes.error) {
        console.error("[Jarvis API] jarvis_read_user_page RPC error:", rpcRes.error);
        const msg = formatErrorMessage(rpcRes.error);
        return NextResponse.json(
          { success: false, error: msg, message: msg },
          { status: 500, headers: corsHeaders }
        );
      }

      const pages = Array.isArray(rpcRes.data)
        ? rpcRes.data
        : rpcRes.data
        ? [rpcRes.data]
        : [];

      if (pages.length === 0 || !pages[0]?.title) {
        const notFoundMsg = targetNotebook
          ? `Note not found in ${targetNotebook} notebook`
          : "Note not found";
        return NextResponse.json(
          { success: false, error: notFoundMsg, message: notFoundMsg },
          { status: 404, headers: corsHeaders }
        );
      }

      const page = pages[0];
      const docState = page.raw_document_state || {};
      const texts = Array.isArray(docState.texts) ? [...docState.texts] : [];
      const docLevelMeta = Array.isArray(docState.itemsMeta) ? docState.itemsMeta : undefined;

      let matched = false;
      const updatedTexts = texts.map((t: any) => {
        const { items, cleanLines, normalizedMeta } = parseTextNodeItems(t, docLevelMeta);
        if (matched) {
          return {
            ...t,
            content: linesToHtml(cleanLines),
            itemsMeta: normalizedMeta,
          };
        }

        const newLines: string[] = [];
        const newMeta: JarvisItemMeta[] = [];

        for (let i = 0; i < items.length; i++) {
          const entry = items[i];
          const meta = normalizedMeta[i];
          if (!matched && entry.text.toLowerCase() === targetCore) {
            matched = true;
            if (normalizedAction === "remove") {
              // Delete the first matching line and its metadata
              continue;
            } else {
              // Store item as "- [x] item" / "- [ ] item" with metadata preserved in itemsMeta
              newLines.push(`${checked ? "- [x]" : "- [ ]"} ${entry.text}`);
              newMeta.push(meta);
              continue;
            }
          }
          newLines.push(cleanLines[i]);
          newMeta.push(meta);
        }

        return {
          ...t,
          content: linesToHtml(newLines),
          itemsMeta: newMeta,
        };
      });

      if (!matched) {
        const itemNotFoundMsg = `Item '${itemInput}' not found in ${page.title}`;
        return NextResponse.json(
          { success: false, error: itemNotFoundMsg, message: itemNotFoundMsg },
          { status: 404, headers: corsHeaders }
        );
      }

      const updatedDocState = {
        ...docState,
        texts: updatedTexts,
      };

      const updateRes = await supabase.rpc("jarvis_update_page_document_state", {
        p_user_id: auth.userId,
        p_page_id: page.page_id,
        p_document_state: updatedDocState,
      });

      if (updateRes.error || !updateRes.data) {
        console.error("[Jarvis API] jarvis_update_page_document_state error:", updateRes.error);
        const msg = updateRes.error
          ? formatErrorMessage(updateRes.error)
          : "Failed to update list item";
        return NextResponse.json(
          { success: false, error: msg, message: msg },
          { status: 500, headers: corsHeaders }
        );
      }

      const structured = extractStructuredItemsFromDocState(updatedDocState);
      const resolvedNotebook = page.notebook_title || targetNotebook || "Notebook";
      const notePayload = {
        id: page.page_id,
        title: page.title,
        content: structured.plainContent,
        items: structured.items,
        notebook: resolvedNotebook,
        source: "motif_canvas_page",
        updated_at: page.created_at,
      };

      return NextResponse.json(
        {
          success: true,
          note: notePayload,
          updatedNote: notePayload,
          content: structured.plainContent,
          items: structured.items,
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
          {
            success: false,
            error: "Missing required 'title' field for appending to note",
            message: "Missing required 'title' field for appending to note",
          },
          { status: 400, headers: corsHeaders }
        );
      }

      if (auth.userId) {
        // Keep-style dedupe: if this item is already on the note but checked,
        // move it back (uncheck) instead of adding a duplicate.
        const dedupe = await moveBackFromCheckedIfPresent(supabase, auth.userId, {
          title: cleanTitle,
          notebook: targetNotebook,
          itemText: textContent,
        });
        if (dedupe) {
          const payload = {
            id: dedupe.page.page_id,
            title: cleanTitle,
            content: textContent,
            addedBy,
            addedByOwner,
            items: dedupe.items,
            notebook: dedupe.page.notebook_title || targetNotebook || "Notebook",
            source: "motif_canvas_page",
          };
          const message =
            dedupe.outcome === "movedFromChecked" ? "Moved back from Checked" : "Already on the list";
          return NextResponse.json(
            {
              success: true,
              updatedNote: payload,
              items: dedupe.items,
              outcome: dedupe.outcome,
              movedFromChecked: dedupe.outcome === "movedFromChecked",
              message,
            },
            { status: 200, headers: corsHeaders }
          );
        }

        const rpcRes = await supabase.rpc("jarvis_append_or_create_page", {
          p_user_id: auth.userId,
          p_title: cleanTitle,
          p_text: textContent,
          p_is_list: isList,
          p_notebook_name: targetNotebook,
          p_added_by: addedBy,
          p_added_by_owner: addedByOwner,
        });

        if (rpcRes.error) {
          console.error("[Jarvis API] jarvis_append_or_create_page RPC error:", rpcRes.error);
          const msg = formatErrorMessage(rpcRes.error);
          return NextResponse.json(
            { success: false, error: msg, message: msg },
            { status: 500, headers: corsHeaders }
          );
        }

        if (rpcRes.data && (rpcRes.data as any).success) {
          const res = rpcRes.data as any;
          const isCreated = res.action === "created";
          const structured = extractStructuredItemsFromDocState(res.document_state);
          const payload = {
            id: res.page_id,
            title: cleanTitle,
            content: textContent,
            addedBy,
            addedByOwner,
            items: structured.items,
            notebook: res.notebook || targetNotebook || "Notebook",
            source: "motif_canvas_page",
          };

          return NextResponse.json(
            {
              success: true,
              [isCreated ? "createdNote" : "updatedNote"]: payload,
              items: structured.items,
            },
            { status: isCreated ? 201 : 200, headers: corsHeaders }
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
