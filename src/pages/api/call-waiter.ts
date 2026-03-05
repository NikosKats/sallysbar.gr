import type { APIRoute } from "astro";
import { sendMessage } from "../../lib/telegram";
import { supabaseAdmin } from "../../lib/supabase";

const RATE_LIMIT     = 5;   // max calls per table
const RATE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

async function makeToken(table: number): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(import.meta.env.TABLE_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(String(table)));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

export const POST: APIRoute = async ({ request }) => {
  let table: number | undefined;
  let reason: string = "order";
  let token: string = "";

  try {
    const body = await request.json();
    table  = Number(body.table);
    token  = String(body.token ?? "");
    if (body.reason === "pay") reason = body.method === "cash" ? "pay-cash" : "pay-card";
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if (!table || isNaN(table)) {
    return json({ error: "Missing table number" }, 400);
  }

  // Token validation
  const secret = import.meta.env.TABLE_SECRET;
  if (secret) {
    const expected = await makeToken(table);
    if (token !== expected) {
      return json({ error: "Forbidden" }, 403);
    }
  }

  // Rate limiting: max RATE_LIMIT calls per table per window
  const windowStart = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
  const { count } = await supabaseAdmin
    .from("waiter_calls")
    .select("*", { count: "exact", head: true })
    .eq("table_num", table)
    .gte("called_at", windowStart);

  if ((count ?? 0) >= RATE_LIMIT) {
    return json({ error: "rate_limit" }, 429);
  }

  // Log the call
  await supabaseAdmin.from("waiter_calls").insert({ table_num: table });

  const msg =
    reason === "pay-card" ? `💳 <b>Table ${table}</b> wants to pay by <b>card</b>!` :
    reason === "pay-cash" ? `💵 <b>Table ${table}</b> wants to pay by <b>cash</b>!` :
    `🔔 <b>Table ${table}</b> is calling for a waiter to order!`;

  await sendMessage(import.meta.env.TELEGRAM_WAITER_CHAT_ID, msg);

  return json({ ok: true });
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
