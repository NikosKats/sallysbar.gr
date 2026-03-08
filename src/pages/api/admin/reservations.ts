import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

const POINTS_PER_RESERVATION = 10;

// PATCH — confirm or cancel a reservation (auto-awards loyalty on confirm)
export const PATCH: APIRoute = async ({ request, locals }) => {
  if (locals.role !== "admin") {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  let body: Record<string, string>;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  const { id, status } = body;

  if (!id || !["confirmed", "cancelled", "pending"].includes(status)) {
    return new Response(JSON.stringify({ error: "Invalid id or status" }), { status: 400 });
  }

  // Fetch current reservation so we can check user_id and previous status
  const { data: reservation } = await supabaseAdmin
    .from("reservations")
    .select("user_id, status")
    .eq("id", id)
    .single();

  const { error } = await supabaseAdmin
    .from("reservations")
    .update({ status })
    .eq("id", id);

  if (error) {
    console.error("[admin/reservations] update error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  // Auto-award loyalty points when confirming a reservation for a logged-in user
  if (
    status === "confirmed" &&
    reservation?.user_id &&
    reservation.status !== "confirmed"
  ) {
    // Avoid double-awarding if somehow called twice
    const { data: existing } = await supabaseAdmin
      .from("loyalty_events")
      .select("id")
      .eq("reservation_id", id)
      .maybeSingle();

    if (!existing) {
      await supabaseAdmin.from("loyalty_events").insert({
        user_id: reservation.user_id,
        points: POINTS_PER_RESERVATION,
        reason: "Confirmed reservation",
        reservation_id: id,
      });
    }
  }

  return new Response(JSON.stringify({ ok: true }));
};

// DELETE — hard delete a reservation
export const DELETE: APIRoute = async ({ request, locals }) => {
  if (locals.role !== "admin") {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  const { id } = await request.json();
  if (!id) return new Response(JSON.stringify({ error: "Missing id" }), { status: 400 });

  const { error } = await supabaseAdmin.from("reservations").delete().eq("id", id);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }));
};
