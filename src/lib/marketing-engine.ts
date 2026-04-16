// Unified marketing-automation engine.
// - Reads trigger config from public.marketing_triggers
// - Dedupes via public.marketing_log (cooldown_days in trigger settings)
// - Sends via WhatsApp (Vonage Messages API), SMS, push (existing helper), or email (Resend)
// - Every send is logged whether or not it succeeded
//
// Entry points:
//   runTrigger(key, ctx) → runs one trigger (called from cron + event hooks)
//   runAllCronTriggers() → iterates every enabled trigger whose runner exists

import { supabaseAdmin } from "./supabase";
import { sendMessage, setRuntimeEnv } from "./vonage-messages";
import { pushToAdmins } from "./adminPush";

// Same pattern as vonage-messages: runtime env (CF secrets) arrives via locals.runtime.env,
// NOT via import.meta.env. Callers (routes / cron) pass it once; this module reads it.
let _runtimeEnv: Record<string, any> | null = null;
export function setEngineRuntimeEnv(env: Record<string, any> | null | undefined) {
  _runtimeEnv = env ?? null;
  setRuntimeEnv(env); // propagate to vonage-messages
}
function E(key: string): string {
  const a = _runtimeEnv?.[key];
  if (a != null && String(a)) return String(a);
  const b = (globalThis as any)?.process?.env?.[key];
  if (b != null && String(b)) return String(b);
  return String((import.meta.env as any)?.[key] ?? "");
}

export type TriggerRow = {
  key: string;
  enabled: boolean;
  channel: "whatsapp" | "sms" | "push" | "email";
  settings: Record<string, any>;
};

export type UserMini = {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
};

async function loadTrigger(key: string): Promise<TriggerRow | null> {
  const { data } = await supabaseAdmin
    .from("marketing_triggers").select("*").eq("key", key).maybeSingle();
  return data as TriggerRow | null;
}

async function alreadySent(trigger_key: string, user_id: string, cooldownDays: number): Promise<boolean> {
  if (cooldownDays <= 0) return false;
  const since = new Date(Date.now() - cooldownDays * 86400_000).toISOString();
  const { data } = await supabaseAdmin
    .from("marketing_log")
    .select("id")
    .eq("trigger_key", trigger_key)
    .eq("user_id", user_id)
    .eq("success", true)
    .gte("sent_at", since)
    .limit(1)
    .maybeSingle();
  return !!data;
}

async function logSend(row: {
  trigger_key: string; user_id: string | null; channel: string; to_address?: string | null;
  preview: string; success: boolean; error_text?: string; meta?: any;
}) {
  try {
    await supabaseAdmin.from("marketing_log").insert({
      trigger_key: row.trigger_key,
      user_id: row.user_id,
      channel: row.channel,
      to_address: row.to_address ?? null,
      preview: row.preview.slice(0, 140),
      success: row.success,
      error_text: row.error_text ?? null,
      meta: row.meta ?? {},
    });
  } catch {}
}

function renderTemplate(tpl: string, vars: Record<string, string | number>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}

// ── Single-user dispatch (channel-aware) ────────────────────────────────────
export async function dispatch(opts: {
  trigger: TriggerRow;
  user: UserMini;
  text: string;               // full message text
  cooldown_days?: number;     // overrides settings.cooldown_days
  meta?: any;
}): Promise<{ ok: boolean; error?: string }> {
  const { trigger, user, text } = opts;
  if (!trigger.enabled) return { ok: false, error: "trigger_disabled" };

  const cooldown = opts.cooldown_days ?? Number(trigger.settings?.cooldown_days ?? 0);
  if (cooldown > 0 && await alreadySent(trigger.key, user.id, cooldown)) {
    return { ok: false, error: "cooldown" };
  }

  let result: { ok: boolean; error?: string } = { ok: false };
  let to: string | null = null;

  if (trigger.channel === "whatsapp" || trigger.channel === "sms") {
    if (!user.phone) { result = { ok: false, error: "no_phone" }; }
    else {
      to = user.phone;
      const r = await sendMessage(user.phone, text, { channel: trigger.channel });
      result = r.ok ? { ok: true } : { ok: false, error: r.error };
    }
  } else if (trigger.channel === "email") {
    if (!user.email) { result = { ok: false, error: "no_email" }; }
    else {
      to = user.email;
      const r = await sendResendEmail(user.email, opts.meta?.subject ?? "Sally's Bar", text);
      result = r;
    }
  } else if (trigger.channel === "push") {
    // Customer push (not admin push) — this uses the quest-push pattern.
    to = user.id;
    const r = await sendUserPush(user.id, opts.meta?.title ?? "Sally's Bar", text, opts.meta?.url);
    result = r;
  }

  await logSend({
    trigger_key: trigger.key, user_id: user.id, channel: trigger.channel,
    to_address: to, preview: text, success: result.ok, error_text: result.error, meta: opts.meta,
  });
  return result;
}

// ── Resend email ──
async function sendResendEmail(to: string, subject: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const apiKey = E("RESEND_API_KEY");
  const from = E("RESEND_FROM") || "Sally's Bar <bookings@sallysbar.gr>";
  if (!apiKey) return { ok: false, error: "resend_not_configured" };
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({ from, to, subject, text }),
    });
    if (r.ok) return { ok: true };
    const j: any = await r.json().catch(() => ({}));
    return { ok: false, error: j?.message || `http_${r.status}` };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "network" };
  }
}

// ── User push (via existing push_subscriptions) ──
export async function sendUserPush(user_id: string, title: string, body: string, url = "/account"): Promise<{ ok: boolean; error?: string }> {
  try {
    const publicKey  = E("VAPID_PUBLIC_KEY");
    const privateKey = E("VAPID_PRIVATE_KEY");
    const subject    = E("VAPID_SUBJECT");
    if (!publicKey || !privateKey || !subject) return { ok: false, error: "vapid_not_configured" };
    const { data: subs } = await supabaseAdmin
      .from("push_subscriptions").select("endpoint, p256dh, auth").eq("user_id", user_id);
    if (!subs?.length) return { ok: false, error: "no_subscription" };
    const { sendWebPush } = await import("./webpush");
    let sent = 0;
    const stale: string[] = [];
    await Promise.all(subs.map(async (s: any) => {
      try {
        const res = await sendWebPush(
          { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
          { title, body, url, tag: "marketing" },
          { publicKey, privateKey, subject },
          { ttl: 3600, urgency: "normal" },
        );
        if (res.ok || res.status === 201) sent++;
        else if (res.status === 404 || res.status === 410) stale.push(s.endpoint);
      } catch {}
    }));
    if (stale.length) await supabaseAdmin.from("push_subscriptions").delete().in("endpoint", stale);
    return sent > 0 ? { ok: true } : { ok: false, error: "all_failed" };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "push_failed" };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Trigger runners — each returns { ok, sent, skipped, errors }
// ─────────────────────────────────────────────────────────────────────────
export type TriggerResult = { key: string; sent: number; skipped: number; errors: number; note?: string };

async function loadEnabled(key: string): Promise<TriggerRow | null> {
  const t = await loadTrigger(key);
  return t && t.enabled ? t : null;
}

// 1. Reservation confirmed — called immediately after a booking is inserted.
export async function fireReservationConfirmed(reservation_id: string): Promise<TriggerResult> {
  const trigger = await loadEnabled("reservation_confirmed");
  if (!trigger) return { key: "reservation_confirmed", sent: 0, skipped: 1, errors: 0, note: "disabled" };

  const { data: r } = await supabaseAdmin
    .from("reservations")
    .select("id, user_id, name, phone, party_size, reservation_at, notes")
    .eq("id", reservation_id).maybeSingle();
  if (!r) return { key: "reservation_confirmed", sent: 0, skipped: 1, errors: 0, note: "not_found" };

  const user = await userForReservation(r);
  if (!user?.phone) return { key: "reservation_confirmed", sent: 0, skipped: 1, errors: 0, note: "no_phone" };

  const d = new Date(r.reservation_at);
  const when = d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  const text = renderTemplate(
    "🍸 Sally's Bar — your table for {party} is confirmed for {when}.\nSee you then in Skala!\nNeed to cancel? Reply here.",
    { party: r.party_size, when },
  );
  const res = await dispatch({ trigger, user, text, meta: { reservation_id } });

  // Optional: group-booking bonus
  if (res.ok && r.party_size >= 6) {
    const bonusTrigger = await loadEnabled("group_booking_bonus");
    if (bonusTrigger) {
      await dispatch({
        trigger: bonusTrigger, user, cooldown_days: 7, meta: { reservation_id },
        text: "🎉 Bringing a group of " + r.party_size + "? Your group gets a free bottle of house wine on arrival. Show this message to the waiter!",
      });
    }
  }
  return { key: "reservation_confirmed", sent: res.ok ? 1 : 0, skipped: 0, errors: res.ok ? 0 : 1 };
}

// 2. 2h-before reminder — cron every 15 min finds reservations starting in ~120 min.
export async function cronReservationReminders(): Promise<TriggerResult> {
  const trigger = await loadEnabled("reservation_reminder_2h");
  if (!trigger) return { key: "reservation_reminder_2h", sent: 0, skipped: 1, errors: 0 };

  const lead = Number(trigger.settings?.lead_minutes ?? 120);
  const now = Date.now();
  const windowStart = new Date(now + (lead - 10) * 60_000).toISOString();
  const windowEnd   = new Date(now + (lead + 10) * 60_000).toISOString();
  const { data: rs } = await supabaseAdmin
    .from("reservations")
    .select("id, user_id, name, phone, party_size, reservation_at")
    .gte("reservation_at", windowStart).lte("reservation_at", windowEnd);
  const pageHandle = E("PUBLIC_FB_PAGE_HANDLE") || "sallysbar";
  let sent = 0, errs = 0;
  for (const r of (rs ?? []) as any[]) {
    const u = await userForReservation(r);
    if (!u?.phone) continue;
    // dedup: one reminder per reservation via meta match
    const { data: prev } = await supabaseAdmin.from("marketing_log")
      .select("id").eq("trigger_key", "reservation_reminder_2h").eq("success", true)
      .contains("meta", { reservation_id: r.id }).limit(1).maybeSingle();
    if (prev) continue;

    // Booster #2 — append Messenger connect link if this user hasn't linked yet.
    // Doubles as a retention hook: "you already trusted us with a booking, link now for updates."
    const { data: prof } = await supabaseAdmin
      .from("profiles").select("messenger_id").eq("id", u.id).maybeSingle();
    const needsLink = !prof?.messenger_id;
    const ctaLine = needsLink
      ? `\n\n💬 Get faster updates — tap to link Messenger (+20 points): https://m.me/${pageHandle}?ref=user_${u.id}`
      : "";

    const t = `⏰ Reminder — your Sally's Bar table for ${r.party_size} is in 2 hours. See you in Skala! 🍸${ctaLine}`;
    const out = await dispatch({ trigger, user: u, text: t, meta: { reservation_id: r.id } });
    out.ok ? sent++ : errs++;
  }
  return { key: "reservation_reminder_2h", sent, skipped: 0, errors: errs };
}

// 3. Birthday — daily at `send_hour` local.
export async function cronBirthday(): Promise<TriggerResult> {
  const trigger = await loadEnabled("birthday");
  if (!trigger) return { key: "birthday", sent: 0, skipped: 1, errors: 0 };
  const today = new Date();
  const mm = String(today.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(today.getUTCDate()).padStart(2, "0");
  const { data: users } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, phone, birthday")
    .not("birthday", "is", null);
  let sent = 0, errs = 0;
  for (const u of (users ?? []) as any[]) {
    if (!u.birthday) continue;
    const b = String(u.birthday);
    if (b.slice(5, 7) !== mm || b.slice(8, 10) !== dd) continue;
    const mini = { id: u.id, full_name: u.full_name, phone: u.phone, email: null };
    const name = (u.full_name || "").split(" ")[0] || "friend";
    const text = `🎂 Happy birthday, ${name}! Your free cocktail is waiting at Sally's Bar tonight. Show this message — valid 24h. See you! 🍸`;
    const out = await dispatch({ trigger, user: mini, text, cooldown_days: 350 });
    out.ok ? sent++ : errs++;
  }
  return { key: "birthday", sent, skipped: 0, errors: errs };
}

// 4. Post-visit review nudge — T+delay after order marked paid (cron every 30min).
export async function cronReviewNudges(): Promise<TriggerResult> {
  const trigger = await loadEnabled("review_nudge");
  if (!trigger) return { key: "review_nudge", sent: 0, skipped: 1, errors: 0 };
  const delayHours = Number(trigger.settings?.delay_hours ?? 24);
  const cooldown = Number(trigger.settings?.cooldown_days ?? 60);
  const since = new Date(Date.now() - (delayHours + 1) * 3600_000).toISOString();
  const until = new Date(Date.now() - delayHours * 3600_000).toISOString();
  const { data: orders } = await supabaseAdmin
    .from("orders")
    .select("id, session_id, paid_at")
    .eq("status", "paid")
    .gte("paid_at", since).lt("paid_at", until);
  let sent = 0, errs = 0;
  const seenUsers = new Set<string>();
  for (const o of (orders ?? []) as any[]) {
    if (!o.session_id) continue;
    const { data: sess } = await supabaseAdmin
      .from("table_sessions").select("customer_user_id").eq("id", o.session_id).maybeSingle();
    const user_id = (sess as any)?.customer_user_id;
    if (!user_id || seenUsers.has(user_id)) continue;
    seenUsers.add(user_id);
    const { data: p } = await supabaseAdmin
      .from("profiles").select("id, full_name, phone").eq("id", user_id).maybeSingle();
    if (!p) continue;
    const mini = { id: p.id, full_name: p.full_name, phone: p.phone, email: null };
    const text = "Hope you had a great night at Sally's! ⭐\n60 seconds to leave a Google review = +100 loyalty points.\nhttps://sallysbar.gr/loyalty";
    const out = await dispatch({ trigger, user: mini, text, cooldown_days: cooldown });
    out.ok ? sent++ : errs++;
  }
  return { key: "review_nudge", sent, skipped: 0, errors: errs };
}

// 5. Inactive 30/60/90 — cron once per day.
export async function cronInactive(days: 30 | 60 | 90): Promise<TriggerResult> {
  const key = `inactive_${days}d`;
  const trigger = await loadEnabled(key);
  if (!trigger) return { key, sent: 0, skipped: 1, errors: 0 };
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const windowEnd = new Date(Date.now() - (days - 1) * 86400_000).toISOString();
  // Users whose last order was exactly `days` days ago (a daily step fires once per user per tier)
  const { data: candidates } = await supabaseAdmin
    .from("profiles").select("id, full_name, phone").not("phone", "is", null);
  let sent = 0, errs = 0;
  for (const u of (candidates ?? []) as any[]) {
    // Find latest order for this user via sessions
    const { data: lastSess } = await supabaseAdmin
      .from("table_sessions").select("created_at").eq("customer_user_id", u.id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!lastSess) continue;
    const last = new Date(lastSess.created_at).getTime();
    if (last > Date.parse(windowEnd) || last < Date.parse(since)) continue;
    const mini = { id: u.id, full_name: u.full_name, phone: u.phone, email: null };
    const copy: Record<number, string> = {
      30: "Hey, been a while! 🍸 Come in this week and your first cocktail is on us. Just show this message.",
      60: "We miss you at Sally's! +100 loyalty points waiting if you visit this week. See you soon. 🍹",
      90: "Still thinking of you 👋 Come back to Sally's Bar this week — free welcome shot + our best table.",
    };
    const text = copy[days];
    const out = await dispatch({ trigger, user: mini, text, cooldown_days: Number(trigger.settings?.cooldown_days ?? 60) });
    out.ok ? sent++ : errs++;
  }
  return { key, sent, skipped: 0, errors: errs };
}

// 6. Happy-hour local push — daily at `send_hour`.
export async function cronHappyHour(): Promise<TriggerResult> {
  const trigger = await loadEnabled("happy_hour_local");
  if (!trigger) return { key: "happy_hour_local", sent: 0, skipped: 1, errors: 0 };
  const { data: users } = await supabaseAdmin
    .from("profiles").select("id, full_name");
  let sent = 0, errs = 0;
  for (const u of (users ?? []) as any[]) {
    const mini = { id: u.id, full_name: u.full_name, phone: null, email: null };
    const text = "⏰ Happy hour starts now at Sally's — €5 cocktails till 20:00 🍸";
    const out = await dispatch({
      trigger, user: mini, text, cooldown_days: 1,
      meta: { title: "🍸 Sally's Happy Hour", url: "/menu" },
    });
    out.ok ? sent++ : errs++;
  }
  return { key: "happy_hour_local", sent, skipped: 0, errors: errs };
}

// 7. Weekly admin digest (Resend email).
export async function cronAdminWeekly(): Promise<TriggerResult> {
  const trigger = await loadEnabled("admin_weekly_digest");
  if (!trigger) return { key: "admin_weekly_digest", sent: 0, skipped: 1, errors: 0 };
  const to = import.meta.env.ADMIN_DIGEST_TO || "";
  if (!to) return { key: "admin_weekly_digest", sent: 0, skipped: 1, errors: 0, note: "no_to" };

  const since = new Date(Date.now() - 7 * 86400_000).toISOString();
  const [
    { count: rCount },
    { count: oCount },
    { data: paid },
    { count: newUsers },
  ] = await Promise.all([
    supabaseAdmin.from("reservations").select("id", { count: "exact", head: true }).gte("created_at", since),
    supabaseAdmin.from("orders").select("id", { count: "exact", head: true }).gte("created_at", since),
    supabaseAdmin.from("orders").select("total_cents").eq("status", "paid").gte("paid_at", since),
    supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", since),
  ]);
  const revenue = (paid ?? []).reduce((s: number, o: any) => s + (o.total_cents ?? 0), 0) / 100;

  const text =
    `📊 Sally's Bar — last 7 days
 • Reservations: ${rCount ?? 0}
 • Orders: ${oCount ?? 0}
 • Revenue: €${revenue.toFixed(2)}
 • New members: ${newUsers ?? 0}

Open the admin dashboard:
https://sallysbar.gr/admin`;

  let errs = 0, sent = 0;
  for (const addr of to.split(",").map(s => s.trim()).filter(Boolean)) {
    const r = await sendResendEmail(addr, "📊 Sally's Bar — weekly digest", text);
    await logSend({
      trigger_key: "admin_weekly_digest", user_id: null, channel: "email",
      to_address: addr, preview: text, success: r.ok, error_text: r.error,
    });
    r.ok ? sent++ : errs++;
  }
  return { key: "admin_weekly_digest", sent, skipped: 0, errors: errs };
}

// Helper: derive a UserMini from a reservation row (handles non-registered bookers too).
async function userForReservation(r: any): Promise<UserMini | null> {
  if (r.user_id) {
    const { data: p } = await supabaseAdmin
      .from("profiles").select("id, full_name, phone").eq("id", r.user_id).maybeSingle();
    if (p) return { id: p.id, full_name: p.full_name, phone: p.phone ?? r.phone, email: null };
  }
  if (r.phone && r.name) {
    return { id: r.id /* anon — log by reservation id */, full_name: r.name, phone: r.phone, email: null };
  }
  return null;
}

// ── Master runner — called by /api/cron/marketing ─────────────────────────
export async function runAllCronTriggers(): Promise<TriggerResult[]> {
  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Athens", hour: "2-digit", hour12: false }).format(now));
  const dow  = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Athens", weekday: "short" }).format(now) === "Sun" ? 0 : 1); // simplistic; only sunday matters
  const out: TriggerResult[] = [];

  out.push(await cronReservationReminders());

  const bday = await loadTrigger("birthday");
  if (bday?.enabled && hour === Number(bday.settings?.send_hour ?? 11)) out.push(await cronBirthday());

  out.push(await cronReviewNudges());

  if (hour === 12) {
    for (const d of [30, 60, 90] as const) out.push(await cronInactive(d));
  }

  const hh = await loadTrigger("happy_hour_local");
  if (hh?.enabled && hour === Number(hh.settings?.send_hour ?? 18)) out.push(await cronHappyHour());

  const dig = await loadTrigger("admin_weekly_digest");
  if (dig?.enabled && dow === 0 && hour === Number(dig.settings?.send_hour ?? 9)) out.push(await cronAdminWeekly());

  return out;
}
