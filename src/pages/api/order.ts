import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../lib/supabase";
import { sendMessage } from "../../lib/telegram";
import { pushOrderCreated } from "../../lib/pushOrders";

export type OrderItem = { name: string; qty: number; price_cents: number };

export const POST: APIRoute = async ({ request, locals }) => {
  // Only authenticated staff can submit orders
  if (!locals.role || !["employee", "admin"].includes(locals.role)) {
    return json({ error: "Unauthorized" }, 401);
  }

  let table: number, items: OrderItem[], note: string | undefined, session_id: string | undefined;
  try {
    const body = await request.json();
    table = Number(body.table);
    items = body.items;
    note = body.note?.trim() || undefined;
    session_id = body.session_id || undefined;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if (!table || isNaN(table) || !Array.isArray(items) || items.length === 0) {
    return json({ error: "Missing table or items" }, 400);
  }

  // Compute order total
  const total_cents = items.reduce((sum, i) => sum + i.qty * i.price_cents, 0);

  // Session handling: join existing session or create a new one
  let finalSessionId: string;
  let roundNumber = 1;
  let customerUserId: string | null = null;

  if (session_id) {
    // Adding a round to an existing session — find the next round number
    const { data: existingRounds } = await supabaseAdmin
      .from("orders")
      .select("round_number")
      .eq("session_id", session_id)
      .order("round_number", { ascending: false })
      .limit(1);
    roundNumber = (existingRounds?.[0]?.round_number ?? 0) + 1;
    finalSessionId = session_id;
    const { data: sess } = await supabaseAdmin
      .from("table_sessions")
      .select("customer_user_id")
      .eq("id", session_id)
      .maybeSingle();
    customerUserId = sess?.customer_user_id ?? null;
  } else {
    // New session
    const { data: session, error: sessionErr } = await supabaseAdmin
      .from("table_sessions")
      .insert({ table_number: table })
      .select("id")
      .single();
    if (sessionErr || !session) {
      console.error(sessionErr);
      return json({ error: "Could not create session" }, 500);
    }
    finalSessionId = session.id;
  }

  // Save to Supabase
  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .insert({
      table_number: table, items, note, status: "pending", total_cents,
      waiter_id: locals.user?.id ?? null,
      session_id: finalSessionId,
      round_number: roundNumber,
      customer_user_id: customerUserId,
    })
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
  const roundLabel = roundNumber > 1 ? ` — Round ${roundNumber}` : "";

  const text =
    `🍹 <b>New Order${roundLabel} — Table ${table}</b>\n\n` +
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

  await pushOrderCreated({
    id: order.id,
    table_number: table,
    total_cents,
    round_number: roundNumber,
  });

  // Admin push (separate from staff push) — summary view
  try {
    const { pushToAdmins } = await import("../../lib/adminPush");
    await pushToAdmins({
      title: `🍸 New order · Table ${table}`,
      body: `${totalFormatted} · ${items.reduce((s, i) => s + i.qty, 0)} items${roundLabel}`,
      url: "/admin/orders",
      tag: `order-${order.id}`,
    });
  } catch {}

  return json({ ok: true, order_id: order.id, session_id: finalSessionId });
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
