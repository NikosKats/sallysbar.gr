import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";
import { hashIp } from "../../../lib/ua";

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  if (!locals.user) return json({ error: "auth_required" }, 401);
  const { getGameFlags } = await import("../../../lib/gameFlags");
  if (!(await getGameFlags()).scratch) return json({ error: "scratch_disabled" }, 403);

  let body: any;
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400); }

  const id = body.id ? String(body.id) : null;
  if (!id) return json({ error: "missing_id" }, 400);

  const { data: card } = await supabaseAdmin
    .from("scratch_cards")
    .select("id, user_id, reward_type, reward_value, reward_label, revealed_at, claimed_at, expires_at, trigger")
    .eq("id", id)
    .maybeSingle();

  if (!card || card.user_id !== locals.user.id) return json({ error: "not_found" }, 404);
  if (card.expires_at && new Date(card.expires_at) < new Date()) return json({ error: "expired" }, 410);

  const now = new Date().toISOString();

  // ── Anti-abuse guard for signup cards ─────────────────────────────────
  // A signup card can only be revealed once per phone number, forever.
  // This stops the delete-and-recreate exploit: a new auth.users id is free,
  // but the phone is shared and gets locked on first successful reveal.
  if (!card.revealed_at && card.trigger === "signup") {
    const { data: profile } = await supabaseAdmin
      .from("profiles").select("phone").eq("id", locals.user.id).maybeSingle();
    const phoneRaw = profile?.phone ? String(profile.phone).trim() : "";
    const phoneDigits = phoneRaw.replace(/\D/g, "");

    if (phoneDigits.length < 6) {
      return json({
        error: "activate_card_first",
        message: "Activate your loyalty card first (we need your phone to issue the signup bonus).",
      }, 403);
    }
    const phone_hash = await sha256Hex(phoneDigits);

    // Has this phone already revealed a signup card (on any user)?
    const { data: prior } = await supabaseAdmin
      .from("scratch_cards")
      .select("id, user_id")
      .eq("trigger", "signup")
      .eq("phone_hash", phone_hash)
      .not("revealed_at", "is", null)
      .neq("id", card.id)
      .maybeSingle();

    // Capture IP for audit (hashed, not stored raw)
    let ip = "";
    try { ip = clientAddress || request.headers.get("cf-connecting-ip") || ""; } catch {}
    const ip_hash = ip ? await hashIp(ip) : null;

    if (prior) {
      await supabaseAdmin.from("signup_abuse_log").insert({
        user_id: locals.user.id,
        email: locals.user.email ?? null,
        phone_hash,
        ip_hash,
        reason: "duplicate_phone_signup_reveal",
        action: "blocked",
      });
      // Alert admins — duplicate-phone signup attempt. Batch-suppress spam:
      // only push on the 1st attempt, and again if ≥5 attempts in the last 60 minutes.
      try {
        const { pushToAdmins } = await import("../../../lib/adminPush");
        const sinceHour = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { count: hourly } = await supabaseAdmin
          .from("signup_abuse_log").select("id", { count: "exact", head: true })
          .gte("created_at", sinceHour);
        const n = hourly ?? 0;
        const shouldPing = n === 1 || n === 5 || n === 20 || (n > 0 && n % 50 === 0);
        if (shouldPing) {
          await pushToAdmins({
            title: n >= 5 ? `⚠️ ${n} abuse attempts this hour` : "⚠️ Blocked duplicate signup",
            body: `${locals.user.email ?? "unknown"} · phone already used`,
            url: `/admin/users/${locals.user.id}`,
            tag: `abuse-${Math.floor(Date.now() / 3600000)}`,
            urgent: n >= 5,
          });
        }
      } catch {}
      return json({
        error: "phone_already_claimed",
        message: "This phone number has already claimed a signup bonus.",
      }, 409);
    }

    // Bind phone + IP to the card (before reveal, so the unique index wins the race)
    const { error: bindErr } = await supabaseAdmin
      .from("scratch_cards")
      .update({ phone_hash, ip_hash })
      .eq("id", card.id);
    if (bindErr) {
      // Likely a concurrent reveal beat us — treat as duplicate
      await supabaseAdmin.from("signup_abuse_log").insert({
        user_id: locals.user.id, email: locals.user.email ?? null,
        phone_hash, ip_hash, reason: "phone_bind_race", action: "blocked",
      });
      return json({ error: "phone_already_claimed" }, 409);
    }
  }

  if (!card.revealed_at) {
    const { error: revErr } = await supabaseAdmin.from("scratch_cards").update({ revealed_at: now }).eq("id", id);
    // The unique index on (phone_hash) where trigger='signup' and revealed_at is not null
    // will throw 23505 here if two tabs race. Handle cleanly.
    if (revErr && (revErr as any).code === "23505") {
      return json({ error: "phone_already_claimed" }, 409);
    }

    if (card.reward_type === "points" && Number(card.reward_value) > 0) {
      const { error: insErr } = await supabaseAdmin.from("loyalty_events").insert({
        user_id: locals.user.id,
        points: Number(card.reward_value),
        reason: `scratch:${card.id}`,
      });
      if (insErr && !insErr.message?.includes("duplicate")) {
        console.error("[scratch-reveal] loyalty insert failed:", insErr.message);
      } else {
        await supabaseAdmin.from("scratch_cards").update({ claimed_at: now }).eq("id", id);
      }
    }
  }

  return json({
    ok: true,
    reward: {
      type:  card.reward_type,
      value: card.reward_value,
      label: card.reward_label,
      auto_claimed: card.reward_type === "points",
    },
  });
};
