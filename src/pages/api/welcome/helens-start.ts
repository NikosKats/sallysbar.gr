import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";
import { sendEmail, escapeHtml } from "../../../lib/email";
import { verifyStart } from "../../../lib/vonage";
import { getWelcomeSettings } from "../../../lib/welcome-settings";

export const prerender = false;

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

function sixDigitOtp(): string {
  const buf = new Uint8Array(3);
  crypto.getRandomValues(buf);
  return String((buf[0] << 16 | buf[1] << 8 | buf[2]) % 1_000_000).padStart(6, "0");
}

function maskEmail(e: string) {
  const [local, domain] = e.split("@");
  if (!domain) return e;
  const shown = local.length <= 2 ? local[0] : local.slice(0, 2);
  return `${shown}${"*".repeat(Math.max(1, local.length - 2))}@${domain}`;
}
function maskPhone(p: string) {
  return p.length <= 4 ? p : `${p.slice(0, 3)}…${p.slice(-2)}`;
}

// Step 1 of Helen's welcome signup:
//  - validates inputs + dedupes
//  - creates (or finds) the Sally's auth user (password stored, email unverified)
//  - sends an email OTP via Resend
//  - fires a Vonage Verify SMS OTP
// All state is stashed in httpOnly cookies so the verify endpoint can complete
// the handshake without a separate DB table.
export const POST: APIRoute = async ({ request, cookies, locals }) => {
  let body: any;
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400); }

  const full_name = String(body.full_name ?? "").trim().slice(0, 120);
  const email     = String(body.email ?? "").trim().toLowerCase().slice(0, 160);
  const phone     = String(body.phone ?? "").trim().replace(/[^\d+]/g, "");
  const password  = String(body.password ?? "");
  const marketing = Boolean(body.marketing);

  // If the caller is already authenticated (e.g. signed in with Facebook),
  // we don't need a new password — we'll reuse their session.
  const alreadyAuthed = !!(locals as any)?.user?.id;

  if (full_name.length < 2)                       return json({ error: "name_too_short",  message: "Please enter your full name." }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))  return json({ error: "bad_email",       message: "That email doesn't look right." }, 400);
  if (!/^\+\d{8,15}$/.test(phone))                return json({ error: "bad_phone",       message: "Phone must include country code (e.g. +306943649190)." }, 400);
  if (!alreadyAuthed && password.length < 6)      return json({ error: "weak_password",   message: "Password must be at least 6 characters." }, 400);

  // Load runtime toggles — owner may disable one or both OTP channels.
  const settings = await getWelcomeSettings();

  // Dedupe: email OR phone already claimed for Helen's.
  const [emailHit, phoneHit] = await Promise.all([
    supabaseAdmin.from("welcome_drinks").select("id, code, status")
      .eq("source", "helens").ilike("email", email).in("status", ["issued","redeemed"]).maybeSingle(),
    supabaseAdmin.from("welcome_drinks").select("id, code, status")
      .eq("source", "helens").eq("phone", phone).in("status", ["issued","redeemed"]).maybeSingle(),
  ]);
  const existing = emailHit?.data ?? phoneHit?.data;
  if (existing?.status === "redeemed") {
    return json({ error: "already_redeemed", message: "This email or phone has already used its welcome drink. See you at the bar!" }, 409);
  }
  if (existing?.status === "issued") {
    // Already mid-flow — tell caller so they can go straight to /verify.
    return json({ ok: true, already_issued: true, message: "You already have a pending code — please verify or check your SMS/email." }, 200);
  }

  // If the caller is already authenticated (Facebook / Google etc.), reuse
  // that user — no createUser needed. Otherwise, create an email+password
  // account. email_confirm:false because we'll flip it to true ourselves
  // once the email OTP is entered.
  let userId: string | null = alreadyAuthed ? ((locals as any).user.id as string) : null;
  if (!alreadyAuthed) {
    try {
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        email, password,
        email_confirm: false,
        user_metadata: { full_name, phone, source: "helens_welcome" },
      });
      if (created?.user) userId = created.user.id;
      if (error && !/already/i.test(error.message)) {
        console.warn("[helens-start] createUser error:", error.message);
      }
    } catch (e: any) {
      console.warn("[helens-start] createUser exception:", e?.message);
    }
  }

  // If the email was already taken, look up that user's id so we still
  // associate welcome_drinks correctly.
  if (!userId) {
    try {
      const { data } = await supabaseAdmin.rpc("get_user_id_by_email", { p_email: email }) as any;
      if (typeof data === "string") userId = data;
    } catch {}
  }

  // Send email OTP via Resend — only if required.
  let emailOtp = "";
  if (settings.require_email_otp) {
    emailOtp = sixDigitOtp();
    try {
      await sendEmail({
        to: email,
        subject: "Sally's Bar — your verification code",
        html: `
          <div style="font-family:system-ui,sans-serif;max-width:420px;margin:0 auto;padding:24px;color:#111">
            <h2 style="margin:0 0 12px">Verify your email</h2>
            <p>Hi ${escapeHtml(full_name)},</p>
            <p>Your verification code for Sally's Bar is:</p>
            <div style="background:#f6f6f6;border-radius:12px;padding:20px;text-align:center;font:700 28px/1 ui-monospace,Menlo,monospace;letter-spacing:6px;margin:16px 0">${emailOtp}</div>
            <p style="color:#666;font-size:12px">The code expires in 10 minutes. If you didn't request it, ignore this email.</p>
          </div>`,
        text: `Your Sally's Bar verification code is ${emailOtp} (expires in 10 min).`,
      });
    } catch (e: any) {
      console.warn("[helens-start] email send failed:", e?.message);
    }
  }

  // Send phone OTP via Vonage Verify — only if required.
  let vonageReqId = "";
  if (settings.require_phone_otp) {
    const phoneDigits = phone.replace(/\D/g, "");
    try {
      const r = await verifyStart(phoneDigits, { brand: "Sally's Bar" });
      if (r.ok) vonageReqId = r.request_id;
      else console.warn("[helens-start] verifyStart failed:", (r as any).error);
    } catch (e: any) {
      console.warn("[helens-start] verifyStart exception:", e?.message);
    }
  }

  // Pack the pending-flow state into short-lived httpOnly cookies. 10-min TTL.
  const ten = 10 * 60;
  cookies.set("w_otp",   emailOtp,                 { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: ten });
  cookies.set("w_req",   vonageReqId,              { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: ten });
  cookies.set("w_email", email,                    { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: ten });
  cookies.set("w_phone", phone,                    { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: ten });
  cookies.set("w_name",  full_name,                { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: ten });
  cookies.set("w_mkt",   marketing ? "1" : "0",    { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: ten });
  cookies.set("w_uid",   userId ?? "",             { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: ten });

  return json({
    ok: true,
    require_email_otp: settings.require_email_otp,
    require_phone_otp: settings.require_phone_otp,
    gift_label: settings.gift_label,
    email_masked: maskEmail(email),
    phone_masked: maskPhone(phone),
    phone_channel_ok: !!vonageReqId || !settings.require_phone_otp,
  });
};
