import { defineMiddleware } from "astro:middleware";
import { createSupabaseServerClient, supabaseAdmin } from "./lib/supabase";

// Routes that require admin role
const ADMIN_ROUTES = ["/admin", "/el/admin"];

// Routes that require employee or admin role
const STAFF_ROUTES = ["/staff", "/el/staff"];

// Routes that logged-in users should be redirected away from (to dashboard)
const AUTH_ROUTES = ["/login", "/register", "/el/login", "/el/register", "/forgot-password", "/el/forgot-password"];

export const onRequest = defineMiddleware(async (context, next) => {
  const { request, cookies, locals, redirect } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Google/OAuth sometimes redirects to the Supabase "Site URL" (the root) with ?code=…
  // instead of to /auth/callback — rescue those and funnel them through our handler.
  if ((pathname === "/" || pathname === "/el" || pathname === "/el/") && url.searchParams.has("code")) {
    const code = url.searchParams.get("code")!;
    const next = url.searchParams.get("next") ?? "/account";
    return redirect(`/auth/callback?code=${encodeURIComponent(code)}&next=${encodeURIComponent(next)}`);
  }

  // x-astro-lang header is set by elRewrite() stubs so language survives middleware re-run on rewrite
  const langHeader = request.headers.get("x-astro-lang");
  locals.lang = (pathname.startsWith("/el") || langHeader === "el") ? "el" : "en";
  locals.user = null;
  locals.session = null;
  locals.role = null;

  let user = null;

  try {
    const supabase = createSupabaseServerClient(request, cookies);

    // Get the authenticated user (verifies JWT with Supabase server)
    const { data } = await supabase.auth.getUser();
    user = data.user ?? null;
    locals.user = user;

    if (user) {
      // Fetch role + handle in a single query — Header & pages read these from locals to avoid extra round-trips.
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("role, handle")
        .eq("id", user.id)
        .single();

      locals.role = (profile?.role as App.Locals["role"]) ?? "customer";
      (locals as any).handle = profile?.handle ?? null;
    }
  } catch {
    // Supabase unavailable — continue as unauthenticated
  }

  // Protect admin routes
  const isAdminRoute = ADMIN_ROUTES.some((r) => pathname.startsWith(r));
  if (isAdminRoute && !["admin", "super_admin"].includes(locals.role ?? "")) {
    return redirect(`/login?next=${encodeURIComponent(pathname)}`);
  }

  // Protect staff routes
  const isStaffRoute = STAFF_ROUTES.some((r) => pathname.startsWith(r));
  if (isStaffRoute && !["employee", "admin", "super_admin"].includes(locals.role ?? "")) {
    return redirect(`/login?next=${encodeURIComponent(pathname)}`);
  }

  // Redirect already logged-in users away from auth pages
  const isAuthRoute = AUTH_ROUTES.some((r) => pathname.startsWith(r));
  if (isAuthRoute && user) {
    const isEl = pathname.startsWith("/el");
    return redirect(isEl ? "/el/dashboard" : "/dashboard");
  }

  return next();
});
