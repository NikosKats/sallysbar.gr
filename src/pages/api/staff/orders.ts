import type { APIRoute } from "astro";
import { createSupabaseServerClient, supabaseAdmin } from "../../../lib/supabase";

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
  if (!body?.id || !body?.action) return json({ error: "id and action required" }, 400);

  const { id, action, tip_amount_cents, tip_type } = body;

  // Fetch current order to verify allowed transition
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("id,status,waiter_id,barman_message_id,waiter_message_id,table_number,items,note")
    .eq("id", id)
    .single();

  if (!order) return json({ error: "Order not found" }, 404);

  // ── Cancel (pending only) ──────────────────────────────────────────────────
  if (action === "cancel") {
    if (order.status !== "pending") {
      return json({ error: "Only pending orders can be cancelled" }, 400);
    }
    await supabaseAdmin.from("orders").update({ status: "cancelled" }).eq("id", id);
    return json({ ok: true });
  }

  // ── Mark as paid (delivered only) ─────────────────────────────────────────
  if (action === "paid") {
    if (order.status !== "delivered") {
      return json({ error: "Only delivered orders can be marked as paid" }, 400);
    }
    await supabaseAdmin.from("orders").update({ status: "paid" }).eq("id", id);

    // Record tip if provided
    const cents = Number(tip_amount_cents);
    if (cents > 0 && (tip_type === "cash" || tip_type === "card")) {
      await supabaseAdmin.from("tips").insert({
        order_id: id,
        waiter_id: order.waiter_id ?? user.id,
        amount_cents: cents,
        type: tip_type,
      });
    }

    return json({ ok: true });
  }

  return json({ error: "Unknown action" }, 400);
};
