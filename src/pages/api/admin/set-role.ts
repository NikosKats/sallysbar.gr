import type { APIRoute } from "astro";
import { createSupabaseServerClient, supabaseAdmin } from "../../../lib/supabase";

export const POST: APIRoute = async ({ request, cookies }) => {
  // Verify caller is admin
  const supabase = createSupabaseServerClient(request, cookies);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

  const { data: profile } = await supabaseAdmin
    .from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return json({ error: "Forbidden" }, 403);

  const body = await request.json().catch(() => null);
  const { userId, role } = body ?? {};

  if (!userId || !["customer", "employee", "admin"].includes(role)) {
    return json({ error: "Invalid input" }, 400);
  }

  const { error } = await supabaseAdmin
    .from("profiles").update({ role }).eq("id", userId);

  if (error) return json({ error: error.message }, 500);
  return json({ ok: true }, 200);
};

function json(body: object, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
