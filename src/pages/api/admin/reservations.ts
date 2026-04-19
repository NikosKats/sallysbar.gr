import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";
import { sendMessage, setRuntimeEnv } from "../../../lib/vonage-messages";
import { buildManageUrl } from "../../../lib/booking-tokens";
import { shortenUrl } from "../../../lib/url-shortener";
import { getDayCapacity } from "../../../lib/booking-capacity";

const POINTS_PER_RESERVATION = 10;

// POST — staff-created reservation. Unlike the public /api/reservations route
// this one doesn't require email, skips the consent/marketing side-effects,
// and lets the admin pick the initial status (defaults to "confirmed" since
// phoning the venue is usually a live booking).
export const POST: APIRoute = async ({ request, locals }) => {
  if (!["admin","super_admin"].includes(locals.role ?? "")) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  let body: Record<string, any>;
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 }); }

  const name = String(body?.name ?? "").trim().slice(0, 120);
  const email = String(body?.email ?? "").trim().toLowerCase().slice(0, 160);
  const phone = String(body?.phone ?? "").trim().replace(/[^\d+]/g, "");
  const date = String(body?.date ?? "").trim();
  const time = String(body?.time ?? "").trim();
  const partySize = Number(body?.party_size ?? 0);
  const notes = String(body?.notes ?? "").trim().slice(0, 500);
  const status = ["pending","pending_ai","confirmed","cancelled"].includes(String(body?.status))
    ? String(body.status) : "confirmed";

  if (name.length < 2) return new Response(JSON.stringify({ error: "name too short" }), { status: 400 });
  if (!/^\+\d{8,15}$/.test(phone)) return new Response(JSON.stringify({ error: "phone required (E.164, e.g. +306943649190)" }), { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return new Response(JSON.stringify({ error: "bad date (YYYY-MM-DD)" }), { status: 400 });
  if (!/^\d{1,2}:\d{2}$/.test(time))    return new Response(JSON.stringify({ error: "bad time (HH:MM)" }), { status: 400 });
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > 50)
    return new Response(JSON.stringify({ error: "party size 1–50" }), { status: 400 });

  // Capacity guard — admin can override by setting `force=true` (rare cases like
  // big parties merging tables). Otherwise we reject so we don't oversell.
  const force = body?.force === true;
  if (!force) {
    const cap = await getDayCapacity(date);
    if (cap.isFull) {
      return new Response(JSON.stringify({
        error: `Fully booked on ${date} (${cap.used}/${cap.capacity}). Re-submit with force=true to override.`,
        full: true,
        capacity: cap,
      }), { status: 409 });
    }
  }

  const { data: inserted, error } = await supabaseAdmin
    .from("reservations")
    .insert({
      name,
      email: email || "",
      phone: phone || null,
      date,
      time: time.length === 4 ? "0" + time : time,
      party_size: partySize,
      notes: notes || null,
      status,
      source: "admin",
    })
    .select("id")
    .single();

  if (error || !inserted) {
    console.error("[admin/reservations] POST error:", error?.message);
    return new Response(JSON.stringify({ error: error?.message ?? "db_error" }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true, id: inserted.id }), {
    headers: { "Content-Type": "application/json" },
  });
};

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

  // Capacity guard for un-cancelling: if the row was previously cancelled or
  // rejected (so it freed a slot) and admin is putting it back to confirmed,
  // make sure we still have room. Other transitions don't change `used`.
  const wasFreed = reservation?.status === "cancelled" || reservation?.status === "rejected";
  const willConsume = status === "confirmed" || status === "pending";
  if (wasFreed && willConsume && !body?.force) {
    const cap = await getDayCapacity(reservation!.date as string, { excludeId: id });
    if (cap.isFull) {
      return new Response(JSON.stringify({
        error: `Fully booked on ${reservation!.date} (${cap.used}/${cap.capacity}). Re-submit with force=true to override.`,
        full: true,
        capacity: cap,
      }), { status: 409 });
    }
  }

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
  type SmsReport = { attempted: boolean; ok: boolean; error?: string; reason?: string };
  const sms: SmsReport = { attempted: false, ok: false };
  if (!hasPhone) sms.reason = "no_phone";
  else if (!wasUnresolved) sms.reason = "already_decided";
  else if (status !== "confirmed" && status !== "cancelled") sms.reason = "not_a_decision";

  if (hasPhone && wasUnresolved && (status === "confirmed" || status === "cancelled")) {
    sms.attempted = true;
    setRuntimeEnv((locals as any)?.runtime?.env);
    try {
      const firstName = (reservation!.name ?? "").split(" ")[0] || "there";
      const niceDate = new Date(`${reservation!.date}T00:00:00`).toLocaleDateString("en-GB", {
        weekday: "short", day: "numeric", month: "short",
      });
      const manageUrl = status === "confirmed"
        ? await shortenUrl(await buildManageUrl(id, locals))
        : "";
      const text = status === "confirmed"
        ? `Hi ${firstName}, your table for ${reservation!.party_size} at Sally's Bar on ${niceDate} at ${reservation!.time} is confirmed. Manage/cancel: ${manageUrl} — see you then! Reply STOP to opt out.`
        : `Hi ${firstName}, unfortunately we can't accommodate your booking for ${niceDate} at ${reservation!.time}. Please call us on +30 694 627 2083 to rearrange. Sally's Bar.`;
      const r = await sendMessage(reservation!.phone!, text, { channel: "sms" });
      sms.ok = r.ok;
      if (!r.ok) sms.error = (r as any).error ?? "send_failed";
    } catch (e: any) {
      console.warn("[admin/reservations] customer SMS failed:", e?.message);
      sms.error = e?.message ?? "exception";
    }
  }

  return new Response(JSON.stringify({ ok: true, sms }));
};

// PUT — edit reservation fields (name, contact, date/time, party, notes).
// Status changes still go through PATCH so their SMS/loyalty side-effects stay
// centralised.
export const PUT: APIRoute = async ({ request, locals }) => {
  if (!["admin","super_admin"].includes(locals.role ?? "")) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  let body: Record<string, any>;
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 }); }

  const id = String(body.id ?? "").trim();
  if (!id) return new Response(JSON.stringify({ error: "Missing id" }), { status: 400 });

  const patch: Record<string, any> = {};
  if (typeof body.name  === "string") patch.name  = body.name.trim().slice(0, 120);
  if (typeof body.email === "string") patch.email = body.email.trim().toLowerCase().slice(0, 160);
  if (typeof body.phone === "string") patch.phone = body.phone.trim().replace(/[^\d+]/g, "") || null;
  if (typeof body.notes === "string") patch.notes = body.notes.trim().slice(0, 500) || null;

  if (typeof body.date === "string") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
      return new Response(JSON.stringify({ error: "Invalid date (YYYY-MM-DD)" }), { status: 400 });
    }
    patch.date = body.date;
  }
  if (typeof body.time === "string") {
    if (!/^\d{1,2}:\d{2}$/.test(body.time)) {
      return new Response(JSON.stringify({ error: "Invalid time (HH:MM)" }), { status: 400 });
    }
    patch.time = body.time.length === 4 ? "0" + body.time : body.time;
  }
  if (body.party_size != null) {
    const n = Number(body.party_size);
    if (!Number.isInteger(n) || n < 1 || n > 50) {
      return new Response(JSON.stringify({ error: "Invalid party size (1–50)" }), { status: 400 });
    }
    patch.party_size = n;
  }

  if (!Object.keys(patch).length) {
    return new Response(JSON.stringify({ error: "Nothing to update" }), { status: 400 });
  }

  const { error } = await supabaseAdmin.from("reservations").update(patch).eq("id", id);
  if (error) {
    console.error("[admin/reservations] PUT error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
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
