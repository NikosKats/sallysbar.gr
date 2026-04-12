import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return json({ error: "auth_required" }, 401);

  let body: any;
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400); }
  const quest_id = body.quest_id ? String(body.quest_id) : null;
  if (!quest_id) return json({ error: "missing_quest_id" }, 400);

  const { data: q } = await supabaseAdmin
    .from("quests")
    .select("id, reward_points, reward_label_en, active, active_date")
    .eq("id", quest_id)
    .maybeSingle();

  if (!q || !q.active) return json({ error: "not_active" }, 400);

  // Only allow claiming on the quest's active date
  const today = new Date().toISOString().slice(0, 10);
  if (q.active_date !== today) return json({ error: "not_today" }, 400);

  const { error: dupErr } = await supabaseAdmin.from("quest_claims").insert({
    quest_id: q.id, user_id: locals.user.id,
  });
  if (dupErr) {
    if (dupErr.code === "23505") return json({ error: "already_claimed" }, 409);
    return json({ error: dupErr.message }, 500);
  }

  if (q.reward_points > 0) {
    const { error: insErr } = await supabaseAdmin.from("loyalty_events").insert({
      user_id: locals.user.id,
      points: q.reward_points,
      reason: `quest:${q.id}`,
    });
    if (insErr && !insErr.message?.includes("duplicate")) {
      console.error("[quest/claim] loyalty insert failed:", insErr.message);
    }
  }

  return json({ ok: true, points: q.reward_points });
};
