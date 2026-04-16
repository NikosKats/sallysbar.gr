import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../lib/supabase";
import { sendMessage } from "../../lib/telegram";
import { sendEmail, escapeHtml } from "../../lib/email";

export const POST: APIRoute = async ({ request, locals }) => {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  const { name, email, phone, date, time, party_size, notes } = body as Record<string, string>;

  if (!name?.trim() || !email?.trim() || !date || !time || !party_size) {
    return new Response(JSON.stringify({ error: "required" }), { status: 400 });
  }

  const bookingDate = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (bookingDate < today) {
    return new Response(JSON.stringify({ error: "past" }), { status: 400 });
  }

  const partySizeNum = Number(party_size);
  if (!Number.isInteger(partySizeNum) || partySizeNum < 1 || partySizeNum > 20) {
    return new Response(JSON.stringify({ error: "invalid_party_size" }), { status: 400 });
  }

  const { data: inserted, error } = await supabaseAdmin
    .from("reservations")
    .insert({
      user_id: locals.user?.id ?? null,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone?.trim() || null,
      date,
      time,
      party_size: partySizeNum,
      notes: notes?.trim() || null,
      status: "pending",
    })
    .select("id")
    .single();

  if (error || !inserted) {
    console.error("[reservations] insert error:", error?.message);
    return new Response(JSON.stringify({ error: "db" }), { status: 500 });
  }

  const reservationId = inserted.id as string;

  try {
    const chatId = import.meta.env.TELEGRAM_BOOKING_CHAT_ID;
    if (chatId) {
      const lines = [
        `📅 <b>New booking request</b>`,
        ``,
        `👤 <b>${escapeHtml(name.trim())}</b>`,
        `👥 Party of ${partySizeNum}`,
        `🗓 ${escapeHtml(date)} at ${escapeHtml(time)}`,
        `✉️ ${escapeHtml(email.trim().toLowerCase())}`,
        phone?.trim() ? `📞 ${escapeHtml(phone.trim())}` : "",
        notes?.trim() ? `\n📝 <i>${escapeHtml(notes.trim())}</i>` : "",
        `\n<code>#${reservationId.slice(0, 8)}</code>`,
      ].filter(Boolean);

      const resp = await sendMessage(chatId, lines.join("\n"), {
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
      } else {
        console.error("[reservations] telegram send failed:", resp);
      }
    }
  } catch (e) {
    console.error("[reservations] telegram error:", e);
  }

  try {
    await sendEmail({
      to: email.trim().toLowerCase(),
      subject: "We received your booking request — Sally's Bar",
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111">
          <h2 style="margin:0 0 12px">Booking request received 📅</h2>
          <p>Hi ${escapeHtml(name.trim())},</p>
          <p>Thanks for your request. We'll review and confirm shortly — you'll receive another email once it's decided.</p>
          <div style="background:#f6f6f6;border-radius:12px;padding:16px;margin:16px 0">
            <div><strong>Date:</strong> ${escapeHtml(date)} at ${escapeHtml(time)}</div>
            <div><strong>Party:</strong> ${partySizeNum}</div>
            ${notes?.trim() ? `<div><strong>Notes:</strong> ${escapeHtml(notes.trim())}</div>` : ""}
          </div>
          <p style="color:#666;font-size:12px">Sally's Bar · Skala</p>
        </div>`,
    });
  } catch (e) { console.warn("[reservations] ack email failed", e); }

  // Push to admins
  try {
    const { pushToAdmins } = await import("../../lib/adminPush");
    await pushToAdmins({
      title: "📅 New reservation",
      body: `${name.trim()} · ${partySizeNum} guests · ${date} ${time}`,
      url: "/admin/reservations",
      tag: `res-${reservationId}`,
      urgent: true,
    });
  } catch {}

  // Marketing automation: fire reservation_confirmed (and group-booking bonus if party size >= 6)
  try {
    const { fireReservationConfirmed } = await import("../../lib/marketing-engine");
    fireReservationConfirmed(reservationId).catch((e) =>
      console.warn("[reservations] marketing fire failed", e)
    );
  } catch {}

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
