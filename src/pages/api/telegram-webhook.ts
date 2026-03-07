import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../lib/supabase";
import {
  sendMessage,
  editMessageText,
  answerCallbackQuery,
  deleteMessage,
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
  // ── Handle plain messages (custom tip amount replies) ──────────────────────
  // State is encoded in the reply_to_message text — no DB table needed.
  // Format: "...#tip_cash_UUID" or "...#tip_card_UUID"
  if (body.message && !body.callback_query) {
    const msg = body.message as {
      message_id: number;
      chat: { id: number };
      text?: string;
      reply_to_message?: { text?: string };
    };

    // DEBUG — remove once working
    await sendMessage(
      msg.chat.id,
      `🔍 <b>Debug:</b> got msg <code>${(msg.text ?? "").slice(0, 80)}</code>\nreply_to: <code>${(msg.reply_to_message?.text ?? "none").slice(0, 120)}</code>`
    ).catch(() => {});

    const replyText = msg.reply_to_message?.text ?? "";
    const marker    = replyText.match(/#tip_(cash|card)_([0-9a-f-]{36})/);
    if (!marker) return new Response("ok");

    const tipType  = marker[1] as "cash" | "card";
    const targetId = marker[2];
    const chatId   = msg.chat.id;
    const raw      = (msg.text ?? "").trim().replace(",", ".");
    const amount   = parseFloat(raw.replace(/[^0-9.]/g, ""));

    if (isNaN(amount) || amount <= 0) {
      await sendMessage(chatId, "⚠️ Invalid amount. Send a number e.g. <b>7.50</b>");
      return new Response("ok");
    }

    const amount_cents = Math.round(amount * 100);
    const typeLabel    = tipType === "cash" ? "💵 Cash" : "💳 Card";
    const euros        = amount.toFixed(2);

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("waiter_id, table_number")
      .eq("id", targetId)
      .single();

    if (order?.waiter_id) {
      await supabaseAdmin.from("tips").insert({
        order_id: targetId, waiter_id: order.waiter_id, amount_cents, type: tipType,
      });
    }

    await deleteMessage(chatId, msg.message_id);
    await sendMessage(
      chatId,
      `✅ <b>€${euros} ${typeLabel} tip</b> saved for Table ${order?.table_number ?? "?"} 💚`
    );

    return new Response("ok");
  }

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
      `📦 <b>Delivered — Table ${order.table_number}</b>\n\n${itemLines}${idTag}`,
      { reply_markup: { inline_keyboard: [] } }
    );

    await sendMessage(
      import.meta.env.TELEGRAM_WAITER_CHAT_ID,
      `💰 <b>Table ${order.table_number}</b> — Did you receive a tip?`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "💵 Cash", callback_data: `tc:${orderId}` },
              { text: "💳 Card", callback_data: `tk:${orderId}` },
              { text: "❌ No tip", callback_data: `tn:${orderId}` },
            ],
          ],
        },
      }
    );

    await answerCallbackQuery(cb.id, "Order delivered! ✅");
  }

  // Tip type chosen → show amount buttons + Custom option
  if (action === "tc" || action === "tk") {
    const typeLabel = action === "tc" ? "💵 Cash" : "💳 Card";
    const prefix    = action === "tc" ? "ta" : "tb";
    const custom    = action === "tc" ? "tc_custom" : "tk_custom";

    await editMessageText(
      cb.message.chat.id,
      cb.message.message_id,
      `${typeLabel} tip — <b>Table ${order.table_number}</b>\nHow much?`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "€1",  callback_data: `${prefix}_100:${orderId}`  },
              { text: "€2",  callback_data: `${prefix}_200:${orderId}`  },
              { text: "€3",  callback_data: `${prefix}_300:${orderId}`  },
              { text: "€5",  callback_data: `${prefix}_500:${orderId}`  },
            ],
            [
              { text: "€7",  callback_data: `${prefix}_700:${orderId}`  },
              { text: "€10", callback_data: `${prefix}_1000:${orderId}` },
              { text: "€15", callback_data: `${prefix}_1500:${orderId}` },
              { text: "€20", callback_data: `${prefix}_2000:${orderId}` },
            ],
            [
              { text: "€25", callback_data: `${prefix}_2500:${orderId}` },
              { text: "€30", callback_data: `${prefix}_3000:${orderId}` },
              { text: "€50", callback_data: `${prefix}_5000:${orderId}` },
              { text: "€100",callback_data: `${prefix}_10000:${orderId}`},
            ],
            [
              { text: "✏️ Other amount", callback_data: `${custom}:${orderId}` },
            ],
          ],
        },
      }
    );
    await answerCallbackQuery(cb.id);
  }

  // Custom amount chosen → send force_reply prompt with order info embedded in text
  if (action === "tc_custom" || action === "tk_custom") {
    const tipType   = action === "tc_custom" ? "cash" : "card";
    const typeLabel = tipType === "cash" ? "💵 Cash" : "💳 Card";
    const chatId    = cb.message.chat.id;

    // Remove buttons from the type-selection message
    await editMessageText(
      chatId,
      cb.message.message_id,
      `${typeLabel} tip — <b>Table ${order.table_number}</b>\n⌨️ Reply to the next message with the amount (e.g. 7.50)`
    );

    // Embed order state in the message text so we can parse it from reply_to_message
    await sendMessage(
      chatId,
      `${typeLabel} tip — Table ${order.table_number}\nHow much? Reply to this message with the amount:\n#tip_${tipType}_${orderId}`,
      { reply_markup: { force_reply: true, selective: false } }
    );

    await answerCallbackQuery(cb.id);
  }

  // No tip
  if (action === "tn") {
    await editMessageText(
      cb.message.chat.id,
      cb.message.message_id,
      `👍 No tip recorded for Table ${order.table_number}.`
    );
    await answerCallbackQuery(cb.id, "Noted.");
  }

  // Preset amount chosen (callback_data format: ta_500:orderId)
  if (action.startsWith("ta_") || action.startsWith("tb_")) {
    const [prefix, amountStr] = action.split("_");
    const amount_cents = parseInt(amountStr, 10);
    const tipType  = prefix === "ta" ? "cash" : "card";
    const typeLabel = prefix === "ta" ? "💵 Cash" : "💳 Card";
    const euros    = (amount_cents / 100).toFixed(2);

    if (!isNaN(amount_cents) && order.waiter_id) {
      await supabaseAdmin.from("tips").insert({
        order_id:     orderId,
        waiter_id:    order.waiter_id,
        amount_cents,
        type:         tipType,
      });
    }

    await editMessageText(
      cb.message.chat.id,
      cb.message.message_id,
      `✅ <b>€${euros} ${typeLabel} tip</b> saved for Table ${order.table_number} 💚`
    );
    await answerCallbackQuery(cb.id, `€${euros} tip recorded!`);
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

    await answerCallbackQuery(cb.id, "Order cancelled.");
  }

  return new Response("ok");
}
