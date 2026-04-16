import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

export const prerender = false;

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

// Normalise a phone number to digits only. Strips country-code prefix checks.
function digits(s: string): string {
  return String(s ?? "").replace(/\D/g, "");
}

// Match a Vonage "from" to a public.profiles row by phone or social ID.
async function findMatchedUser(channel: string, from: string): Promise<string | null> {
  if (!from) return null;

  // Phone-based channels
  if (channel === "sms" || channel === "whatsapp" || channel === "viber_service") {
    const d = digits(from);
    if (d.length < 8) return null;
    // Try exact match + last-10-digits match (users may have stored with/without country code)
    const last10 = d.slice(-10);
    const { data } = await supabaseAdmin
      .from("profiles").select("id, phone")
      .or(`phone.eq.+${d},phone.eq.${d},phone.ilike.%${last10}`)
      .limit(5);
    const best = (data ?? []).find((p: any) => digits(p.phone).endsWith(last10));
    return best?.id ?? null;
  }

  // Platform-scoped channels
  if (channel === "messenger") {
    const { data } = await supabaseAdmin.from("profiles").select("id").eq("messenger_id", String(from)).maybeSingle();
    return data?.id ?? null;
  }
  if (channel === "instagram") {
    const { data } = await supabaseAdmin.from("profiles").select("id").eq("instagram_id", String(from)).maybeSingle();
    return data?.id ?? null;
  }

  return null;
}

// Vonage Messages API inbound webhook.
// Docs: https://developer.vonage.com/en/messages/concepts/inbound-message
export const POST: APIRoute = async ({ request }) => {
  let payload: any;
  try { payload = await request.json(); } catch { return json({ ok: false, error: "bad_json" }, 400); }

  const channel      = String(payload.channel ?? "sms");
  const messageUuid  = String(payload.message_uuid ?? payload.messageUuid ?? "");
  const from         = String(payload.from ?? "");
  const to           = String(payload.to ?? "");
  const messageType  = String(payload.message_type ?? payload.messageType ?? "text");

  // Body lives in different keys depending on channel / message_type.
  const text =
    payload.text ??
    payload.message?.content?.text ??
    payload.body ??
    null;

  const matchedUserId = await findMatchedUser(channel, from);

  const { error } = await supabaseAdmin.from("vonage_inbound_messages").insert({
    message_uuid: messageUuid || null,
    channel,
    from_address: from,
    to_address: to || null,
    message_type: messageType,
    text: text ? String(text).slice(0, 4000) : null,
    matched_user_id: matchedUserId,
    raw: payload,
  });

  // Auto-unsubscribe on "stop" / "unsubscribe" / "παυση"
  if (matchedUserId && text) {
    const normalised = String(text).trim().toLowerCase();
    if (["stop", "unsubscribe", "παυση", "διαγραφη", "quit"].includes(normalised)) {
      await supabaseAdmin.from("profiles").update({ marketing_consent: false }).eq("id", matchedUserId);
    }
  }

  // 200 even on DB error — Vonage retries 4xx/5xx which creates dupes.
  if (error) console.error("[vonage/inbound] insert error:", error.message);
  return json({ ok: true });
};

// GET: allow Vonage's verification ping (some setups do a GET first)
export const GET: APIRoute = async () => json({ ok: true, endpoint: "vonage_inbound" });
