import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

export const prerender = false;

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
function randomSlug(len = 5): string {
  let s = "";
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  for (let i = 0; i < len; i++) s += ALPHABET[buf[i] % ALPHABET.length];
  return s;
}

function isValidUrl(u: string): boolean {
  try {
    const url = new URL(u);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch { return false; }
}

export const POST: APIRoute = async ({ request, url, locals }) => {
  if (!["admin", "super_admin"].includes(locals.role ?? "")) return json({ ok: false, error: "forbidden" });

  let body: any;
  try { body = await request.json(); } catch { return json({ ok: false, error: "bad_json" }); }

  const target = String(body?.url ?? "").trim();
  if (!isValidUrl(target)) return json({ ok: false, error: "bad_url" });

  // Don't double-shorten — if this is already a /s/<slug> of our own domain, return it
  try {
    const u = new URL(target);
    if (/\/s\/[a-z0-9]{5}$/.test(u.pathname)) return json({ ok: true, short: target, already_short: true });
  } catch {}

  // Reuse an existing short link if target_url matches (idempotent)
  const { data: existing } = await supabaseAdmin
    .from("short_links").select("slug").eq("target_url", target).maybeSingle();
  if (existing?.slug) {
    const origin = url.origin.replace(/^http:/, "https:");
    return json({ ok: true, short: `${origin}/s/${existing.slug}`, slug: existing.slug, reused: true });
  }

  // Generate a unique slug with up to 5 tries
  let slug = "";
  for (let i = 0; i < 5; i++) {
    slug = randomSlug(5);
    const { data } = await supabaseAdmin
      .from("short_links").select("id").eq("slug", slug).maybeSingle();
    if (!data) break;
    if (i === 4) return json({ ok: false, error: "slug_collision" });
  }

  const { error } = await supabaseAdmin.from("short_links").insert({
    slug,
    target_url: target,
    created_by: locals.user?.id ?? null,
  });
  if (error) return json({ ok: false, error: error.message });

  const origin = url.origin.replace(/^http:/, "https:");
  return json({ ok: true, short: `${origin}/s/${slug}`, slug });
};
