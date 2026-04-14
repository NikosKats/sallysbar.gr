import type { APIRoute } from "astro";
import Anthropic from "@anthropic-ai/sdk";

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

export const POST: APIRoute = async ({ request, locals }) => {
  if (!["admin","super_admin"].includes(locals.role ?? "")) return json({ error: "forbidden" }, 403);

  let body: any;
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400); }

  const theme = String(body.theme ?? body.title ?? "").trim();
  if (!theme || theme.length < 2) return json({ error: "theme_required" }, 400);

  const apiKey = import.meta.env.ANTHROPIC_API_KEY;
  if (!apiKey) return json({ error: "ai_not_configured" }, 503);

  const system = `You craft short, exciting event listings for Sally's Bar — a lively cocktail bar in Skala, Kefalonia, Greece. Tone: warm, playful, inviting. Audience: locals, tourists, expats.

Return ONLY a single JSON object (no markdown, no commentary) with these exact keys:
{
  "title_en": string,           // catchy title, <= 50 chars
  "title_el": string,           // Greek translation
  "description_en": string,     // 2-3 sentences, vivid
  "description_el": string,     // same, in Greek
  "suggested_time": string,     // "HH:MM" 24h, typical for this event (e.g. "21:00")
  "suggested_capacity": number, // realistic capacity (20-150) or 0 for unlimited
  "suggested_price": number     // EUR price, 0 for free
}

Do not wrap in code fences.`;

  const user = `Generate an event listing for: "${theme}".`;

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 700,
      system,
      messages: [{ role: "user", content: user }],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    const s = text.indexOf("{"), e = text.lastIndexOf("}");
    if (s < 0 || e < 0) return json({ error: "parse_failed", raw: text }, 502);
    let parsed: any;
    try { parsed = JSON.parse(text.slice(s, e + 1)); }
    catch { return json({ error: "parse_failed", raw: text }, 502); }

    return json({ ok: true, event: parsed });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "ai_error";
    return json({ error: msg }, 500);
  }
};
