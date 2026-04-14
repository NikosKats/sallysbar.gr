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
  const table_number = body.table_number ? Number(body.table_number) : null;

  const { data: q } = await supabaseAdmin
    .from("quests")
    .select("id, reward_points, reward_label_en, active, active_date")
    .eq("id", quest_id)
    .maybeSingle();
  if (!q || !q.active) return json({ error: "not_active" }, 400);

  const today = new Date().toISOString().slice(0, 10);
  if (q.active_date !== today) return json({ error: "not_today" }, 400);

  // Look up settings (default require_confirmation=true)
  const { data: settings } = await supabaseAdmin
    .from("quest_settings").select("require_confirmation, approval_window_min").eq("id", 1).maybeSingle();
  const requireConfirm = settings?.require_confirmation !== false;
  const windowMin      = settings?.approval_window_min ?? 5;

  // Reject if user has another pending claim already (1 at a time)
  const { data: pending } = await supabaseAdmin
    .from("quest_claims")
    .select("id, expires_at")
    .eq("user_id", locals.user.id).eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (pending) return json({ error: "claim_in_progress", message: "Finish your current pending claim first." }, 409);

  // Cooldown: 3 rejects in 7 days = 24h ban on quest claims
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
  const { count: rejects } = await supabaseAdmin
    .from("quest_claims")
    .select("id", { count: "exact", head: true })
    .eq("user_id", locals.user.id).eq("status", "rejected")
    .gte("reviewed_at", sevenDaysAgo);
  if ((rejects ?? 0) >= 3) {
    return json({ error: "abuse_cooldown", message: "Too many rejections recently — try again tomorrow." }, 429);
  }

  if (!requireConfirm) {
    // Honor mode: insert as approved + award immediately (preserves old behaviour).
    const { error: dupErr } = await supabaseAdmin.from("quest_claims").insert({
      quest_id: q.id, user_id: locals.user.id, status: "approved",
    });
    if (dupErr) {
      if (dupErr.code === "23505") return json({ error: "already_claimed" }, 409);
      return json({ error: dupErr.message }, 500);
    }
    if (q.reward_points > 0) {
      await supabaseAdmin.from("loyalty_events").insert({
        user_id: locals.user.id, points: q.reward_points, reason: `quest:${q.id}`,
      });
    }
    return json({ ok: true, mode: "instant", points: q.reward_points });
  }

  // Confirm mode: insert pending row with short-lived random token.
  const token = crypto.randomUUID().replace(/-/g, "");
  const expires = new Date(Date.now() + windowMin * 60_000).toISOString();
  const { data: row, error: insErr } = await supabaseAdmin
    .from("quest_claims")
    .insert({
      quest_id: q.id,
      user_id: locals.user.id,
      status: "pending",
      claim_token: token,
      expires_at: expires,
      table_number,
    })
    .select("id, claim_token, expires_at")
    .single();
  if (insErr) {
    if (insErr.code === "23505") return json({ error: "already_claimed" }, 409);
    return json({ error: insErr.message }, 500);
  }

  return json({
    ok: true, mode: "pending",
    claim_id: row.id,
    token: row.claim_token,
    expires_at: row.expires_at,
    window_min: windowMin,
  });
};
