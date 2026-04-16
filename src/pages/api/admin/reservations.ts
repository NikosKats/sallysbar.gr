import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";
import { sendMessage, setRuntimeEnv } from "../../../lib/vonage-messages";

const POINTS_PER_RESERVATION = 10;

// PATCH — confirm or cancel a reservation (auto-awards loyalty on confirm)
export const PATCH: APIRoute = async ({ request, locals }) => {
  if (!["admin","super_admin"].includes(locals.role ?? "")) {
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

  // Fetch current reservation so we can check user_id, previous status, and
  // customer contact for the confirmation SMS.
  const { data: reservation } = await supabaseAdmin
    .from("reservations")
    .select("user_id, status, source, name, phone, date, time, party_size")
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

  const wasUnresolved = reservation?.status === "pending" || reservation?.status === "pending_ai";
  const hasPhone = !!reservation?.phone;

  // Auto-award loyalty points when confirming a reservation for a logged-in user
  if (status === "confirmed" && reservation?.user_id && reservation.status !== "confirmed") {
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

  // SMS the customer on status transition (only if we have a phone number and
  // this is a transition from pending/pending_ai → confirmed/cancelled).
  if (hasPhone && wasUnresolved && (status === "confirmed" || status === "cancelled")) {
    setRuntimeEnv((locals as any)?.runtime?.env);
    try {
      const firstName = (reservation!.name ?? "").split(" ")[0] || "there";
      const niceDate = new Date(`${reservation!.date}T00:00:00`).toLocaleDateString("en-GB", {
        weekday: "short", day: "numeric", month: "short",
      });
      const text = status === "confirmed"
        ? `Hi ${firstName}, your table for ${reservation!.party_size} at Sally's Bar on ${niceDate} at ${reservation!.time} is confirmed. See you then! Reply STOP to opt out.`
        : `Hi ${firstName}, unfortunately we can't accommodate your booking for ${niceDate} at ${reservation!.time}. Please call us on +30 694 627 2083 to rearrange. Sally's Bar.`;
      await sendMessage(reservation!.phone!, text, { channel: "sms" });
    } catch (e: any) {
      console.warn("[admin/reservations] customer SMS failed:", e?.message);
    }
  }

  return new Response(JSON.stringify({ ok: true }));
};

// DELETE — hard delete a reservation
export const DELETE: APIRoute = async ({ request, locals }) => {
  if (!["admin","super_admin"].includes(locals.role ?? "")) {
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
