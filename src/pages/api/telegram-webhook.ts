import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../lib/supabase";
import {
  sendMessage,
  editMessageText,
  answerCallbackQuery,
} from "../../lib/telegram";
import { pushOrderStatus, pushToUser } from "../../lib/pushOrders";
import { sendEmail } from "../../lib/email";
import { sendMessage as sendVonage, setRuntimeEnv as setVonageEnv } from "../../lib/vonage-messages";
import { buildManageUrl } from "../../lib/booking-tokens";
import { shortenUrl } from "../../lib/url-shortener";

type OrderItem = { name: string; qty: number; price_cents: number };

function formatItems(items: OrderItem[]) {
  return items.map((i) => `  • ${i.qty}× ${i.name}`).join("\n");
}

export const POST: APIRoute = async ({ request, locals }) => {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return new Response("ok");
  }

  try {
    return await handleUpdate(body, locals);
  } catch (err) {
    const errText = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
    try {
      await sendMessage(
        import.meta.env.TELEGRAM_BARMAN_CHAT_ID,
        `⚠️ <b>Webhook crash</b>\n<code>${errText.slice(0, 800)}</code>`
      );
    } catch { /* ignore */ }
    return new Response("ok");
  }
};

async function handleUpdate(body: Record<string, unknown>, locals: any): Promise<Response> {
  if (!body.callback_query) return new Response("ok");

  const cb = body.callback_query as {
    id: string;
    data: string;
    message: { message_id: number; chat: { id: number } };
  };

  const [action, orderId] = cb.data.split(":");
  if (!action || !orderId) {
    await answerCallbackQuery(cb.id, "Unknown action.");
    return new Response("ok");
  }

  if (action === "confirm_booking" || action === "reject_booking") {
    return handleBookingCallback(action, orderId, cb, locals);
  }

  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .single();

  if (!order) {
    await answerCallbackQuery(cb.id, "Order not found.");
    return new Response("ok");
  }

  const itemLines = formatItems(order.items);
  const noteBlock = order.note ? `\n\n📝 <i>${order.note}</i>` : "";
  const shortId   = orderId.slice(0, 8).toUpperCase();
  const seq       = (order as any).seq as number | null | undefined;
  const primaryNum = (seq != null) ? `#${seq}` : `#${shortId}`;
  const secondary  = (seq != null) ? ` · ${shortId}` : "";
  const idTag     = `\n\n<code>${primaryNum}</code>`;
  // Order datetime header (Athens tz) — kept consistent on every status edit
  // so the message preserves when the round was placed, not when it moved.
  const createdAt = order.created_at ? new Date(order.created_at) : new Date();
  let whenStr = "";
  try {
    whenStr = createdAt.toLocaleString("en-GB", {
      weekday: "short", day: "numeric", month: "short",
      hour: "2-digit", minute: "2-digit",
      timeZone: "Europe/Athens", hour12: false,
    });
  } catch {
    whenStr = createdAt.toISOString().slice(0, 16).replace("T", " ") + " UTC";
  }
  const metaLine = `\n🕒 ${whenStr}  ·  🔖 <b>${primaryNum}</b>${secondary}`;

  if (action === "preparing") {
    await supabaseAdmin
      .from("orders")
      .update({ status: "preparing", prepared_at: new Date().toISOString() })
      .eq("id", orderId);

    await editMessageText(
      import.meta.env.TELEGRAM_BARMAN_CHAT_ID,
      cb.message.message_id,
      `🔄 <b>Preparing — Table ${order.table_number}</b>${metaLine}\n\n${itemLines}${noteBlock}${idTag}`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "✅ Ready", callback_data: `ready:${orderId}` }],
          ],
        },
      }
    );

    if (order.waiter_message_id) {
      await editMessageText(
        import.meta.env.TELEGRAM_WAITER_CHAT_ID,
        order.waiter_message_id,
        `🔄 <b>Preparing — Table ${order.table_number}</b>${metaLine}\n\n${itemLines}${noteBlock}${idTag}`
      );
    }

    await pushOrderStatus({ id: orderId, table_number: order.table_number, status: "preparing" });
    await answerCallbackQuery(cb.id, "Marked as preparing.");
  }

  if (action === "ready") {
    await supabaseAdmin
      .from("orders")
      .update({ status: "ready", ready_at: new Date().toISOString() })
      .eq("id", orderId);

    await editMessageText(
      import.meta.env.TELEGRAM_BARMAN_CHAT_ID,
      cb.message.message_id,
      `✅ <b>Ready — Table ${order.table_number}</b>${metaLine}\n\n${itemLines}${noteBlock}${idTag}`,
      { reply_markup: { inline_keyboard: [] } }
    );

    const waiterMsg = await sendMessage(
      import.meta.env.TELEGRAM_WAITER_CHAT_ID,
      `✅ <b>Order ready — Table ${order.table_number}</b>${metaLine}\n\n${itemLines}\n\nDeliver to table ${order.table_number}! 🚀${idTag}`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "📦 Delivered", callback_data: `delivered:${orderId}` }],
          ],
        },
      }
    );

    if (waiterMsg.ok) {
      await supabaseAdmin
        .from("orders")
        .update({ waiter_message_id: waiterMsg.result.message_id })
        .eq("id", orderId);
    }

    await pushOrderStatus({ id: orderId, table_number: order.table_number, status: "ready" });
    await answerCallbackQuery(cb.id, "Waiter notified! ✅");
  }

  if (action === "delivered") {
    await supabaseAdmin
      .from("orders")
      .update({ status: "delivered", delivered_at: new Date().toISOString() })
      .eq("id", orderId);

    await editMessageText(
      import.meta.env.TELEGRAM_WAITER_CHAT_ID,
      cb.message.message_id,
      `📦 <b>Delivered — Table ${order.table_number}</b>${metaLine}\n\n${itemLines}${idTag}\n\n<i>Mark as paid from the app.</i>`,
      { reply_markup: { inline_keyboard: [] } }
    );

    await pushOrderStatus({ id: orderId, table_number: order.table_number, status: "delivered" });
    await answerCallbackQuery(cb.id, "Order delivered! ✅");
  }

  if (action === "cancel") {
    await supabaseAdmin
      .from("orders")
      .update({ status: "cancelled" })
      .eq("id", orderId);

    const cancelledText = `❌ <b>Cancelled — Table ${order.table_number}</b>${metaLine}\n\n${itemLines}${noteBlock}${idTag}`;
    const noButtons = { reply_markup: { inline_keyboard: [] } };

    await Promise.all([
      order.barman_message_id
        ? editMessageText(import.meta.env.TELEGRAM_BARMAN_CHAT_ID, order.barman_message_id, cancelledText, noButtons)
        : Promise.resolve(),
      order.waiter_message_id
        ? editMessageText(import.meta.env.TELEGRAM_WAITER_CHAT_ID, order.waiter_message_id, cancelledText, noButtons)
        : Promise.resolve(),
    ]);

    // Auto-close session if all orders are now paid or cancelled
    if (order.session_id) {
      const { data: remaining } = await supabaseAdmin
        .from("orders")
        .select("id")
        .eq("session_id", order.session_id)
        .not("status", "in", '("paid","cancelled")')
        .limit(1);
      if (!remaining?.length) {
        await supabaseAdmin
          .from("table_sessions")
          .update({ status: "closed", closed_at: new Date().toISOString() })
          .eq("id", order.session_id);
      }
    }

    await pushOrderStatus({ id: orderId, table_number: order.table_number, status: "cancelled" });
    await answerCallbackQuery(cb.id, "Order cancelled.");
  }

  return new Response("ok");
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
  );
}

async function handleBookingCallback(
  action: string,
  reservationId: string,
  cb: { id: string; message: { message_id: number; chat: { id: number } } },
  locals: any,
): Promise<Response> {
  const { data: r } = await supabaseAdmin
    .from("reservations")
    .select("*")
    .eq("id", reservationId)
    .single();

  if (!r) {
    await answerCallbackQuery(cb.id, "Booking not found.");
    return new Response("ok");
  }

  const confirmed = action === "confirm_booking";
  const newStatus = confirmed ? "confirmed" : "rejected";
  const wasUnresolved = r.status === "pending" || r.status === "pending_ai";

  await supabaseAdmin
    .from("reservations")
    .update({ status: newStatus, decided_at: new Date().toISOString() })
    .eq("id", reservationId);

  // SMS the caller on a status transition — only if they have a phone and
  // this is the first decision (don't re-SMS on double-clicks).
  if (r.phone && wasUnresolved) {
    setVonageEnv(locals?.runtime?.env);
    try {
      const firstName = (r.name ?? "").split(" ")[0] || "there";
      const niceDate = new Date(`${r.date}T00:00:00`).toLocaleDateString("en-GB", {
        weekday: "short", day: "numeric", month: "short",
      });
      const manageUrl = confirmed
        ? await shortenUrl(await buildManageUrl(reservationId, locals))
        : "";
      const text = confirmed
        ? `Hi ${firstName}, your table for ${r.party_size} at Sally's Bar on ${niceDate} at ${r.time} is confirmed. Manage/cancel: ${manageUrl} — see you then! Reply STOP to opt out.`
        : `Hi ${firstName}, unfortunately we can't accommodate your booking for ${niceDate} at ${r.time}. Please call us on +30 694 627 2083 to rearrange. Sally's Bar.`;
      const result = await sendVonage(r.phone, text, { channel: "sms" });
      if (!result.ok) {
        console.warn("[booking] SMS failed", result);
      }
    } catch (e: any) {
      console.warn("[booking] SMS error", e?.message);
    }
  }

  const header = confirmed
    ? `✅ <b>Booking confirmed</b>`
    : `❌ <b>Booking rejected</b>`;

  const lines = [
    header,
    ``,
    `👤 <b>${escapeHtml(r.name)}</b>`,
    `👥 Party of ${r.party_size}`,
    `🗓 ${escapeHtml(r.date)} at ${escapeHtml(r.time)}`,
    r.email ? `✉️ ${escapeHtml(r.email)}` : "",
    r.phone ? `📞 ${escapeHtml(r.phone)}` : "",
    r.notes ? `\n📝 <i>${escapeHtml(r.notes)}</i>` : "",
    `\n<code>#${reservationId.slice(0, 8)}</code>`,
  ].filter(Boolean);

  await editMessageText(
    cb.message.chat.id,
    cb.message.message_id,
    lines.join("\n"),
    { reply_markup: { inline_keyboard: [] } }
  );

  // Notify customer (email — only when we have one; AI voice bookings don't)
  if (r.email) {
    try {
      const subject = confirmed
        ? `Your booking at Sally's Bar is confirmed ✅`
        : `Your booking at Sally's Bar could not be confirmed`;
      const intro = confirmed
        ? `Great news — we've confirmed your booking. We can't wait to see you!`
        : `Unfortunately we couldn't accommodate your booking at the requested time. Please try another slot or contact us directly.`;
      const html = `
        <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111">
          <h2 style="margin:0 0 12px">${confirmed ? "Booking confirmed ✅" : "Booking not confirmed"}</h2>
          <p>Hi ${escapeHtml(r.name)},</p>
          <p>${intro}</p>
          <div style="background:#f6f6f6;border-radius:12px;padding:16px;margin:16px 0">
            <div><strong>Date:</strong> ${escapeHtml(r.date)} at ${escapeHtml(r.time)}</div>
            <div><strong>Party:</strong> ${r.party_size}</div>
            ${r.notes ? `<div><strong>Notes:</strong> ${escapeHtml(r.notes)}</div>` : ""}
          </div>
          <p style="color:#666;font-size:12px">Sally's Bar · Skala</p>
        </div>`;
      await sendEmail({ to: r.email, subject, html });
    } catch (e) { console.warn("[booking] email failed", e); }
  }

  if (r.user_id) {
    try {
      await pushToUser(r.user_id, {
        title: confirmed ? "Booking confirmed ✅" : "Booking not confirmed",
        body: `${r.date} at ${r.time} · party of ${r.party_size}`,
        tag: `booking-${reservationId}`,
        url: "/account",
      });
    } catch (e) { console.warn("[booking] push failed", e); }
  }

  await answerCallbackQuery(cb.id, confirmed ? "Booking confirmed ✅" : "Booking rejected ❌");
  return new Response("ok");
}
