import type { APIRoute } from "astro";
import Anthropic from "@anthropic-ai/sdk";
import { getMenuAll as getMenu, formatPriceEUR } from "../../lib/menuService";
import { verifyTableToken } from "../../lib/tableToken";

export const POST: APIRoute = async ({ request }) => {
  let table: number;
  let token: string;
  let messages: { role: "user" | "assistant"; content: string }[];
  let lang: "en" | "el";

  try {
    const body = await request.json();
    table    = Number(body.table);
    token    = String(body.token ?? "");
    messages = Array.isArray(body.messages) ? body.messages : [];
    lang     = body.lang === "el" ? "el" : "en";
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if (!table || isNaN(table)) return json({ error: "Missing table" }, 400);
  if (!await verifyTableToken(table, token)) return json({ error: "Forbidden" }, 403);
  if (!messages.length) return json({ error: "No messages" }, 400);

  const apiKey = import.meta.env.ANTHROPIC_API_KEY;
  if (!apiKey) return json({ error: "AI not configured" }, 503);

  // Build menu context
  const { categories, items } = await getMenu(lang);
  const menuLines: string[] = [];
  for (const cat of categories) {
    const catItems = items.filter(i => i.category_id === cat.id);
    if (!catItems.length) continue;
    menuLines.push(`\n## ${cat.name}`);
    for (const item of catItems) {
      const desc = item.description ? ` — ${item.description}` : "";
      menuLines.push(`- ${item.name}: ${formatPriceEUR(item.price_cents)}${desc}`);
    }
  }
  const menuText = menuLines.join("\n");

  const isEl = lang === "el";
  const systemPrompt = isEl
    ? `Είσαι ο φιλικός AI βοηθός του Sally's Bar στη Σκάλα, Κεφαλονιά. Βοηθάς τον πελάτη στο τραπέζι ${table}. Απαντάς για τον κατάλογο, κάνεις προτάσεις ανάλογα με τη διάθεση, εξηγείς τα ποτά. Είσαι ζεστός, σύντομος. Μην αναφέρεις πληροφορίες εκτός καταλόγου. Αν δεν ξέρεις κάτι, πρότεινε να ρωτήσει το προσωπικό.\n\nΚατάλογος:\n${menuText}`
    : `You are the friendly AI assistant of Sally's Bar in Skala, Kefalonia. You help the customer at table ${table}. Answer questions about the menu, suggest drinks based on their mood, explain cocktails. Be warm and concise. Don't invent information not in the menu. If unsure, suggest they ask the staff.\n\nMenu:\n${menuText}`;

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 512,
      system: systemPrompt,
      messages: messages.slice(-10),
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    return json({ text });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "AI error";
    return json({ error: msg }, 500);
  }
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
