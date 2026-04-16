import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

export const prerender = false;

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

// Wholesale cost per message, per channel (EUR, net of VAT).
// Sources (Apr 2026): https://www.vonage.com/communications-apis/pricing/ · Resend pricing page.
// ─────────────────────────────────────────────────────────────────────
// Vonage SMS to Greece (outbound, by MNO — retail):
//   Cosmote   €0.0675/msg    Vodafone   €0.0675/msg
//   Wind/Nova €0.0595/msg    → blended avg ≈ €0.0648
// Vonage WhatsApp Business Platform (Greece, per Meta 2026 categories):
//   Marketing template (business-initiated)   €0.0955/msg   ← campaigns default
//   Utility template   (transactional)        €0.0340/msg
//   Authentication template (OTP)             €0.0340/msg
//   Service conversation (user-initiated ≤24h) €0.0050/msg
// Resend (email): 3,000/mo free; above tier ≈ €0.00033/msg at scale.
// Web Push (VAPID via own server): €0.
// ─────────────────────────────────────────────────────────────────────
// Override any rate via Cloudflare env (e.g. CAMPAIGN_COST_SMS=0.055) if you negotiate.
const num = (v: unknown, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};
const WHOLESALE: Record<string, number> = {
  sms:           num(import.meta.env.CAMPAIGN_COST_SMS,           0.0648),  // Greek MNO blended retail
  whatsapp:      num(import.meta.env.CAMPAIGN_COST_WHATSAPP,      0.0955),  // Marketing template
  viber_service: num(import.meta.env.CAMPAIGN_COST_VIBER,         0.0360),  // Viber service msg, Greece
  messenger:     num(import.meta.env.CAMPAIGN_COST_MESSENGER,     0.0260),  // FB Messenger MAUP (outside 24h)
  instagram:     num(import.meta.env.CAMPAIGN_COST_INSTAGRAM,     0.0260),  // Instagram paid message
  email:         num(import.meta.env.CAMPAIGN_COST_EMAIL,         0.00033), // Resend above free tier
  push:          num(import.meta.env.CAMPAIGN_COST_PUSH,          0),       // Free via VAPID
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (!["admin", "super_admin"].includes(locals.role ?? "")) return json({ ok: false, error: "forbidden" });

  let body: any;
  try { body = await request.json(); } catch { return json({ ok: false, error: "bad_json" }); }

  // Pasted-list mode: we trust the count coming from the UI (already validated + deduped there).
  // Still return the same cost shape so the UI doesn't branch.
  const list: string[] = Array.isArray(body.recipients_list) ? body.recipients_list.filter((x: any) => typeof x === "string" && x.trim()) : [];
  if (list.length > 0) {
    const channel = String(body.channel ?? "sms");
    const unit = WHOLESALE[channel] ?? 0;
    const commissionPct = Math.max(0, Math.min(500, Number(body.commission_pct ?? 50)));
    const wholesale = unit * list.length;
    const commission = wholesale * (commissionPct / 100);
    const billable = wholesale + commission;
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const billable_eur = r2(billable);
    const vat_eur      = r2(billable_eur * 0.24);
    const gross_eur    = r2(billable_eur + vat_eur);
    return json({
      ok: true,
      count: list.length,
      cost: { channel, unit_eur: unit, wholesale_eur: r2(wholesale), commission_pct: commissionPct, commission_eur: r2(commission), billable_eur, vat_eur, gross_eur },
    });
  }

  try {
    const { data: all, error } = await supabaseAdmin
      .from("profiles")
      .select("id, phone, birthday, city, marketing_consent, created_at, messenger_id, instagram_id");
    if (error) return json({ ok: false, error: error.message });

    // Tier + points — compute only if tier filter is used
    let pointsByUser = new Map<string, number>();
    let tierThresholds: { key: string; min: number; max: number }[] = [];
    if (body.tier) {
      const { data: tiers } = await supabaseAdmin.from("loyalty_tiers").select("key, threshold").order("threshold", { ascending: true });
      const thresholds = (tiers ?? []).map((t: any) => ({ key: t.key, min: Number(t.threshold) }));
      tierThresholds = thresholds.map((t, i) => ({
        key: t.key,
        min: t.min,
        max: i < thresholds.length - 1 ? thresholds[i + 1].min - 1 : Number.MAX_SAFE_INTEGER,
      }));
      const { data: events } = await supabaseAdmin.from("loyalty_events").select("user_id, points");
      for (const e of events ?? []) {
        pointsByUser.set(e.user_id, (pointsByUser.get(e.user_id) ?? 0) + Number(e.points ?? 0));
      }
    }

    const m = body.birthday_month ? Number(body.birthday_month) : null;
    const adjusted = (all ?? []).filter((u: any) => {
      if (body.consent && !u.marketing_consent) return false;
      if (body.city && (!u.city || !u.city.toLowerCase().includes(String(body.city).toLowerCase()))) return false;
      const ch = body.channel;
      if ((ch === "sms" || ch === "whatsapp" || ch === "viber_service") && !u.phone) return false;
      if (ch === "messenger" && !u.messenger_id) return false;
      if (ch === "instagram" && !u.instagram_id) return false;
      if (m) {
        if (!u.birthday) return false;
        if (Number(String(u.birthday).slice(5, 7)) !== m) return false;
      }
      if (body.signed_within) {
        const since = Date.now() - Number(body.signed_within) * 86400_000;
        if (!u.created_at || new Date(u.created_at).getTime() < since) return false;
      }
      if (body.tier) {
        const pts = pointsByUser.get(u.id) ?? 0;
        const band = tierThresholds.find(t => pts >= t.min && pts <= t.max);
        if (!band || band.key !== body.tier) return false;
      }
      return true;
    }).length;

    const channel = String(body.channel ?? "sms");
    const unit = WHOLESALE[channel] ?? 0;
    const commissionPct = Math.max(0, Math.min(500, Number(body.commission_pct ?? 50)));
    const wholesale = unit * adjusted;
    const commission = wholesale * (commissionPct / 100);
    const billable = wholesale + commission;

    // Round the NET total first, then derive VAT + gross from the rounded net so
    // what the user sees adds up (avoids "€0.07 + €0.02 = €0.08" rounding mismatch).
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const billable_eur = r2(billable);
    const vat_eur      = r2(billable_eur * 0.24);
    const gross_eur    = r2(billable_eur + vat_eur);

    return json({
      ok: true,
      count: adjusted,
      cost: {
        channel,
        unit_eur: unit,
        wholesale_eur: r2(wholesale),
        commission_pct: commissionPct,
        commission_eur: r2(commission),
        billable_eur,
        vat_eur,
        gross_eur,
      },
    });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message ?? e) });
  }
};
