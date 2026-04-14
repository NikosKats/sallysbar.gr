import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

export const POST: APIRoute = async ({ request, locals }) => {
  if (!["admin","super_admin"].includes(locals.role ?? "")) return json({ error: "forbidden" }, 403);

  let body: any;
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400); }

  const payload: Record<string, unknown> = {
    auto_on_order:         Boolean(body.auto_on_order),
    order_min_cents:       Math.max(0, Math.min(100000, Number(body.order_min_cents ?? 500) | 0)),
    cards_per_order:       Math.max(1, Math.min(10, Number(body.cards_per_order ?? 1) | 0)),
    auto_on_rsvp:          Boolean(body.auto_on_rsvp),
    auto_on_checkin:       Boolean(body.auto_on_checkin),
    auto_on_referral:      Boolean(body.auto_on_referral),
    auto_on_signup:        Boolean(body.auto_on_signup),
    daily_drop_enabled:    Boolean(body.daily_drop_enabled),
    daily_drop_hour:       Math.max(0, Math.min(23, Number(body.daily_drop_hour ?? 21) | 0)),
    birthday_enabled:      Boolean(body.birthday_enabled),
    default_expires_hours: body.default_expires_hours === "" || body.default_expires_hours == null
      ? null
      : Math.max(0, Math.min(8760, Number(body.default_expires_hours) | 0)),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseAdmin.from("scratch_settings").update(payload).eq("id", 1);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
};
