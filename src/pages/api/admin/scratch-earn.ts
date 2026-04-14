import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

export const POST: APIRoute = async ({ locals, request }) => {
  if (!["admin", "super_admin"].includes(locals.role ?? "")) return json({ error: "forbidden" }, 403);
  let body: any;
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400); }

  const rows = Array.isArray(body?.rows) ? body.rows : [];
  const clean = rows
    .filter((r: any) => r && typeof r.text_en === "string" && typeof r.text_el === "string")
    .map((r: any, i: number) => ({
      emoji:      (typeof r.emoji === "string" ? r.emoji : "🎁").slice(0, 8) || "🎁",
      text_en:    String(r.text_en).slice(0, 200),
      text_el:    String(r.text_el).slice(0, 200),
      sort_order: i + 1,
      active:     r.active !== false,
      updated_at: new Date().toISOString(),
    }));

  // Replace entire list atomically
  const { error: delErr } = await supabaseAdmin.from("scratch_earn_items").delete().gt("sort_order", -1);
  if (delErr) return json({ error: delErr.message }, 500);
  if (clean.length) {
    const { error: insErr } = await supabaseAdmin.from("scratch_earn_items").insert(clean);
    if (insErr) return json({ error: insErr.message }, 500);
  }
  return json({ ok: true, count: clean.length });
};
