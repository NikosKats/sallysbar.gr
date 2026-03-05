import type { APIRoute } from "astro";
import { sendMessage } from "../../lib/telegram";

export const POST: APIRoute = async ({ request }) => {
  let table: number | undefined;
  let reason: string = "order";
  try {
    const body = await request.json();
    table = Number(body.table);
    if (body.reason === "pay") reason = body.method === "cash" ? "pay-cash" : "pay-card";
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if (!table || isNaN(table)) {
    return json({ error: "Missing table number" }, 400);
  }

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
