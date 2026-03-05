import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { AstroCookies } from "astro";

/**
 * Server-side Supabase client — use in pages, API routes, and middleware.
 * Automatically reads and writes cookies for session management.
 */
export function createSupabaseServerClient(
  request: Request,
  cookies: AstroCookies
) {
  return createServerClient(
    import.meta.env.PUBLIC_SUPABASE_URL,
    import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return parseCookieHeader(request.headers.get("Cookie") ?? "")
            .filter((c): c is { name: string; value: string } => c.value !== undefined);
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookies.set(name, value, options);
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
let _admin: ReturnType<typeof createClient> | undefined;
export const supabaseAdmin = new Proxy({} as ReturnType<typeof createClient>, {
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
