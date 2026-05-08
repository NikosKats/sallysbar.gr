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

const VALID_CATEGORIES = ["bar", "inventory"] as const;
type Category = typeof VALID_CATEGORIES[number];

const NUMERIC_FIELDS = ["current_qty", "reorder_threshold", "default_order_qty", "unit_cost"] as const;

export const GET: APIRoute = async ({ request, cookies, url }) => {
  if (!await requireAdmin(request, cookies)) return json({ error: "Forbidden" }, 403);
  const category = url.searchParams.get("category");
  let q = supabaseAdmin
    .from("stock_items")
    .select("*, supplier:suppliers(id, name, email, phone, contact_name)")
    .order("name", { ascending: true });
  if (category && (VALID_CATEGORIES as readonly string[]).includes(category)) {
    q = q.eq("category", category);
  }
  const { data, error } = await q;
  if (error) return json({ error: error.message }, 500);
  return json({ items: data ?? [] });
};

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!await requireAdmin(request, cookies)) return json({ error: "Forbidden" }, 403);
  const body = await request.json().catch(() => null);
  const nameEn = body?.name_en?.toString().trim() || null;
  const nameEl = body?.name_el?.toString().trim() || null;
  const name = body?.name?.toString().trim() || nameEn || nameEl;
  if (!name) return json({ error: "name required (provide name_en or name_el)" }, 400);
  if (!(VALID_CATEGORIES as readonly string[]).includes(body.category)) {
    return json({ error: "category must be bar or inventory" }, 400);
  }
  const insert: Record<string, any> = {
    category: body.category as Category,
    name,
    name_en: nameEn,
    name_el: nameEl,
    unit: body.unit?.trim() || "btl",
    notes: body.notes?.trim() || null,
    supplier_id: body.supplier_id || null,
    subcategory: body.subcategory?.trim() || null,
  };
  for (const k of NUMERIC_FIELDS) {
    if (body[k] !== undefined && body[k] !== "") insert[k] = Number(body[k]) || 0;
  }
  const { data, error } = await supabaseAdmin
    .from("stock_items").insert(insert)
    .select("*, supplier:suppliers(id, name, email, phone, contact_name)").single();
  if (error) return json({ error: error.message }, 500);
  return json({ item: data });
};

export const PUT: APIRoute = async ({ request, cookies }) => {
  if (!await requireAdmin(request, cookies)) return json({ error: "Forbidden" }, 403);
  const body = await request.json().catch(() => null);
  if (!body?.id) return json({ error: "id required" }, 400);
  const update: Record<string, any> = { updated_at: new Date().toISOString() };
  if (body.name_en !== undefined) update.name_en = body.name_en?.toString().trim() || null;
  if (body.name_el !== undefined) update.name_el = body.name_el?.toString().trim() || null;
  if (body.name !== undefined) {
    const trimmed = String(body.name).trim();
    if (!trimmed && !update.name_en && !update.name_el) return json({ error: "name cannot be empty" }, 400);
    update.name = trimmed || update.name_en || update.name_el;
  } else if (body.name_en !== undefined || body.name_el !== undefined) {
    // Keep the canonical name in sync with whichever of EN/EL is the most-likely primary.
    update.name = update.name_en || update.name_el || undefined;
    if (update.name === undefined) delete update.name;
  }
  if (body.unit !== undefined) update.unit = body.unit?.trim() || "btl";
  if (body.notes !== undefined) update.notes = body.notes?.trim() || null;
  if (body.supplier_id !== undefined) update.supplier_id = body.supplier_id || null;
  if (body.subcategory !== undefined) update.subcategory = body.subcategory?.trim() || null;
  for (const k of NUMERIC_FIELDS) {
    if (body[k] !== undefined && body[k] !== "") update[k] = Number(body[k]) || 0;
  }
  const { data, error } = await supabaseAdmin
    .from("stock_items").update(update).eq("id", body.id)
    .select("*, supplier:suppliers(id, name, email, phone, contact_name)").single();
  if (error) return json({ error: error.message }, 500);
  return json({ item: data });
};

export const DELETE: APIRoute = async ({ request, cookies }) => {
  if (!await requireAdmin(request, cookies)) return json({ error: "Forbidden" }, 403);
  const body = await request.json().catch(() => null);
  if (!body?.id) return json({ error: "id required" }, 400);
  const { error } = await supabaseAdmin.from("stock_items").delete().eq("id", body.id);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
};
