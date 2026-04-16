import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

export const prerender = false;

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

function digits(s: string) { return String(s ?? "").replace(/\D/g, ""); }

// Vonage Voice API event webhook. Fires at every state change:
// started → ringing → answered → completed (or busy/failed/rejected/timeout/unanswered).
// Supports BOTH POST (JSON body) and GET (URL query params) — Vonage sends
// via whichever HTTP method is set in the application's Event URL config.
// Docs: https://developer.vonage.com/en/voice/voice-api/webhook-reference#event-webhook
async function handle(payload: any) {

  const callUuid         = String(payload.uuid ?? payload.call_uuid ?? "");
  const conversationUuid = String(payload.conversation_uuid ?? "");
  const direction        = String(payload.direction ?? "inbound");
  const from             = String(payload.from ?? payload.from_user ?? "");
  const to               = String(payload.to ?? "");
  const status           = String(payload.status ?? "unknown");
  const duration         = Number(payload.duration ?? 0);
  const price            = Number(payload.price ?? 0);
  const recording        = payload.recording_url ?? null;

  // Match inbound caller to a profile by phone
  let matchedUserId: string | null = null;
  if (direction === "inbound" && from) {
    const last10 = digits(from).slice(-10);
    if (last10.length >= 8) {
      const { data } = await supabaseAdmin
        .from("profiles").select("id, phone").ilike("phone", `%${last10}`).limit(5);
      matchedUserId = data?.find((p: any) => digits(p.phone).endsWith(last10))?.id ?? null;
    }
  }

  // Upsert by call_uuid so multiple status updates collapse into one row.
  const { data: existing } = await supabaseAdmin
    .from("vonage_voice_calls").select("id, raw").eq("call_uuid", callUuid).maybeSingle();

  if (existing) {
    const patch: any = { status, raw: { ...(existing.raw ?? {}), [status]: payload } };
    if (duration > 0) patch.duration_sec = duration;
    if (price > 0)    patch.price_eur = price;
    if (recording)    patch.recording_url = recording;
    if (["completed", "failed", "busy", "rejected", "timeout", "unanswered"].includes(status)) {
      patch.ended_at = new Date().toISOString();
    }
    await supabaseAdmin.from("vonage_voice_calls").update(patch).eq("id", existing.id);
  } else {
    await supabaseAdmin.from("vonage_voice_calls").insert({
      call_uuid: callUuid || null,
      conversation_uuid: conversationUuid || null,
      direction,
      from_address: from,
      to_address: to,
      status,
      duration_sec: duration > 0 ? duration : null,
      price_eur: price > 0 ? price : null,
      recording_url: recording,
      matched_user_id: matchedUserId,
      raw: { [status]: payload },
    });
  }

  return { ok: true };
}

export const POST: APIRoute = async ({ request }) => {
  let payload: any = {};
  try { payload = await request.json(); } catch {
    // Empty or non-JSON body — treat as webhook ping, not a real event
    return json({ ok: true, skipped: "empty_body" });
  }
  if (!payload || Object.keys(payload).length === 0) return json({ ok: true, skipped: "empty_payload" });
  await handle(payload);
  return json({ ok: true });
};

// Vonage sends events as GET when the Event URL HTTP method is set to GET.
// Payload arrives as URL query-string params instead of JSON body.
export const GET: APIRoute = async ({ url }) => {
  const params = Object.fromEntries(url.searchParams.entries());
  // Skip our own test hits (no params = likely a healthcheck)
  if (Object.keys(params).length === 0) return json({ ok: true, endpoint: "vonage_voice_events" });
  await handle(params);
  return json({ ok: true });
};
