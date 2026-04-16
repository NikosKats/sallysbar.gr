import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

export const prerender = false;

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

// Super-admin only: delete every row in marketing_log that was logged by the
// bulk campaign sender. Trigger-fired messages (birthday, reservation_reminder_2h,
// inactive_30d, etc.) keep their rows so analytics don't get wiped by accident.
export const POST: APIRoute = async ({ locals }) => {
  if (locals.role !== "super_admin") return json({ ok: false, error: "super_admin_only" });

  const { error, count } = await supabaseAdmin
    .from("marketing_log")
    .delete({ count: "exact" })
    .like("trigger_key", "campaign_%");

  if (error) return json({ ok: false, error: error.message });
  return json({ ok: true, deleted: count ?? 0 });
};
