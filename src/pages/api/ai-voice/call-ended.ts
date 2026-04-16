import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";
import { isVapiAuthed } from "../../../lib/vapi-auth";

export const prerender = false;

// Vapi sends a server-side webhook for every lifecycle event on a call.
// We only care about "end-of-call-report" which arrives once the call ends —
// it contains the full transcript, the LLM-generated summary, the recording
// URL, and duration/cost. We upsert this into vonage_voice_calls so the
// conversation shows up alongside the raw Vonage call row in /admin/inbox.
//
// Payload shape (abridged):
// { message: {
//     type: "end-of-call-report",
//     call: { id, customer: { number }, phoneNumber: { number } },
//     startedAt, endedAt, endedReason, cost, durationSeconds,
//     transcript, summary, recordingUrl
//   }
// }

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

export const POST: APIRoute = async ({ request, locals }) => {
  if (!isVapiAuthed(request, locals)) {
    // Vapi retries 4xx, so still accept-but-log if the secret is missing
    console.warn("[ai-voice/call-ended] missing or bad x-vapi-secret header");
    return json({ ok: false, error: "unauthorised" }, 401);
  }

  let payload: any;
  try { payload = await request.json(); } catch { return json({ ok: false, error: "bad_json" }, 400); }

  const msg = payload?.message ?? payload;
  const type = msg?.type;

  // We only persist on end-of-call; other events (speech-update, status-update)
  // are ignored for now. Still return 200 so Vapi doesn't retry.
  if (type !== "end-of-call-report") {
    return json({ ok: true, ignored: type });
  }

  const call = msg.call ?? {};
  const vapiCallId: string | null = call.id ?? null;
  const fromNumber: string | null = call.customer?.number ?? msg.customer?.number ?? null;
  const toNumber: string | null = call.phoneNumber?.number ?? msg.phoneNumber?.number ?? null;
  const startedAt = msg.startedAt ?? msg.timestamp ?? null;
  const endedAt = msg.endedAt ?? null;
  const duration = Number(msg.durationSeconds ?? msg.callDurationSecs ?? 0) || null;
  const cost = typeof msg.cost === "number" ? msg.cost : null;
  const transcript = typeof msg.transcript === "string" ? msg.transcript.slice(0, 40000) : null;
  const summary = typeof msg.summary === "string" ? msg.summary.slice(0, 4000) : null;
  const recordingUrl = msg.recordingUrl ?? msg.recording?.url ?? null;
  const endedReason = msg.endedReason ?? "completed";

  if (!vapiCallId) {
    console.warn("[ai-voice/call-ended] missing call.id");
    return json({ ok: true, skipped: "no_call_id" });
  }

  // Try to match an existing vonage_voice_calls row via caller number + recent
  // startedAt so we merge with the Vonage-side record. Falling back to insert.
  let existingId: number | null = null;
  try {
    const since = new Date(Date.now() - 30 * 60_000).toISOString();
    const { data } = await supabaseAdmin
      .from("vonage_voice_calls")
      .select("id")
      .eq("from_address", fromNumber || "")
      .gte("started_at", since)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.id) existingId = data.id;
  } catch {}

  const patch: any = {
    ai_handled: true,
    transcript,
    summary,
    vapi_call_id: vapiCallId,
    status: endedReason,
    duration_sec: duration,
    price_eur: cost,
    recording_url: recordingUrl,
    ended_at: endedAt,
    raw: payload,
  };

  if (existingId) {
    await supabaseAdmin.from("vonage_voice_calls").update(patch).eq("id", existingId);
  } else {
    await supabaseAdmin.from("vonage_voice_calls").insert({
      ...patch,
      call_uuid: vapiCallId,
      direction: "inbound",
      from_address: fromNumber,
      to_address: toNumber,
      started_at: startedAt ?? new Date().toISOString(),
    });
  }

  return json({ ok: true });
};

export const GET: APIRoute = async () => json({ ok: true, endpoint: "ai-voice/call-ended" });
