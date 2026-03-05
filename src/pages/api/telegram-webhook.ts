import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../lib/supabase";
import {
  sendMessage,
  editMessageText,
  answerCallbackQuery,
} from "../../lib/telegram";

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

  if (!body.callback_query) return new Response("ok");

  const cb = body.callback_query as {
    id: string;
    data: string;
    message: { message_id: number };
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
  const idTag = `\n\n<code>#${orderId.slice(0, 8)}</code>`;

  if (action === "preparing") {
    await supabaseAdmin
      .from("orders")
      .update({ status: "preparing" })
      .eq("id", orderId);

    // Barman message → show Ready button
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

    // Edit waiter's existing message to update status (remove cancel button)
    if (order.waiter_message_id) {
      await editMessageText(
        import.meta.env.TELEGRAM_WAITER_CHAT_ID,
        order.waiter_message_id,
        `🔄 <b>Preparing — Table ${order.table_number}</b>\n\n${itemLines}${noteBlock}${idTag}`
      );
    }

    await answerCallbackQuery(cb.id, "Marked as preparing.");
  }

  if (action === "ready") {
    await supabaseAdmin
      .from("orders")
      .update({ status: "ready" })
      .eq("id", orderId);

    // Remove buttons from barman message
    await editMessageText(
      import.meta.env.TELEGRAM_BARMAN_CHAT_ID,
      cb.message.message_id,
      `✅ <b>Ready — Table ${order.table_number}</b>\n\n${itemLines}${noteBlock}${idTag}`,
      { reply_markup: { inline_keyboard: [] } }
    );

    // Notify waiter channel with a Delivered button
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

    await answerCallbackQuery(cb.id, "Waiter notified! ✅");
  }

  if (action === "delivered") {
    await supabaseAdmin
      .from("orders")
      .update({ status: "delivered" })
      .eq("id", orderId);

    // Remove button from waiter message
    await editMessageText(
      import.meta.env.TELEGRAM_WAITER_CHAT_ID,
      cb.message.message_id,
      `📦 <b>Delivered — Table ${order.table_number}</b>\n\n${itemLines}${idTag}`,
      { reply_markup: { inline_keyboard: [] } }
    );

    await answerCallbackQuery(cb.id, "Order delivered! ✅");
  }

  if (action === "cancel") {
    await supabaseAdmin
      .from("orders")
      .update({ status: "cancelled" })
      .eq("id", orderId);

    const cancelledText = `❌ <b>Cancelled — Table ${order.table_number}</b>\n\n${itemLines}${noteBlock}${idTag}`;

    // Edit both barman and waiter messages — remove buttons from both
    const noButtons = { reply_markup: { inline_keyboard: [] } };
    await Promise.all([
      order.barman_message_id
        ? editMessageText(import.meta.env.TELEGRAM_BARMAN_CHAT_ID, order.barman_message_id, cancelledText, noButtons)
        : Promise.resolve(),
      order.waiter_message_id
        ? editMessageText(import.meta.env.TELEGRAM_WAITER_CHAT_ID, order.waiter_message_id, cancelledText, noButtons)
        : Promise.resolve(),
    ]);

    await answerCallbackQuery(cb.id, "Order cancelled.");
  }

  return new Response("ok");
};
