import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

// Customer asks for a QR → server generates short-lived token attached to the spin row.
export const POST: APIRoute = async ({ locals, request }) => {
  if (!locals.user) return json({ error: "auth_required" }, 401);
  let body: any;
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400); }
  const id = String(body?.spin_id ?? "");
  if (!id) return json({ error: "missing_id" }, 400);

  const { data: spin } = await supabaseAdmin
    .from("wheel_spins")
    .select("id, user_id, reward_type, reward_label, claimed_at, rejected_at, claim_token")
    .eq("id", id).maybeSingle();
  if (!spin || spin.user_id !== locals.user.id) return json({ error: "not_found" }, 404);
  if (spin.claimed_at)  return json({ error: "already_claimed" }, 409);
  if (spin.rejected_at) return json({ error: "rejected" }, 409);
  if (spin.reward_type === "points") return json({ error: "auto_claimed" }, 400);

  const token = crypto.randomUUID().replace(/-/g, "");
  await supabaseAdmin.from("wheel_spins").update({ claim_token: token }).eq("id", spin.id);

  return json({ ok: true, token, url: `/staff/wheel-claim?token=${token}`, reward: spin.reward_label });
};

// Staff approves (tap or scan) / rejects.
export const PATCH: APIRoute = async ({ locals, request }) => {
  if (!locals.user) return json({ error: "auth_required" }, 401);
  const { data: me } = await supabaseAdmin.from("profiles").select("role").eq("id", locals.user.id).maybeSingle();
  if (!me || !["employee", "admin", "super_admin"].includes(me.role)) return json({ error: "forbidden" }, 403);

  let body: any;
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400); }
  const action = String(body?.action ?? "");
  const reason = body?.reason ? String(body.reason).slice(0, 200) : null;
  if (!["approve", "reject"].includes(action)) return json({ error: "bad_action" }, 400);

  const id = body?.spin_id ? String(body.spin_id) : null;
  const token = body?.token ? String(body.token).slice(0, 64) : null;
  if (!id && !token) return json({ error: "missing_id_or_token" }, 400);

  let q = supabaseAdmin.from("wheel_spins")
    .select("id, user_id, reward_type, reward_label, claimed_at, rejected_at, claim_token");
  if (id)    q = q.eq("id", id);
  if (token) q = q.eq("claim_token", token);
  const { data: spin } = await q.maybeSingle();
  if (!spin) return json({ error: "not_found" }, 404);
  if (spin.claimed_at)  return json({ error: "already_claimed" }, 409);
  if (spin.rejected_at) return json({ error: "already_rejected" }, 409);

  const upd: any = action === "approve"
    ? { claimed_at: new Date().toISOString(), claimed_by: locals.user.id }
    : { rejected_at: new Date().toISOString(), rejected_by: locals.user.id, reject_reason: reason };

  await supabaseAdmin.from("wheel_spins").update(upd).eq("id", spin.id);
  return json({ ok: true, action, reward: spin.reward_label });
};
