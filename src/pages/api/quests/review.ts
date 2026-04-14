import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

// GET → list pending claims (staff/admin only)
export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return json({ error: "auth_required" }, 401);
  const { data: me } = await supabaseAdmin.from("profiles").select("role").eq("id", locals.user.id).maybeSingle();
  if (!me || !["employee","admin","super_admin"].includes(me.role)) return json({ error: "forbidden" }, 403);

  const nowIso = new Date().toISOString();
  const { data: claims } = await supabaseAdmin
    .from("quest_claims")
    .select("id, quest_id, user_id, status, claim_token, expires_at, created_at, table_number")
    .eq("status", "pending")
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: true });

  if (!claims?.length) return json({ ok: true, claims: [] });

  const userIds  = Array.from(new Set(claims.map(c => c.user_id)));
  const questIds = Array.from(new Set(claims.map(c => c.quest_id)));
  const [{ data: profiles }, { data: quests }] = await Promise.all([
    supabaseAdmin.from("profiles").select("id, full_name, avatar_url").in("id", userIds),
    supabaseAdmin.from("quests").select("id, title_en, title_el, reward_points, reward_label_en, reward_label_el").in("id", questIds),
  ]);
  const pMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
  const qMap = new Map((quests   ?? []).map((q: any) => [q.id, q]));

  return json({
    ok: true,
    claims: claims.map((c: any) => ({
      ...c,
      user:  pMap.get(c.user_id) ?? { full_name: "Member" },
      quest: qMap.get(c.quest_id) ?? null,
    })),
  });
};

// POST → approve or reject. Staff/admin only.
export const POST: APIRoute = async ({ locals, request }) => {
  if (!locals.user) return json({ error: "auth_required" }, 401);
  const { data: me } = await supabaseAdmin.from("profiles").select("role").eq("id", locals.user.id).maybeSingle();
  if (!me || !["employee","admin","super_admin"].includes(me.role)) return json({ error: "forbidden" }, 403);

  let body: any;
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400); }

  const action = String(body.action ?? "");
  const reason = body.reason ? String(body.reason).slice(0, 200) : null;
  if (!["approve","reject"].includes(action)) return json({ error: "bad_action" }, 400);

  // Locate the claim by id OR token (token = staff scanned a QR).
  const claimId = body.claim_id ? String(body.claim_id) : null;
  const token   = body.token    ? String(body.token).slice(0, 64) : null;
  if (!claimId && !token) return json({ error: "missing_claim_id_or_token" }, 400);

  let q = supabaseAdmin.from("quest_claims")
    .select("id, quest_id, user_id, status, expires_at, claim_token")
    .eq("status", "pending");
  if (claimId) q = q.eq("id", claimId);
  if (token)   q = q.eq("claim_token", token);
  const { data: claim } = await q.maybeSingle();
  if (!claim) return json({ error: "claim_not_found" }, 404);
  if (new Date(claim.expires_at).getTime() < Date.now()) {
    await supabaseAdmin.from("quest_claims").update({ status: "expired" }).eq("id", claim.id);
    return json({ error: "expired" }, 410);
  }

  if (action === "reject") {
    await supabaseAdmin.from("quest_claims").update({
      status: "rejected", reviewed_by: locals.user.id, reviewed_at: new Date().toISOString(), reject_reason: reason,
    }).eq("id", claim.id);
    return json({ ok: true, action: "rejected" });
  }

  // Approve → mark + award points.
  const { data: questRow } = await supabaseAdmin
    .from("quests").select("reward_points").eq("id", claim.quest_id).maybeSingle();
  const points = questRow?.reward_points ?? 0;

  await supabaseAdmin.from("quest_claims").update({
    status: "approved", reviewed_by: locals.user.id, reviewed_at: new Date().toISOString(),
  }).eq("id", claim.id);

  if (points > 0) {
    await supabaseAdmin.from("loyalty_events").insert({
      user_id: claim.user_id, points, reason: `quest:${claim.quest_id}`,
    });
  }
  return json({ ok: true, action: "approved", points });
};
