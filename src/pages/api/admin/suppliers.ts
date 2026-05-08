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

export const GET: APIRoute = async ({ request, cookies }) => {
  if (!await requireAdmin(request, cookies)) return json({ error: "Forbidden" }, 403);
  const { data, error } = await supabaseAdmin
    .from("suppliers").select("*").order("name", { ascending: true });
  if (error) return json({ error: error.message }, 500);
  return json({ suppliers: data ?? [] });
};

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!await requireAdmin(request, cookies)) return json({ error: "Forbidden" }, 403);
  const body = await request.json().catch(() => null);
  if (!body?.name?.trim()) return json({ error: "name required" }, 400);
  const insert = {
    name: String(body.name).trim(),
    contact_name: body.contact_name?.trim() || null,
    email: body.email?.trim() || null,
    phone: body.phone?.trim() || null,
    notes: body.notes?.trim() || null,
  };
  const { data, error } = await supabaseAdmin.from("suppliers").insert(insert).select().single();
  if (error) return json({ error: error.message }, 500);
  return json({ supplier: data });
};

export const PUT: APIRoute = async ({ request, cookies }) => {
  if (!await requireAdmin(request, cookies)) return json({ error: "Forbidden" }, 403);
  const body = await request.json().catch(() => null);
  if (!body?.id) return json({ error: "id required" }, 400);
  const update: Record<string, any> = { updated_at: new Date().toISOString() };
  for (const k of ["name", "contact_name", "email", "phone", "notes"]) {
    if (k in body) update[k] = body[k]?.toString().trim() || null;
  }
  if (update.name === null) return json({ error: "name cannot be empty" }, 400);
  const { data, error } = await supabaseAdmin
    .from("suppliers").update(update).eq("id", body.id).select().single();
  if (error) return json({ error: error.message }, 500);
  return json({ supplier: data });
};

export const DELETE: APIRoute = async ({ request, cookies }) => {
  if (!await requireAdmin(request, cookies)) return json({ error: "Forbidden" }, 403);
  const body = await request.json().catch(() => null);
  if (!body?.id) return json({ error: "id required" }, 400);
  const { error } = await supabaseAdmin.from("suppliers").delete().eq("id", body.id);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
};
