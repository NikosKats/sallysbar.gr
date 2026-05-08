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

// POST /api/admin/stock-list-items  body: { list_id, stock_item_id?, name, unit?, qty?, unit_cost?, subcategory?, supplier_name? }
export const POST: APIRoute = async ({ request, cookies }) => {
  if (!await requireAdmin(request, cookies)) return json({ error: "Forbidden" }, 403);
  const body = await request.json().catch(() => null);
  if (!body?.list_id) return json({ error: "list_id required" }, 400);
  const nameEn = body?.name_en?.toString().trim() || null;
  const nameEl = body?.name_el?.toString().trim() || null;
  const name = body?.name?.toString().trim() || nameEn || nameEl;
  if (!name) return json({ error: "name required" }, 400);

  // Position = current max + 1
  const { data: existing } = await supabaseAdmin
    .from("stock_list_items").select("position").eq("list_id", body.list_id)
    .order("position", { ascending: false }).limit(1);
  const position = ((existing?.[0]?.position ?? -1) as number) + 1;

  const insert = {
    list_id: body.list_id,
    stock_item_id: body.stock_item_id ?? null,
    name,
    name_en: nameEn,
    name_el: nameEl,
    unit: body.unit?.toString().trim() || null,
    subcategory: body.subcategory?.toString().trim() || null,
    unit_cost: Number(body.unit_cost ?? 0) || 0,
    qty: Number(body.qty ?? 0) || 0,
    inventory_qty: Number(body.inventory_qty ?? 0) || 0,
    supplier_name: body.supplier_name?.toString().trim() || null,
    position,
  };
  const { data, error } = await supabaseAdmin
    .from("stock_list_items").insert(insert).select().single();
  if (error) return json({ error: error.message }, 500);
  await supabaseAdmin.from("stock_lists").update({ updated_at: new Date().toISOString() }).eq("id", body.list_id);
  return json({ item: data });
};

// PUT /api/admin/stock-list-items  body: { id, qty?, name?, unit?, unit_cost?, subcategory?, supplier_name? }
export const PUT: APIRoute = async ({ request, cookies }) => {
  if (!await requireAdmin(request, cookies)) return json({ error: "Forbidden" }, 403);
  const body = await request.json().catch(() => null);
  if (!body?.id) return json({ error: "id required" }, 400);
  const update: Record<string, any> = { updated_at: new Date().toISOString() };
  if (body.qty !== undefined)           update.qty           = Math.max(0, Number(body.qty) || 0);
  if (body.inventory_qty !== undefined) update.inventory_qty = Math.max(0, Number(body.inventory_qty) || 0);
  if (body.name_en !== undefined) update.name_en = body.name_en?.toString().trim() || null;
  if (body.name_el !== undefined) update.name_el = body.name_el?.toString().trim() || null;
  if (body.name !== undefined) {
    const n = String(body.name).trim();
    if (!n && !update.name_en && !update.name_el) return json({ error: "name cannot be empty" }, 400);
    update.name = n || update.name_en || update.name_el;
  } else if (body.name_en !== undefined || body.name_el !== undefined) {
    update.name = update.name_en || update.name_el || undefined;
    if (update.name === undefined) delete update.name;
  }
  if (body.unit !== undefined)         update.unit          = body.unit?.toString().trim() || null;
  if (body.subcategory !== undefined)  update.subcategory   = body.subcategory?.toString().trim() || null;
  if (body.unit_cost !== undefined)    update.unit_cost     = Number(body.unit_cost) || 0;
  if (body.supplier_name !== undefined) update.supplier_name = body.supplier_name?.toString().trim() || null;

  const { data, error } = await supabaseAdmin
    .from("stock_list_items").update(update).eq("id", body.id).select().single();
  if (error) return json({ error: error.message }, 500);
  if (data?.list_id) {
    await supabaseAdmin.from("stock_lists").update({ updated_at: new Date().toISOString() }).eq("id", data.list_id);
  }
  return json({ item: data });
};

export const DELETE: APIRoute = async ({ request, cookies }) => {
  if (!await requireAdmin(request, cookies)) return json({ error: "Forbidden" }, 403);
  const body = await request.json().catch(() => null);
  if (!body?.id) return json({ error: "id required" }, 400);
  // Capture list_id before delete so we can bump updated_at
  const { data: existing } = await supabaseAdmin
    .from("stock_list_items").select("list_id").eq("id", body.id).single();
  const { error } = await supabaseAdmin.from("stock_list_items").delete().eq("id", body.id);
  if (error) return json({ error: error.message }, 500);
  if (existing?.list_id) {
    await supabaseAdmin.from("stock_lists").update({ updated_at: new Date().toISOString() }).eq("id", existing.list_id);
  }
  return json({ ok: true });
};
