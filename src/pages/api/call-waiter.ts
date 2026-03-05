import type { APIRoute } from "astro";
import { sendMessage } from "../../lib/telegram";

export const POST: APIRoute = async ({ request }) => {
  let table: number | undefined;
  try {
    const body = await request.json();
    table = Number(body.table);
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if (!table || isNaN(table)) {
    return json({ error: "Missing table number" }, 400);
  }

  await sendMessage(
    import.meta.env.TELEGRAM_WAITER_CHAT_ID,
    `🔔 <b>Table ${table}</b> is calling for a waiter!`
  );

  return json({ ok: true });
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
