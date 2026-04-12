import type { APIRoute } from "astro";
import { createSupabaseServerClient, supabaseAdmin } from "../../../lib/supabase";
import { pushOrderStatus, pushToAllStaff } from "../../../lib/pushOrders";
import { awardPointsForOrderIds } from "../../../lib/loyalty";

async function requireAuth(request: Request, cookies: any) {
  const supabase = createSupabaseServerClient(request, cookies);
  const { data: { user } } = await supabase.auth.getUser();
  return user ?? null;
}

function json(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const PATCH: APIRoute = async ({ request, cookies }) => {
  const user = await requireAuth(request, cookies);
  if (!user) return json({ error: "Unauthorized" }, 401);

  const body = await request.json().catch(() => null);
  if (!body?.action) return json({ error: "action required" }, 400);

  const { id, action, tip_amount_cents, tip_type, session_id, amount_cents, items_snapshot } = body;

  // ── Pay entire session (all delivered rounds) ──────────────────────────────
  if (action === "pay_session") {
    if (!session_id) return json({ error: "session_id required" }, 400);

    const { data: deliveredOrders } = await supabaseAdmin
      .from("orders")
      .select("id, waiter_id")
      .eq("session_id", session_id)
      .eq("status", "delivered");

    if (!deliveredOrders?.length) return json({ error: "No delivered rounds to pay" }, 400);

    await supabaseAdmin
      .from("orders")
      .update({ status: "paid" })
      .eq("session_id", session_id)
      .eq("status", "delivered");

    await awardPointsForOrderIds(deliveredOrders.map((o) => o.id));

    await supabaseAdmin
      .from("table_sessions")
      .update({ status: "closed", closed_at: new Date().toISOString() })
      .eq("id", session_id);

    const { data: sessionRow } = await supabaseAdmin
      .from("table_sessions")
      .select("table_number")
      .eq("id", session_id)
      .single();
    await pushToAllStaff({
      title: `💶 Session paid — Table ${sessionRow?.table_number ?? ""}`,
      body: `All rounds closed`,
      tag: `session-${session_id}`,
      url: "/staff",
    });

    const cents = Number(tip_amount_cents);
    if (cents > 0 && (tip_type === "cash" || tip_type === "card")) {
      await supabaseAdmin.from("tips").insert({
        order_id: deliveredOrders[0].id,
        waiter_id: deliveredOrders[0].waiter_id ?? user.id,
        amount_cents: cents,
        type: tip_type,
      });
    }

    return json({ ok: true });
  }

  // ── Partial payment (collect some items without closing session) ────────────
  if (action === "partial_pay") {
    if (!session_id || !amount_cents) return json({ error: "session_id and amount_cents required" }, 400);

    await supabaseAdmin.from("partial_payments").insert({
      session_id,
      amount_cents: Number(amount_cents),
      tip_amount_cents: Number(tip_amount_cents ?? 0),
      tip_type: (tip_type === "cash" || tip_type === "card") ? tip_type : null,
      items_snapshot: items_snapshot ?? null,
    });

    const cents = Number(tip_amount_cents);
    if (cents > 0 && (tip_type === "cash" || tip_type === "card")) {
      const { data: latestOrder } = await supabaseAdmin
        .from("orders")
        .select("id, waiter_id")
        .eq("session_id", session_id)
        .eq("status", "delivered")
        .order("round_number", { ascending: false })
        .limit(1)
        .single();
      if (latestOrder) {
        await supabaseAdmin.from("tips").insert({
          order_id: latestOrder.id,
          waiter_id: latestOrder.waiter_id ?? user.id,
          amount_cents: cents,
          type: tip_type,
        });
      }
    }

    // ── Mark individual rounds as paid if their items are fully covered ────────
    const [{ data: deliveredOrders }, { data: allPartials }] = await Promise.all([
      supabaseAdmin.from("orders").select("id, items, round_number").eq("session_id", session_id).eq("status", "delivered"),
      supabaseAdmin.from("partial_payments").select("items_snapshot").eq("session_id", session_id),
    ]);

    if (deliveredOrders?.length) {
      // Build paid qty per round number from items_snapshot.roundNum
      const paidQtyByRound = new Map<number, Map<string, number>>();
      for (const pp of (allPartials ?? [])) {
        for (const item of ((pp.items_snapshot ?? []) as any[])) {
          const rn: number = item.roundNum ?? 0;
          const qty: number = item.qty ?? item.quantity ?? 1;
          const roundMap = paidQtyByRound.get(rn) ?? new Map<string, number>();
          roundMap.set(item.name, (roundMap.get(item.name) ?? 0) + qty);
          paidQtyByRound.set(rn, roundMap);
        }
      }

      // Find rounds whose items are fully covered by partial payments
      const ordersToPay: string[] = [];
      for (const order of deliveredOrders) {
        const roundPaid = paidQtyByRound.get(order.round_number) ?? new Map<string, number>();
        const covered = (order.items as any[]).every((item: any) => {
          const qty = item.qty ?? item.quantity ?? 1;
          return (roundPaid.get(item.name) ?? 0) >= qty;
        });
        if (covered) ordersToPay.push(order.id);
      }

      if (ordersToPay.length > 0) {
        await supabaseAdmin.from("orders").update({ status: "paid" }).in("id", ordersToPay);
        await awardPointsForOrderIds(ordersToPay);
        const { data: paidRows } = await supabaseAdmin
          .from("orders")
          .select("id, table_number")
          .in("id", ordersToPay);
        for (const p of paidRows ?? []) {
          await pushOrderStatus({ id: p.id, table_number: p.table_number, status: "paid" });
        }
        // Close session only if all non-cancelled orders are now paid
        const { data: remaining } = await supabaseAdmin
          .from("orders")
          .select("id")
          .eq("session_id", session_id)
          .not("status", "in", '("paid","cancelled")')
          .limit(1);
        if (!remaining?.length) {
          await supabaseAdmin
            .from("table_sessions")
            .update({ status: "closed", closed_at: new Date().toISOString() })
            .eq("id", session_id);
        }
      }
    }

    return json({ ok: true });
  }

  // For single-order actions we need the order id
  if (!id) return json({ error: "id required" }, 400);

  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("id,status,waiter_id,session_id,table_number,items,note")
    .eq("id", id)
    .single();

  if (!order) return json({ error: "Order not found" }, 404);

  // ── Cancel (pending only) ──────────────────────────────────────────────────
  if (action === "cancel") {
    if (order.status !== "pending") {
      return json({ error: "Only pending orders can be cancelled" }, 400);
    }
    await supabaseAdmin.from("orders").update({ status: "cancelled" }).eq("id", id);
    await pushOrderStatus({ id: order.id, table_number: order.table_number, status: "cancelled" });

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

    return json({ ok: true });
  }

  // ── Mark individual round as paid (delivered only) ─────────────────────────
  if (action === "paid") {
    if (order.status !== "delivered") {
      return json({ error: "Only delivered orders can be marked as paid" }, 400);
    }
    await supabaseAdmin.from("orders").update({ status: "paid" }).eq("id", id);
    await pushOrderStatus({ id: order.id, table_number: order.table_number, status: "paid" });
    await awardPointsForOrderIds([id]);

    const cents = Number(tip_amount_cents);
    if (cents > 0 && (tip_type === "cash" || tip_type === "card")) {
      await supabaseAdmin.from("tips").insert({
        order_id: id,
        waiter_id: order.waiter_id ?? user.id,
        amount_cents: cents,
        type: tip_type,
      });
    }

    // Auto-close session if all non-cancelled orders are now paid
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

    return json({ ok: true });
  }

  return json({ error: "Unknown action" }, 400);
};
