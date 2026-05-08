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

  // Update auth user — email and/or user_metadata.full_name (the dropdown
  // header in the top bar reads user_metadata.full_name, so we must keep it
  // in sync with profiles.full_name).
  const authUpdate: Record<string, any> = {};
  if (email) authUpdate.email = email;
  if (name !== undefined) authUpdate.user_metadata = { full_name: name };
  if (Object.keys(authUpdate).length > 0) {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(id, authUpdate);
    if (error) return json({ error: error.message }, 500);
  }

  // Update profile (name + role)
  const profileUpdate: Record<string, string> = {};
  if (name !== undefined) profileUpdate.full_name = name;
  if (role && ["customer", "employee", "staff", "waiter", "barman", "admin", "super_admin"].includes(role)) {
    profileUpdate.role = role;
  }

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

  // Look up the user's email first — needed to clean up welcome_drinks rows
  // where user_id might be null (e.g. signup happened before cookies were set).
  let userEmail: string | null = null;
  try {
    const { data } = await supabaseAdmin.auth.admin.getUserById(body.id);
    userEmail = data?.user?.email?.toLowerCase() ?? null;
  } catch {}

  // Nullify FK references before deleting so constraints don't block,
  // and clean up customer-side data tied to this user.
  const cleanups: Promise<unknown>[] = [
    supabaseAdmin.from("orders").update({ waiter_id: null }).eq("waiter_id", body.id),
    supabaseAdmin.from("tips").update({ waiter_id: null }).eq("waiter_id", body.id),
    // Welcome drinks: delete any code linked by user_id…
    supabaseAdmin.from("welcome_drinks").delete().eq("user_id", body.id),
    // …and by email match too, in case user_id was never wired up.
    ...(userEmail ? [supabaseAdmin.from("welcome_drinks").delete().ilike("email", userEmail)] : []),
    // Nullify staff-side FK so historical redemptions don't block deletion.
    supabaseAdmin.from("welcome_drinks").update({ redeemed_by: null }).eq("redeemed_by", body.id),
  ];
  await Promise.all(cleanups);

  const { error } = await supabaseAdmin.auth.admin.deleteUser(body.id);
  if (error) return json({ error: error.message }, 500);

  return json({ ok: true });
};
