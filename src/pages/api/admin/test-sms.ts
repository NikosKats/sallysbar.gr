import type { APIRoute } from "astro";
import { sendMessage, setRuntimeEnv } from "../../../lib/vonage-messages";

export const prerender = false;

// Admin-only: send a one-off SMS to any number. Used from /admin/reservations
// to verify Vonage credentials + sender ID + carrier delivery without having
// to create a real reservation.
export const POST: APIRoute = async ({ request, locals }) => {
  if (!["admin", "super_admin"].includes(locals.role ?? "")) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  let body: any = {};
  try { body = await request.json(); }
  catch { return new Response(JSON.stringify({ error: "bad_json" }), { status: 400 }); }

  const to = String(body?.to ?? "").trim().replace(/[^\d+]/g, "");
  const text = String(body?.text ?? "").trim().slice(0, 900);
  if (!/^\+\d{8,15}$/.test(to)) {
    return new Response(JSON.stringify({ error: "invalid_to (expected E.164 like +306943649190)" }), { status: 400 });
  }
  if (!text) {
    return new Response(JSON.stringify({ error: "missing_text" }), { status: 400 });
  }

  setRuntimeEnv((locals as any)?.runtime?.env);
  const result = await sendMessage(to, text, { channel: "sms" });
  return new Response(JSON.stringify({ to, result }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
