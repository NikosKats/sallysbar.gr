import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.role || !["employee", "admin"].includes(locals.role)) {
    return json({ error: "Unauthorized" }, 401);
  }

  let sub: any;
  try { sub = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const endpoint: string | undefined = sub?.endpoint;
  const p256dh: string | undefined = sub?.keys?.p256dh;
  const auth: string | undefined = sub?.keys?.auth;
  if (!endpoint || !p256dh || !auth) return json({ error: "Invalid subscription" }, 400);

  const { error } = await supabaseAdmin
    .from("push_subscriptions")
    .upsert(
      {
        endpoint,
        p256dh,
        auth,
        user_id: locals.user?.id ?? null,
        user_agent: request.headers.get("user-agent") ?? null,
      },
      { onConflict: "endpoint" },
    );

  if (error) {
    console.error("push subscribe error", error);
    return json({ error: "Database error" }, 500);
  }
  return json({ ok: true });
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  if (!locals.role || !["employee", "admin"].includes(locals.role)) {
    return json({ error: "Unauthorized" }, 401);
  }
  let body: any;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  if (!body?.endpoint) return json({ error: "endpoint required" }, 400);

  await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", body.endpoint);
  return json({ ok: true });
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
