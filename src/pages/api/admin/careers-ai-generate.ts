import type { APIRoute } from "astro";
import Anthropic from "@anthropic-ai/sdk";

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

export const POST: APIRoute = async ({ request, locals }) => {
  if (locals.role !== "admin") return json({ error: "forbidden" }, 403);

  let body: any;
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400); }

  const role = String(body.role ?? body.title_en ?? "").trim();
  if (!role || role.length < 2) return json({ error: "role_required" }, 400);

  const apiKey = import.meta.env.ANTHROPIC_API_KEY;
  if (!apiKey) return json({ error: "ai_not_configured" }, 503);

  const system = `You write concise, appealing job listings for Sally's Bar — a busy cocktail bar in Skala, Kefalonia, Greece. Tone: warm, friendly, hospitality-focused. Audience: locals, expats, seasonal workers.

Return ONLY a single JSON object (no markdown, no commentary) with these exact keys:
{
  "title_en": string,
  "title_el": string,
  "department": string,          // e.g. "Bar", "Kitchen", "Floor", "Management"
  "employment_type": string,     // one of: "full_time" | "part_time" | "seasonal" | "contract"
  "description_en": string,      // 2-4 sentences describing the role
  "description_el": string,      // same, in Greek
  "requirements_en": string,     // 4-7 bullet-style lines, newline-separated, no leading "-"
  "requirements_el": string      // same, in Greek
}

Keep each field tight. Do not wrap in code fences.`;

  const user = `Generate a job listing for the following role: "${role}". If the role is Greek, translate EN too. If it's English, translate EL too.`;

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 900,
      system,
      messages: [{ role: "user", content: user }],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    const jsonStart = text.indexOf("{");
    const jsonEnd   = text.lastIndexOf("}");
    if (jsonStart < 0 || jsonEnd < 0) return json({ error: "parse_failed", raw: text }, 502);

    let parsed: Record<string, string>;
    try { parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)); }
    catch { return json({ error: "parse_failed", raw: text }, 502); }

    return json({ ok: true, job: parsed });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "ai_error";
    return json({ error: msg }, 500);
  }
};
