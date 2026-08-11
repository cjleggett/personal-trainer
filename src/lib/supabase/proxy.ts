import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase auth session on every request and redirects
 * unauthenticated users to /login. Invoked from the root proxy (src/proxy.ts).
 *
 * IMPORTANT: return the `supabaseResponse` object as-is. If you create a new
 * response, copy over its cookies, or the session will desync.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and getClaims() — it refreshes
  // the token and any gap can cause hard-to-debug session issues.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  const url = request.nextUrl;
  // Routes reachable without a session: the login page and the email-confirm
  // handler (which establishes the session).
  const isPublicRoute =
    url.pathname.startsWith("/login") ||
    url.pathname.startsWith("/auth/confirm");

  if (!claims && !isPublicRoute) {
    const redirectUrl = url.clone();
    redirectUrl.pathname = "/login";
    return NextResponse.redirect(redirectUrl);
  }

  return supabaseResponse;
}
