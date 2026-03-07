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

function fmtEur(cents: number): string {
  return (cents / 100).toFixed(2);
}

function tipKeyboard(t: "c" | "k", current: number, orderId: string) {
  const d = (add: number) => `tadd_${t}_${add}_${current}:${orderId}`;
  return {
    inline_keyboard: [
      [
        { text: "+€0.01", callback_data: d(1)     },
        { text: "+€0.05", callback_data: d(5)     },
        { text: "+€0.10", callback_data: d(10)    },
        { text: "+€0.50", callback_data: d(50)    },
      ],
      [
        { text: "+€1",    callback_data: d(100)   },
        { text: "+€2",    callback_data: d(200)   },
        { text: "+€5",    callback_data: d(500)   },
        { text: "+€10",   callback_data: d(1000)  },
      ],
      [
        { text: "+€20",   callback_data: d(2000)  },
        { text: "+€50",   callback_data: d(5000)  },
        { text: "+€100",  callback_data: d(10000) },
        { text: "⟳ Reset", callback_data: `treset_${t}:${orderId}` },
      ],
      [
        { text: current > 0 ? `✅ Save €${fmtEur(current)}` : "✅ Save",
          callback_data: `tsave_${t}_${current}:${orderId}` },
      ],
    ],
  };
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

  // Tip type chosen → open accumulator at €0.00
  if (action === "tc" || action === "tk") {
    const t = action === "tc" ? "c" : "k";
    const typeLabel = t === "c" ? "💵 Cash" : "💳 Card";
    await editMessageText(
      cb.message.chat.id,
      cb.message.message_id,
      `${typeLabel} tip — <b>Table ${order.table_number}</b>\n\nTotal: <b>€0.00</b>`,
      { reply_markup: tipKeyboard(t, 0, orderId) }
    );
    await answerCallbackQuery(cb.id);
  }

  // Increment current total  (tadd_c_10_150:orderId → add 10¢ to 150¢)
  if (action.startsWith("tadd_")) {
    const parts = action.split("_");           // ["tadd","c","10","150"]
    const t       = parts[1] as "c" | "k";
    const add     = parseInt(parts[2], 10);
    const current = parseInt(parts[3], 10);
    const total   = Math.min(current + add, 99999); // cap at €999.99
    const typeLabel = t === "c" ? "💵 Cash" : "💳 Card";
    const euros = fmtEur(total);
    await editMessageText(
      cb.message.chat.id,
      cb.message.message_id,
      `${typeLabel} tip — <b>Table ${order.table_number}</b>\n\nTotal: <b>€${euros}</b>`,
      { reply_markup: tipKeyboard(t, total, orderId) }
    );
    await answerCallbackQuery(cb.id, `+€${fmtEur(add)}`);
  }

  // Reset to €0.00  (treset_c:orderId)
  if (action.startsWith("treset_")) {
    const t = action.split("_")[1] as "c" | "k";
    const typeLabel = t === "c" ? "💵 Cash" : "💳 Card";
    await editMessageText(
      cb.message.chat.id,
      cb.message.message_id,
      `${typeLabel} tip — <b>Table ${order.table_number}</b>\n\nTotal: <b>€0.00</b>`,
      { reply_markup: tipKeyboard(t, 0, orderId) }
    );
    await answerCallbackQuery(cb.id, "Reset ✓");
  }

  // Save tip  (tsave_c_150:orderId)
  if (action.startsWith("tsave_")) {
    const parts = action.split("_");           // ["tsave","c","150"]
    const t           = parts[1] as "c" | "k";
    const amount_cents = parseInt(parts[2], 10);
    const tipType     = t === "c" ? "cash" : "card";
    const typeLabel   = t === "c" ? "💵 Cash" : "💳 Card";

    if (amount_cents <= 0) {
      await answerCallbackQuery(cb.id, "Select an amount first!", true);
      return new Response("ok");
    }

    if (order.waiter_id) {
      await supabaseAdmin.from("tips").insert({
        order_id: orderId, waiter_id: order.waiter_id, amount_cents, type: tipType,
      });
    }

    await editMessageText(
      cb.message.chat.id,
      cb.message.message_id,
      `✅ <b>€${fmtEur(amount_cents)} ${typeLabel} tip</b> saved for Table ${order.table_number} 💚`
    );
    await answerCallbackQuery(cb.id, `€${fmtEur(amount_cents)} recorded!`);
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
