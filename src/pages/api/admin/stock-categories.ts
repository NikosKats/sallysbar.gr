import type { APIRoute } from "astro";
import { createSupabaseServerClient, supabaseAdmin } from "../../../lib/supabase";

async function requireAdmin(request: Request, cookies: any) {
  const supabase = createSupabaseServerClient(request, cookies);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: profile } = await supabaseAdmin
    .from("profiles").select("role").eq("id", user.id).single();
  return ["admin", "super_admin"].includes(profile?.role ?? "");
}

const json = (body: object, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const VALID_SCOPES = ["bar", "inventory"] as const;

export const GET: APIRoute = async ({ request, cookies, url }) => {
  if (!await requireAdmin(request, cookies)) return json({ error: "Forbidden" }, 403);
  const scope = url.searchParams.get("scope");
  let q = supabaseAdmin.from("stock_categories").select("*").order("name", { ascending: true });
  if (scope && (VALID_SCOPES as readonly string[]).includes(scope)) q = q.eq("scope", scope);
  const { data, error } = await q;
  if (error) return json({ error: error.message }, 500);
  return json({ categories: data ?? [] });
};

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!await requireAdmin(request, cookies)) return json({ error: "Forbidden" }, 403);
  const body = await request.json().catch(() => null);
  const nameEn = body?.name_en?.toString().trim() || null;
  const nameEl = body?.name_el?.toString().trim() || null;
  const name = body?.name?.toString().trim() || nameEn || nameEl;
  const scope = body?.scope;
  if (!name) return json({ error: "name required (provide name_en or name_el)" }, 400);
  if (!(VALID_SCOPES as readonly string[]).includes(scope)) return json({ error: "scope must be bar or inventory" }, 400);
  const { data, error } = await supabaseAdmin
    .from("stock_categories").insert({ name, name_en: nameEn, name_el: nameEl, scope }).select().single();
  if (error) {
    if (error.code === "23505") return json({ error: "Category already exists" }, 409);
    return json({ error: error.message }, 500);
  }
  return json({ category: data });
};

export const PUT: APIRoute = async ({ request, cookies }) => {
  if (!await requireAdmin(request, cookies)) return json({ error: "Forbidden" }, 403);
  const body = await request.json().catch(() => null);
  if (!body?.id) return json({ error: "id required" }, 400);
  const nameEn = body?.name_en?.toString().trim() || null;
  const nameEl = body?.name_el?.toString().trim() || null;
  const explicitName = body?.name?.toString().trim();
  const newName = explicitName || nameEn || nameEl;
  if (!newName) return json({ error: "name cannot be empty" }, 400);

  const { data: existing, error: fetchErr } = await supabaseAdmin
    .from("stock_categories").select("*").eq("id", body.id).single();
  if (fetchErr || !existing) return json({ error: "Category not found" }, 404);

  const update: Record<string, any> = {
    name: newName,
    updated_at: new Date().toISOString(),
  };
  if (body.name_en !== undefined) update.name_en = nameEn;
  if (body.name_el !== undefined) update.name_el = nameEl;

  const { data, error } = await supabaseAdmin
    .from("stock_categories")
    .update(update)
    .eq("id", body.id)
    .select().single();
  if (error) {
    if (error.code === "23505") return json({ error: "Category already exists" }, 409);
    return json({ error: error.message }, 500);
  }

  // Cascade rename to stock_items.subcategory entries that match the old name within the same scope.
  if (existing.name !== newName) {
    await supabaseAdmin
      .from("stock_items")
      .update({ subcategory: newName, updated_at: new Date().toISOString() })
      .eq("category", existing.scope)
      .eq("subcategory", existing.name);
  }

  return json({ category: data });
};

export const DELETE: APIRoute = async ({ request, cookies }) => {
  if (!await requireAdmin(request, cookies)) return json({ error: "Forbidden" }, 403);
  const body = await request.json().catch(() => null);
  if (!body?.id) return json({ error: "id required" }, 400);

  const { data: existing, error: fetchErr } = await supabaseAdmin
    .from("stock_categories").select("*").eq("id", body.id).single();
  if (fetchErr || !existing) return json({ error: "Category not found" }, 404);

  // Null out subcategory on items that referenced this category (within scope) so users can recategorise.
  await supabaseAdmin
    .from("stock_items")
    .update({ subcategory: null, updated_at: new Date().toISOString() })
    .eq("category", existing.scope)
    .eq("subcategory", existing.name);

  const { error } = await supabaseAdmin.from("stock_categories").delete().eq("id", body.id);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
};
