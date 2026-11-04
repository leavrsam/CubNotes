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
 * Validates request authentication against process.env.JARVIS_API_KEY
 * Checks `x-jarvis-key` header (case-insensitive in Fetch API) or Bearer authorization header
 */
function isAuthorized(req: NextRequest): boolean {
  const expectedKey = process.env.JARVIS_API_KEY?.trim();
  if (!expectedKey) {
    return false;
  }

  // Check x-jarvis-key header
  const headerKey = req.headers.get("x-jarvis-key")?.trim();
  if (headerKey && headerKey === expectedKey) {
    return true;
  }

  // Check standard Authorization: Bearer <key> header
  const authHeader = req.headers.get("authorization")?.trim();
  if (authHeader) {
    const bearerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (bearerToken === expectedKey) {
      return true;
    }
  }

  return false;
}

/**
 * Initializes a Supabase client using Service Role key (if set) or Anon key
 */
function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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
    error?.code === "PGRST205" ||
    (typeof error?.message === "string" && error.message.includes("motif_notes"))
  ) {
    return "Database table 'motif_notes' not found. Please run the migration script in 'supabase/motif_notes.sql' in your Supabase SQL Editor.";
  }
  return error?.message || String(error) || "An unexpected database error occurred";
}

/**
 * GET /api/jarvis - List or search notes
 * Query parameters:
 *  - search / query / title: Optional string to filter notes by title or content
 *  - limit: Number of notes to return (default 15, max 50)
 *  - type / note_type: Optional filter by note_type (e.g., 'list', 'note')
 */
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      { success: false, error: "Unauthorized: Missing or invalid API key" },
      { status: 401, headers: corsHeaders }
    );
  }

  try {
    const supabase = getSupabaseClient();
    const { searchParams } = new URL(req.url);

    const query = (
      searchParams.get("search") ||
      searchParams.get("query") ||
      searchParams.get("title") ||
      ""
    ).trim();

    const limitParam = parseInt(searchParams.get("limit") || "15", 10);
    const limit = isNaN(limitParam) ? 15 : Math.min(Math.max(limitParam, 1), 50);

    const typeFilter = (searchParams.get("note_type") || searchParams.get("type") || "").trim();

    let queryBuilder = supabase
      .from("motif_notes")
      .select("id, title, content, note_type, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (query) {
      queryBuilder = queryBuilder.or(`title.ilike.%${query}%,content.ilike.%${query}%`);
    }

    if (typeFilter) {
      queryBuilder = queryBuilder.eq("note_type", typeFilter);
    }

    const { data: notes, error } = await queryBuilder;

    if (error) {
      throw error;
    }

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
 * JSON payload: { action, title, text, content, note_type }
 */
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
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
    const textContent = (text !== undefined ? text : content ?? "").toString();
    const cleanTitle = typeof title === "string" ? title.trim() : "";

    const supabase = getSupabaseClient();

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

      const noteType = (note_type || "note").toString().toLowerCase().trim();
      const now = new Date().toISOString();

      const { data: note, error } = await supabase
        .from("motif_notes")
        .insert({
          title: cleanTitle,
          content: textContent,
          note_type: noteType,
          created_at: now,
          updated_at: now,
        })
        .select("id, title, content, note_type, created_at, updated_at")
        .single();

      if (error) {
        throw error;
      }

      return NextResponse.json(
        {
          success: true,
          note: {
            id: note.id,
            title: note.title,
            content: note.content,
            note_type: note.note_type,
            created_at: note.created_at,
            updated_at: note.updated_at,
          },
        },
        { status: 201, headers: corsHeaders }
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

      // Step 1: Look for exact case-insensitive title match first
      let { data: matches, error: searchError } = await supabase
        .from("motif_notes")
        .select("*")
        .ilike("title", cleanTitle)
        .order("updated_at", { ascending: false })
        .limit(1);

      if (searchError) {
        throw searchError;
      }

      // Step 2: Fallback to fuzzy substring match if exact match wasn't found
      if (!matches || matches.length === 0) {
        const { data: fuzzyMatches, error: fuzzyError } = await supabase
          .from("motif_notes")
          .select("*")
          .ilike("title", `%${cleanTitle}%`)
          .order("updated_at", { ascending: false })
          .limit(1);

        if (fuzzyError) {
          throw fuzzyError;
        }
        matches = fuzzyMatches;
      }

      const existingNote = matches && matches.length > 0 ? matches[0] : null;

      if (existingNote) {
        // Note found -> Append item or block
        const isList = existingNote.note_type === "list" || note_type === "list";
        const existingContent = existingNote.content || "";
        const item = textContent.trim();

        let updatedContent = existingContent;
        if (!existingContent.trim()) {
          updatedContent = isList ? (item.startsWith("- ") ? item : `- ${item}`) : item;
        } else if (isList) {
          const formattedItem = item.startsWith("- ") ? item : `- ${item}`;
          updatedContent = `${existingContent.trimEnd()}\n${formattedItem}`;
        } else {
          updatedContent = `${existingContent.trimEnd()}\n\n${item}`;
        }

        const now = new Date().toISOString();
        const { data: updatedNote, error: updateError } = await supabase
          .from("motif_notes")
          .update({
            content: updatedContent,
            updated_at: now,
          })
          .eq("id", existingNote.id)
          .select("id, title, content, note_type, created_at, updated_at")
          .single();

        if (updateError) {
          throw updateError;
        }

        return NextResponse.json(
          { success: true, updatedNote },
          { status: 200, headers: corsHeaders }
        );
      } else {
        // Note not found -> Automatically create it with this item
        const isList = note_type === "list";
        const item = textContent.trim();
        const initialContent = isList ? (item.startsWith("- ") ? item : `- ${item}`) : item;
        const now = new Date().toISOString();

        const { data: createdNote, error: createError } = await supabase
          .from("motif_notes")
          .insert({
            title: cleanTitle,
            content: initialContent,
            note_type: note_type || (isList ? "list" : "note"),
            created_at: now,
            updated_at: now,
          })
          .select("id, title, content, note_type, created_at, updated_at")
          .single();

        if (createError) {
          throw createError;
        }

        return NextResponse.json(
          { success: true, createdNote },
          { status: 201, headers: corsHeaders }
        );
      }
    }

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

      // Step 1: Look for exact case-insensitive match
      let { data: notes, error: readError } = await supabase
        .from("motif_notes")
        .select("id, title, content, note_type, created_at, updated_at")
        .ilike("title", cleanTitle)
        .order("updated_at", { ascending: false })
        .limit(1);

      if (readError) {
        throw readError;
      }

      // Step 2: Fallback to substring fuzzy match
      if (!notes || notes.length === 0) {
        const { data: fuzzyNotes, error: fuzzyError } = await supabase
          .from("motif_notes")
          .select("id, title, content, note_type, created_at, updated_at")
          .ilike("title", `%${cleanTitle}%`)
          .order("updated_at", { ascending: false })
          .limit(1);

        if (fuzzyError) {
          throw fuzzyError;
        }
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
            created_at: note.created_at,
          },
        },
        { status: 200, headers: corsHeaders }
      );
    }

    // --------------------------------------------------------------------------
    // ACTION: "list"
    // --------------------------------------------------------------------------
    if (normalizedAction === "list") {
      const { data: notes, error: listError } = await supabase
        .from("motif_notes")
        .select("id, title, note_type, updated_at")
        .order("updated_at", { ascending: false })
        .limit(15);

      if (listError) {
        throw listError;
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

    // --------------------------------------------------------------------------
    // UNKNOWN ACTION
    // --------------------------------------------------------------------------
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
