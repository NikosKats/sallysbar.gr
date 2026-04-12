import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

export const POST: APIRoute = async ({ request }) => {
  let body: any;
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400); }

  const full_name = String(body.full_name ?? "").trim();
  const email     = String(body.email ?? "").trim();
  const phone     = body.phone ? String(body.phone).trim() : null;
  const message   = body.message ? String(body.message).trim() : null;
  const job_id    = body.job_id ? String(body.job_id) : null;

  if (full_name.length < 2 || full_name.length > 120) return json({ error: "bad_name" }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))      return json({ error: "bad_email" }, 400);
  if (phone && !/^\+?[\d\s\-()]{6,30}$/.test(phone))  return json({ error: "bad_phone" }, 400);
  if (message && message.length > 2000)                return json({ error: "message_too_long" }, 400);

  const { error } = await supabaseAdmin.from("job_applications").insert({
    job_id, full_name, email, phone, message,
  });
  if (error) return json({ error: error.message }, 500);

  return json({ ok: true });
};
