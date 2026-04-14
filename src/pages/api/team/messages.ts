import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

async function requireStaff(userId: string | undefined) {
  if (!userId) return null;
  const { data } = await supabaseAdmin.from("profiles").select("role, full_name").eq("id", userId).maybeSingle();
  if (!data || !["employee", "admin", "super_admin"].includes(data.role)) return null;
  return data;
}

export const GET: APIRoute = async ({ locals, url }) => {
  const me = await requireStaff(locals.user?.id);
  if (!me) return json({ error: "Forbidden" }, 403);

  const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 500);
  const { data: msgs } = await supabaseAdmin
    .from("team_messages")
    .select("id, user_id, body, created_at, image_url, edited_at, deleted_at, reply_to, pinned_at, pinned_by")
    .order("created_at", { ascending: false })
    .limit(limit);

  const ids = Array.from(new Set((msgs ?? []).map(m => m.user_id)));
  const { data: profs } = ids.length
    ? await supabaseAdmin.from("profiles").select("id, full_name, role").in("id", ids)
    : { data: [] };
  const profMap = new Map((profs ?? []).map((p: any) => [p.id, p]));

  // Fetch reply-parent summaries
  const parentIds = Array.from(new Set((msgs ?? []).map((m: any) => m.reply_to).filter(Boolean)));
  const { data: parents } = parentIds.length
    ? await supabaseAdmin.from("team_messages").select("id, user_id, body, image_url, deleted_at").in("id", parentIds)
    : { data: [] };
  const parentMap = new Map((parents ?? []).map((p: any) => [p.id, p]));

  const messages = (msgs ?? []).reverse().map((m: any) => {
    const parent = m.reply_to ? parentMap.get(m.reply_to) : null;
    return {
      id: m.id,
      user_id: m.user_id,
      body: m.body,
      image_url: m.image_url,
      edited_at: m.edited_at,
      deleted_at: m.deleted_at,
      pinned_at: m.pinned_at,
      pinned_by: m.pinned_by,
      reply_to: m.reply_to,
      reply_parent: parent ? {
        id: parent.id,
        body: parent.deleted_at ? "(deleted)" : parent.body,
        has_image: !!parent.image_url,
        author_name: (profMap.get(parent.user_id) as any)?.full_name ?? "Member",
      } : null,
      created_at: m.created_at,
      author_name: (profMap.get(m.user_id) as any)?.full_name ?? "Member",
      author_role: (profMap.get(m.user_id) as any)?.role ?? "employee",
    };
  });

  return json({ messages });
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
