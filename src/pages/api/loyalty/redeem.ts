import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";
import { getBalance, generateRedemptionCode } from "../../../lib/loyalty";

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: "auth_required" }), { status: 401 });

  let body: any;
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 }); }

  const rewardId = String(body.reward_id ?? "");
  if (!rewardId) return new Response(JSON.stringify({ error: "reward_id required" }), { status: 400 });

  const { data: reward } = await supabaseAdmin
    .from("loyalty_rewards")
    .select("id, cost, active, name_en")
    .eq("id", rewardId)
    .maybeSingle();
  if (!reward || !reward.active) return new Response(JSON.stringify({ error: "unavailable" }), { status: 404 });

  const balance = await getBalance(locals.user.id);
  if (balance < reward.cost) return new Response(JSON.stringify({ error: "insufficient_points", balance }), { status: 400 });

  // Generate a unique code (retry up to 5 times on collision)
  let code = "";
  for (let i = 0; i < 5; i++) {
    code = generateRedemptionCode();
    const { data: exists } = await supabaseAdmin.from("loyalty_redemptions").select("id").eq("code", code).maybeSingle();
    if (!exists) break;
    code = "";
  }
  if (!code) return new Response(JSON.stringify({ error: "code_gen_failed" }), { status: 500 });

  const { data: redemption, error: rErr } = await supabaseAdmin
    .from("loyalty_redemptions")
    .insert({
      user_id: locals.user.id,
      reward_id: reward.id,
      cost: reward.cost,
      code,
      status: "pending",
    })
    .select("id, code")
    .single();
  if (rErr || !redemption) return new Response(JSON.stringify({ error: rErr?.message ?? "db" }), { status: 500 });

  // Deduct points
  const { error: eErr } = await supabaseAdmin.from("loyalty_events").insert({
    user_id: locals.user.id,
    points: -reward.cost,
    reason: `redeem:${redemption.id}`,
  });
  if (eErr) {
    // roll back the redemption
    await supabaseAdmin.from("loyalty_redemptions").delete().eq("id", redemption.id);
    return new Response(JSON.stringify({ error: eErr.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true, code: redemption.code, id: redemption.id }));
};
