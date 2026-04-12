import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

export const POST: APIRoute = async ({ request, locals }) => {
  if (locals.role !== "admin") return json({ error: "forbidden" }, 403);

  let body: any;
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400); }

  const id = body.id ? String(body.id) : null;
  if (!id) return json({ error: "missing_id" }, 400);

  const action = String(body.action ?? "claim"); // claim | unclaim | void

  if (action === "void") {
    const { error } = await supabaseAdmin.from("scratch_cards").delete().eq("id", id);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, voided: true });
  }

  const claimed_at = action === "unclaim" ? null : new Date().toISOString();
  const { error } = await supabaseAdmin.from("scratch_cards").update({ claimed_at }).eq("id", id);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, claimed_at });
};
