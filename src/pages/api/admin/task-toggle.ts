import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";
import { clearDisabledTodoCache } from "../../../lib/todos";

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

export const POST: APIRoute = async ({ locals, request }) => {
  if (!["admin","super_admin"].includes(locals.role ?? "")) return json({ error: "Forbidden" }, 403);
  let body: any;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const key = String(body?.key ?? "");
  if (!key) return json({ error: "key required" }, 400);
  const enabled = !!body?.enabled;
  const { error } = await supabaseAdmin.from("task_settings").upsert(
    { task_key: key, enabled, updated_at: new Date().toISOString() },
    { onConflict: "task_key" },
  );
  if (error) return json({ error: error.message }, 500);
  clearDisabledTodoCache();
  return json({ ok: true });
};
