// Server-side URL shortener used by the SMS flows (AI voice / admin / Telegram).
// Same DB table and /s/<slug> resolver as the admin shorten-url endpoint, but
// callable without an admin role — the callers are all trusted server paths.

import { supabaseAdmin } from "./supabase";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const ORIGIN = "https://www.sallysbar.gr";

function randomSlug(len = 5): string {
  let s = "";
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  for (let i = 0; i < len; i++) s += ALPHABET[buf[i] % ALPHABET.length];
  return s;
}

/**
 * Returns a short https://www.sallysbar.gr/s/<slug> URL for the given target.
 * Idempotent: if we've already shortened this exact target, we return the
 * existing slug. On any DB error the original URL is returned so the caller
 * still gets a working link in the SMS.
 */
export async function shortenUrl(targetUrl: string, createdBy?: string | null): Promise<string> {
  if (!targetUrl) return targetUrl;
  try {
    const u = new URL(targetUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") return targetUrl;
    // Already a /s/<slug>? pass through.
    if (/\/s\/[a-z0-9]{5}$/.test(u.pathname)) return targetUrl;
  } catch {
    return targetUrl;
  }

  // Reuse an existing slug for the same target.
  try {
    const { data: existing } = await supabaseAdmin
      .from("short_links").select("slug").eq("target_url", targetUrl).maybeSingle();
    if (existing?.slug) return `${ORIGIN}/s/${existing.slug}`;
  } catch {}

  // Try up to 5 random slugs.
  for (let i = 0; i < 5; i++) {
    const slug = randomSlug(5);
    try {
      const { data: taken } = await supabaseAdmin
        .from("short_links").select("id").eq("slug", slug).maybeSingle();
      if (taken) continue;
      const { error } = await supabaseAdmin.from("short_links").insert({
        slug,
        target_url: targetUrl,
        created_by: createdBy ?? null,
      });
      if (error) throw error;
      return `${ORIGIN}/s/${slug}`;
    } catch (e) {
      // fall through to next attempt
    }
  }
  // Couldn't shorten — return the original so the SMS still works.
  return targetUrl;
}
