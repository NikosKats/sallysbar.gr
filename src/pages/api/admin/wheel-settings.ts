import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

export const POST: APIRoute = async ({ request, locals }) => {
  if (locals.role !== "admin") return json({ error: "forbidden" }, 403);

  let body: any;
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400); }

  const payload = {
    enabled:         Boolean(body.enabled),
    max_distance_m:  Math.max(10, Math.min(5000, Number(body.max_distance_m ?? 250) | 0)),
    require_country: Boolean(body.require_country),
    allow_remote:    Boolean(body.allow_remote),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseAdmin.from("wheel_settings").update(payload).eq("id", 1);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
};
