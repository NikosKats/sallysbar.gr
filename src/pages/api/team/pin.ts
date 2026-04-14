import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

// Pin/unpin a message. Admin or super_admin only.
export const POST: APIRoute = async ({ locals, request }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);
  const { data: me } = await supabaseAdmin.from("profiles").select("role").eq("id", locals.user.id).maybeSingle();
  if (!me || !["admin", "super_admin"].includes(me.role)) return json({ error: "Forbidden" }, 403);

  let body: any;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const id = String(body?.id ?? "");
  if (!id) return json({ error: "Missing id" }, 400);
  const pin = !!body?.pin;

  const { error } = await supabaseAdmin
    .from("team_messages")
    .update(pin
      ? { pinned_at: new Date().toISOString(), pinned_by: locals.user.id }
      : { pinned_at: null, pinned_by: null })
    .eq("id", id);
  if (error) return json({ error: "Update failed" }, 500);
  return json({ ok: true, pinned: pin });
};
