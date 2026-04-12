import type { APIRoute } from "astro";
import { attemptClaim } from "../../../lib/todos";

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return json({ error: "auth_required" }, 401);
  let body: any;
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400); }
  const key = body.key ? String(body.key) : "";
  if (!key) return json({ error: "missing_key" }, 400);

  const result = await attemptClaim(locals.user.id, key, { clientSignal: body });
  if (!result.ok) return json(result, 400);
  return json(result);
};
