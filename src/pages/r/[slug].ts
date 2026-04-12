import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../lib/supabase";

export const GET: APIRoute = async ({ params }) => {
  const slug = params.slug;
  if (!slug) return new Response("Not found", { status: 404 });

  const { data: c } = await supabaseAdmin
    .from("campaigns")
    .select("id, target_url, utm_source, utm_medium, utm_campaign, utm_content, active")
    .eq("slug", slug)
    .maybeSingle();

  if (!c || !c.active || !c.target_url) {
    return new Response("Campaign not found", { status: 404 });
  }

  // Fire-and-forget scan increment
  supabaseAdmin.rpc("increment_campaign_scan", { p_id: c.id }).then(() => {}).catch(() => {});

  // Build destination URL with UTM params
  let dest: URL;
  try { dest = new URL(c.target_url); }
  catch { return new Response("Bad target", { status: 500 }); }

  const addIfMissing = (k: string, v: string | null) => {
    if (v && !dest.searchParams.has(k)) dest.searchParams.set(k, v);
  };
  addIfMissing("utm_source",   c.utm_source);
  addIfMissing("utm_medium",   c.utm_medium);
  addIfMissing("utm_campaign", c.utm_campaign);
  addIfMissing("utm_content",  c.utm_content);

  return new Response(null, {
    status: 302,
    headers: { Location: dest.toString(), "Cache-Control": "no-store" },
  });
};
