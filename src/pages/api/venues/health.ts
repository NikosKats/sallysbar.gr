import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

// Pings every venue's live domain, updates last_health_check + last_health_ok.
export const POST: APIRoute = async ({ locals }) => {
  if (locals.role !== "super_admin") return json({ error: "Forbidden" }, 403);

  const { data: venues } = await supabaseAdmin
    .from("saas_venues")
    .select("slug, domain, cloudflare_pages_url")
    .not("domain", "is", null);

  const results: any[] = [];
  await Promise.all((venues ?? []).map(async (v: any) => {
    const url = v.domain ? `https://${v.domain}` : v.cloudflare_pages_url;
    if (!url) return;
    let ok = false;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 6000);
      const r = await fetch(url, { signal: ctrl.signal, redirect: "follow" });
      clearTimeout(t);
      ok = r.ok;
    } catch { ok = false; }
    await supabaseAdmin
      .from("saas_venues")
      .update({ last_health_check: new Date().toISOString(), last_health_ok: ok })
      .eq("slug", v.slug);
    results.push({ slug: v.slug, url, ok });
  }));

  return json({ ok: true, results });
};
