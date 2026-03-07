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

// PUT /api/admin/users — update name, email, and/or role
export const PUT: APIRoute = async ({ request, cookies }) => {
  if (!await requireAdmin(request, cookies)) return json({ error: "Forbidden" }, 403);

  const body = await request.json().catch(() => null);
  if (!body?.id) return json({ error: "id required" }, 400);

  const { id, name, email, role } = body;

  // Update auth user (email)
  if (email) {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(id, { email });
    if (error) return json({ error: error.message }, 500);
  }

  // Update profile (name + role)
  const profileUpdate: Record<string, string> = {};
  if (name !== undefined) profileUpdate.full_name = name;
  if (role && ["customer", "employee", "admin"].includes(role)) profileUpdate.role = role;

  if (Object.keys(profileUpdate).length > 0) {
    const { error } = await supabaseAdmin
      .from("profiles").update(profileUpdate).eq("id", id);
    if (error) return json({ error: error.message }, 500);
  }

  return json({ ok: true });
};

// DELETE /api/admin/users — delete user from auth (profile cascades)
export const DELETE: APIRoute = async ({ request, cookies }) => {
  if (!await requireAdmin(request, cookies)) return json({ error: "Forbidden" }, 403);

  const body = await request.json().catch(() => null);
  if (!body?.id) return json({ error: "id required" }, 400);

  // Nullify FK references before deleting so constraints don't block
  await Promise.all([
    supabaseAdmin.from("orders").update({ waiter_id: null }).eq("waiter_id", body.id),
    supabaseAdmin.from("tips").update({ waiter_id: null }).eq("waiter_id", body.id),
  ]);

  const { error } = await supabaseAdmin.auth.admin.deleteUser(body.id);
  if (error) return json({ error: error.message }, 500);

  return json({ ok: true });
};
