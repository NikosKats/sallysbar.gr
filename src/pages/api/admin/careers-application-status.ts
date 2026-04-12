import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

const ALLOWED = new Set(["new", "reviewed", "interviewed", "accepted", "rejected", "hired", "archived"]);

export const POST: APIRoute = async ({ request, locals }) => {
  if (locals.role !== "admin") return json({ error: "forbidden" }, 403);

  let body: any;
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400); }

  const id = body.id ? String(body.id) : null;
  if (!id) return json({ error: "missing_id" }, 400);

  const patch: Record<string, unknown> = {};
  if (body.status !== undefined) {
    const s = String(body.status);
    if (!ALLOWED.has(s)) return json({ error: "bad_status" }, 400);
    patch.status = s;
  }
  if (body.full_name !== undefined) {
    const v = String(body.full_name).trim();
    if (v.length < 2 || v.length > 120) return json({ error: "bad_name" }, 400);
    patch.full_name = v;
  }
  if (body.email !== undefined) {
    const v = String(body.email).trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return json({ error: "bad_email" }, 400);
    patch.email = v;
  }
  if (body.phone !== undefined) {
    const v = body.phone ? String(body.phone).trim() : null;
    if (v && !/^\+?[\d\s\-()]{6,30}$/.test(v)) return json({ error: "bad_phone" }, 400);
    patch.phone = v;
  }
  if (body.message !== undefined) {
    const v = body.message ? String(body.message) : null;
    if (v && v.length > 5000) return json({ error: "message_too_long" }, 400);
    patch.message = v;
  }
  if (body.cv_url !== undefined) patch.cv_url = body.cv_url ? String(body.cv_url) : null;
  if (body.cv_filename !== undefined) patch.cv_filename = body.cv_filename ? String(body.cv_filename) : null;

  if (Object.keys(patch).length === 0) return json({ error: "nothing_to_update" }, 400);

  const { error } = await supabaseAdmin
    .from("job_applications")
    .update(patch)
    .eq("id", id);

  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
};

export const DELETE: APIRoute = async ({ url, locals }) => {
  if (locals.role !== "admin") return json({ error: "forbidden" }, 403);
  const id = url.searchParams.get("id");
  if (!id) return json({ error: "missing_id" }, 400);
  const { error } = await supabaseAdmin.from("job_applications").delete().eq("id", id);
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
};
