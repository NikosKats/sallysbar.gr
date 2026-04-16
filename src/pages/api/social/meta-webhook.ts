import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

export const prerender = false;

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

function readEnv(locals: any, key: string): string {
  const cf = locals?.runtime?.env?.[key];
  if (cf) return String(cf);
  const pe = (globalThis as any)?.process?.env?.[key];
  if (pe) return String(pe);
  return String((import.meta.env as any)?.[key] ?? "");
}

// GET: Meta webhook verification handshake (hub.challenge echo)
export const GET: APIRoute = async ({ url, locals }) => {
  const mode    = url.searchParams.get("hub.mode");
  const token   = url.searchParams.get("hub.verify_token");
  const chall   = url.searchParams.get("hub.challenge");
  const expected = readEnv(locals, "META_WEBHOOK_VERIFY_TOKEN");
  if (mode === "subscribe" && expected && token === expected && chall) {
    return new Response(chall, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return json({ ok: false, error: "verification_failed" }, 403);
};

// POST: message + referral events from Messenger/Instagram
export const POST: APIRoute = async ({ request, locals }) => {
  const rawBody = await request.text();
  const sig256  = request.headers.get("x-hub-signature-256") ?? "";
  const appSecret = readEnv(locals, "FACEBOOK_APP_SECRET");
  if (!appSecret) return json({ ok: false, error: "fb_not_configured" }, 503);

  // Verify HMAC-SHA256 using Web Crypto (Cloudflare Workers / Astro edge)
  const expected = await hmacSha256Hex(appSecret, rawBody);
  const provided = sig256.replace(/^sha256=/, "");
  if (!provided || !constantTimeEq(expected, provided)) {
    return json({ ok: false, error: "invalid_signature" }, 401);
  }

  let payload: any;
  try { payload = JSON.parse(rawBody); } catch { return json({ ok: false, error: "bad_json" }, 400); }

  const object = String(payload.object ?? ""); // "page" for Messenger, "instagram" for IG
  const platform = object === "instagram" ? "instagram" : "messenger";
  const column   = platform === "instagram" ? "instagram_id" : "messenger_id";

  const events: any[] = Array.isArray(payload.entry) ? payload.entry : [];
  const linked: string[] = [];

  for (const entry of events) {
    const msgs: any[] = Array.isArray(entry.messaging) ? entry.messaging : [];
    for (const m of msgs) {
      const senderId = m?.sender?.id ?? null;
      // Referral comes either as a top-level `referral` or inside a `postback.referral`
      const ref =
        m?.referral?.ref ??
        m?.postback?.referral?.ref ??
        m?.message?.referral?.ref ??
        null;

      // Log every event (useful for debugging)
      let matchedUserId: string | null = null;
      if (ref && typeof ref === "string" && ref.startsWith("user_")) {
        matchedUserId = ref.slice("user_".length);
      }

      await supabaseAdmin.from("social_webhook_events").insert({
        platform,
        event_type: m?.referral ? "messaging_referral" : (m?.postback ? "postback" : "message"),
        sender_id: senderId,
        ref,
        matched_user_id: matchedUserId,
        raw: m,
      });

      // Persist the PSID/IG-ID on the matched profile
      if (senderId && matchedUserId) {
        // Skip if already linked (idempotent — prevents double-points)
        const { data: existing } = await supabaseAdmin
          .from("profiles").select(column).eq("id", matchedUserId).maybeSingle();
        const alreadyLinked = !!(existing as any)?.[column];

        const patch: any = {
          [column]: String(senderId),
          social_opt_in_at: new Date().toISOString(),
        };
        const { error } = await supabaseAdmin
          .from("profiles").update(patch).eq("id", matchedUserId);
        if (!error) linked.push(`${matchedUserId}:${platform}`);

        // Booster #1 — award +20 loyalty points the FIRST time each platform is linked.
        if (!error && !alreadyLinked) {
          const reason = `social_link:${platform}`;
          const { data: already } = await supabaseAdmin
            .from("loyalty_events").select("id").eq("user_id", matchedUserId).eq("reason", reason).maybeSingle();
          if (!already) {
            await supabaseAdmin.from("loyalty_events").insert({
              user_id: matchedUserId,
              points: 20,
              reason,
            });
          }
        }
      }
    }
  }

  return json({ ok: true, linked: linked.length });
};

// ── crypto helpers ───────────────────────────────────────────────────────────
async function hmacSha256Hex(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function constantTimeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
