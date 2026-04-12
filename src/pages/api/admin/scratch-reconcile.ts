import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), { status, headers: { "Content-Type": "application/json" } });
}

// One-shot repair: find scratch cards that were revealed but never credited
// (because the earlier reveal endpoint silently failed when it tried to write
// a non-existent `meta` column) and credit the points now.
export const POST: APIRoute = async ({ locals }) => {
  if (locals.role !== "admin") return json({ error: "forbidden" }, 403);

  const { data: cards } = await supabaseAdmin
    .from("scratch_cards")
    .select("id, user_id, reward_type, reward_value, reward_label, revealed_at, claimed_at")
    .eq("reward_type", "points")
    .not("revealed_at", "is", null)
    .is("claimed_at", null);

  const results: any[] = [];
  const now = new Date().toISOString();

  for (const c of cards ?? []) {
    const v = Number(c.reward_value) || 0;
    if (v <= 0) continue;
    const { error: insErr } = await supabaseAdmin.from("loyalty_events").insert({
      user_id: c.user_id,
      points: v,
      reason: `scratch:${c.id}`,
    });
    if (insErr && !insErr.message?.includes("duplicate")) {
      results.push({ id: c.id, user_id: c.user_id, status: "error", error: insErr.message });
      continue;
    }
    await supabaseAdmin.from("scratch_cards").update({ claimed_at: now }).eq("id", c.id);
    results.push({ id: c.id, user_id: c.user_id, credited: v, label: c.reward_label });
  }

  return json({ ok: true, repaired: results.filter(r => r.credited).length, results });
};
