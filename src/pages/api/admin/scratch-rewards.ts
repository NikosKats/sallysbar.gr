import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";
import { clearScratchPoolCache } from "../../../lib/scratch";

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

const TYPES = new Set(["points", "free_shot", "free_drink", "discount", "custom"]);

export const POST: APIRoute = async ({ locals, request }) => {
  if (!["admin", "super_admin"].includes(locals.role ?? "")) return json({ error: "forbidden" }, 403);
  let body: any;
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400); }

  const action = String(body?.action ?? "save");

  // One-shot save of all rows (create/update/delete diff handled by action "save")
  if (action === "save") {
    const rows = Array.isArray(body?.rows) ? body.rows : [];
    if (!rows.length) return json({ error: "no_rows" }, 400);

    // Replace entire pool atomically
    const { error: delErr } = await supabaseAdmin.from("scratch_rewards").delete().gt("sort_order", -1);
    if (delErr) return json({ error: delErr.message }, 500);

    const clean = rows
      .filter((r: any) => r && TYPES.has(r.type) && typeof r.label_en === "string" && typeof r.label_el === "string")
      .map((r: any, i: number) => ({
        type: r.type,
        value: Number.isFinite(Number(r.value)) ? Math.round(Number(r.value)) : 0,
        label_en: String(r.label_en).slice(0, 100),
        label_el: String(r.label_el).slice(0, 100),
        weight: Math.max(0, Math.round(Number(r.weight) || 0)),
        active: r.active !== false,
        sort_order: i + 1,
        updated_at: new Date().toISOString(),
      }));

    if (!clean.length) return json({ error: "no_valid_rows" }, 400);
    const { error: insErr } = await supabaseAdmin.from("scratch_rewards").insert(clean);
    if (insErr) return json({ error: insErr.message }, 500);

    clearScratchPoolCache();
    return json({ ok: true, count: clean.length });
  }

  return json({ error: "unknown_action" }, 400);
};
