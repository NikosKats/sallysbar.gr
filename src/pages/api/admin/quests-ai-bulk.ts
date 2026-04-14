import type { APIRoute } from "astro";
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "../../../lib/supabase";

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

const SYSTEM = `You craft "Tonight's Quest" entries for Sally's Bar — a lively cocktail bar in Skala, Kefalonia, Greece. Each quest is a small, fun mission a customer can complete in one visit (or that night).

Tone: playful, warm, inviting. Mix of: drinks (try a cocktail), social (bring a friend), gamified (post a story), seasonal (sunset toast, full-moon dance), local (try a Greek liqueur), foodie, music, themed nights.

Return ONLY a JSON array (no markdown, no commentary) of N objects with these exact keys:
[
  {
    "title_en": string,                // <= 50 chars, catchy
    "title_el": string,                // Greek translation
    "description_en": string,          // 1-2 sentences, vivid
    "description_el": string,          // same in Greek
    "reward_label_en": string,         // <= 30 chars, what they win (e.g. "+50 pts" or "+50 pts + free shot")
    "reward_label_el": string,
    "reward_points": number,           // 25, 50, 75, or 100
    "cta_url": string                  // one of: "/menu", "/book", "/events", "/play", "/loyalty", "/membership", "" (empty for none)
  }
]

No duplicates. Variety across categories. Do not wrap in code fences.`;

async function generateBatch(client: Anthropic, batchSize: number, themeHint?: string): Promise<any[]> {
  const userMsg = `Generate ${batchSize} unique Tonight's Quests${themeHint ? ` themed around: ${themeHint}` : ""}. Return ONLY the JSON array.`;
  const r = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 8000,
    system: SYSTEM,
    messages: [{ role: "user", content: userMsg }],
  });
  const text = r.content[0]?.type === "text" ? r.content[0].text : "";
  const s = text.indexOf("["), e = text.lastIndexOf("]");
  if (s < 0 || e < 0) return [];
  try { return JSON.parse(text.slice(s, e + 1)); } catch { return []; }
}

export const POST: APIRoute = async ({ request, locals }) => {
  if (!["admin","super_admin"].includes(locals.role ?? "")) return json({ error: "forbidden" }, 403);

  const apiKey = import.meta.env.ANTHROPIC_API_KEY;
  if (!apiKey) return json({ error: "ai_not_configured" }, 503);

  let body: any = {};
  try { body = await request.json(); } catch {}
  const count       = Math.max(1, Math.min(200, Number(body.count ?? 100)));
  const startDateStr= String(body.start_date ?? "").trim();
  const skipExisting= body.skip_existing !== false;

  const startDate = startDateStr && /^\d{4}-\d{2}-\d{2}$/.test(startDateStr) ? new Date(startDateStr) : new Date();
  startDate.setHours(0, 0, 0, 0);

  const themes = [
    "classic cocktails and signature drinks",
    "social challenges (bring a friend, share a story)",
    "Greek/Kefalonia local flavour (Robola wine, Tsipouro, Loukoumades)",
    "music and dancing nights",
    "sunset and beach vibes",
    "foodie nights (snacks, pairings)",
    "themed nights (80s, salsa, karaoke)",
    "instagram-worthy moments",
    "loyalty actions (refer a friend, redeem a reward)",
    "weekend party mode",
  ];

  const client = new Anthropic({ apiKey });
  const batchSize = 20;
  const all: any[] = [];

  for (let i = 0; i < Math.ceil(count / batchSize); i++) {
    const theme = themes[i % themes.length];
    const need = Math.min(batchSize, count - all.length);
    if (need <= 0) break;
    try {
      const batch = await generateBatch(client, need, theme);
      for (const q of batch) {
        if (q && typeof q.title_en === "string" && typeof q.title_el === "string") all.push(q);
        if (all.length >= count) break;
      }
    } catch {}
  }

  if (!all.length) return json({ error: "no_quests_generated" }, 502);

  // Optional: dedupe against existing titles
  let existingTitles = new Set<string>();
  if (skipExisting) {
    const { data } = await supabaseAdmin.from("quests").select("title_en");
    existingTitles = new Set((data ?? []).map((r: any) => (r.title_en ?? "").toLowerCase()));
  }

  // Build inserts: spread one quest per day from startDate, push at 19:00 Athens
  const rows: any[] = [];
  let dayOffset = 0;
  for (const q of all) {
    if (skipExisting && existingTitles.has(String(q.title_en).toLowerCase())) continue;
    const d = new Date(startDate);
    d.setDate(d.getDate() + dayOffset);
    dayOffset++;
    const yyyy = d.toISOString().slice(0, 10);
    const pushAt = new Date(`${yyyy}T17:00:00.000Z`); // 19:00 EET (UTC+2) ≈ 17:00 UTC
    rows.push({
      title_en:        String(q.title_en).slice(0, 200),
      title_el:        String(q.title_el).slice(0, 200),
      description_en:  q.description_en ? String(q.description_en).slice(0, 500) : null,
      description_el:  q.description_el ? String(q.description_el).slice(0, 500) : null,
      reward_points:   Math.max(10, Math.min(500, Number(q.reward_points ?? 50))),
      reward_label_en: q.reward_label_en ? String(q.reward_label_en).slice(0, 100) : null,
      reward_label_el: q.reward_label_el ? String(q.reward_label_el).slice(0, 100) : null,
      cta_url:         q.cta_url ? String(q.cta_url).slice(0, 100) : null,
      active_date:     yyyy,
      push_at:         pushAt.toISOString(),
      active:          true,
    });
  }

  if (!rows.length) return json({ ok: true, inserted: 0, generated: all.length, note: "All generated quests were duplicates of existing ones." });

  const { error } = await supabaseAdmin.from("quests").insert(rows);
  if (error) return json({ error: error.message }, 500);

  return json({ ok: true, inserted: rows.length, generated: all.length, first_date: rows[0]?.active_date, last_date: rows[rows.length - 1]?.active_date });
};
