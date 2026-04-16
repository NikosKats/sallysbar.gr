import type { APIRoute } from "astro";
import { verifyStart } from "../../../lib/vonage";

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

// Normalise a phone number to E.164 digits (strip spaces, dashes, leading +/00 keeps +).
function normalisePhone(input: string): string {
  const s = String(input).trim();
  if (!s) return "";
  const plus = s.startsWith("+");
  const digits = s.replace(/\D/g, "");
  return plus ? `+${digits}` : digits;
}

export const POST: APIRoute = async ({ request, locals, cookies }) => {
  if (!locals.user) return json({ error: "auth_required" }, 401);
  let body: any;
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400); }

  const phone = normalisePhone(String(body?.phone ?? ""));
  if (!phone || phone.replace(/\D/g, "").length < 8) return json({ error: "invalid_phone" }, 400);

  // Vonage expects digits only, no leading +
  const number = phone.replace(/\D/g, "");

  // Basic per-user throttle: 1 send per minute (stored in short-lived cookie).
  const last = cookies.get("verify_last")?.number ?? 0;
  if (Date.now() - last < 60_000) return json({ error: "rate_limited", retry_in: 60 - Math.floor((Date.now() - last) / 1000) }, 429);

  const configured = !!import.meta.env.VONAGE_API_KEY && !!import.meta.env.VONAGE_SIGNATURE_SECRET;
  if (!configured) {
    return json({
      error: "vonage_not_configured",
      hint: "Upload VONAGE_API_KEY + VONAGE_SIGNATURE_SECRET as Cloudflare Pages secrets. The .env file only works in dev.",
    }, 500);
  }

  const r = await verifyStart(number);
  if (!r.ok) return json({ error: r.error, status: r.status }, 502);

  // Store request_id in an httpOnly cookie so the check endpoint can look it up
  // without the client being able to forge it.
  cookies.set("verify_req", r.request_id, {
    httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 10 * 60,
  });
  cookies.set("verify_phone", phone, {
    httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 10 * 60,
  });
  cookies.set("verify_last", String(Date.now()), {
    httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 2 * 60,
  });

  return json({ ok: true });
};
