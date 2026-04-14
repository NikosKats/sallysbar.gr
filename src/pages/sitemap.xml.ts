import type { APIRoute } from "astro";
import { supabaseAdmin } from "../lib/supabase";

const STATIC_PATHS: Array<{ path: string; priority: number; changefreq: string }> = [
  { path: "/",            priority: 1.0, changefreq: "weekly" },
  { path: "/menu",        priority: 0.9, changefreq: "weekly" },
  { path: "/book",        priority: 0.8, changefreq: "weekly" },
  { path: "/events",      priority: 0.8, changefreq: "daily" },
  { path: "/card",        priority: 0.8, changefreq: "monthly" },
  { path: "/membership",  priority: 0.7, changefreq: "monthly" },
  { path: "/loyalty",     priority: 0.6, changefreq: "monthly" },
  { path: "/play",        priority: 0.6, changefreq: "monthly" },
  { path: "/careers",     priority: 0.6, changefreq: "weekly" },
  { path: "/login",       priority: 0.4, changefreq: "yearly" },
  { path: "/register",    priority: 0.4, changefreq: "yearly" },
  { path: "/terms",       priority: 0.3, changefreq: "yearly" },
  { path: "/privacy",     priority: 0.3, changefreq: "yearly" },
];

function escapeXml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function urlEntry(loc: string, lastmod: string, changefreq: string, priority: number, alts?: Array<{ hreflang: string; href: string }>) {
  const altLinks = (alts ?? [])
    .map(a => `    <xhtml:link rel="alternate" hreflang="${a.hreflang}" href="${escapeXml(a.href)}" />`)
    .join("\n");
  return `  <url>
    <loc>${escapeXml(loc)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority.toFixed(1)}</priority>${altLinks ? "\n" + altLinks : ""}
  </url>`;
}

export const GET: APIRoute = async ({ url }) => {
  const origin = url.origin;
  const today  = new Date().toISOString().slice(0, 10);
  const entries: string[] = [];

  // Static pages, EN + EL with hreflang alternates
  for (const p of STATIC_PATHS) {
    const enHref = origin + p.path;
    const elHref = origin + "/el" + (p.path === "/" ? "" : p.path);
    const alts = [
      { hreflang: "en", href: enHref },
      { hreflang: "el", href: elHref },
      { hreflang: "x-default", href: enHref },
    ];
    entries.push(urlEntry(enHref, today, p.changefreq, p.priority, alts));
    entries.push(urlEntry(elHref, today, p.changefreq, Math.max(0.1, p.priority - 0.1), alts));
  }

  // Public social cards
  try {
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("handle, id, updated_at, card_public")
      .eq("card_public", true)
      .not("handle", "is", null)
      .limit(5000);
    for (const p of (profiles ?? []) as any[]) {
      const slug = p.handle ?? p.id?.slice(0, 8);
      if (!slug) continue;
      const lm = (p.updated_at ?? today).slice(0, 10);
      entries.push(urlEntry(`${origin}/u/${slug}`, lm, "monthly", 0.5));
    }
  } catch {}

  // Active events (if table has slug + active flag)
  try {
    const { data: events } = await supabaseAdmin
      .from("events")
      .select("slug, updated_at, starts_at")
      .order("starts_at", { ascending: false })
      .limit(500);
    for (const e of (events ?? []) as any[]) {
      if (!e.slug) continue;
      const lm = (e.updated_at ?? today).slice(0, 10);
      entries.push(urlEntry(`${origin}/events/${e.slug}`, lm, "weekly", 0.6));
    }
  } catch {}

  // Active job listings (if available)
  try {
    const { data: jobs } = await supabaseAdmin
      .from("job_listings")
      .select("slug, updated_at, status")
      .eq("status", "open")
      .limit(200);
    for (const j of (jobs ?? []) as any[]) {
      if (!j.slug) continue;
      const lm = (j.updated_at ?? today).slice(0, 10);
      entries.push(urlEntry(`${origin}/careers/${j.slug}`, lm, "weekly", 0.6));
    }
  } catch {}

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries.join("\n")}
</urlset>`;

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
