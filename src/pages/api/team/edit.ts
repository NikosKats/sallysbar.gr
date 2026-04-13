import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

export const POST: APIRoute = async ({ locals, request }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);
  let body: any;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const id = String(body?.id ?? "");
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  if (!id || !text || text.length > 2000) return json({ error: "Invalid input" }, 400);

  const { data: msg } = await supabaseAdmin
    .from("team_messages").select("user_id, deleted_at").eq("id", id).maybeSingle();
  if (!msg) return json({ error: "Not found" }, 404);
  if (msg.deleted_at) return json({ error: "Deleted" }, 410);
  if (msg.user_id !== locals.user.id) return json({ error: "Forbidden" }, 403);

  const { error } = await supabaseAdmin
    .from("team_messages")
    .update({ body: text, edited_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return json({ error: "Update failed" }, 500);
  return json({ ok: true });
};
