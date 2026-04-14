import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

export const POST: APIRoute = async ({ request, locals }) => {
  if (!["admin","super_admin"].includes(locals.role ?? "")) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }
  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 }); }

  const points_per_euro     = Number(body.points_per_euro);
  const min_order_cents     = Number(body.min_order_cents ?? 0);
  const birthday_multiplier = Number(body.birthday_multiplier ?? 2);
  const referral_points     = Number(body.referral_points ?? 0);
  const event_rsvp_points   = Number(body.event_rsvp_points ?? 0);
  const double_point_dows   = Array.isArray(body.double_point_dows)
    ? (body.double_point_dows as unknown[]).map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6)
    : [];

  if (!Number.isFinite(points_per_euro) || points_per_euro < 0 || points_per_euro > 100) {
    return new Response(JSON.stringify({ error: "points_per_euro must be 0–100" }), { status: 400 });
  }
  if (!Number.isInteger(min_order_cents) || min_order_cents < 0) {
    return new Response(JSON.stringify({ error: "min_order_cents must be a non-negative integer" }), { status: 400 });
  }
  if (!Number.isFinite(birthday_multiplier) || birthday_multiplier < 1 || birthday_multiplier > 10) {
    return new Response(JSON.stringify({ error: "birthday_multiplier must be 1–10" }), { status: 400 });
  }
  if (!Number.isInteger(referral_points) || referral_points < 0 || referral_points > 100000) {
    return new Response(JSON.stringify({ error: "referral_points invalid" }), { status: 400 });
  }
  if (!Number.isInteger(event_rsvp_points) || event_rsvp_points < 0 || event_rsvp_points > 100000) {
    return new Response(JSON.stringify({ error: "event_rsvp_points invalid" }), { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("loyalty_settings")
    .update({
      points_per_euro,
      min_order_cents,
      birthday_multiplier,
      referral_points,
      event_rsvp_points,
      double_point_dows,
      updated_at: new Date().toISOString(),
      updated_by: locals.user?.id ?? null,
    })
    .eq("id", 1);

  if (error) {
    console.error("[loyalty-settings] update error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
  return new Response(JSON.stringify({ ok: true }));
};
