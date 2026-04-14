import type { APIRoute } from "astro";

export const GET: APIRoute = async ({ request, locals }) => {
  if (!["admin","super_admin"].includes(locals.role ?? "")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const token   = import.meta.env.TELEGRAM_BOT_TOKEN;
  const origin  = new URL(request.url).origin;
  const hookUrl = `${origin}/api/telegram-webhook`;

  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: hookUrl,
      allowed_updates: ["message", "callback_query"],
    }),
  });

  const data = await res.json();

  // Also fetch current webhook info for confirmation
  const infoRes = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
  const info    = await infoRes.json();

  return new Response(
    JSON.stringify({ setWebhook: data, webhookInfo: info }, null, 2),
    { headers: { "Content-Type": "application/json" } }
  );
};
