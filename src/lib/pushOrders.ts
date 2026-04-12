import { supabaseAdmin } from "./supabase";
import { sendWebPush, type VapidKeys } from "./webpush";

type OrderPushPayload = {
  title: string;
  body: string;
  tag?: string;
  url?: string;
};

function vapidKeys(): VapidKeys | null {
  const publicKey = import.meta.env.VAPID_PUBLIC_KEY;
  const privateKey = import.meta.env.VAPID_PRIVATE_KEY;
  const subject = import.meta.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

export async function pushToAllStaff(payload: OrderPushPayload): Promise<void> {
  const keys = vapidKeys();
  if (!keys) { console.warn("VAPID keys not configured — skipping push"); return; }

  // Staff-only: join push_subscriptions to profiles and keep role IN (employee, admin).
  const { data: staffIds } = await supabaseAdmin
    .from("profiles").select("id").in("role", ["employee", "admin"]);
  if (!staffIds?.length) return;

  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .in("user_id", staffIds.map((u: any) => u.id));

  if (!subs?.length) return;

  const stale: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        const res = await sendWebPush(
          { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
          payload,
          keys,
          { ttl: 60, urgency: "high", topic: payload.tag },
        );
        if (res.status === 404 || res.status === 410) stale.push(s.endpoint);
        else if (!res.ok) console.warn("push failed", res.status, await res.text().catch(() => ""));
      } catch (e) {
        console.warn("push error", e);
      }
    }),
  );

  if (stale.length) {
    await supabaseAdmin.from("push_subscriptions").delete().in("endpoint", stale);
  }
}

// Helpers per status
export async function pushOrderCreated(order: { id: string; table_number: number; total_cents: number; round_number: number }) {
  const round = order.round_number > 1 ? ` (Round ${order.round_number})` : "";
  return pushToAllStaff({
    title: `🍹 New order — Table ${order.table_number}${round}`,
    body: `Total €${(order.total_cents / 100).toFixed(2)} · #${order.id.slice(0, 8)}`,
    tag: `order-${order.id}`,
    url: "/staff",
  });
}

export async function pushToUser(userId: string, payload: OrderPushPayload): Promise<void> {
  const keys = vapidKeys();
  if (!keys) return;
  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userId);
  if (!subs?.length) return;
  const stale: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        const res = await sendWebPush(
          { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
          payload,
          keys,
          { ttl: 3600, urgency: "high", topic: payload.tag },
        );
        if (res.status === 404 || res.status === 410) stale.push(s.endpoint);
      } catch (e) { console.warn("push error", e); }
    }),
  );
  if (stale.length) {
    await supabaseAdmin.from("push_subscriptions").delete().in("endpoint", stale);
  }
}

export async function pushOrderStatus(order: { id: string; table_number: number; status: string }) {
  const map: Record<string, { emoji: string; label: string }> = {
    preparing: { emoji: "🔄", label: "Preparing" },
    ready:     { emoji: "✅", label: "Ready to serve" },
    delivered: { emoji: "📦", label: "Delivered" },
    cancelled: { emoji: "❌", label: "Cancelled" },
    paid:      { emoji: "💶", label: "Paid" },
  };
  const m = map[order.status];
  if (!m) return;
  return pushToAllStaff({
    title: `${m.emoji} ${m.label} — Table ${order.table_number}`,
    body: `Order #${order.id.slice(0, 8)}`,
    tag: `order-${order.id}`,
    url: "/staff",
  });
}
