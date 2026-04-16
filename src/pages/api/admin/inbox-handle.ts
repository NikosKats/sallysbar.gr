import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

export const prerender = false;

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

export const POST: APIRoute = async ({ request, locals }) => {
  if (!["admin", "super_admin"].includes(locals.role ?? "")) return json({ ok: false, error: "forbidden" });

  let body: any;
  try { body = await request.json(); } catch { return json({ ok: false, error: "bad_json" }); }
  const id = Number(body?.id);
  if (!Number.isFinite(id)) return json({ ok: false, error: "bad_id" });

  const { error } = await supabaseAdmin
    .from("vonage_inbound_messages").update({ handled: true }).eq("id", id);
  if (error) return json({ ok: false, error: error.message });
  return json({ ok: true });
};
