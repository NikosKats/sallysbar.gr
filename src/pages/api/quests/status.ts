import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user) return json({ error: "auth_required" }, 401);
  const claim_id = url.searchParams.get("claim_id");
  if (!claim_id) return json({ error: "missing_claim_id" }, 400);

  const { data: c } = await supabaseAdmin
    .from("quest_claims")
    .select("id, status, expires_at, quest_id, reject_reason")
    .eq("id", claim_id)
    .eq("user_id", locals.user.id)
    .maybeSingle();

  if (!c) return json({ error: "not_found" }, 404);

  let points: number | null = null;
  if (c.status === "approved") {
    const { data: q } = await supabaseAdmin.from("quests").select("reward_points").eq("id", c.quest_id).maybeSingle();
    points = q?.reward_points ?? 0;
  }
  return json({ ok: true, status: c.status, expires_at: c.expires_at, reject_reason: c.reject_reason, points });
};
