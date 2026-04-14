import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return json({ error: "auth_required" }, 401);
  const { data: me } = await supabaseAdmin.from("profiles").select("role").eq("id", locals.user.id).maybeSingle();
  if (!me || !["employee", "admin", "super_admin"].includes(me.role)) return json({ error: "forbidden" }, 403);

  const { data: spins } = await supabaseAdmin
    .from("wheel_spins")
    .select("id, user_id, spun_at, reward_type, reward_label, claim_token")
    .not("claim_token", "is", null)
    .is("claimed_at", null)
    .is("rejected_at", null)
    .order("spun_at", { ascending: true })
    .limit(50);

  if (!spins?.length) return json({ ok: true, spins: [] });
  const ids = Array.from(new Set(spins.map(s => s.user_id)));
  const { data: profs } = await supabaseAdmin.from("profiles").select("id, full_name, avatar_url").in("id", ids);
  const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
  return json({ ok: true, spins: spins.map((s: any) => ({ ...s, user: map.get(s.user_id) ?? { full_name: "Member" } })) });
};
