import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

function isAdmin(locals: App.Locals) { return locals.role === "admin"; }

export const POST: APIRoute = async ({ request, locals }) => {
  if (!isAdmin(locals)) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  let b: any;
  try { b = await request.json(); } catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 }); }

  const row: any = {
    name_en: String(b.name_en ?? "").trim(),
    name_el: String(b.name_el ?? "").trim(),
    description_en: String(b.description_en ?? ""),
    description_el: String(b.description_el ?? ""),
    cost: Number(b.cost),
    active: b.active !== false,
    sort_order: Number(b.sort_order ?? 0),
  };
  if (!row.name_en || !row.name_el) return new Response(JSON.stringify({ error: "name required" }), { status: 400 });
  if (!Number.isInteger(row.cost) || row.cost <= 0) return new Response(JSON.stringify({ error: "cost must be > 0" }), { status: 400 });

  if (b.id) {
    const { error } = await supabaseAdmin.from("loyalty_rewards").update(row).eq("id", b.id);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ ok: true, id: b.id }));
  } else {
    const { data, error } = await supabaseAdmin.from("loyalty_rewards").insert(row).select("id").single();
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    return new Response(JSON.stringify({ ok: true, id: data.id }));
  }
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  if (!isAdmin(locals)) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  const { id } = await request.json().catch(() => ({}));
  if (!id) return new Response(JSON.stringify({ error: "id required" }), { status: 400 });
  const { error } = await supabaseAdmin.from("loyalty_rewards").delete().eq("id", id);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify({ ok: true }));
};
