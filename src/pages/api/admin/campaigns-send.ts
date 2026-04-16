import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";
import { sendMessage } from "../../../lib/vonage-messages";
import { setEngineRuntimeEnv } from "../../../lib/marketing-engine";

export const prerender = false;

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

type Recipient = {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  loyalty_tier?: string | null;
  points?: number | null;
  messenger_id?: string | null;
  instagram_id?: string | null;
};

function renderTemplate(text: string, u: Recipient) {
  return text
    .replace(/\{\{\s*name\s*\}\}/gi, (u.full_name ?? "").split(" ")[0] || "there")
    .replace(/\{\{\s*tier\s*\}\}/gi, u.loyalty_tier ?? "")
    .replace(/\{\{\s*points\s*\}\}/gi, String(u.points ?? 0));
}

// Append a link URL to the message body if provided. Push uses it differently
// (as tap-target via sendPush), so for push we DON'T append — callers should skip.
function appendUrl(body: string, url: string | null | undefined): string {
  if (!url) return body;
  const clean = String(url).trim();
  if (!clean) return body;
  // Don't double-append if the body already contains the exact URL
  if (body.includes(clean)) return body;
  return body.replace(/\s+$/, "") + "\n" + clean;
}

function escapeHtml(s: string) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildEmailHtml(text: string, unsubUrl: string) {
  // Escape HTML first, then auto-linkify any http(s) URLs (or relative "/paths")
  const linkified = escapeHtml(text)
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#b45309;">$1</a>')
    .replace(/\n/g, "<br/>");
  const safe = linkified;
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;padding:28px 28px 20px;color:#1a1a1a;">
        <tr><td style="font-size:15px;line-height:1.55;color:#1a1a1a;">${safe}</td></tr>
        <tr><td style="padding-top:22px;border-top:1px solid #e5e5ea;margin-top:22px;font-size:11px;line-height:1.45;color:#6b6b72;">
          <p style="margin:14px 0 4px;">Sally's Bar · Skala, Kefalonia · <a href="https://sallysbar.gr" style="color:#6b6b72;">sallysbar.gr</a></p>
          <p style="margin:0;">Received this in error or no longer want updates? <a href="${unsubUrl}" style="color:#6b6b72;text-decoration:underline;">Unsubscribe</a>.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

async function sendResendEmail(to: string, subject: string, text: string, userId: string | null): Promise<{ ok: boolean; error?: string }> {
  try {
    const apiKey = import.meta.env.RESEND_API_KEY;
    const from = import.meta.env.RESEND_FROM ?? "Sally's Bar <bookings@sallysbar.gr>";
    if (!apiKey) return { ok: false, error: "resend_not_configured" };

    const unsubUrl = `https://sallysbar.gr/settings?unsubscribe=1${userId ? "&u=" + userId : ""}`;
    const html = buildEmailHtml(text, unsubUrl);

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text,
        html,
        reply_to: "bookings@sallysbar.gr",
        headers: {
          "List-Unsubscribe": `<${unsubUrl}>, <mailto:bookings@sallysbar.gr?subject=unsubscribe>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          "Precedence": "bulk",
        },
      }),
    });
    if (!r.ok) {
      const d = await r.text().catch(() => "");
      return { ok: false, error: `resend_${r.status}: ${d.slice(0, 120)}` };
    }
    return { ok: true };
  } catch (e: any) { return { ok: false, error: String(e?.message ?? e) }; }
}

async function sendPush(user_id: string, title: string, body: string, url: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const { sendUserPush } = await import("../../../lib/marketing-engine");
    return sendUserPush(user_id, title, body, url);
  } catch (e: any) { return { ok: false, error: String(e?.message ?? e) }; }
}

export const POST: APIRoute = async ({ request, locals }) => {
  if (!["admin", "super_admin"].includes(locals.role ?? "")) return json({ ok: false, error: "forbidden" });
  setEngineRuntimeEnv((locals as any).runtime?.env);

  let body: any;
  try { body = await request.json(); } catch { return json({ ok: false, error: "bad_json" }); }

  const channel = String(body.channel ?? "");
  const text    = String(body.body ?? "").trim();
  const subject = String(body.subject ?? "").trim();
  const url     = String(body.url ?? "/account");
  const filters = body.filters ?? {};
  const testOnly = !!body.test_to_me;

  if (!channel || !["whatsapp", "sms", "viber_service", "messenger", "instagram", "push", "email"].includes(channel)) return json({ ok: false, error: "bad_channel" });
  if (!text) return json({ ok: false, error: "empty_body" });
  if (channel === "email" && !subject) return json({ ok: false, error: "subject_required_for_email" });
  if (subject.length > 120) return json({ ok: false, error: "subject_too_long_max_120" });

  // Fetch recipients
  let recipients: Recipient[] = [];

  // Messenger / Instagram: recipient is ALWAYS the platform-scoped ID in the input
  // (these channels don't lookup users from profiles).
  const directRecipId = String((body as any).test_recipient_id ?? "").trim();
  if ((channel === "messenger" || channel === "instagram") && directRecipId) {
    recipients = [{
      id: locals.user?.id ?? "direct",
      full_name: null,
      phone: null,
      email: null,
      loyalty_tier: null,
    }];
  } else if (testOnly) {
    // Send only to the currently-authenticated admin
    const uid = locals.user?.id;
    if (!uid) return json({ ok: false, error: "no_user" });
    const { data } = await supabaseAdmin.from("profiles").select("id, full_name, phone").eq("id", uid).maybeSingle();
    // Fallback chain: profiles.phone → auth user's phone → new_phone (set via OTP flow)
    const authPhone = (locals.user as any)?.phone
                  || (locals.user as any)?.new_phone
                  || (locals.user as any)?.user_metadata?.phone
                  || null;
    const phone = data?.phone || authPhone;
    recipients = [{
      id: uid,
      full_name: data?.full_name ?? null,
      phone: phone ? String(phone) : null,
      email: locals.user?.email ?? null,
      loyalty_tier: null,
    }];
  } else {
    const { data: all, error } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, phone, birthday, city, marketing_consent, created_at, messenger_id, instagram_id");
    if (error) return json({ ok: false, error: error.message });

    const { data: users } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    const emailMap = new Map<string, string>();
    for (const u of users?.users ?? []) emailMap.set(u.id, u.email ?? "");

    // Compute points/tier ONLY if tier filter is used (event-sourced, no column on profiles)
    const pointsByUser = new Map<string, number>();
    const tierByUser = new Map<string, string>();
    if (filters.tier) {
      const { data: tiers } = await supabaseAdmin.from("loyalty_tiers").select("key, threshold").order("threshold", { ascending: true });
      const thresholds = (tiers ?? []).map((t: any) => ({ key: t.key, min: Number(t.threshold) }));
      const bands = thresholds.map((t: any, i: number) => ({
        key: t.key,
        min: t.min,
        max: i < thresholds.length - 1 ? thresholds[i + 1].min - 1 : Number.MAX_SAFE_INTEGER,
      }));
      const { data: events } = await supabaseAdmin.from("loyalty_events").select("user_id, points");
      for (const e of events ?? []) {
        pointsByUser.set(e.user_id, (pointsByUser.get(e.user_id) ?? 0) + Number(e.points ?? 0));
      }
      for (const [uid, pts] of pointsByUser) {
        const band = bands.find((b: any) => pts >= b.min && pts <= b.max);
        if (band) tierByUser.set(uid, band.key);
      }
    }

    const now = Date.now();
    recipients = (all ?? []).filter((u: any) => {
      if (filters.consent && !u.marketing_consent) return false;
      if (filters.tier && tierByUser.get(u.id) !== filters.tier) return false;
      if (filters.city && (!u.city || !u.city.toLowerCase().includes(String(filters.city).toLowerCase()))) return false;
      if (filters.birthday_month) {
        if (!u.birthday) return false;
        if (Number(String(u.birthday).slice(5, 7)) !== Number(filters.birthday_month)) return false;
      }
      if (filters.signed_within) {
        const since = now - Number(filters.signed_within) * 86400_000;
        if (!u.created_at || new Date(u.created_at).getTime() < since) return false;
      }
      // Channel requirements
      if ((channel === "sms" || channel === "whatsapp" || channel === "viber_service") && !u.phone) return false;
      if (channel === "email" && !emailMap.get(u.id)) return false;
      if (channel === "messenger" && !u.messenger_id) return false;
      if (channel === "instagram" && !u.instagram_id) return false;
      return true;
    }).map((u: any) => ({
      id: u.id,
      full_name: u.full_name,
      phone: u.phone,
      email: emailMap.get(u.id) ?? null,
      loyalty_tier: tierByUser.get(u.id) ?? null,
      points: pointsByUser.get(u.id) ?? 0,
      messenger_id: u.messenger_id ?? null,
      instagram_id: u.instagram_id ?? null,
    }));
  }

  const total = recipients.length;
  if (total === 0) return json({ ok: false, error: "no_recipients" });

  // Campaign ID for logging
  const campaignKey = "campaign_" + Date.now().toString(36);

  let sent = 0, skipped = 0, errors = 0;
  const BATCH_DELAY_MS = channel === "sms" || channel === "whatsapp" ? 150 : 0;

  for (const u of recipients) {
    // For non-push channels, append the optional URL to the end of the body
    const baseText = renderTemplate(text, u);
    const personalised = channel === "push" ? baseText : appendUrl(baseText, url);
    let ok = false, errText: string | null = null, toAddr: string | null = null;
    let messageUuid: string | null = null;

    try {
      if (channel === "sms" || channel === "whatsapp" || channel === "viber_service") {
        if (!u.phone) { skipped++; continue; }
        toAddr = u.phone;
        const r = await sendMessage(u.phone, personalised, { channel: channel as any });
        ok = r.ok;
        if (r.ok) messageUuid = r.message_uuid;
        else errText = r.error;
      } else if (channel === "messenger" || channel === "instagram") {
        // Prefer the stored platform-scoped ID on the profile;
        // fall back to the admin's "Recipient ID" override for one-off tests.
        const stored = channel === "messenger" ? u.messenger_id : u.instagram_id;
        const recipId = stored || String((body as any).test_recipient_id ?? "").trim();
        if (!recipId) { skipped++; continue; }
        toAddr = recipId;
        const r = await sendMessage(recipId, personalised, { channel: channel as any });
        ok = r.ok;
        if (r.ok) messageUuid = r.message_uuid;
        else errText = r.error;
      } else if (channel === "email") {
        if (!u.email) { skipped++; continue; }
        toAddr = u.email;
        const r = await sendResendEmail(u.email, subject, personalised, u.id);
        ok = r.ok;
        if (!r.ok) errText = r.error ?? null;
      } else if (channel === "push") {
        toAddr = u.id;
        const r = await sendPush(u.id, subject, personalised, url);
        ok = r.ok;
        if (!r.ok) errText = r.error ?? null;
      }
    } catch (e: any) {
      errText = String(e?.message ?? e);
    }

    if (ok) sent++; else errors++;

    await supabaseAdmin.from("marketing_log").insert({
      trigger_key: campaignKey,
      user_id: u.id,
      channel,
      to_address: toAddr,
      preview: personalised.slice(0, 200),
      success: ok,
      error_text: errText,
      meta: {
        test: testOnly,
        subject: channel === "email" ? subject : undefined,
        message_uuid: messageUuid ?? undefined,  // used by /api/vonage/status to match delivery
      },
    });

    if (BATCH_DELAY_MS) await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
  }

  return json({ ok: true, campaign: campaignKey, total, sent, skipped, errors });
};
