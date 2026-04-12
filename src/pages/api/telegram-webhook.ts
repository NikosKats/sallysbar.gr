import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../lib/supabase";
import {
  sendMessage,
  editMessageText,
  answerCallbackQuery,
} from "../../lib/telegram";
import { pushOrderStatus } from "../../lib/pushOrders";

type OrderItem = { name: string; qty: number; price_cents: number };

function formatItems(items: OrderItem[]) {
  return items.map((i) => `  • ${i.qty}× ${i.name}`).join("\n");
}

export const POST: APIRoute = async ({ request }) => {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return new Response("ok");
  }

  try {
    return await handleUpdate(body);
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

async function handleUpdate(body: Record<string, unknown>): Promise<Response> {
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
  const idTag     = `\n\n<code>#${orderId.slice(0, 8)}</code>`;

  if (action === "preparing") {
    await supabaseAdmin
      .from("orders")
      .update({ status: "preparing" })
      .eq("id", orderId);

    await editMessageText(
      import.meta.env.TELEGRAM_BARMAN_CHAT_ID,
      cb.message.message_id,
      `🔄 <b>Preparing — Table ${order.table_number}</b>\n\n${itemLines}${noteBlock}${idTag}`,
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
        `🔄 <b>Preparing — Table ${order.table_number}</b>\n\n${itemLines}${noteBlock}${idTag}`
      );
    }

    await pushOrderStatus({ id: orderId, table_number: order.table_number, status: "preparing" });
    await answerCallbackQuery(cb.id, "Marked as preparing.");
  }

  if (action === "ready") {
    await supabaseAdmin
      .from("orders")
      .update({ status: "ready" })
      .eq("id", orderId);

    await editMessageText(
      import.meta.env.TELEGRAM_BARMAN_CHAT_ID,
      cb.message.message_id,
      `✅ <b>Ready — Table ${order.table_number}</b>\n\n${itemLines}${noteBlock}${idTag}`,
      { reply_markup: { inline_keyboard: [] } }
    );

    const waiterMsg = await sendMessage(
      import.meta.env.TELEGRAM_WAITER_CHAT_ID,
      `✅ <b>Order ready — Table ${order.table_number}</b>\n\n${itemLines}\n\nDeliver to table ${order.table_number}! 🚀`,
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
      .update({ status: "delivered" })
      .eq("id", orderId);

    await editMessageText(
      import.meta.env.TELEGRAM_WAITER_CHAT_ID,
      cb.message.message_id,
      `📦 <b>Delivered — Table ${order.table_number}</b>\n\n${itemLines}${idTag}\n\n<i>Mark as paid from the app.</i>`,
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

    const cancelledText = `❌ <b>Cancelled — Table ${order.table_number}</b>\n\n${itemLines}${noteBlock}${idTag}`;
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
