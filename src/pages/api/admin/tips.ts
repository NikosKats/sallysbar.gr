import type { APIRoute } from "astro";
import { createSupabaseServerClient, supabaseAdmin } from "../../../lib/supabase";

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

// PATCH /api/admin/tips — edit amount and/or type
export const PATCH: APIRoute = async ({ request, cookies }) => {
  if (!await requireAdmin(request, cookies)) return json({ error: "Forbidden" }, 403);

  const body = await request.json().catch(() => null);
  if (!body?.id) return json({ error: "id required" }, 400);

  const update: Record<string, unknown> = {};
  if (body.amount_cents !== undefined) update.amount_cents = Number(body.amount_cents);
  if (body.type && ["cash", "card"].includes(body.type)) update.type = body.type;

  if (!Object.keys(update).length) return json({ error: "Nothing to update" }, 400);

  const { error } = await supabaseAdmin.from("tips").update(update).eq("id", body.id);
  if (error) return json({ error: error.message }, 500);

  return json({ ok: true });
};

// DELETE /api/admin/tips — delete a tip
export const DELETE: APIRoute = async ({ request, cookies }) => {
  if (!await requireAdmin(request, cookies)) return json({ error: "Forbidden" }, 403);

  const body = await request.json().catch(() => null);
  if (!body?.id) return json({ error: "id required" }, 400);

  const { error } = await supabaseAdmin.from("tips").delete().eq("id", body.id);
  if (error) return json({ error: error.message }, 500);

  return json({ ok: true });
};
