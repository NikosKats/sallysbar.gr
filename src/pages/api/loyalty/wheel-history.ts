import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return json({ error: "auth_required" }, 401);

  const { data } = await supabaseAdmin
    .from("wheel_spins")
    .select("id, spun_at, reward_type, reward_value, reward_label, claimed_at, rejected_at, claim_token, reject_reason")
    .eq("user_id", locals.user.id)
    .order("spun_at", { ascending: false })
    .limit(50);

  return json({ ok: true, spins: data ?? [] });
};
