import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

export const POST: APIRoute = async ({ locals, request }) => {
  if (!["admin","super_admin"].includes(locals.role ?? "")) return json({ error: "forbidden" }, 403);
  let body: any;
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400); }
  const update: any = { id: 1, updated_at: new Date().toISOString() };
  if ("require_confirmation" in body) update.require_confirmation = !!body.require_confirmation;
  if ("approval_window_min" in body) {
    const n = Number(body.approval_window_min);
    if (Number.isFinite(n) && n >= 1 && n <= 30) update.approval_window_min = Math.round(n);
  }
  const { error } = await supabaseAdmin.from("quest_settings").upsert(update, { onConflict: "id" });
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
};
