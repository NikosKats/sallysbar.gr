import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";
import { isVapiAuthed, parseVapiToolCall, vapiToolResponse, authDiag, corsHeaders, corsPreflight } from "../../../lib/vapi-auth";
import { sendMessage, setRuntimeEnv } from "../../../lib/vonage-messages";
import { sendMessage as sendTelegram } from "../../../lib/telegram";
import { escapeHtml } from "../../../lib/email";
import { getDayCapacity } from "../../../lib/booking-capacity";

const AI_VOICE_TELEGRAM_CHAT_ID = "-1003855453083";

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
//   phone       : caller's phone in E.164 (+<country><subscriber>, 8–15 digits)
//   notes       : optional ("window seat", "wheelchair access", …)

export const POST: APIRoute = async ({ request, locals }) => {
  if (!isVapiAuthed(request, locals)) {
    return new Response(JSON.stringify({ error: "unauthorised", diag: authDiag(request, locals) }), { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders() } });
  }

  const { args, callId, toolCallId } = await parseVapiToolCall(request);

  // Normalise + validate
  const date = String(args?.date ?? "").trim();
  const time = String(args?.time ?? "").trim();
  const partySize = Number(args?.party_size ?? args?.partySize ?? 0);
  const name = String(args?.name ?? "").trim().slice(0, 120);
  const phoneRaw = String(args?.phone ?? "").trim().replace(/[^\d+]/g, "");
  // Coerce a bare local Greek number (e.g. "69451…") to E.164 with +30.
  const phone = phoneRaw.startsWith("+")
    ? phoneRaw
    : phoneRaw.startsWith("00") ? "+" + phoneRaw.slice(2)
    : phoneRaw ? "+30" + phoneRaw.replace(/^0+/, "") : "";
  const notes = String(args?.notes ?? "").trim().slice(0, 500);

  // Country-code-aware length rules (subscriber digits after the country code).
  // Covers the countries Sally's Skala callers actually come from; anything else
  // falls back to the ITU-T E.164 range of 8–15 total digits.
  const COUNTRY_LEN: Record<string, number[]> = {
    "1":   [10],          // US / Canada
    "30":  [10],          // Greece (e.g. 6XXXXXXXXX mobile, 2XXXXXXXXX fixed)
    "31":  [9],           // Netherlands
    "32":  [8, 9],        // Belgium
    "33":  [9],           // France
    "34":  [9],           // Spain
    "36":  [9],           // Hungary
    "39":  [9, 10, 11],   // Italy
    "40":  [9],           // Romania
    "41":  [9],           // Switzerland
    "43":  [10, 11],      // Austria
    "44":  [10],          // UK
    "45":  [8],           // Denmark
    "46":  [7, 8, 9],     // Sweden
    "47":  [8],           // Norway
    "48":  [9],           // Poland
    "49":  [10, 11],      // Germany
    "90":  [10],          // Turkey
    "351": [9],           // Portugal
    "352": [8, 9],        // Luxembourg
    "353": [9],           // Ireland
    "354": [7],           // Iceland
    "357": [8],           // Cyprus
    "358": [9, 10],       // Finland
    "359": [8, 9],        // Bulgaria
    "370": [8],           // Lithuania
    "371": [8],           // Latvia
    "372": [7, 8],        // Estonia
    "380": [9],           // Ukraine
    "381": [8, 9],        // Serbia
    "385": [8, 9],        // Croatia
    "420": [9],           // Czechia
    "421": [9],           // Slovakia
    "972": [8, 9],        // Israel
  };
  function phoneIsValid(p: string): boolean {
    if (!/^\+\d{8,15}$/.test(p)) return false;
    const digits = p.slice(1);
    // Longest prefix match against known country codes.
    for (const len of [3, 2, 1]) {
      const cc = digits.slice(0, len);
      const expected = COUNTRY_LEN[cc];
      if (expected) {
        const sub = digits.length - len;
        return expected.includes(sub);
      }
    }
    // Unknown code: accept anything inside the E.164 8–15-digit range.
    return true;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return vapiToolResponse({ ok: false, message: "I need a date in YYYY-MM-DD format (e.g. 2026-05-14)." }, toolCallId);
  }
  if (!/^\d{1,2}:\d{2}$/.test(time)) {
    return vapiToolResponse({ ok: false, message: "I need a time in HH:MM 24-hour format (e.g. 20:30)." }, toolCallId);
  }
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > 20) {
    return vapiToolResponse({ ok: false, message: "Party size must be a whole number between 1 and 20." }, toolCallId);
  }
  if (name.length < 2) {
    return vapiToolResponse({ ok: false, message: "I still need the guest's full name to take the booking." }, toolCallId);
  }
  if (!phone) {
    return vapiToolResponse({ ok: false, message: "I still need a phone number so the manager can confirm by SMS — what's the country code and number?" }, toolCallId);
  }
  if (!phoneIsValid(phone)) {
    return vapiToolResponse({ ok: false, message: `That phone number doesn't look right (${phone}). Can you confirm the country code and read the digits again?` }, toolCallId);
  }
  // Date in the past?
  const when = new Date(`${date}T${time.padStart(5, "0")}:00+03:00`);
  if (isNaN(when.getTime()) || when.getTime() < Date.now() - 60_000) {
    return vapiToolResponse({ ok: false, message: "That date and time is in the past — please try again." }, toolCallId);
  }

  // Capacity check — refuse when the night is full so the AI doesn't oversell.
  const cap = await getDayCapacity(date);
  if (cap.isFull) {
    const niceDateMsg = new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", {
      weekday: "long", day: "numeric", month: "long",
    });
    return vapiToolResponse({
      ok: false,
      full: true,
      message: `I'm so sorry, we're fully booked on ${niceDateMsg}. Would you like to try a different date, or shall I take your number for the waitlist?`,
    }, toolCallId);
  }

  const { data: inserted, error } = await supabaseAdmin
    .from("reservations")
    .insert({
      name,
      email: "",
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
    return vapiToolResponse({ ok: false, message: "Our booking system is down for a moment — can I take a message and have the manager call you back?" }, toolCallId);
  }

  const reservationId = inserted.id as string;

  // Notifications run AFTER we respond so Vapi doesn't time out (it gives
  // tools ~10-20s and Vonage WhatsApp is often the slowest hop). Cloudflare
  // kills background promises when the response is sent unless we hand them
  // to ctx.waitUntil — fall back to plain promise chain if ctx isn't present
  // (local dev / Node adapter).
  setRuntimeEnv((locals as any)?.runtime?.env);
  const ctx = (locals as any)?.runtime?.ctx;
  const background = (async () => {
    const niceDate = new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", {
      weekday: "short", day: "numeric", month: "short",
    });

    // Owner's WhatsApp
    try {
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
      await sendMessage("+306946272083", text, { channel: "whatsapp" });
    } catch (e: any) {
      console.warn("[ai-voice/create-reservation] owner WA failed:", e?.message);
    }

    // Telegram channel
    try {
      const lines = [
        `🤖 <b>AI voice booking</b> — pending approval`,
        ``,
        `👤 <b>${escapeHtml(name)}</b>`,
        `👥 Party of ${partySize}`,
        `🗓 ${escapeHtml(niceDate)} at ${escapeHtml(time)}`,
        phone ? `📞 ${escapeHtml(phone)}` : "",
        notes ? `\n📝 <i>${escapeHtml(notes)}</i>` : "",
        ``,
        `Approve: https://www.sallysbar.gr/admin/reservations?status=pending_ai#${reservationId.slice(0, 8)}`,
        `\n<code>#${reservationId.slice(0, 8)}</code>`,
      ].filter(Boolean);
      const resp = await sendTelegram(AI_VOICE_TELEGRAM_CHAT_ID, lines.join("\n"), {
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Confirm", callback_data: `confirm_booking:${reservationId}` },
              { text: "❌ Reject", callback_data: `reject_booking:${reservationId}` },
            ],
          ],
        },
      });
      if (resp?.ok && resp.result?.message_id) {
        await supabaseAdmin
          .from("reservations")
          .update({ telegram_message_id: resp.result.message_id })
          .eq("id", reservationId);
      } else if (!resp?.ok) {
        console.error("[ai-voice/create-reservation] telegram failed:", resp);
      }
    } catch (e: any) {
      console.warn("[ai-voice/create-reservation] telegram error:", e?.message);
    }

    // Admin push
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
  })();

  if (ctx?.waitUntil) ctx.waitUntil(background);
  // else: fire-and-forget; on Node dev the promise resolves before process exits.

  // Reply to the agent — it'll read the confirmation back to the caller.
  return vapiToolResponse({
    ok: true,
    reservation_id: reservationId.slice(0, 8),
    message: `Got it — I've requested a table for ${partySize} on ${date} at ${time} for ${name}. The manager will confirm shortly via SMS to ${phone || "your phone"}.`,
  }, toolCallId);
};

// Health check (manual curl)
export const GET: APIRoute = async () =>
  new Response(JSON.stringify({ ok: true, endpoint: "ai-voice/create-reservation" }), {
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });

export const OPTIONS: APIRoute = async () => corsPreflight();
