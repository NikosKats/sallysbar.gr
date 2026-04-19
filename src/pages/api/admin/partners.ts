import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

export const prerender = false;

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
function requireAdmin(locals: any) {
  return ["admin", "super_admin"].includes(locals.role ?? "");
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;

function pickFields(body: any): Record<string, any> {
  const out: Record<string, any> = {};
  if (typeof body.name === "string")              out.name = body.name.trim().slice(0, 120);
  if (typeof body.short_description === "string") out.short_description = body.short_description.trim().slice(0, 280) || null;
  if (typeof body.long_description === "string")  out.long_description  = body.long_description.trim().slice(0, 2000) || null;
  if (typeof body.website_url === "string")       out.website_url       = body.website_url.trim().slice(0, 500) || null;
  if (typeof body.google_business_url === "string") out.google_business_url = body.google_business_url.trim().slice(0, 500) || null;
  if (typeof body.google_maps_url === "string")     out.google_maps_url     = body.google_maps_url.trim().slice(0, 1500) || null;
  if (typeof body.logo_url === "string")          out.logo_url          = body.logo_url.trim().slice(0, 500) || null;
  if (typeof body.city === "string")              out.city              = body.city.trim().slice(0, 120) || null;
  if (typeof body.distance_from_bar === "string") out.distance_from_bar = body.distance_from_bar.trim().slice(0, 60) || null;
  if (typeof body.gift_label === "string") {
    const v = body.gift_label.trim().slice(0, 120);
    if (v) out.gift_label = v;
  }
  if (typeof body.code_prefix === "string") {
    const v = body.code_prefix.trim().toUpperCase().slice(0, 6);
    if (v && /^[A-Z0-9]+$/.test(v)) out.code_prefix = v;
  }
  if (typeof body.require_email_otp === "boolean") out.require_email_otp = body.require_email_otp;
  if (typeof body.require_phone_otp === "boolean") out.require_phone_otp = body.require_phone_otp;
  if (typeof body.allow_facebook_login === "boolean") out.allow_facebook_login = body.allow_facebook_login;
  if (body.commission_per_redeem_eur != null) {
    const n = Number(body.commission_per_redeem_eur);
    if (Number.isFinite(n) && n >= 0) out.commission_per_redeem_eur = n;
  }
  if (typeof body.monthly_report_email === "string") out.monthly_report_email = body.monthly_report_email.trim().toLowerCase().slice(0, 160) || null;
  if (typeof body.notes === "string")                out.notes                = body.notes.trim().slice(0, 2000) || null;
  if (typeof body.active === "boolean")              out.active = body.active;
  if (typeof body.visible_on_public_page === "boolean") out.visible_on_public_page = body.visible_on_public_page;
  if (body.sort_order != null) {
    const n = Number(body.sort_order);
    if (Number.isInteger(n)) out.sort_order = n;
  }
  return out;
}

// GET /api/admin/partners — list all
export const GET: APIRoute = async ({ locals }) => {
  if (!requireAdmin(locals)) return json({ error: "forbidden" }, 403);
  const { data, error } = await supabaseAdmin
    .from("partners").select("*").order("sort_order").order("name");
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, partners: data ?? [] });
};

// POST /api/admin/partners — create. Required: slug, name.
export const POST: APIRoute = async ({ request, locals }) => {
  if (!requireAdmin(locals)) return json({ error: "forbidden" }, 403);
  let body: any = {};
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400); }

  const slug = String(body?.slug ?? "").trim().toLowerCase();
  if (!SLUG_RE.test(slug)) return json({ error: "bad_slug", message: "Slug: lowercase a-z, 0-9, hyphens (3-32 chars)." }, 400);

  const fields = pickFields(body);
  if (!fields.name || fields.name.length < 2) return json({ error: "bad_name" }, 400);
  if (!fields.code_prefix) fields.code_prefix = slug.slice(0, 3).toUpperCase().padEnd(3, "X");

  const { data, error } = await supabaseAdmin
    .from("partners").insert({ slug, ...fields }).select("*").single();
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, partner: data });
};

// PATCH /api/admin/partners — update. Body must include slug.
export const PATCH: APIRoute = async ({ request, locals }) => {
  if (!requireAdmin(locals)) return json({ error: "forbidden" }, 403);
  let body: any = {};
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400); }

  const slug = String(body?.slug ?? "").trim().toLowerCase();
  if (!SLUG_RE.test(slug)) return json({ error: "bad_slug" }, 400);

  const fields = pickFields(body);
  if (Object.keys(fields).length === 0) return json({ error: "nothing_to_update" }, 400);
  fields.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("partners").update(fields).eq("slug", slug).select("*").maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!data) return json({ error: "not_found" }, 404);
  return json({ ok: true, partner: data });
};

// DELETE /api/admin/partners — delete by slug. Body: { slug }
export const DELETE: APIRoute = async ({ request, locals }) => {
  if (!requireAdmin(locals)) return json({ error: "forbidden" }, 403);
  let body: any = {};
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400); }

  const slug = String(body?.slug ?? "").trim().toLowerCase();
  if (!SLUG_RE.test(slug)) return json({ error: "bad_slug" }, 400);

  const { error } = await supabaseAdmin.from("partners").delete().eq("slug", slug);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
};
