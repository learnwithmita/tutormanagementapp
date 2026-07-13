import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Auth callback for email links (signup confirmation + password recovery).
// Supabase redirects here with a `code`; we exchange it for a session (setting
// the auth cookies) and forward to `next` (default home; /reset-password for
// recovery links).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // No code, or exchange failed → send to login with a hint.
  return NextResponse.redirect(`${origin}/login?error=link`);
}
