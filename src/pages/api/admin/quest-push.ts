import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";
import { sendWebPush } from "../../../lib/webpush";

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

export const POST: APIRoute = async ({ request, locals }) => {
  if (locals.role !== "admin") return json({ error: "forbidden" }, 403);

  let body: any;
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400); }

  const id = body.id ? String(body.id) : null;
  if (!id) return json({ error: "missing_id" }, 400);

  const { data: q } = await supabaseAdmin.from("quests").select("*").eq("id", id).maybeSingle();
  if (!q) return json({ error: "not_found" }, 404);

  const vapidKeys = {
    publicKey:  import.meta.env.VAPID_PUBLIC_KEY,
    privateKey: import.meta.env.VAPID_PRIVATE_KEY,
    subject:    import.meta.env.VAPID_SUBJECT,
  };
  if (!vapidKeys.publicKey || !vapidKeys.privateKey) return json({ error: "vapid_not_configured" }, 503);

  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth, user_id");

  if (!subs || subs.length === 0) return json({ ok: true, sent: 0, failed: 0 });

  const payload = {
    title: q.title_en,
    body:  q.description_en ?? (q.reward_label_en ? `Complete for ${q.reward_label_en}` : `Complete for +${q.reward_points} pts`),
    url:   q.cta_url || "/loyalty",
    tag:   `quest-${q.id}`,
  };

  let sent = 0, failed = 0;
  const stale: string[] = [];
  await Promise.all(subs.map(async (s: any) => {
    try {
      const res = await sendWebPush({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth }, payload, vapidKeys, { urgency: "high", ttl: 3600 });
      if (res.ok || res.status === 201) sent++;
      else if (res.status === 404 || res.status === 410) { failed++; stale.push(s.endpoint); }
      else failed++;
    } catch { failed++; }
  }));

  if (stale.length) await supabaseAdmin.from("push_subscriptions").delete().in("endpoint", stale);

  await supabaseAdmin.from("quests").update({ push_sent_at: new Date().toISOString() }).eq("id", q.id);

  return json({ ok: true, sent, failed, pruned: stale.length });
};
