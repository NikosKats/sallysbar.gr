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

  const key = String(body?.key ?? "");
  if (!TODOS.some(t => t.key === key)) return json({ error: "unknown_task" }, 400);

  const update: any = { task_key: key, updated_at: new Date().toISOString() };
  // Null-to-reset: pass "" (or null) to clear an override.
  function pick(field: string, raw: any, max = 500) {
    if (raw === undefined) return;
    if (raw === null || raw === "") { update[field] = null; return; }
    if (typeof raw !== "string") return;
    update[field] = raw.trim().slice(0, max);
  }
  pick("custom_title_en", body.title_en, 200);
  pick("custom_title_el", body.title_el, 200);
  pick("custom_desc_en",  body.desc_en,  500);
  pick("custom_desc_el",  body.desc_el,  500);
  if (body.points !== undefined) {
    const n = Number(body.points);
    update.custom_points = Number.isFinite(n) && n >= 0 && n <= 10000 ? Math.round(n) : null;
  }

  const { error } = await supabaseAdmin.from("task_settings").upsert(update, { onConflict: "task_key" });
  if (error) return json({ error: error.message }, 500);
  clearDisabledTodoCache();
  return json({ ok: true });
};
