import type { APIRoute } from "astro";
import { verifyCheck } from "../../../lib/vonage";
import { supabaseAdmin } from "../../../lib/supabase";

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

export const POST: APIRoute = async ({ request, locals, cookies }) => {
  if (!locals.user) return json({ error: "auth_required" }, 401);

  let body: any;
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400); }
  const code = String(body?.code ?? "").replace(/\D/g, "").slice(0, 8);
  if (code.length < 4) return json({ error: "invalid_code" }, 400);

  const request_id = cookies.get("verify_req")?.value;
  const phone      = cookies.get("verify_phone")?.value;
  if (!request_id || !phone) return json({ error: "no_active_request" }, 400);

  const r = await verifyCheck(request_id, code);
  if (!r.ok) return json({ error: r.error, status: r.status }, 400);

  // Persist verified phone onto the profile
  await supabaseAdmin.from("profiles").update({ phone }).eq("id", locals.user.id);

  // Clear cookies
  cookies.delete("verify_req",   { path: "/" });
  cookies.delete("verify_phone", { path: "/" });

  return json({ ok: true, phone });
};
