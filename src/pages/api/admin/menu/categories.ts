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
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!await requireAdmin(request, cookies)) return json({ error: "Forbidden" }, 403);

  const body = await request.json().catch(() => null);
  if (!body?.title_en || !body?.slug) return json({ error: "title_en and slug are required" }, 400);

  const { data, error } = await supabaseAdmin
    .from("menu_categories")
    .insert({
      title_en: body.title_en,
      title_el: body.title_el || body.title_en,
      slug: body.slug,
      sort: body.sort ?? 0,
      is_visible: body.is_visible ?? true,
    })
    .select()
    .single();

  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, category: data });
};

export const PUT: APIRoute = async ({ request, cookies }) => {
  if (!await requireAdmin(request, cookies)) return json({ error: "Forbidden" }, 403);

  const body = await request.json().catch(() => null);
  if (!body?.id) return json({ error: "id required" }, 400);

  const { id, ...fields } = body;
  const allowed = ["title_en", "title_el", "slug", "sort", "is_visible"];
  const update = Object.fromEntries(Object.entries(fields).filter(([k]) => allowed.includes(k)));

  const { data, error } = await supabaseAdmin
    .from("menu_categories")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, category: data });
};

export const DELETE: APIRoute = async ({ request, cookies }) => {
  if (!await requireAdmin(request, cookies)) return json({ error: "Forbidden" }, 403);

  const body = await request.json().catch(() => null);
  if (!body?.id) return json({ error: "id required" }, 400);

  const { error } = await supabaseAdmin
    .from("menu_categories")
    .delete()
    .eq("id", body.id);

  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
};
