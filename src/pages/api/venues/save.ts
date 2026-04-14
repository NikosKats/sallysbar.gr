import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

export const POST: APIRoute = async ({ locals, request }) => {
  if (locals.role !== "super_admin") return json({ error: "Forbidden" }, 403);

  let body: any;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const slug = String(body.slug ?? "").trim().toLowerCase();
  if (!/^[a-z0-9-]{2,40}$/.test(slug)) return json({ error: "slug must be 2–40 lowercase / digits / dashes" }, 400);

  const payload = {
    slug,
    display_name: String(body.display_name ?? slug),
    domain:       body.domain       ?? null,
    contact_name: body.contact_name ?? null,
    contact_email:body.contact_email?? null,
    contact_phone:body.contact_phone?? null,
    tier:         body.tier         ?? "starter",
    status:       body.status       ?? "prospect",
    billing_model:body.billing_model?? "seasonal_annual",
    season_start: body.season_start || null,
    season_end:   body.season_end   || null,
    setup_fee_eur: body.setup_fee_eur ? Number(body.setup_fee_eur) : null,
    recurring_eur: body.recurring_eur ? Number(body.recurring_eur) : null,
    supabase_ref: body.supabase_ref ?? null,
    pages_project:body.pages_project?? null,
    notes:        body.notes        ?? null,
    deployed_at:  body.deployed_at  || null,
    supabase_url:         body.supabase_url         ?? null,
    supabase_dashboard:   body.supabase_dashboard   ?? null,
    cloudflare_pages_url: body.cloudflare_pages_url ?? null,
    cloudflare_dashboard: body.cloudflare_dashboard ?? null,
    fb_app_id:            body.fb_app_id            ?? null,
    fb_dashboard:         body.fb_dashboard         ?? null,
    admin_bootstrap_email:body.admin_bootstrap_email?? null,
    github_repo:          body.github_repo          ?? null,
    last_deploy_version:  body.last_deploy_version  ?? null,
    updated_at:   new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from("saas_venues")
    .upsert(payload, { onConflict: "slug" })
    .select("*")
    .single();

  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, venue: data });
};

export const DELETE: APIRoute = async ({ locals, request }) => {
  if (locals.role !== "super_admin") return json({ error: "Forbidden" }, 403);
  let body: any;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const slug = String(body.slug ?? "");
  if (!slug) return json({ error: "slug required" }, 400);
  await supabaseAdmin.from("saas_venues").delete().eq("slug", slug);
  return json({ ok: true });
};
