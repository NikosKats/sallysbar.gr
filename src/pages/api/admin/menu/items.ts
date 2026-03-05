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
  if (!body?.name_en || !body?.slug || !body?.category_id) {
    return json({ error: "name_en, slug, and category_id are required" }, 400);
  }

  const { data, error } = await supabaseAdmin
    .from("menu_items")
    .insert({
      category_id: Number(body.category_id),
      slug: body.slug,
      name_en: body.name_en,
      name_el: body.name_el || body.name_en,
      description_en: body.description_en || "",
      description_el: body.description_el || "",
      price_cents: Math.round(Number(body.price_cents)),
      currency: "EUR",
      sort: body.sort ?? 0,
      is_visible: body.is_visible ?? true,
      tags: body.tags ?? [],
    })
    .select()
    .single();

  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, item: data });
};

export const PUT: APIRoute = async ({ request, cookies }) => {
  if (!await requireAdmin(request, cookies)) return json({ error: "Forbidden" }, 403);

  const body = await request.json().catch(() => null);
  if (!body?.id) return json({ error: "id required" }, 400);

  const { id, ...fields } = body;
  const allowed = [
    "category_id", "slug", "name_en", "name_el",
    "description_en", "description_el", "price_cents",
    "sort", "is_visible", "tags",
  ];
  const update = Object.fromEntries(Object.entries(fields).filter(([k]) => allowed.includes(k)));
  if (update.price_cents !== undefined) update.price_cents = Math.round(Number(update.price_cents));
  if (update.category_id !== undefined) update.category_id = Number(update.category_id);

  const { data, error } = await supabaseAdmin
    .from("menu_items")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, item: data });
};

export const DELETE: APIRoute = async ({ request, cookies }) => {
  if (!await requireAdmin(request, cookies)) return json({ error: "Forbidden" }, 403);

  const body = await request.json().catch(() => null);
  if (!body?.id) return json({ error: "id required" }, 400);

  const { error } = await supabaseAdmin
    .from("menu_items")
    .delete()
    .eq("id", body.id);

  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
};
