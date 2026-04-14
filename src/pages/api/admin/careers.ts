import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

export const POST: APIRoute = async ({ request, locals }) => {
  if (!["admin","super_admin"].includes(locals.role ?? "")) return json({ error: "forbidden" }, 403);

  let body: any;
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400); }

  const row: Record<string, unknown> = {
    title_en: String(body.title_en ?? "").trim(),
    title_el: String(body.title_el ?? "").trim(),
    department: body.department?.toString().trim() || null,
    employment_type: body.employment_type?.toString().trim() || null,
    location: body.location?.toString().trim() || "Skala, Kefalonia",
    description_en: body.description_en?.toString() || null,
    description_el: body.description_el?.toString() || null,
    requirements_en: body.requirements_en?.toString() || null,
    requirements_el: body.requirements_el?.toString() || null,
    salary_range: body.salary_range?.toString().trim() || null,
    apply_email: body.apply_email?.toString().trim() || null,
    active: Boolean(body.active ?? true),
    sort_order: Number(body.sort_order ?? 0) | 0,
    updated_at: new Date().toISOString(),
  };

  if (!row.title_en || !row.title_el) return json({ error: "title_required" }, 400);

  if (body.id) {
    const { error } = await supabaseAdmin.from("job_listings").update(row).eq("id", body.id);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, id: body.id });
  } else {
    const { data, error } = await supabaseAdmin.from("job_listings").insert(row).select("id").single();
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, id: data?.id });
  }
};

export const DELETE: APIRoute = async ({ url, locals }) => {
  if (!["admin","super_admin"].includes(locals.role ?? "")) return json({ error: "forbidden" }, 403);
  const id = url.searchParams.get("id");
  if (!id) return json({ error: "missing_id" }, 400);
  const { error } = await supabaseAdmin.from("job_listings").delete().eq("id", id);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
};
