import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

export const prerender = false;

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

// Admin-only: wipe all rows from one of the three inbox tables.
// Uses a "delete all where id > 0" pattern because Supabase's REST delete() needs a filter.
const TABLE_MAP: Record<string, string> = {
  inbound: "vonage_inbound_messages",
  status:  "vonage_message_status",
  calls:   "vonage_voice_calls",
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (locals.role !== "super_admin") return json({ ok: false, error: "super_admin_only" });

  let body: any;
  try { body = await request.json(); } catch { return json({ ok: false, error: "bad_json" }); }

  const table = TABLE_MAP[String(body?.table ?? "")];
  if (!table) return json({ ok: false, error: "bad_table" });

  const { error, count } = await supabaseAdmin.from(table).delete({ count: "exact" }).gt("id", 0);
  if (error) return json({ ok: false, error: error.message });

  return json({ ok: true, deleted: count ?? 0 });
};
