import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";
import { TODOS, clearDisabledTodoCache } from "../../../lib/todos";

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

export const POST: APIRoute = async ({ locals, request }) => {
  if (!["admin","super_admin"].includes(locals.role ?? "")) return json({ error: "forbidden" }, 403);
  let body: any;
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400); }
  const enabled = !!body?.enabled;

  const rows = TODOS.map(t => ({ task_key: t.key, enabled, updated_at: new Date().toISOString() }));
  const { error } = await supabaseAdmin.from("task_settings").upsert(rows, { onConflict: "task_key" });
  if (error) return json({ error: error.message }, 500);
  clearDisabledTodoCache();
  return json({ ok: true, enabled, count: rows.length });
};
