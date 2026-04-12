import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

// Weighted reward pool — every scratch card rolls from here.
// Tune weights to control your margin. Totals don't need to = 100; they're relative.
const POOL: Array<{ type: string; value: number; label_en: string; label_el: string; weight: number }> = [
  { type: "points",     value: 10,  label_en: "+10 points",           label_el: "+10 πόντοι",            weight: 40 },
  { type: "points",     value: 25,  label_en: "+25 points",           label_el: "+25 πόντοι",            weight: 25 },
  { type: "points",     value: 50,  label_en: "+50 points",           label_el: "+50 πόντοι",            weight: 12 },
  { type: "points",     value: 100, label_en: "+100 points",          label_el: "+100 πόντοι",           weight: 6 },
  { type: "free_shot",  value: 1,   label_en: "Free shot 🥃",         label_el: "Δωρεάν σφηνάκι 🥃",     weight: 8 },
  { type: "discount",   value: 10,  label_en: "10% off next round",   label_el: "10% στην επόμενη γύρα", weight: 5 },
  { type: "free_drink", value: 1,   label_en: "Free cocktail 🍸",     label_el: "Δωρεάν cocktail 🍸",    weight: 3 },
  { type: "custom",     value: 0,   label_en: "Skip-the-line pass",   label_el: "Pass χωρίς ουρά",       weight: 1 },
];

function rollReward() {
  const total = POOL.reduce((s, r) => s + r.weight, 0);
  let roll = Math.random() * total;
  for (const r of POOL) {
    if ((roll -= r.weight) <= 0) return r;
  }
  return POOL[0];
}

export const POST: APIRoute = async ({ request, locals }) => {
  if (locals.role !== "admin") return json({ error: "forbidden" }, 403);

  let body: any;
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400); }

  const mode  = String(body.mode ?? "single");     // "single" | "all-members"
  const trigger = String(body.trigger ?? "admin");

  const expires_at = body.expires_at ? new Date(body.expires_at).toISOString() : null;

  if (mode === "single") {
    const user_id = body.user_id ? String(body.user_id) : null;
    if (!user_id) return json({ error: "missing_user_id" }, 400);
    const r = rollReward();
    const { error } = await supabaseAdmin.from("scratch_cards").insert({
      user_id, reward_type: r.type, reward_value: r.value,
      reward_label: r.label_en, trigger, expires_at,
    });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, issued: 1 });
  }

  if (mode === "all-members") {
    const { data: members } = await supabaseAdmin.from("profiles").select("id").not("card_issued_at", "is", null);
    if (!members || members.length === 0) return json({ ok: true, issued: 0 });
    const rows = members.map((m: any) => {
      const r = rollReward();
      return {
        user_id: m.id, reward_type: r.type, reward_value: r.value,
        reward_label: r.label_en, trigger, expires_at,
      };
    });
    const { error } = await supabaseAdmin.from("scratch_cards").insert(rows);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, issued: rows.length });
  }

  return json({ error: "bad_mode" }, 400);
};
