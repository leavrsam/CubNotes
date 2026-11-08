import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
 * Splits a Canvas text card's HTML content into trimmed non-empty lines
 */
function htmlToLines(html: string): string[] {
  if (!html) return [];
  const plain = html
    .replace(/<\/(p|li|h[1-6]|div)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
  return plain
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Serializes plain text lines back into Canvas paragraph HTML
 */
function linesToHtml(lines: string[]): string {
  return lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("");
}

/**
 * Parses a list line to extract its core item text (ignoring leading bullets,
 * checkboxes like [x]/[ ], and any "[Added by ...]" prefix) as well as any guest prefix.
 */
function parseListLine(line: string): {
  coreText: string;
  guestTag: string | null;
} {
  let rest = line.trim();
  let guestTag: string | null = null;

  const extractGuest = (s: string) => {
    const m = s.match(/^(\[Added by [^\]]+\])\s*(.*)$/i);
    if (m) {
      guestTag = m[1];
      return m[2].trim();
    }
    return s;
  };

  for (let i = 0; i < 3; i++) {
    rest = extractGuest(rest);
    rest = rest.replace(/^[-*•]\s+/, "").trim();
    rest = extractGuest(rest);
    rest = rest.replace(/^\[[ xX]?\]\s*/, "").trim();
  }

  return {
    coreText: rest.trim(),
    guestTag,
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
 * POST /api/jarvis - Create, append, read, list, check, or remove notes/items with Guest Privacy & Tagging
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

    // 3. Guest Tagging (only for create/append):
    // When a note or list item is created or appended with isAuthorizedOwner === false,
    // prepend "[Added by " + (speaker || "Guest") + "] "
    if (
      !isAuthorizedOwner &&
      textContent &&
      (normalizedAction === "create" || normalizedAction === "append")
    ) {
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
          const rawTexts = page.raw_document_state?.texts;
          const lines = Array.isArray(rawTexts)
            ? rawTexts.flatMap((t: any) => htmlToLines(t.content || ""))
            : [];
          const plainContent =
            lines.length > 0
              ? lines.join("\n")
              : cleanHtmlToPlainText(page.content || "");

          return NextResponse.json(
            {
              success: true,
              note: {
                id: page.page_id,
                title: page.title,
                content: plainContent,
                items: lines,
                notebook: page.notebook_title || targetNotebook || "Notebook",
                source: "motif_canvas_page",
                updated_at: page.created_at,
              },
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

      let matched = false;
      const updatedTexts = texts.map((t: any) => {
        const lines = htmlToLines(t.content || "");
        if (matched) return t;

        const newLines: string[] = [];
        for (const line of lines) {
          if (!matched) {
            const parsed = parseListLine(line);
            if (parsed.coreText.toLowerCase() === targetCore) {
              matched = true;
              if (normalizedAction === "remove") {
                // Delete the first matching line
                continue;
              } else {
                // Store item as "- [x] item" / "- [ ] item"
                const displayItem = parsed.guestTag
                  ? `${parsed.guestTag} ${parsed.coreText}`
                  : parsed.coreText;
                newLines.push(`${checked ? "- [x]" : "- [ ]"} ${displayItem}`);
                continue;
              }
            }
          }
          newLines.push(line);
        }

        return {
          ...t,
          content: linesToHtml(newLines),
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

      const allUpdatedLines = updatedTexts.flatMap((t: any) =>
        htmlToLines(t.content || "")
      );
      const updatedPlainContent = allUpdatedLines.join("\n");
      const resolvedNotebook = page.notebook_title || targetNotebook || "Notebook";
      const notePayload = {
        id: page.page_id,
        title: page.title,
        content: updatedPlainContent,
        items: allUpdatedLines,
        notebook: resolvedNotebook,
        source: "motif_canvas_page",
        updated_at: page.created_at,
      };

      return NextResponse.json(
        {
          success: true,
          note: notePayload,
          updatedNote: notePayload,
          content: updatedPlainContent,
          items: allUpdatedLines,
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
        const rpcRes = await supabase.rpc("jarvis_append_or_create_page", {
          p_user_id: auth.userId,
          p_title: cleanTitle,
          p_text: textContent,
          p_is_list: isList,
          p_notebook_name: targetNotebook,
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
          const payload = {
            id: res.page_id,
            title: cleanTitle,
            content: textContent,
            notebook: res.notebook || targetNotebook || "Notebook",
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
          return NextResponse.json(
            {
              success: true,
              note: {
                id: res.page_id,
                title: cleanTitle,
                content: textContent,
                notebook: res.notebook || targetNotebook || "Notebook",
                source: "motif_canvas_page",
              },
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
