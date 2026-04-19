import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

export const prerender = false;

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

// GET  /api/staff/welcome-redeem?code=HEL-A4K9 — look up without changing state
// POST /api/staff/welcome-redeem { code }       — mark it redeemed
export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user || !["staff", "admin", "super_admin"].includes(locals.role ?? "")) {
    return json({ error: "forbidden" }, 403);
  }
  const code = String(url.searchParams.get("code") ?? "").trim().toUpperCase();
  if (!code) return json({ error: "code_required" }, 400);

  const { data: r } = await supabaseAdmin
    .from("welcome_drinks")
    .select("id, code, source, full_name, email, phone, status, issued_at, redeemed_at")
    .eq("code", code)
    .maybeSingle();
  if (!r) return json({ error: "not_found" }, 404);
  return json({ ok: true, welcome: r });
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user || !["staff", "admin", "super_admin"].includes(locals.role ?? "")) {
    return json({ error: "forbidden" }, 403);
  }

  let body: any;
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400); }
  const code = String(body?.code ?? "").trim().toUpperCase();
  if (!code) return json({ error: "code_required" }, 400);

  const { data: r } = await supabaseAdmin
    .from("welcome_drinks")
    .select("id, code, source, full_name, status")
    .eq("code", code)
    .maybeSingle();

  if (!r) return json({ error: "not_found" }, 404);
  if (r.status === "redeemed") return json({ error: "already_redeemed" }, 409);
  if (r.status === "expired")  return json({ error: "expired" }, 409);

  const { error } = await supabaseAdmin
    .from("welcome_drinks")
    .update({
      status: "redeemed",
      redeemed_at: new Date().toISOString(),
      redeemed_by: locals.user.id,
    })
    .eq("id", r.id);
  if (error) return json({ error: error.message }, 500);

  return json({ ok: true, full_name: r.full_name, source: r.source });
};
