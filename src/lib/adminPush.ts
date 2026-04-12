import { supabaseAdmin } from "./supabase";
import { sendWebPush, type VapidKeys } from "./webpush";

export type AdminPushPayload = {
  title: string;
  body: string;
  tag?: string;          // dedup key — later pushes with same tag replace earlier ones
  url?: string;          // click target inside admin (e.g. /admin/reservations)
  urgent?: boolean;
};

function vapidKeys(): VapidKeys | null {
  const publicKey  = import.meta.env.VAPID_PUBLIC_KEY;
  const privateKey = import.meta.env.VAPID_PRIVATE_KEY;
  const subject    = import.meta.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

// Fire-and-forget: sends the payload to every push subscription whose user has role='admin'.
// Stale endpoints are pruned automatically.
export async function pushToAdmins(payload: AdminPushPayload): Promise<void> {
  const keys = vapidKeys();
  if (!keys) return;

  // 1. All admin user ids
  const { data: admins } = await supabaseAdmin
    .from("profiles").select("id").eq("role", "admin");
  if (!admins?.length) return;
  const ids = admins.map((a: any) => a.id);

  // 2. Their push subscriptions
  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions").select("endpoint, p256dh, auth")
    .in("user_id", ids);
  if (!subs?.length) return;

  const body = {
    title: payload.title,
    body:  payload.body,
    url:   payload.url ?? "/admin",
    tag:   payload.tag,
  };

  const stale: string[] = [];
  await Promise.all(subs.map(async (s: any) => {
    try {
      const res = await sendWebPush(
        { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
        body,
        keys,
        { ttl: 3600, urgency: payload.urgent ? "high" : "normal", topic: payload.tag },
      );
      if (res.status === 404 || res.status === 410) stale.push(s.endpoint);
    } catch { /* network — ignore */ }
  }));

  if (stale.length) {
    await supabaseAdmin.from("push_subscriptions").delete().in("endpoint", stale);
  }
}
