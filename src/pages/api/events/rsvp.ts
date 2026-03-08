import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

export const POST: APIRoute = async ({ request, locals }) => {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  const { event_id, name, email, guests } = body as Record<string, string>;

  if (!event_id || !name?.trim() || !email?.trim()) {
    return new Response(JSON.stringify({ error: "required" }), { status: 400 });
  }

  const guestsNum = Math.max(1, Math.min(20, Number(guests) || 1));

  // Verify event exists and is published
  const { data: event } = await supabaseAdmin
    .from("events")
    .select("id, capacity, is_published")
    .eq("id", event_id)
    .eq("is_published", true)
    .single();

  if (!event) {
    return new Response(JSON.stringify({ error: "Event not found" }), { status: 404 });
  }

  // Check if user already RSVPd (logged-in users only)
  if (locals.user) {
    const { data: existing } = await supabaseAdmin
      .from("event_rsvps")
      .select("id")
      .eq("event_id", event_id)
      .eq("user_id", locals.user.id)
      .eq("status", "confirmed")
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({ error: "already_registered" }), { status: 409 });
    }
  }

  // Check capacity if set
  if (event.capacity) {
    const { count } = await supabaseAdmin
      .from("event_rsvps")
      .select("guests", { count: "exact", head: false })
      .eq("event_id", event_id)
      .eq("status", "confirmed");

    if ((count ?? 0) + guestsNum > event.capacity) {
      return new Response(JSON.stringify({ error: "no_capacity" }), { status: 409 });
    }
  }

  const { error } = await supabaseAdmin.from("event_rsvps").insert({
    event_id,
    user_id: locals.user?.id ?? null,
    name: name.trim(),
    email: email.trim().toLowerCase(),
    guests: guestsNum,
    status: "confirmed",
  });

  if (error) {
    console.error("[events/rsvp] insert error:", error.message);
    return new Response(JSON.stringify({ error: "db" }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
