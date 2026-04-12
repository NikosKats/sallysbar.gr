import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), { status, headers: { "Content-Type": "application/json" } });
}

// Admin-only debug endpoint. Visit /api/admin/scratch-debug?email=someone@example.com (GET)
// to see exactly what's in the DB for that user.
export const GET: APIRoute = async ({ url, locals }) => {
  if (locals.role !== "admin") return json({ error: "forbidden" }, 403);

  const result: Record<string, unknown> = {};

  const { data: settings, error: sErr } = await supabaseAdmin.from("scratch_settings").select("*").eq("id", 1).maybeSingle();
  result.scratch_settings = settings ?? { error: sErr?.message ?? "no row" };

  const { data: trig, error: tErr } = await supabaseAdmin
    .rpc("pg_get_triggerdef_if_exists", {})
    .then(r => r, () => ({ data: null, error: { message: "rpc_not_available" } }));
  result.trigger_note = tErr ? "cannot introspect from client; check Supabase dashboard → Database → Triggers for trg_issue_signup_scratch on public.profiles" : trig;

  const email = url.searchParams.get("email");
  if (email) {
    // Find user by email
    const { data: users } = await supabaseAdmin.auth.admin.listUsers();
    const user = users?.users?.find(u => (u.email ?? "").toLowerCase() === email.toLowerCase());
    if (!user) { result.user_lookup = `no user found for ${email}`; return json(result); }

    const { data: profile, error: pErr } = await supabaseAdmin
      .from("profiles").select("id, full_name, card_issued_at, created_at").eq("id", user.id).maybeSingle();
    result.user = { id: user.id, email: user.email, created_at: user.created_at };
    result.profile = profile ?? { error: pErr?.message ?? "no profile row (DB trigger on auth.users → profiles may not be set up)" };

    const { data: cards, error: cErr } = await supabaseAdmin
      .from("scratch_cards").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    result.scratch_cards = cErr ? { error: cErr.message } : (cards ?? []);
    result.unrevealed_count = (cards ?? []).filter(c => !c.revealed_at).length;
  } else {
    result.hint = "Pass ?email=<signup-email> to inspect a specific user.";
  }

  return json(result);
};

// POST — manually fire the signup card for a user (bypass the trigger for diagnosis)
export const POST: APIRoute = async ({ request, locals }) => {
  if (locals.role !== "admin") return json({ error: "forbidden" }, 403);
  let body: any;
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400); }
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!email) return json({ error: "missing_email" }, 400);

  const { data: users } = await supabaseAdmin.auth.admin.listUsers();
  const user = users?.users?.find(u => (u.email ?? "").toLowerCase() === email);
  if (!user) return json({ error: "user_not_found" }, 404);

  const { issueScratchCard, expiresAt, getScratchSettings } = await import("../../../lib/scratch");
  const s = await getScratchSettings();
  const n = await issueScratchCard(user.id, "signup", { expires_at: expiresAt(s.default_expires_hours) });

  return json({ ok: true, issued: n, user_id: user.id });
};
