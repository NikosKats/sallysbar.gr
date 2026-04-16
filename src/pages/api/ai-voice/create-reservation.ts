import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";
import { isVapiAuthed, parseVapiToolCall, vapiToolResponse } from "../../../lib/vapi-auth";
import { sendMessage, setRuntimeEnv } from "../../../lib/vonage-messages";

export const prerender = false;

// Vapi function-call tool: the assistant invokes this when the caller wants
// to book a table. We create a reservations row with status='pending_ai' and
// notify the owner (push + WhatsApp) so they can approve → customer SMS.
//
// Expected arguments from the assistant:
//   date        : ISO date YYYY-MM-DD
//   time        : HH:MM (24h)
//   party_size  : integer 1..20
//   name        : customer's first + last name
//   phone       : caller's phone (E.164 preferred — falls back to call caller id)
//   notes       : optional ("window seat", "wheelchair access", …)

export const POST: APIRoute = async ({ request, locals }) => {
  if (!isVapiAuthed(request, locals)) {
    return new Response(JSON.stringify({ error: "unauthorised" }), { status: 401 });
  }

  const { args, callId } = await parseVapiToolCall(request);

  // Normalise + validate
  const date = String(args?.date ?? "").trim();
  const time = String(args?.time ?? "").trim();
  const partySize = Number(args?.party_size ?? args?.partySize ?? 0);
  const name = String(args?.name ?? "").trim().slice(0, 120);
  const phone = String(args?.phone ?? "").trim().replace(/[^\d+]/g, "");
  const notes = String(args?.notes ?? "").trim().slice(0, 500);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return vapiToolResponse({ ok: false, message: "I need a date in YYYY-MM-DD format (e.g. 2026-05-14)." });
  }
  if (!/^\d{1,2}:\d{2}$/.test(time)) {
    return vapiToolResponse({ ok: false, message: "I need a time in HH:MM 24-hour format (e.g. 20:30)." });
  }
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > 20) {
    return vapiToolResponse({ ok: false, message: "Party size must be a whole number between 1 and 20." });
  }
  if (name.length < 2) {
    return vapiToolResponse({ ok: false, message: "I still need the guest's name to take the booking." });
  }
  // Date in the past?
  const when = new Date(`${date}T${time.padStart(5, "0")}:00+03:00`);
  if (isNaN(when.getTime()) || when.getTime() < Date.now() - 60_000) {
    return vapiToolResponse({ ok: false, message: "That date and time is in the past — please try again." });
  }

  const { data: inserted, error } = await supabaseAdmin
    .from("reservations")
    .insert({
      name,
      email: "",                 // AI bookings don't collect email
      phone: phone || null,
      date,
      time,
      party_size: partySize,
      notes: notes || null,
      status: "pending_ai",
      source: "ai_voice",
      ai_call_uuid: callId ?? null,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    console.error("[ai-voice/create-reservation] db error:", error?.message);
    return vapiToolResponse({ ok: false, message: "Our booking system is down for a moment — can I take a message and have the manager call you back?" });
  }

  const reservationId = inserted.id as string;

  // Owner notification — WhatsApp first (he'll see it on his phone immediately),
  // push as a backup. Both succeed or fail independently; the booking is saved.
  setRuntimeEnv((locals as any)?.runtime?.env);
  try {
    const niceDate = new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", {
      weekday: "short", day: "numeric", month: "short",
    });
    const text = [
      `🤖 AI booking — needs your approval`,
      ``,
      `${name} · party of ${partySize}`,
      `${niceDate} at ${time}`,
      phone ? `📞 ${phone}` : "",
      notes ? `📝 ${notes}` : "",
      ``,
      `Approve: https://www.sallysbar.gr/admin/reservations?status=pending_ai#${reservationId.slice(0, 8)}`,
    ].filter(Boolean).join("\n");

    // Owner's WhatsApp per decision in plan
    await sendMessage("+306946272083", text, { channel: "whatsapp" });
  } catch (e: any) {
    console.warn("[ai-voice/create-reservation] owner WA failed:", e?.message);
  }

  try {
    const { pushToAdmins } = await import("../../../lib/adminPush");
    await pushToAdmins({
      title: "🤖 AI booking (pending approval)",
      body: `${name} · ${partySize} guests · ${date} ${time}`,
      url: `/admin/reservations?status=pending_ai#${reservationId.slice(0, 8)}`,
      tag: `ai-res-${reservationId}`,
      urgent: true,
    });
  } catch {}

  // Reply to the agent — it'll read the confirmation back to the caller.
  return vapiToolResponse({
    ok: true,
    reservation_id: reservationId.slice(0, 8),
    message: `Got it — I've requested a table for ${partySize} on ${date} at ${time} for ${name}. The manager will confirm shortly via SMS to ${phone || "your phone"}.`,
  }, (args as any)?.toolCallId);
};

// Health check (manual curl)
export const GET: APIRoute = async () =>
  new Response(JSON.stringify({ ok: true, endpoint: "ai-voice/create-reservation" }), {
    headers: { "Content-Type": "application/json" },
  });
