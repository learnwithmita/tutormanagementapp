import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options: CookieOptions };

// Refreshes the auth session on every request and enforces route protection.
// Public routes: /login, /signup, and Next internals/assets. Everything else
// requires a session; unauthenticated users are redirected to /login with a
// ?redirect=<original path> so we can return them after login.
// Routes that never require a session.
const PUBLIC_PATHS = ["/login", "/signup", "/forgot-password", "/reset-password"];
// Of those, only these should bounce an already-signed-in user to home.
// (Not /reset-password: the recovery link itself creates a temporary session.)
const AUTH_ONLY_PATHS = ["/login", "/signup"];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  // Signed-in user hitting the login/signup pages → send to home. (Recovery
  // sessions on /reset-password are left alone.)
  const isAuthOnly = AUTH_ONLY_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
  if (user && isAuthOnly) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
