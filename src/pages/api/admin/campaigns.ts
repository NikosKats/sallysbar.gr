import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

function slugify(s: string) {
  return s.toLowerCase()
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || `c-${Math.random().toString(36).slice(2, 8)}`;
}

export const POST: APIRoute = async ({ request, locals }) => {
  if (!["admin","super_admin"].includes(locals.role ?? "")) return json({ error: "forbidden" }, 403);

  let body: any;
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400); }

  const name = String(body.name ?? "").trim();
  const target_url = String(body.target_url ?? "").trim();
  if (name.length < 2) return json({ error: "name_required" }, 400);
  try { new URL(target_url); } catch { return json({ error: "bad_target_url" }, 400); }

  const slug = body.slug ? slugify(String(body.slug)) : slugify(name);

  const row: Record<string, unknown> = {
    name,
    slug,
    target_url,
    description:  body.description?.toString().trim() || null,
    utm_source:   body.utm_source?.toString().trim()   || null,
    utm_medium:   body.utm_medium?.toString().trim()   || null,
    utm_campaign: body.utm_campaign?.toString().trim() || null,
    utm_content:  body.utm_content?.toString().trim()  || null,
    active: Boolean(body.active ?? true),
    updated_at: new Date().toISOString(),
  };

  if (body.id) {
    const { error } = await supabaseAdmin.from("campaigns").update(row).eq("id", body.id);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, id: body.id, slug });
  } else {
    const { data, error } = await supabaseAdmin.from("campaigns").insert(row).select("id, slug").single();
    if (error) {
      if (error.code === "23505") return json({ error: "slug_taken" }, 409);
      return json({ error: error.message }, 500);
    }
    return json({ ok: true, id: data?.id, slug: data?.slug });
  }
};

export const DELETE: APIRoute = async ({ url, locals }) => {
  if (!["admin","super_admin"].includes(locals.role ?? "")) return json({ error: "forbidden" }, 403);
  const id = url.searchParams.get("id");
  if (!id) return json({ error: "missing_id" }, 400);
  const { error } = await supabaseAdmin.from("campaigns").delete().eq("id", id);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
};
