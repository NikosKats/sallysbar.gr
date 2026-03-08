import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../lib/supabase";

export const POST: APIRoute = async ({ request, locals }) => {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  const { name, email, phone, date, time, party_size, notes } = body as Record<string, string>;

  if (!name?.trim() || !email?.trim() || !date || !time || !party_size) {
    return new Response(JSON.stringify({ error: "required" }), { status: 400 });
  }

  // Validate date is not in the past
  const bookingDate = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (bookingDate < today) {
    return new Response(JSON.stringify({ error: "past" }), { status: 400 });
  }

  const partySizeNum = Number(party_size);
  if (!Number.isInteger(partySizeNum) || partySizeNum < 1 || partySizeNum > 20) {
    return new Response(JSON.stringify({ error: "invalid_party_size" }), { status: 400 });
  }

  const { error } = await supabaseAdmin.from("reservations").insert({
    user_id: locals.user?.id ?? null,
    name: name.trim(),
    email: email.trim().toLowerCase(),
    phone: phone?.trim() || null,
    date,
    time,
    party_size: partySizeNum,
    notes: notes?.trim() || null,
    status: "pending",
  });

  if (error) {
    console.error("[reservations] insert error:", error.message);
    return new Response(JSON.stringify({ error: "db" }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
