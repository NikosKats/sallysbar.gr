import type { APIRoute } from "astro";
import { createSupabaseServerClient, supabaseAdmin } from "../../../../lib/supabase";

async function requireAdmin(request: Request, cookies: any) {
  const supabase = createSupabaseServerClient(request, cookies);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: profile } = await supabaseAdmin
    .from("profiles").select("role").eq("id", user.id).single();
  return profile?.role === "admin";
}

function json(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!await requireAdmin(request, cookies)) return json({ error: "Forbidden" }, 403);

  const apiKey = import.meta.env.ANTHROPIC_API_KEY;
  if (!apiKey) return json({ error: "ANTHROPIC_API_KEY is not configured" }, 500);

  const body = await request.json().catch(() => null) as { image_base64?: string; image_mime_type?: string } | null;
  if (!body?.image_base64 || !body?.image_mime_type) {
    return json({ error: "image_base64 and image_mime_type required" }, 400);
  }

  const { data: cats } = await supabaseAdmin
    .from("menu_categories")
    .select("id,slug,title_en,title_el")
    .order("sort");
  const catList = (cats ?? []).map((c: any) => `${c.id}: ${c.title_en} / ${c.title_el}`).join("\n");

  const prompt = `You are extracting menu items from a photograph of a restaurant/bar menu.

Existing categories (id: name_en / name_el):
${catList || "(none yet)"}

For every item visible, output JSON. Return ONLY a JSON object of the form:
{ "items": [ { "name_en": string, "name_el": string, "description_en": string, "description_el": string, "price_cents": integer, "category_id": integer | null, "vat_category": "alcoholic" | "non_alcoholic" } ] }

Rules:
- name_en and name_el: provide both. If the menu is only in one language, translate to the other. Keep proper nouns (cocktail names) as-is.
- description_*: copy description if shown, else empty string.
- price_cents: price in euro cents as integer (e.g. €8.50 → 850). If no price visible, use 0.
- category_id: pick the best matching existing category id from the list above. If none fits, use null.
- vat_category: "alcoholic" for alcoholic drinks/cocktails/beer/wine/spirits, "non_alcoholic" for everything else (food, soft drinks, coffee).
- Skip section headers — only extract actual orderable items.
- Output valid JSON only, no markdown fences, no prose.`;

  const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 4096,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: body.image_mime_type, data: body.image_base64 } },
          { type: "text", text: prompt },
        ],
      }],
    }),
  });

  if (!anthropicRes.ok) {
    const errText = await anthropicRes.text();
    return json({ error: `Anthropic API error: ${errText}` }, 500);
  }

  const data: any = await anthropicRes.json();
  const text: string = data?.content?.[0]?.text ?? "";

  let parsed: any;
  try {
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return json({ error: "Could not parse AI response", raw: text }, 500);
  }

  const items = Array.isArray(parsed?.items) ? parsed.items : [];
  return json({ ok: true, items, categories: cats ?? [] });
};
