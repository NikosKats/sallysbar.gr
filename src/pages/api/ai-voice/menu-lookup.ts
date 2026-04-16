import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";
import { isVapiAuthed, parseVapiToolCall, vapiToolResponse, authDiag, corsHeaders, corsPreflight } from "../../../lib/vapi-auth";

export const prerender = false;

// Vapi function-call tool: the assistant invokes this when the caller asks
// menu-related questions ("do you have mojitos?", "what's the cheapest beer?",
// "anything gluten-free?"). We fuzzy-match against visible menu items and
// return up to 5 results for the agent to read back.
//
// Expected arguments:
//   query : free-text search string
//   lang  : optional 'en' | 'el' (defaults to en)

type Row = {
  name_en: string;
  name_el: string | null;
  description_en: string | null;
  description_el: string | null;
  price_cents: number;
  currency: string;
  tags: string[] | null;
  menu_categories: { title_en: string; title_el: string | null } | null;
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (!isVapiAuthed(request, locals)) {
    return new Response(JSON.stringify({ error: "unauthorised", diag: authDiag(request, locals) }), { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders() } });
  }

  const { args, toolCallId } = await parseVapiToolCall(request);
  const query = String(args?.query ?? "").trim().toLowerCase().slice(0, 120);
  const lang = String(args?.lang ?? "en").toLowerCase() === "el" ? "el" : "en";

  if (!query) {
    return vapiToolResponse({ ok: false, message: "What are you looking for on the menu?" }, toolCallId);
  }

  // Full scan — menu size is tiny (a few hundred items max), cheaper and simpler
  // than building a full-text index for this one-off read.
  const { data: items, error } = await supabaseAdmin
    .from("menu_items")
    .select(`
      name_en, name_el, description_en, description_el,
      price_cents, currency, tags,
      menu_categories ( title_en, title_el )
    `)
    .eq("is_visible", true)
    .limit(500);

  if (error) {
    return vapiToolResponse({ ok: false, message: "I can't reach the menu right now. Want me to get the manager to call you back?" }, toolCallId);
  }

  const q = query.replace(/\s+/g, " ").trim();
  const terms = q.split(" ").filter(Boolean);

  // Simple scoring: +5 full substring match in name, +3 per term in name,
  // +2 per term in description, +3 per tag hit. Return top 5.
  const scored = (items ?? []).map((it: any) => {
    const name = `${it.name_en ?? ""} ${it.name_el ?? ""}`.toLowerCase();
    const desc = `${it.description_en ?? ""} ${it.description_el ?? ""}`.toLowerCase();
    const tags = (it.tags ?? []).map((t: string) => t.toLowerCase());
    let score = 0;
    if (name.includes(q)) score += 5;
    for (const term of terms) {
      if (name.includes(term)) score += 3;
      if (desc.includes(term)) score += 2;
      if (tags.some((t: string) => t.includes(term))) score += 3;
    }
    return { it, score };
  })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  if (scored.length === 0) {
    return vapiToolResponse({ ok: true, results: [], message: `I couldn't find anything on the menu matching "${query}". Want me to check with the bartender?` }, toolCallId);
  }

  const results = scored.map(({ it }: { it: Row }) => ({
    name: lang === "el" && it.name_el ? it.name_el : it.name_en,
    description: lang === "el" && it.description_el ? it.description_el : it.description_en,
    category: lang === "el" && it.menu_categories?.title_el ? it.menu_categories.title_el : it.menu_categories?.title_en,
    price_eur: ((it.price_cents ?? 0) / 100).toFixed(2),
    currency: it.currency || "EUR",
    tags: it.tags ?? [],
  }));

  // Build a short natural-language summary so the agent has something ready-to-speak
  const short = results.map(r =>
    `${r.name} ${r.currency === "EUR" ? "€" : r.currency}${r.price_eur}${r.description ? " — " + r.description : ""}`,
  ).join("; ");

  return vapiToolResponse({
    ok: true,
    results,
    summary: short,
  }, toolCallId);
};

export const GET: APIRoute = async () =>
  new Response(JSON.stringify({ ok: true, endpoint: "ai-voice/menu-lookup" }), {
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });

export const OPTIONS: APIRoute = async () => corsPreflight();
