import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";
import { verifyBookingToken, getBookingSecret } from "../../../lib/booking-tokens";
import { sendMessage as sendVonage, setRuntimeEnv as setVonageEnv } from "../../../lib/vonage-messages";
import { sendMessage as sendTelegram } from "../../../lib/telegram";

export const prerender = false;

// Customer-facing cancel — verifies the HMAC token, flips status to cancelled,
// notifies staff on Telegram. No login required; the signed URL is the only
// credential, so iterating reservation UUIDs can't cancel other bookings.

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

export const POST: APIRoute = async ({ request, locals }) => {
  let body: any = {};
  try { body = await request.json(); } catch { return json({ ok: false, error: "bad_json" }, 400); }

  const id = String(body?.id ?? "").trim();
  const token = String(body?.t ?? "").trim();

  const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidLike.test(id)) return json({ ok: false, error: "invalid_id" }, 400);

  const valid = await verifyBookingToken(id, token, getBookingSecret(locals));
  if (!valid) return json({ ok: false, error: "invalid_token" }, 403);

  // Only cancel if currently active AND in the future — stale links can't
  // retroactively cancel a past visit.
  const { data: r } = await supabaseAdmin
    .from("reservations")
    .select("id, name, phone, date, time, party_size, status")
    .eq("id", id)
    .maybeSingle();

  if (!r) return json({ ok: false, error: "not_found" }, 404);
  if (["cancelled", "rejected"].includes(r.status)) return json({ ok: false, error: "already_cancelled" }, 409);

  const when = new Date(`${r.date}T${r.time}:00+03:00`);
  if (isNaN(when.getTime()) || when.getTime() < Date.now()) {
    return json({ ok: false, error: "past_booking" }, 409);
  }

  const { error } = await supabaseAdmin
    .from("reservations")
    .update({ status: "cancelled", decided_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return json({ ok: false, error: error.message }, 500);

  // Fire-and-forget notifications — don't block the user's "cancelled" UX.
  setVonageEnv((locals as any)?.runtime?.env);
  const ctx = (locals as any)?.runtime?.ctx;
  const background = (async () => {
    try {
      const tgChatId = (locals as any)?.runtime?.env?.TELEGRAM_BOOKING_CHAT_ID
                   ?? (import.meta.env as any)?.TELEGRAM_BOOKING_CHAT_ID
                   ?? "-1003855453083"; // fallback to the AI voice channel
      const niceDate = new Date(`${r.date}T00:00:00`).toLocaleDateString("en-GB", {
        weekday: "short", day: "numeric", month: "short",
      });
      await sendTelegram(tgChatId, [
        `❌ <b>Customer cancelled their booking</b>`,
        ``,
        `👤 <b>${r.name}</b>`,
        `👥 Party of ${r.party_size}`,
        `🗓 ${niceDate} at ${r.time}`,
        r.phone ? `📞 ${r.phone}` : "",
        `\n<code>#${id.slice(0, 8)}</code>`,
      ].filter(Boolean).join("\n"));
    } catch (e: any) {
      console.warn("[booking/cancel] telegram failed:", e?.message);
    }
  })();
  if (ctx?.waitUntil) ctx.waitUntil(background);

  return json({ ok: true });
};
