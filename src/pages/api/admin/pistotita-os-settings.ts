import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";
import { clearPistotitaOsFlagsCache } from "../../../lib/pistotitaOsSettings";

export const prerender = false;

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

// Super-admin only. Flip one of three boolean flags on the singleton row.
export const POST: APIRoute = async ({ request, locals }) => {
  if (locals.role !== "super_admin") return json({ ok: false, error: "super_admin_only" }, 403);

  let body: any;
  try { body = await request.json(); } catch { return json({ ok: false, error: "bad_json" }, 400); }

  const allowed = ["page_enabled", "compare_page_enabled", "footer_link_enabled"];
  const key = String(body?.key ?? "");
  if (!allowed.includes(key)) return json({ ok: false, error: "bad_key" }, 400);
  const enabled = !!body?.enabled;

  const patch: Record<string, any> = {
    [key]: enabled,
    updated_at: new Date().toISOString(),
    updated_by: locals.user?.id ?? null,
  };

  const { error } = await supabaseAdmin
    .from("pistotita_os_settings")
    .update(patch)
    .eq("id", 1);

  if (error) return json({ ok: false, error: error.message }, 500);

  clearPistotitaOsFlagsCache();
  return json({ ok: true, key, enabled });
};
