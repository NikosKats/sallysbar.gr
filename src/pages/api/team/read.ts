import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

export const POST: APIRoute = async ({ locals }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);
  await supabaseAdmin.from("team_reads").upsert(
    { user_id: locals.user.id, last_read_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
  return json({ ok: true });
};

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return json({ unread: 0 });
  const { data: me } = await supabaseAdmin
    .from("profiles").select("role").eq("id", locals.user.id).maybeSingle();
  if (!me || !["employee", "admin"].includes(me.role)) return json({ unread: 0 });

  const { data: read } = await supabaseAdmin
    .from("team_reads").select("last_read_at").eq("user_id", locals.user.id).maybeSingle();
  const since = read?.last_read_at ?? "1970-01-01";
  const { count } = await supabaseAdmin
    .from("team_messages")
    .select("id", { count: "exact", head: true })
    .gt("created_at", since)
    .neq("user_id", locals.user.id);
  return json({ unread: count ?? 0 });
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
