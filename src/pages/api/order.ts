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

  // Compute order total
  const total_cents = items.reduce((sum, i) => sum + i.qty * i.price_cents, 0);

  // Save to Supabase
  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .insert({ table_number: table, items, note, status: "pending", total_cents, waiter_id: locals.user?.id ?? null })
    .select()
    .single();

  if (error || !order) {
    console.error(error);
    return json({ error: "Database error" }, 500);
  }

  // Format Telegram message with prices
  const itemLines = items
    .map((i) => `  • ${i.qty}× ${i.name}  <i>€${((i.qty * i.price_cents) / 100).toFixed(2)}</i>`)
    .join("\n");

  const totalFormatted = `€${(total_cents / 100).toFixed(2)}`;

  const text =
    `🍹 <b>New Order — Table ${table}</b>\n\n` +
    `${itemLines}\n\n` +
    `💶 <b>Total: ${totalFormatted}</b>` +
    (note ? `\n\n📝 <i>${note}</i>` : "") +
    `\n\n<code>#${order.id.slice(0, 8)}</code>`;

  const [barmanMsg, waiterMsg] = await Promise.all([
    sendMessage(
      import.meta.env.TELEGRAM_BARMAN_CHAT_ID,
      text,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "🔄 Preparing", callback_data: `preparing:${order.id}` },
              { text: "❌ Cancel", callback_data: `cancel:${order.id}` },
            ],
          ],
        },
      }
    ),
    sendMessage(
      import.meta.env.TELEGRAM_WAITER_CHAT_ID,
      text,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "❌ Cancel", callback_data: `cancel:${order.id}` }],
          ],
        },
      }
    ),
  ]);

  // Store message IDs so we can edit them later
  const updates: Record<string, number> = {};
  if (barmanMsg.ok) updates.barman_message_id = barmanMsg.result.message_id;
  if (waiterMsg.ok) updates.waiter_message_id = waiterMsg.result.message_id;
  if (Object.keys(updates).length) {
    await supabaseAdmin.from("orders").update(updates).eq("id", order.id);
  }

  return json({ ok: true, order_id: order.id });
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
