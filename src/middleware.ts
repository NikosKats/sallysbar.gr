import { defineMiddleware } from "astro:middleware";
import { createSupabaseServerClient } from "./lib/supabase";

// Routes that require admin role
const ADMIN_ROUTES = ["/admin", "/el/admin"];

// Routes that require employee or admin role
const STAFF_ROUTES = ["/staff"];

// Routes that logged-in users should be redirected away from (to dashboard)
const AUTH_ROUTES = ["/login", "/register", "/el/login", "/el/register", "/forgot-password", "/el/forgot-password"];

export const onRequest = defineMiddleware(async (context, next) => {
  const { request, cookies, locals, redirect } = context;
  const pathname = new URL(request.url).pathname;

  const supabase = createSupabaseServerClient(request, cookies);

  // Get the authenticated user (verifies JWT with Supabase server)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  locals.user = user ?? null;
  locals.session = null;
  locals.role = null;

  if (user) {
    // Fetch user role from profiles table
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    locals.role = (profile?.role as App.Locals["role"]) ?? "customer";
  }

  // Protect admin routes
  const isAdminRoute = ADMIN_ROUTES.some((r) => pathname.startsWith(r));
  if (isAdminRoute && locals.role !== "admin") {
    return redirect(`/login?next=${encodeURIComponent(pathname)}`);
  }

  // Protect staff routes
  const isStaffRoute = STAFF_ROUTES.some((r) => pathname.startsWith(r));
  if (isStaffRoute && !["employee", "admin"].includes(locals.role ?? "")) {
    return redirect(`/login?next=${encodeURIComponent(pathname)}`);
  }

  // Redirect already logged-in users away from auth pages
  const isAuthRoute = AUTH_ROUTES.some((r) => pathname.startsWith(r));
  if (isAuthRoute && user) {
    return redirect("/dashboard");
  }

  return next();
});
