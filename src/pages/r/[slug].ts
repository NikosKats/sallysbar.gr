import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../lib/supabase";
import { parseUA, hashIp } from "../../lib/ua";

export const GET: APIRoute = async ({ params, request, clientAddress }) => {
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

  // Log scan (fire-and-forget but awaited before redirect to ensure write on Cloudflare edge)
  try {
    const h = request.headers;
    const ua = h.get("user-agent") || "";
    const { device, browser, os } = parseUA(ua);
    let ip = "";
    try { ip = clientAddress || h.get("cf-connecting-ip") || h.get("x-forwarded-for")?.split(",")[0]?.trim() || ""; } catch {}
    const ip_hash = ip ? await hashIp(ip) : null;
    const lat = h.get("cf-iplatitude"); const lon = h.get("cf-iplongitude");

    await Promise.all([
      supabaseAdmin.from("campaign_scans").insert({
        campaign_id: c.id,
        country:        h.get("cf-ipcountry") || null,
        region:         h.get("cf-region") || null,
        city:           h.get("cf-ipcity") || null,
        timezone:       h.get("cf-timezone") || null,
        lat: lat ? Number(lat) : null,
        lon: lon ? Number(lon) : null,
        device, browser, os,
        user_agent:      ua || null,
        referer:         h.get("referer") || null,
        accept_language: h.get("accept-language") || null,
        ip_hash,
      }),
      supabaseAdmin.rpc("increment_campaign_scan", { p_id: c.id }),
    ]);
  } catch (e) {
    console.error("[r/slug] scan log failed", e);
  }

  return new Response(null, {
    status: 302,
    headers: { Location: dest.toString(), "Cache-Control": "no-store" },
  });
};
