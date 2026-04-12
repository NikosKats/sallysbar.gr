import type { APIRoute } from "astro";
import { createSupabaseServerClient, supabaseAdmin } from "../../../../lib/supabase";

async function requireAdmin(request: Request, cookies: any) {
  const supabase = createSupabaseServerClient(request, cookies);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: profile } = await supabaseAdmin
    .from("profiles").select("role").eq("id", user.id).single();
  return profile?.role === "admin";
}

function json(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json" },
  });
}

function normalizeTime(v: any): string | null {
  if (!v || typeof v !== "string") return null;
  const m = v.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return null;
  const h = String(Math.min(23, parseInt(m[1], 10))).padStart(2, "0");
  const mm = String(Math.min(59, parseInt(m[2], 10))).padStart(2, "0");
  return `${h}:${mm}:00`;
}

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!await requireAdmin(request, cookies)) return json({ error: "Forbidden" }, 403);
  const body = await request.json().catch(() => null);
  if (!body?.name_en || !body?.slug) return json({ error: "name_en and slug are required" }, 400);

  const { data, error } = await supabaseAdmin
    .from("menus")
    .insert({
      slug: body.slug,
      name_en: body.name_en,
      name_el: body.name_el || body.name_en,
      is_active: body.is_active ?? true,
      start_time: normalizeTime(body.start_time),
      end_time:   normalizeTime(body.end_time),
      sort: body.sort ?? 0,
    })
    .select().single();
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, menu: data });
};

export const PUT: APIRoute = async ({ request, cookies }) => {
  if (!await requireAdmin(request, cookies)) return json({ error: "Forbidden" }, 403);
  const body = await request.json().catch(() => null);
  if (!body?.id) return json({ error: "id required" }, 400);

  const update: any = {};
  if (body.slug       !== undefined) update.slug       = body.slug;
  if (body.name_en    !== undefined) update.name_en    = body.name_en;
  if (body.name_el    !== undefined) update.name_el    = body.name_el;
  if (body.is_active  !== undefined) update.is_active  = !!body.is_active;
  if (body.sort       !== undefined) update.sort       = body.sort;
  if ("start_time" in body) update.start_time = normalizeTime(body.start_time);
  if ("end_time"   in body) update.end_time   = normalizeTime(body.end_time);

  const { data, error } = await supabaseAdmin
    .from("menus").update(update).eq("id", body.id).select().single();
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, menu: data });
};

export const DELETE: APIRoute = async ({ request, cookies }) => {
  if (!await requireAdmin(request, cookies)) return json({ error: "Forbidden" }, 403);
  const body = await request.json().catch(() => null);
  if (!body?.id) return json({ error: "id required" }, 400);

  const { count } = await supabaseAdmin.from("menus").select("id", { count: "exact", head: true });
  if ((count ?? 0) <= 1) return json({ error: "Cannot delete the last menu" }, 400);

  const { error } = await supabaseAdmin.from("menus").delete().eq("id", body.id);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
};
