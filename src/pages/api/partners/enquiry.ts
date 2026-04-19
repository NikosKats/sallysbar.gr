import type { APIRoute } from "astro";

export const prerender = false;

function readEnv(locals: any, key: string): string {
  return (locals as any)?.runtime?.env?.[key]
      ?? (globalThis as any)?.process?.env?.[key]
      ?? (import.meta.env as any)?.[key]
      ?? "";
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

function escapeHtml(s: string) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)
  );
}

// Public — anyone can submit a partner-enquiry. We still throttle by IP via
// Cloudflare and rely on the captcha-less form being plain text only.
export const POST: APIRoute = async ({ request, locals }) => {
  let body: any;
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400); }

  const business = String(body?.business ?? "").trim().slice(0, 120);
  const name     = String(body?.name ?? "").trim().slice(0, 120);
  const email    = String(body?.email ?? "").trim().toLowerCase().slice(0, 160);
  const phone    = String(body?.phone ?? "").trim().slice(0, 30);
  const message  = String(body?.message ?? "").trim().slice(0, 1500);

  if (business.length < 2) return json({ error: "bad_business", message: "Please tell us your business name." }, 400);
  if (name.length < 2)     return json({ error: "bad_name",     message: "Please tell us your name." }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "bad_email", message: "That email doesn't look right." }, 400);
  if (message.length < 10) return json({ error: "bad_message",  message: "Please leave a short message (10+ chars)." }, 400);

  // Bot token + chat. Prefer the dedicated partners bot, fall back to the
  // general bot so this still works if no separate bot is provisioned.
  const token  = readEnv(locals, "TELEGRAM_PARTNERS_BOT_TOKEN") || readEnv(locals, "TELEGRAM_BOT_TOKEN");
  const chatId = readEnv(locals, "TELEGRAM_PARTNERS_CHAT_ID")   || readEnv(locals, "TELEGRAM_BOOKING_CHAT_ID");
  if (!token || !chatId) {
    return json({ error: "telegram_not_configured", message: "We received your message but can't deliver it right now — please email hello@sallysbar.gr." }, 503);
  }

  const text = [
    `🤝 <b>New partner enquiry</b>`,
    ``,
    `🏢 <b>${escapeHtml(business)}</b>`,
    `👤 ${escapeHtml(name)}`,
    `✉️ ${escapeHtml(email)}`,
    phone ? `📞 ${escapeHtml(phone)}` : "",
    ``,
    `📝 <i>${escapeHtml(message)}</i>`,
  ].filter(Boolean).join("\n");

  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
    });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) {
      console.error("[partners/enquiry] telegram failed:", j);
      return json({ error: "telegram_send_failed", message: "Telegram rejected the message — please email hello@sallysbar.gr." }, 502);
    }
  } catch (e: any) {
    console.error("[partners/enquiry] telegram exception:", e?.message);
    return json({ error: "network", message: "Network error — please try again or email hello@sallysbar.gr." }, 502);
  }

  return json({ ok: true });
};
