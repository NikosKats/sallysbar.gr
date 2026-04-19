import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";
import { sendEmail, escapeHtml } from "../../../lib/email";
import { verifyCheck } from "../../../lib/vonage";
import { sendMessage as sendVonageSms, setRuntimeEnv as setVonageEnv } from "../../../lib/vonage-messages";
import { getWelcomeSettings } from "../../../lib/welcome-settings";

export const prerender = false;

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

// Unambiguous alphabet: no 0/O, 1/I/L so staff can read codes aloud.
const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function generateCode(prefix = "HEL"): string {
  const buf = new Uint8Array(4);
  crypto.getRandomValues(buf);
  let s = "";
  for (let i = 0; i < 4; i++) s += ALPHA[buf[i] % ALPHA.length];
  return `${prefix}-${s}`;
}

// Constant-time string compare (same-length, ASCII-only).
function eq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  let body: any;
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400); }

  const emailOtp = String(body?.email_otp ?? "").replace(/\D/g, "").slice(0, 8);
  const phoneOtp = String(body?.phone_otp ?? "").replace(/\D/g, "").slice(0, 8);

  const storedOtp   = cookies.get("w_otp")?.value   ?? "";
  const vonageReqId = cookies.get("w_req")?.value   ?? "";
  const email       = cookies.get("w_email")?.value ?? "";
  const phone       = cookies.get("w_phone")?.value ?? "";
  const fullName    = cookies.get("w_name")?.value  ?? "";
  const marketing   = cookies.get("w_mkt")?.value === "1";
  const userId      = cookies.get("w_uid")?.value   || null;

  if (!email || !phone) {
    return json({ error: "session_expired", message: "Verification session expired — please start again." }, 400);
  }

  const settings = await getWelcomeSettings();

  // 1) Email OTP — only if required
  if (settings.require_email_otp) {
    if (!storedOtp) return json({ error: "session_expired", message: "Verification session expired — please start again." }, 400);
    if (emailOtp.length < 4) return json({ error: "bad_email_otp", message: "Enter the 6-digit code from your email." }, 400);
    if (!eq(emailOtp, storedOtp)) {
      return json({ error: "email_otp_mismatch", message: "The email code doesn't match — check your inbox and try again." }, 400);
    }
  }

  // 2) Phone OTP via Vonage — only if required
  if (settings.require_phone_otp) {
    if (!vonageReqId) {
      return json({ error: "phone_channel_not_started", message: "We couldn't send the SMS code. Please restart." }, 400);
    }
    if (phoneOtp.length < 4) return json({ error: "bad_phone_otp", message: "Enter the 6-digit code from the SMS." }, 400);
    const phoneCheck = await verifyCheck(vonageReqId, phoneOtp);
    if (!phoneCheck.ok) {
      return json({ error: "phone_otp_mismatch", message: "The SMS code is wrong or expired." }, 400);
    }
  }

  // Both OTPs passed. Mark email verified on the auth user, upsert profile.
  if (userId) {
    try {
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        email_confirm: true,
        user_metadata: { full_name: fullName, phone, source: "helens_welcome" },
      });
    } catch (e: any) {
      console.warn("[helens-verify] updateUserById warn:", e?.message);
    }
    try {
      await supabaseAdmin.from("profiles").upsert({
        id: userId,
        full_name: fullName,
        phone,
        source: "helens_welcome",
        marketing_consent: marketing,
      }, { onConflict: "id" });
    } catch (e: any) {
      console.warn("[helens-verify] profile upsert warn:", e?.message);
    }
  }

  // Generate unique welcome code.
  let code = generateCode();
  for (let i = 0; i < 5; i++) {
    const { data: collide } = await supabaseAdmin
      .from("welcome_drinks").select("id").eq("code", code).maybeSingle();
    if (!collide) break;
    code = generateCode();
  }

  const { error: insertErr } = await supabaseAdmin.from("welcome_drinks").insert({
    code, source: "helens",
    user_id: userId, full_name: fullName, email, phone,
  });
  if (insertErr) {
    console.error("[helens-verify] insert failed:", insertErr.message);
    return json({ error: "db_error", message: "Something went wrong saving your code. Please try again." }, 500);
  }

  // Clear the one-shot verification cookies.
  ["w_otp","w_req","w_email","w_phone","w_name","w_mkt","w_uid"].forEach(k => cookies.delete(k, { path: "/" }));

  // Fire-and-forget deliveries so the success screen shows instantly. Cloudflare
  // keeps the worker alive via ctx.waitUntil.
  setVonageEnv((locals as any)?.runtime?.env);
  const ctx = (locals as any)?.runtime?.ctx;
  const firstName = fullName.split(" ")[0] || "there";
  const giftLabel = settings.gift_label;
  const deliveries = (async () => {
    try {
      const text = `Welcome to Sally's Bar! Show this code at the bar for your ${giftLabel}: ${code}. See you soon, ${firstName}! Reply STOP to opt out.`;
      const r = await sendVonageSms(phone, text, { channel: "sms" });
      if (!r.ok) console.warn("[helens-verify] SMS failed:", (r as any).error);
    } catch (e: any) { console.warn("[helens-verify] SMS err:", e?.message); }

    try {
      await sendEmail({
        to: email,
        subject: `Your Sally's Bar welcome gift — code ${code}`,
        html: `
          <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111">
            <h2 style="margin:0 0 12px">🍹 Your ${escapeHtml(giftLabel)} is ready</h2>
            <p>Hi ${escapeHtml(firstName)},</p>
            <p>Show this code to the bar staff at Sally's Bar to claim your ${escapeHtml(giftLabel)}:</p>
            <div style="background:linear-gradient(135deg,#fde68a,#fbbf24);border-radius:16px;padding:24px;text-align:center;font:900 32px/1 ui-monospace,Menlo,monospace;letter-spacing:6px;margin:16px 0;color:#111">${escapeHtml(code)}</div>
            <p>We're on the main square in Skala — <a href="https://www.sallysbar.gr/directions">directions here</a>.</p>
            <p style="color:#666;font-size:12px">One per guest. Valid for the duration of your Helen's stay.</p>
          </div>`,
        text: `Your Sally's Bar code: ${code}. Show it at the bar for your ${giftLabel}.`,
      });
    } catch (e: any) { console.warn("[helens-verify] email err:", e?.message); }

    try {
      const { pushToAdmins } = await import("../../../lib/adminPush");
      await pushToAdmins({
        title: "🍹 Helen's welcome signup",
        body: `${fullName} · code ${code}`,
        url: "/admin/welcome-helens",
        tag: `welcome-${code}`,
      });
    } catch {}
  })();
  if (ctx?.waitUntil) ctx.waitUntil(deliveries);

  return json({ ok: true, code });
};
