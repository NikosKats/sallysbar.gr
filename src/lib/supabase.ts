import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AstroCookies } from "astro";

/**
 * Server-side Supabase client — use in pages, API routes, and middleware.
 * Automatically reads and writes cookies for session management.
 */
// Persist auth for ~1 year so mobile PWAs / home-screen launches stay logged in
// (Facebook / Instagram style). Refresh tokens are rotated server-side on each visit,
// so an attacker needs the device itself — same risk model as any always-logged-in app.
const SESSION_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export function createSupabaseServerClient(
  request: Request,
  cookies: AstroCookies
) {
  return createServerClient(
    import.meta.env.PUBLIC_SUPABASE_URL,
    import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
    {
      cookieOptions: {
        maxAge: SESSION_MAX_AGE,
        path: "/",
        sameSite: "lax",
        secure: true,
      },
      cookies: {
        getAll() {
          return parseCookieHeader(request.headers.get("Cookie") ?? "")
            .filter((c): c is { name: string; value: string } => c.value !== undefined);
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookies.set(name, value, { ...options, maxAge: SESSION_MAX_AGE, path: "/", sameSite: "lax", secure: true });
          });
        },
      },
    }
  );
}

/**
 * Admin client with service role key — bypasses RLS.
 * Lazy proxy: client is created on first use so module-level init
 * doesn't throw when SUPABASE_SERVICE_ROLE_KEY isn't baked in at build time.
 */
let _admin: SupabaseClient<any> | undefined;
export const supabaseAdmin: SupabaseClient<any> = new Proxy({} as SupabaseClient<any>, {
  get(_, prop) {
    if (!_admin) {
      _admin = createClient(
        import.meta.env.PUBLIC_SUPABASE_URL,
        import.meta.env.SUPABASE_SERVICE_ROLE_KEY
      );
    }
    const value = (_admin as any)[prop];
    return typeof value === "function" ? value.bind(_admin) : value;
  },
});
