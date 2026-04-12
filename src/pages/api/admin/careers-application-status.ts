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
  const status = body.status ? String(body.status) : null;
  if (!id) return json({ error: "missing_id" }, 400);
  if (!status || !ALLOWED.has(status)) return json({ error: "bad_status" }, 400);

  const { error } = await supabaseAdmin
    .from("job_applications")
    .update({ status })
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
