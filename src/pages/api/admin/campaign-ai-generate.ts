import type { APIRoute } from "astro";
import Anthropic from "@anthropic-ai/sdk";

export const prerender = false;

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

const CHANNEL_LIMITS: Record<string, { max: number; label: string }> = {
  sms:      { max: 160, label: "SMS (1 segment)" },
  whatsapp: { max: 500, label: "WhatsApp" },
  push:     { max: 120, label: "push notification" },
  email:    { max: 800, label: "email body" },
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (!["admin", "super_admin"].includes(locals.role ?? "")) return json({ ok: false, error: "forbidden" });

  let body: any;
  try { body = await request.json(); } catch { return json({ ok: false, error: "bad_json" }); }

  const apiKey = import.meta.env.ANTHROPIC_API_KEY;
  if (!apiKey) return json({ ok: false, error: "ai_not_configured" });

  const channel = String(body.channel ?? "sms");
  const brief = String(body.brief ?? "").trim();
  const lang = String(body.lang ?? "en");
  const filters = body.filters ?? {};
  const limit = CHANNEL_LIMITS[channel] ?? CHANNEL_LIMITS.sms;

  const audienceBits: string[] = [];
  if (filters.tier)           audienceBits.push(`loyalty tier: ${filters.tier}`);
  if (filters.birthday_month) audienceBits.push(`birthday month: ${filters.birthday_month}`);
  if (filters.city)           audienceBits.push(`city contains: ${filters.city}`);
  if (filters.inactive_days)  audienceBits.push(`inactive ≥ ${filters.inactive_days} days`);
  if (filters.signed_within)  audienceBits.push(`joined within ${filters.signed_within} days`);
  if (filters.consent)        audienceBits.push(`marketing consent: yes`);
  const audienceLine = audienceBits.length ? audienceBits.join(" · ") : "all customers";

  const system = `You write short, punchy marketing messages for Sally's Bar — a cocktail bar in Skala, Kefalonia, Greece. Tone: warm, casual, Mediterranean, never corporate. One clear call-to-action. Use emojis sparingly (max 2). No hashtags. Write in ${lang === "el" ? "Greek" : "English"}.

You may personalise with these exact placeholders (do not invent others):
- {{name}}   — recipient's first name
- {{tier}}   — loyalty tier (e.g. Gold, Silver)
- {{points}} — current loyalty points balance

Hard constraints:
- Channel: ${limit.label}
- MAX LENGTH: ${limit.max} characters (count the rendered text, assume {{name}} → "John")
- ${channel === "sms" ? "Plain text only — no emoji in first 10 chars (carriers flag)." : ""}
- ${channel === "email" ? "No salutation line like 'Dear X' — jump into the hook." : ""}
${channel === "email" ? '- Return BOTH a subject line (≤60 chars) and a body.' : ""}

Return ONLY a single JSON object (no markdown, no code fences):
${channel === "email"
  ? '{ "subject": string, "body": string }'
  : '{ "body": string }'}`;

  const user = `Audience: ${audienceLine}
Brief: ${brief || "Invite them to the bar this week with a warm, short message. Mention one concrete reason to come in (e.g. new cocktail, live music night, happy hour, seasonal offer)."}

Write the message now. Return only the JSON.`;

  try {
    const client = new Anthropic({ apiKey });
    const resp = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      system,
      messages: [{ role: "user", content: user }],
    });

    const raw = (resp.content[0] as any)?.text ?? "";
    let parsed: any = null;
    try {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]);
    } catch {}
    if (!parsed || typeof parsed.body !== "string") {
      return json({ ok: false, error: "ai_bad_output", raw: raw.slice(0, 200) });
    }

    return json({
      ok: true,
      body: parsed.body,
      subject: parsed.subject ?? null,
      channel,
      length: parsed.body.length,
      max: limit.max,
    });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message ?? e) });
  }
};
