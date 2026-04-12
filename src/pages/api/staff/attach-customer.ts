import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";
import { parseLoyaltyCode } from "../../../lib/loyalty";

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.role || !["employee", "admin"].includes(locals.role)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 }); }

  const session_id = String(body.session_id ?? "");
  const loyalty_code = String(body.loyalty_code ?? "");
  if (!session_id || !loyalty_code) {
    return new Response(JSON.stringify({ error: "session_id and loyalty_code are required" }), { status: 400 });
  }

  const userId = parseLoyaltyCode(loyalty_code);
  if (!userId) {
    return new Response(JSON.stringify({ error: "Invalid loyalty code" }), { status: 400 });
  }

  const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (!authUser?.user) {
    return new Response(JSON.stringify({ error: "Unknown customer" }), { status: 404 });
  }

  const { error: sessErr } = await supabaseAdmin
    .from("table_sessions")
    .update({ customer_user_id: userId })
    .eq("id", session_id);
  if (sessErr) {
    return new Response(JSON.stringify({ error: sessErr.message }), { status: 500 });
  }

  await supabaseAdmin
    .from("orders")
    .update({ customer_user_id: userId })
    .eq("session_id", session_id);

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle();

  return new Response(JSON.stringify({
    ok: true,
    customer: {
      id: userId,
      name: profile?.full_name ?? authUser.user.email?.split("@")[0] ?? "Customer",
      email: authUser.user.email,
    },
  }));
};
