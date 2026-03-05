import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../lib/supabase";
import { sendMessage } from "../../lib/telegram";

export type OrderItem = { name: string; qty: number; price_cents: number };

export const POST: APIRoute = async ({ request, locals }) => {
  // Only authenticated staff can submit orders
  if (!locals.role || !["employee", "admin"].includes(locals.role)) {
    return json({ error: "Unauthorized" }, 401);
  }

  let table: number, items: OrderItem[], note: string | undefined;
  try {
    const body = await request.json();
    table = Number(body.table);
    items = body.items;
    note = body.note?.trim() || undefined;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if (!table || isNaN(table) || !Array.isArray(items) || items.length === 0) {
    return json({ error: "Missing table or items" }, 400);
  }

  // Save to Supabase
  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .insert({ table_number: table, items, note, status: "pending" })
    .select()
    .single();

  if (error || !order) {
    console.error(error);
    return json({ error: "Database error" }, 500);
  }

  // Format Telegram message
  const itemLines = items
    .map((i) => `  • ${i.qty}× ${i.name}`)
    .join("\n");

  const text =
    `🍹 <b>New Order — Table ${table}</b>\n\n` +
    `${itemLines}` +
    (note ? `\n\n📝 <i>${note}</i>` : "") +
    `\n\n<code>#${order.id.slice(0, 8)}</code>`;

  const msg = await sendMessage(
    import.meta.env.TELEGRAM_BARMAN_CHAT_ID,
    text,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔄 Preparing", callback_data: `preparing:${order.id}` }],
        ],
      },
    }
  );

  // Store the barman message_id so we can edit it later
  if (msg.ok) {
    await supabaseAdmin
      .from("orders")
      .update({ barman_message_id: msg.result.message_id })
      .eq("id", order.id);
  }

  return json({ ok: true, order_id: order.id });
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
