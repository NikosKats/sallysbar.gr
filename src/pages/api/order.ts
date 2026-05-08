import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../lib/supabase";
import { sendMessage } from "../../lib/telegram";
import { pushOrderCreated } from "../../lib/pushOrders";

export type OrderItem = { name: string; qty: number; price_cents: number };

export const POST: APIRoute = async ({ request, locals }) => {
  // Only authenticated staff can submit orders
  if (!locals.role || !["employee", "staff", "waiter", "barman", "admin", "super_admin"].includes(locals.role)) {
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

  // Wrap the whole Telegram fan-out in try/catch so a Telegram outage or
  // malformed response never blocks the waiter from placing the order.
  try {
    const itemLines = items
      .map((i) => `  • ${i.qty}× ${i.name}  <i>€${((i.qty * i.price_cents) / 100).toFixed(2)}</i>`)
      .join("\n");

    const totalFormatted = `€${(total_cents / 100).toFixed(2)}`;
    const roundLabel = roundNumber > 1 ? ` — Round ${roundNumber}` : "";

    // Date/time in Athens tz, defensive against ICU quirks on the edge runtime.
    let when = "";
    try {
      when = new Date((order as any).created_at ?? Date.now()).toLocaleString("en-GB", {
        weekday: "short", day: "numeric", month: "short",
        hour: "2-digit", minute: "2-digit",
        timeZone: "Europe/Athens", hour12: false,
      });
    } catch {
      when = new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";
    }

    const seq = (order as any).seq as number | null | undefined;
    const shortId = String(order.id ?? "").slice(0, 8).toUpperCase();

    // Compute a "daily" order number that resets at Athens midnight.
    // We count orders for the same Athens-local day with created_at <= this order's,
    // so two orders never collide on the same number even under concurrent inserts
    // (later one always sees the earlier one in the count).
    let dailySeq = 1;
    try {
      const orderCreatedAt = new Date((order as any).created_at ?? Date.now());
      const ymd = new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Europe/Athens",
        year: "numeric", month: "2-digit", day: "2-digit",
      }).format(orderCreatedAt);
      const utcMidnight = new Date(`${ymd}T00:00:00Z`);
      const athensHour = Number(new Intl.DateTimeFormat("en-US", {
        timeZone: "Europe/Athens", hour: "2-digit", hour12: false,
      }).format(utcMidnight));
      const startOfAthensDay = new Date(utcMidnight.getTime() - athensHour * 3600_000);
      const { count } = await supabaseAdmin
        .from("orders")
        .select("id", { count: "exact", head: true })
        .gte("created_at", startOfAthensDay.toISOString())
        .lte("created_at", (order as any).created_at);
      if (count && count > 0) dailySeq = count;
    } catch (e: any) {
      console.warn("[order] daily seq calc failed:", e?.message);
    }

    // Primary number resets per day; keep the global seq / short UUID as a stable secondary.
    const primaryNum = `#${dailySeq}`;
    const secondary  = (seq != null) ? ` · global #${seq} · ${shortId}` : ` · ${shortId}`;

    const text =
      `🍹 <b>New Order${roundLabel} — Table ${table}</b>\n` +
      `🕒 ${when}  ·  🔖 <b>${primaryNum}</b>${secondary}\n\n` +
      `${itemLines}\n\n` +
      `💶 <b>Total: ${totalFormatted}</b>` +
      (note ? `\n\n📝 <i>${note}</i>` : "") +
      `\n\n<code>${primaryNum}</code>`;

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
      ).catch((e) => { console.warn("[order] barman tg failed:", e?.message); return { ok: false }; }),
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
      ).catch((e) => { console.warn("[order] waiter tg failed:", e?.message); return { ok: false }; }),
    ]);

    const updates: Record<string, number> = {};
    if ((barmanMsg as any)?.ok) updates.barman_message_id = (barmanMsg as any).result.message_id;
    if ((waiterMsg as any)?.ok) updates.waiter_message_id = (waiterMsg as any).result.message_id;
    if (Object.keys(updates).length) {
      await supabaseAdmin.from("orders").update(updates).eq("id", order.id);
    }
  } catch (e: any) {
    console.error("[order] telegram/notify block failed — order still saved:", e?.message);
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
