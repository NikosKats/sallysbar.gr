import type { APIRoute } from "astro";
import Anthropic from "@anthropic-ai/sdk";

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

export const POST: APIRoute = async ({ request, locals }) => {
  if (!["admin","super_admin"].includes(locals.role ?? "")) return json({ error: "forbidden" }, 403);

  let body: any;
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400); }

  const brief = String(body.brief ?? "").trim();
  if (brief.length < 3) return json({ error: "brief_required" }, 400);

  const apiKey = import.meta.env.ANTHROPIC_API_KEY;
  if (!apiKey) return json({ error: "ai_not_configured" }, 503);

  const origin = "https://sallysbar.gr";

  const system = `You design high-converting QR-code marketing campaigns for Sally's Bar — a lively cocktail bar in Skala, Kefalonia, Greece. Audience: tourists (UK, cruise passengers, island visitors), expats, and locals.

Given a short brief, pick the single best landing page from this exact list (pick ONE target_url — do not invent):
- ${origin}/book          (book a table — best when the goal is reservations)
- ${origin}/menu          (view cocktails/food menu)
- ${origin}/events        (tonight's / upcoming events)
- ${origin}/loyalty       (loyalty / rewards signup)
- ${origin}/careers       (hiring staff)
- ${origin}/?lang=en      (English landing for UK/tourist audiences)
- https://www.google.com/maps/dir//Sally's+Bar,+Skala+280+86   (Google Maps directions)
- https://www.google.com/maps/place/Sally's+Bar/@38.0748829,18.5557617,8z   (Google review page)
- https://www.instagram.com/sallys_bar/   (Instagram follow)
- https://wa.me/306946272083   (WhatsApp chat)

Return ONLY a single JSON object (no markdown, no commentary) with these exact keys:
{
  "name": string,              // punchy English name, <= 40 chars
  "slug": string,              // url-safe slug 3-30 chars, lowercase-with-dashes
  "description": string,       // 1-2 sentences explaining the offer / hook (English)
  "target_url": string,        // EXACTLY one of the URLs above
  "utm_source": string,        // where the QR is printed (e.g. "coaster", "flyer", "port", "hotel", "taxi", "instagram", "cruise-terminal")
  "utm_medium": string,        // typically "qr" for printed QR or "print" for non-QR print
  "utm_campaign": string,      // short campaign identifier, lowercase-dashes
  "utm_content": string,       // variant (e.g. "v1", "coaster-a4", "cruise-aug")
  "headline_en": string,       // big bold poster line, <= 60 chars
  "headline_el": string,       // same in Greek
  "subtitle_en": string,       // supporting line, <= 110 chars
  "subtitle_el": string        // same in Greek
}

Do not wrap in code fences.`;

  const user = `Brief: "${brief}"

Think about:
- Which landing page maximizes conversion for this brief?
- What channel / placement (print, coaster, port flyer, hotel rack-card, cruise terminal, taxi, Instagram bio)?
- What hook grabs a distracted tourist's eye?
Return the JSON.`;

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 900,
      system,
      messages: [{ role: "user", content: user }],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    const s = text.indexOf("{"), e = text.lastIndexOf("}");
    if (s < 0 || e < 0) return json({ error: "parse_failed", raw: text }, 502);
    let parsed: any;
    try { parsed = JSON.parse(text.slice(s, e + 1)); }
    catch { return json({ error: "parse_failed", raw: text }, 502); }

    return json({ ok: true, campaign: parsed });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "ai_error";
    return json({ error: msg }, 500);
  }
};
