import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import crypto from "crypto";

/**
 * GET /api/user/keys
 * Fetches the active API key for the authenticated user
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized. Please sign in." },
        { status: 401 }
      );
    }

    const { data: keyRecord, error } = await supabase
      .from("user_api_keys")
      .select("id, api_key, name, created_at, last_used_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error && error.code !== "PGRST116" && error.code !== "PGRST205") {
      console.error("[User API Keys] GET error:", error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      apiKey: keyRecord?.api_key || null,
      name: keyRecord?.name || null,
      createdAt: keyRecord?.created_at || null,
      lastUsedAt: keyRecord?.last_used_at || null,
    });
  } catch (error: any) {
    console.error("[User API Keys] GET exception:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/user/keys
 * Generates or regenerates an API key for the authenticated user
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized. Please sign in." },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const keyName = (body?.name || "Jarvis Assistant").trim();

    // Generate random 40-character secure token with motif_live_ prefix
    const randomHex = crypto.randomBytes(20).toString("hex");
    const newApiKey = `motif_live_${randomHex}`;

    // Purge any existing keys for this user to keep exactly 1 active key per account
    await supabase.from("user_api_keys").delete().eq("user_id", user.id);

    const { data: newRecord, error: insertError } = await supabase
      .from("user_api_keys")
      .insert({
        user_id: user.id,
        api_key: newApiKey,
        name: keyName,
        created_at: new Date().toISOString(),
      })
      .select("id, api_key, name, created_at")
      .single();

    if (insertError) {
      console.error("[User API Keys] POST error:", insertError);
      return NextResponse.json(
        {
          success: false,
          error:
            insertError.code === "PGRST205"
              ? "Database table 'user_api_keys' not found. Please run the migration in 'supabase/user_api_keys.sql'."
              : insertError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      apiKey: newRecord.api_key,
      name: newRecord.name,
      createdAt: newRecord.created_at,
    });
  } catch (error: any) {
    console.error("[User API Keys] POST exception:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/user/keys
 * Revokes the API key for the authenticated user
 */
export async function DELETE() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized. Please sign in." },
        { status: 401 }
      );
    }

    const { error: deleteError } = await supabase
      .from("user_api_keys")
      .delete()
      .eq("user_id", user.id);

    if (deleteError) {
      console.error("[User API Keys] DELETE error:", deleteError);
      return NextResponse.json(
        { success: false, error: deleteError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "API key successfully revoked",
    });
  } catch (error: any) {
    console.error("[User API Keys] DELETE exception:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
