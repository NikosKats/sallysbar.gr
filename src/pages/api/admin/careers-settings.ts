import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

export const POST: APIRoute = async ({ request, locals }) => {
  if (locals.role !== "admin") return json({ error: "forbidden" }, 403);

  let body: any;
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400); }

  const notify_email = body.notify_email ? String(body.notify_email).trim() : null;
  const notify_enabled = Boolean(body.notify_enabled ?? true);

  if (notify_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(notify_email)) {
    return json({ error: "bad_email" }, 400);
  }

  const { error } = await supabaseAdmin
    .from("careers_settings")
    .update({ notify_email, notify_enabled, updated_at: new Date().toISOString() })
    .eq("id", 1);

  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
};
