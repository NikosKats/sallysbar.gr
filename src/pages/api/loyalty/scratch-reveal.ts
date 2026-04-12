import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return json({ error: "auth_required" }, 401);

  let body: any;
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400); }

  const id = body.id ? String(body.id) : null;
  if (!id) return json({ error: "missing_id" }, 400);

  const { data: card } = await supabaseAdmin
    .from("scratch_cards")
    .select("id, user_id, reward_type, reward_value, reward_label, revealed_at, claimed_at, expires_at")
    .eq("id", id)
    .maybeSingle();

  if (!card || card.user_id !== locals.user.id) return json({ error: "not_found" }, 404);
  if (card.expires_at && new Date(card.expires_at) < new Date()) return json({ error: "expired" }, 410);

  const now = new Date().toISOString();

  // Reveal (if not already) + auto-claim points immediately
  if (!card.revealed_at) {
    await supabaseAdmin.from("scratch_cards").update({ revealed_at: now }).eq("id", id);

    if (card.reward_type === "points" && Number(card.reward_value) > 0) {
      await supabaseAdmin.from("loyalty_events").insert({
        user_id: locals.user.id,
        points: Number(card.reward_value),
        reason: "scratch_card",
        meta: { scratch_id: card.id, label: card.reward_label },
      });
      await supabaseAdmin.from("scratch_cards").update({ claimed_at: now }).eq("id", id);
    }
  }

  return json({
    ok: true,
    reward: {
      type:  card.reward_type,
      value: card.reward_value,
      label: card.reward_label,
      auto_claimed: card.reward_type === "points",
    },
  });
};
