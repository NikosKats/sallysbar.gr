import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

export const prerender = false;

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

// DELETE /api/admin/welcome-helens
//   body: { id: <welcome_drinks.id>, also_delete_user?: boolean }
// Deletes the welcome_drinks row. If also_delete_user=true and the row is
// linked to an auth.users record, deletes that user too (cascades to profile).
export const DELETE: APIRoute = async ({ request, locals }) => {
  if (!["admin", "super_admin"].includes(locals.role ?? "")) {
    return json({ error: "Forbidden" }, 403);
  }

  let body: any = {};
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400); }

  const id = String(body?.id ?? "").trim();
  const alsoUser = body?.also_delete_user === true;
  if (!id) return json({ error: "missing_id" }, 400);

  const { data: row, error: fetchErr } = await supabaseAdmin
    .from("welcome_drinks")
    .select("id, user_id, full_name, email, source")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) return json({ error: fetchErr.message }, 500);
  if (!row)     return json({ error: "not_found" }, 404);

  const { error: delErr } = await supabaseAdmin.from("welcome_drinks").delete().eq("id", id);
  if (delErr) return json({ error: delErr.message }, 500);

  let user_deleted = false;
  if (alsoUser && row.user_id) {
    try {
      const { error } = await supabaseAdmin.auth.admin.deleteUser(row.user_id);
      if (!error) user_deleted = true;
      else console.warn("[admin/welcome-helens] auth delete warn:", error.message);
    } catch (e: any) {
      console.warn("[admin/welcome-helens] auth delete error:", e?.message);
    }
  }

  return json({ ok: true, deleted: row, user_deleted });
};
