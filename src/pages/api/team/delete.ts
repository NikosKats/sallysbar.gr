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
  if (!id) return json({ error: "Missing id" }, 400);

  const { data: me } = await supabaseAdmin
    .from("profiles").select("role").eq("id", locals.user.id).maybeSingle();
  const { data: msg } = await supabaseAdmin
    .from("team_messages").select("user_id").eq("id", id).maybeSingle();
  if (!msg) return json({ error: "Not found" }, 404);

  const isOwner = msg.user_id === locals.user.id;
  const isAdmin = me?.role === "admin";
  if (!isOwner && !isAdmin) return json({ error: "Forbidden" }, 403);

  const { error } = await supabaseAdmin
    .from("team_messages")
    .update({ deleted_at: new Date().toISOString(), body: "", image_url: null })
    .eq("id", id);
  if (error) return json({ error: "Delete failed" }, 500);
  return json({ ok: true });
};
