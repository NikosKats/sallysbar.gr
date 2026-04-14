import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return json({ error: "auth_required" }, 401);

  let body: any;
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400); }
  const staff_id = body.staff_id ? String(body.staff_id) : "";
  if (!/^[0-9a-f-]{36}$/i.test(staff_id)) return json({ error: "bad_staff_id" }, 400);
  if (staff_id === locals.user.id) return json({ error: "self_ref" }, 400);

  // Only set once — prevents gaming by spamming the claim endpoint.
  const { data: current } = await supabaseAdmin
    .from("profiles").select("referred_by_staff").eq("id", locals.user.id).maybeSingle();
  if (current?.referred_by_staff) return json({ error: "already_set" }, 409);

  // Verify the staff user exists and actually has staff/admin role.
  const { data: staffProfile } = await supabaseAdmin
    .from("profiles").select("id, role").eq("id", staff_id).maybeSingle();
  if (!staffProfile || !["employee", "admin", "super_admin"].includes(staffProfile.role)) {
    return json({ error: "not_staff" }, 400);
  }

  const { error } = await supabaseAdmin.from("profiles")
    .update({ referred_by_staff: staff_id }).eq("id", locals.user.id);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
};
