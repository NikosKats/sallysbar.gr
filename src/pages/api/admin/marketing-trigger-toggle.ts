import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";
import { sendMessage } from "../../../lib/vonage-messages";
import {
  fireReservationConfirmed, cronReservationReminders, cronBirthday,
  cronReviewNudges, cronInactive, cronHappyHour, cronAdminWeekly,
  setEngineRuntimeEnv,
} from "../../../lib/marketing-engine";

export const prerender = false;

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

export const POST: APIRoute = async ({ request, locals }) => {
  if (!["admin", "super_admin"].includes(locals.role ?? "")) return json({ error: "forbidden" }, 403);
  setEngineRuntimeEnv((locals as any).runtime?.env);

  let body: any;
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400); }

  const action = String(body?.action ?? "save");
  const key = String(body?.key ?? "");
  if (!key) return json({ error: "missing_key" }, 400);

  if (action === "test") {
    const to = String(body?.to ?? "").trim();
    const channel = String(body?.channel ?? "whatsapp");
    if (!to) return json({ error: "missing_to" }, 400);
    const text = `🧪 Sally's Bar test — trigger: "${key}" (${channel}). If you got this, the integration works.`;
    try {
      if (channel === "email") {
        const apiKey = import.meta.env.RESEND_API_KEY;
        const from = import.meta.env.RESEND_FROM ?? "Sally's Bar <bookings@sallysbar.gr>";
        if (!apiKey) return json({ ok: false, error: "resend_not_configured" });
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ from, to: [to], subject: `🧪 Test — ${key}`, text }),
        });
        const detail = await r.text().catch(() => "");
        if (!r.ok) return json({ ok: false, error: `resend_${r.status}: ${detail.slice(0, 200)}` });
        return json({ ok: true });
      }
      if (channel === "whatsapp" || channel === "sms") {
        const r = await sendMessage(to, text, { channel });
        if (!r.ok) return json({ ok: false, error: r.error ?? "send_failed", vonage_status: r.status });
        return json({ ok: true, message_uuid: r.message_uuid });
      }
      if (channel === "push") {
        return json({ ok: false, error: "push_test_requires_user_id_not_supported" });
      }
      return json({ ok: false, error: "unknown_channel" });
    } catch (e: any) {
      return json({ ok: false, error: String(e?.message ?? e) });
    }
  }

  if (action === "run") {
    try {
      let r: any;
      if (key === "reservation_reminder_2h") r = await cronReservationReminders();
      else if (key === "birthday") r = await cronBirthday();
      else if (key === "review_nudge") r = await cronReviewNudges();
      else if (key === "inactive_30d") r = await cronInactive(30);
      else if (key === "inactive_60d") r = await cronInactive(60);
      else if (key === "inactive_90d") r = await cronInactive(90);
      else if (key === "happy_hour_local") r = await cronHappyHour();
      else if (key === "admin_weekly_digest") r = await cronAdminWeekly();
      else return json({ error: "not_runnable", hint: "event-driven trigger" }, 400);
      return json({ ok: true, result: r });
    } catch (e: any) {
      return json({ ok: false, error: String(e?.message ?? e) }, 500);
    }
  }

  const patch: any = { updated_at: new Date().toISOString() };
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
  if (typeof body.channel === "string") patch.channel = body.channel;
  if (body.settings && typeof body.settings === "object") patch.settings = body.settings;

  const { error } = await supabaseAdmin.from("marketing_triggers").update(patch).eq("key", key);
  if (error) return json({ error: error.message }, 500);

  return json({ ok: true });
};
