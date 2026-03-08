import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  let body: { id?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  const { id } = body;
  if (!id) {
    return new Response(JSON.stringify({ error: "Missing id" }), { status: 400 });
  }

  // Fetch the reservation and verify ownership
  const { data: reservation, error: fetchError } = await supabaseAdmin
    .from("reservations")
    .select("id, user_id, status, date")
    .eq("id", id)
    .single();

  if (fetchError || !reservation) {
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  }

  if (reservation.user_id !== locals.user.id) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  if (reservation.status === "cancelled") {
    return new Response(JSON.stringify({ error: "Already cancelled" }), { status: 400 });
  }

  // Only allow cancelling future reservations
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (new Date(reservation.date) < today) {
    return new Response(JSON.stringify({ error: "Cannot cancel past reservation" }), { status: 400 });
  }

  const { error: updateError } = await supabaseAdmin
    .from("reservations")
    .update({ status: "cancelled" })
    .eq("id", id);

  if (updateError) {
    return new Response(JSON.stringify({ error: "db" }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
