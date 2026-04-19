import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";
import { DEFAULT_WELCOME_SETTINGS } from "../../../lib/welcome-settings";

export const prerender = false;

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

function requireAdmin(locals: any) {
  return ["admin", "super_admin"].includes(locals.role ?? "");
}

// GET current settings (used by the admin page)
export const GET: APIRoute = async ({ locals }) => {
  if (!requireAdmin(locals)) return json({ error: "forbidden" }, 403);
  const { data } = await supabaseAdmin
    .from("welcome_settings")
    .select("require_email_otp, require_phone_otp, gift_label, updated_at")
    .eq("id", 1)
    .maybeSingle();
  return json({ ok: true, settings: data ?? DEFAULT_WELCOME_SETTINGS });
};

// PATCH — toggle either or both flags
export const PATCH: APIRoute = async ({ request, locals }) => {
  if (!requireAdmin(locals)) return json({ error: "forbidden" }, 403);

  let body: any = {};
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400); }

  const patch: Record<string, any> = {
    updated_at: new Date().toISOString(),
    updated_by: locals.user?.id ?? null,
  };
  if (typeof body.require_email_otp === "boolean") patch.require_email_otp = body.require_email_otp;
  if (typeof body.require_phone_otp === "boolean") patch.require_phone_otp = body.require_phone_otp;
  if (typeof body.gift_label        === "string") {
    const v = body.gift_label.trim().slice(0, 120);
    if (v.length < 2) return json({ error: "bad_gift_label", message: "Gift label must be at least 2 characters." }, 400);
    patch.gift_label = v;
  }

  if (Object.keys(patch).length === 2) return json({ error: "nothing_to_update" }, 400);

  // Upsert the single-row settings (id=1).
  const { data, error } = await supabaseAdmin
    .from("welcome_settings")
    .upsert({ id: 1, ...patch }, { onConflict: "id" })
    .select("require_email_otp, require_phone_otp, gift_label, updated_at")
    .maybeSingle();
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, settings: data });
};
