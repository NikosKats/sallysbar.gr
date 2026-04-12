import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";
import { issueScratchCard } from "../../../lib/scratch";

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

export const POST: APIRoute = async ({ request, locals }) => {
  if (locals.role !== "admin") return json({ error: "forbidden" }, 403);

  let body: any;
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400); }

  const mode    = String(body.mode ?? "single");
  const trigger = String(body.trigger ?? "admin");
  const expires_at = body.expires_at ? new Date(body.expires_at).toISOString() : null;

  if (mode === "single") {
    const user_id = body.user_id ? String(body.user_id) : null;
    if (!user_id) return json({ error: "missing_user_id" }, 400);
    const n = await issueScratchCard(user_id, trigger, { expires_at, count: 1 });
    return json({ ok: true, issued: n });
  }

  if (mode === "all-members") {
    // Every registered auth user (whether or not a profiles row exists yet).
    const { data: list } = await supabaseAdmin.auth.admin.listUsers({ perPage: 500 });
    const members = (list?.users ?? []).map(u => ({ id: u.id }));
    if (!members || members.length === 0) return json({ ok: true, issued: 0 });
    let issued = 0;
    for (const m of members as any[]) {
      issued += await issueScratchCard(m.id, trigger, { expires_at, count: 1 });
    }
    return json({ ok: true, issued });
  }

  return json({ error: "bad_mode" }, 400);
};
