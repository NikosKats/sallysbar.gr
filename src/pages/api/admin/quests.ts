import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

export const POST: APIRoute = async ({ request, locals }) => {
  if (locals.role !== "admin") return json({ error: "forbidden" }, 403);

  let body: any;
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400); }

  const row: Record<string, unknown> = {
    title_en: String(body.title_en ?? "").trim(),
    title_el: String(body.title_el ?? "").trim(),
    description_en: body.description_en?.toString() || null,
    description_el: body.description_el?.toString() || null,
    reward_points: Math.max(0, Math.min(5000, Number(body.reward_points ?? 50) | 0)),
    reward_label_en: body.reward_label_en?.toString().trim() || null,
    reward_label_el: body.reward_label_el?.toString().trim() || null,
    cta_url: body.cta_url?.toString().trim() || null,
    active_date: body.active_date ? String(body.active_date) : new Date().toISOString().slice(0, 10),
    active_from: body.active_from || null,
    active_to:   body.active_to || null,
    push_at:     body.push_at ? new Date(body.push_at).toISOString() : null,
    active: Boolean(body.active ?? true),
    updated_at: new Date().toISOString(),
  };

  if (!row.title_en || !row.title_el) return json({ error: "title_required" }, 400);

  if (body.id) {
    const { error } = await supabaseAdmin.from("quests").update(row).eq("id", body.id);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, id: body.id });
  } else {
    const { data, error } = await supabaseAdmin.from("quests").insert(row).select("id").single();
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, id: data?.id });
  }
};

export const DELETE: APIRoute = async ({ url, locals }) => {
  if (locals.role !== "admin") return json({ error: "forbidden" }, 403);
  const id = url.searchParams.get("id");
  if (!id) return json({ error: "missing_id" }, 400);
  const { error } = await supabaseAdmin.from("quests").delete().eq("id", id);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
};
