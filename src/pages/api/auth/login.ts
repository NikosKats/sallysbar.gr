import type { APIRoute } from "astro";
import { createSupabaseServerClient } from "../../../lib/supabase";

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const formData = await request.formData();
  const email = formData.get("email")?.toString() ?? "";
  const password = formData.get("password")?.toString() ?? "";
  const next = formData.get("next")?.toString() ?? "/dashboard";
  const rawToken = formData.get("captchaToken")?.toString() || undefined;
  // Skip captcha in local dev — Turnstile tokens are invalid on localhost
  const captchaToken = import.meta.env.DEV ? undefined : rawToken;

  if (!email || !password) {
    return redirect(`/login?error=invalid&next=${encodeURIComponent(next)}`);
  }

  const supabase = createSupabaseServerClient(request, cookies);
  const { error } = await supabase.auth.signInWithPassword({ email, password, options: { captchaToken } });

  if (error) {
    let code = "generic";
    if (error.status === 400) code = "invalid";
    else if (error.message?.toLowerCase().includes("email not confirmed")) code = "unconfirmed";
    const msg = encodeURIComponent(error.message ?? "unknown");
    return redirect(`/login?error=${code}&msg=${msg}&next=${encodeURIComponent(next)}`);
  }

  return redirect(next);
};
