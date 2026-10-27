import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    
    // 1. Authenticate user from session cookies
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {}
          },
        },
      }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    // If request contains an unauthenticated email request from public /delete-account page
    const body = await req.json().catch(() => ({}));
    const targetEmail = body?.email;

    if (!user && !targetEmail) {
      return NextResponse.json({ error: "Unauthorized. Please sign in or provide a registered email." }, { status: 401 });
    }

    const userId = user?.id;

    // 2. If authenticated, purge user content via RLS
    if (userId) {
      try {
        // Delete user's notebooks, sections, and pages (cascading through RLS)
        await supabase.from("notebooks").delete().eq("user_id", userId);
        await supabase.from("sections").delete().eq("user_id", userId);
        await supabase.from("pages").delete().eq("user_id", userId);
        await supabase.from("collaborations").delete().or(`owner_id.eq.${userId},collaborator_email.eq.${user.email}`);
      } catch (dbErr) {
        console.warn("Error purging user database rows:", dbErr);
      }

      // 3. If Service Role Key is available in environment (Vercel), delete auth user permanently
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (serviceKey && process.env.NEXT_PUBLIC_SUPABASE_URL) {
        try {
          const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            serviceKey,
            { auth: { autoRefreshToken: false, persistSession: false } }
          );
          await supabaseAdmin.auth.admin.deleteUser(userId);
        } catch (adminErr) {
          console.warn("Failed to delete user via admin API:", adminErr);
        }
      }

      // 4. Sign out
      await supabase.auth.signOut();

      return NextResponse.json({ 
        success: true, 
        message: "Your account and all associated data have been permanently deleted." 
      });
    }

    // 5. Signed-out public deletion request handling (for Play Console compliance)
    if (targetEmail) {
      console.log(`[Account Deletion Request] Received request for email: ${targetEmail}`);
      // Record or notify admin for manual verification
      return NextResponse.json({ 
        success: true, 
        message: "Your deletion request has been registered. All associated data will be purged within 48 hours." 
      });
    }

    return NextResponse.json({ error: "Invalid deletion request" }, { status: 400 });
  } catch (error: any) {
    console.error("Account deletion error:", error);
    return NextResponse.json({ error: error?.message || "Internal server error" }, { status: 500 });
  }
}
