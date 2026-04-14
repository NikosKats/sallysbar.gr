import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";
import { sendWebPush, type VapidKeys } from "../../../lib/webpush";

function vapid(): VapidKeys | null {
  const publicKey = import.meta.env.VAPID_PUBLIC_KEY;
  const privateKey = import.meta.env.VAPID_PRIVATE_KEY;
  const subject = import.meta.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

export const POST: APIRoute = async ({ locals, request }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);

  const { data: me } = await supabaseAdmin
    .from("profiles").select("role, full_name").eq("id", locals.user.id).maybeSingle();
  if (!me || !["employee", "admin", "super_admin"].includes(me.role)) return json({ error: "Forbidden" }, 403);

  let body: any;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  const imageUrl = typeof body?.image_url === "string" ? body.image_url.trim().slice(0, 500) : "";
  const replyTo = typeof body?.reply_to === "string" && /^[0-9a-f-]{36}$/i.test(body.reply_to) ? body.reply_to : null;
  if ((!text && !imageUrl) || text.length > 2000) return json({ error: "Invalid body" }, 400);

  const { data: msg, error } = await supabaseAdmin
    .from("team_messages")
    .insert({ user_id: locals.user.id, body: text || "", image_url: imageUrl || null, reply_to: replyTo })
    .select("id, user_id, body, created_at, image_url, reply_to")
    .single();
  if (error || !msg) return json({ error: "Insert failed" }, 500);

  // Fire-and-forget push to all other staff/admin
  (async () => {
    const keys = vapid();
    if (!keys) return;
    const { data: team } = await supabaseAdmin
      .from("profiles").select("id").in("role", ["employee", "admin", "super_admin"]);
    const ids = (team ?? []).map((p: any) => p.id).filter((id: string) => id !== locals.user!.id);
    if (!ids.length) return;
    const { data: subs } = await supabaseAdmin
      .from("push_subscriptions").select("endpoint, p256dh, auth").in("user_id", ids);
    if (!subs?.length) return;
    const preview = text.length > 120 ? text.slice(0, 120) + "…" : text;
    const payload = {
      title: `💬 ${me.full_name ?? "Team"}`,
      body: preview,
      url: "/staff/chat",
      tag: "team-chat",
    };
    const stale: string[] = [];
    await Promise.all(subs.map(async (s: any) => {
      try {
        const res = await sendWebPush(
          { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
          payload, keys, { ttl: 3600, urgency: "normal", topic: "team-chat" },
        );
        if (res.status === 404 || res.status === 410) stale.push(s.endpoint);
      } catch {}
    }));
    if (stale.length) await supabaseAdmin.from("push_subscriptions").delete().in("endpoint", stale);
  })().catch(() => {});

  return json({
    message: {
      ...msg,
      author_name: me.full_name ?? "Member",
      author_role: me.role,
    },
  });
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
