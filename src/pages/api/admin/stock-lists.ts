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

const VALID_SCOPES = ["bar", "inventory", "mixed"] as const;

// GET /api/admin/stock-lists                → list summaries
// GET /api/admin/stock-lists?id=<uuid>      → single list with items
export const GET: APIRoute = async ({ request, cookies, url }) => {
  if (!await requireAdmin(request, cookies)) return json({ error: "Forbidden" }, 403);
  const id = url.searchParams.get("id");

  if (id) {
    const { data: list, error } = await supabaseAdmin
      .from("stock_lists").select("*").eq("id", id).single();
    if (error || !list) return json({ error: "Not found" }, 404);
    const { data: items } = await supabaseAdmin
      .from("stock_list_items").select("*").eq("list_id", id).order("position", { ascending: true });
    return json({ list, items: items ?? [] });
  }

  // Summary list with item count + total
  const { data: lists, error } = await supabaseAdmin
    .from("stock_lists").select("*").order("updated_at", { ascending: false });
  if (error) return json({ error: error.message }, 500);

  const ids = (lists ?? []).map(l => l.id);
  let counts: Record<string, { count: number; total: number }> = {};
  if (ids.length) {
    const { data: items } = await supabaseAdmin
      .from("stock_list_items").select("list_id, qty, unit_cost").in("list_id", ids);
    for (const it of items ?? []) {
      const c = counts[it.list_id] ?? { count: 0, total: 0 };
      c.count += 1;
      c.total += Number(it.qty ?? 0) * Number(it.unit_cost ?? 0);
      counts[it.list_id] = c;
    }
  }
  return json({ lists: (lists ?? []).map(l => ({ ...l, item_count: counts[l.id]?.count ?? 0, total: counts[l.id]?.total ?? 0 })) });
};

// POST /api/admin/stock-lists  body: { name, scope?, items?: [{stock_item_id?, name, unit?, qty, unit_cost?, subcategory?, supplier_name?}] }
export const POST: APIRoute = async ({ request, cookies }) => {
  if (!await requireAdmin(request, cookies)) return json({ error: "Forbidden" }, 403);
  const body = await request.json().catch(() => null);
  const name = body?.name?.toString().trim();
  if (!name) return json({ error: "name required" }, 400);
  const scope = (VALID_SCOPES as readonly string[]).includes(body?.scope) ? body.scope : "mixed";

  const { data: list, error } = await supabaseAdmin
    .from("stock_lists").insert({ name, scope }).select().single();
  if (error) return json({ error: error.message }, 500);

  if (Array.isArray(body?.items) && body.items.length) {
    const rows = body.items.map((it: any, idx: number) => {
      const nameEn = it.name_en?.toString().trim() || null;
      const nameEl = it.name_el?.toString().trim() || null;
      return {
        list_id: list.id,
        stock_item_id: it.stock_item_id ?? null,
        name: String(it.name ?? "").trim() || nameEn || nameEl || "Item",
        name_en: nameEn,
        name_el: nameEl,
        unit: it.unit?.toString().trim() || null,
        subcategory: it.subcategory?.toString().trim() || null,
        unit_cost: Number(it.unit_cost ?? 0) || 0,
        qty: Number(it.qty ?? 0) || 0,
        inventory_qty: Number(it.inventory_qty ?? 0) || 0,
        supplier_name: it.supplier_name?.toString().trim() || null,
        position: idx,
      };
    });
    const { error: itemsErr } = await supabaseAdmin.from("stock_list_items").insert(rows);
    if (itemsErr) return json({ error: itemsErr.message }, 500);
  }

  return json({ list });
};

// PUT /api/admin/stock-lists  body: { id, name?, scope?, rotate_token? }
export const PUT: APIRoute = async ({ request, cookies }) => {
  if (!await requireAdmin(request, cookies)) return json({ error: "Forbidden" }, 403);
  const body = await request.json().catch(() => null);
  if (!body?.id) return json({ error: "id required" }, 400);
  const update: Record<string, any> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) {
    const n = String(body.name).trim();
    if (!n) return json({ error: "name cannot be empty" }, 400);
    update.name = n;
  }
  if (body.scope !== undefined && (VALID_SCOPES as readonly string[]).includes(body.scope)) {
    update.scope = body.scope;
  }
  if (body.rotate_token) {
    // Generate a fresh token client-side (random hex). Server-side fallback uses crypto.
    const buf = new Uint8Array(12);
    crypto.getRandomValues(buf);
    update.share_token = [...buf].map(b => b.toString(16).padStart(2, "0")).join("");
  }
  const { data, error } = await supabaseAdmin
    .from("stock_lists").update(update).eq("id", body.id).select().single();
  if (error) return json({ error: error.message }, 500);
  return json({ list: data });
};

export const DELETE: APIRoute = async ({ request, cookies }) => {
  if (!await requireAdmin(request, cookies)) return json({ error: "Forbidden" }, 403);
  const body = await request.json().catch(() => null);
  if (!body?.id) return json({ error: "id required" }, 400);
  const { error } = await supabaseAdmin.from("stock_lists").delete().eq("id", body.id);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
};
