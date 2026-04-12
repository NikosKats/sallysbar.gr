import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user || !["staff", "admin"].includes(locals.role ?? "")) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  let body: any;
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 }); }

  const code = String(body.code ?? "").trim().toUpperCase();
  if (!code) return new Response(JSON.stringify({ error: "code required" }), { status: 400 });

  const { data: r } = await supabaseAdmin
    .from("loyalty_redemptions")
    .select("id, user_id, reward_id, cost, status, code, loyalty_rewards(name_en, name_el)")
    .eq("code", code)
    .maybeSingle();

  if (!r) return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
  if (r.status === "used") return new Response(JSON.stringify({ error: "already_used" }), { status: 409 });
  if (r.status === "cancelled") return new Response(JSON.stringify({ error: "cancelled" }), { status: 409 });

  const { error } = await supabaseAdmin
    .from("loyalty_redemptions")
    .update({ status: "used", used_at: new Date().toISOString(), used_by: locals.user.id })
    .eq("id", r.id);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  return new Response(JSON.stringify({
    ok: true,
    reward_en: (r as any).loyalty_rewards?.name_en ?? "",
    reward_el: (r as any).loyalty_rewards?.name_el ?? "",
    cost: r.cost,
  }));
};
