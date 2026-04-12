import { supabaseAdmin } from "./supabase";

export type LoyaltySettings = {
  points_per_euro: number;
  min_order_cents: number;
  double_point_dows: number[];
  birthday_multiplier: number;
  referral_points: number;
  event_rsvp_points: number;
};

export type LoyaltyTier = {
  key: string;
  label_en: string;
  label_el: string;
  icon: string;
  color: string;
  threshold: number;
  perk_en: string;
  perk_el: string;
  sort_order: number;
};

export type LoyaltyReward = {
  id: string;
  name_en: string;
  name_el: string;
  description_en: string;
  description_el: string;
  cost: number;
  active: boolean;
  sort_order: number;
};

export async function getLoyaltySettings(): Promise<LoyaltySettings> {
  const { data } = await supabaseAdmin
    .from("loyalty_settings")
    .select("points_per_euro, min_order_cents, double_point_dows, birthday_multiplier, referral_points, event_rsvp_points")
    .eq("id", 1)
    .maybeSingle();
  return {
    points_per_euro:     Number(data?.points_per_euro ?? 1),
    min_order_cents:     Number(data?.min_order_cents ?? 0),
    double_point_dows:   (data?.double_point_dows ?? []) as number[],
    birthday_multiplier: Number(data?.birthday_multiplier ?? 2),
    referral_points:     Number(data?.referral_points ?? 50),
    event_rsvp_points:   Number(data?.event_rsvp_points ?? 20),
  };
}

export async function getTiers(): Promise<LoyaltyTier[]> {
  const { data } = await supabaseAdmin
    .from("loyalty_tiers")
    .select("*")
    .order("threshold", { ascending: true });
  return (data ?? []) as LoyaltyTier[];
}

export async function getRewards(activeOnly = false): Promise<LoyaltyReward[]> {
  let q = supabaseAdmin.from("loyalty_rewards").select("*").order("sort_order", { ascending: true });
  if (activeOnly) q = q.eq("active", true);
  const { data } = await q;
  return (data ?? []) as LoyaltyReward[];
}

export function currentTier(tiers: LoyaltyTier[], points: number): LoyaltyTier | null {
  const eligible = tiers.filter(t => points >= t.threshold).sort((a, b) => b.threshold - a.threshold);
  return eligible[0] ?? tiers[0] ?? null;
}

export function nextTier(tiers: LoyaltyTier[], points: number): LoyaltyTier | null {
  return tiers.filter(t => t.threshold > points).sort((a, b) => a.threshold - b.threshold)[0] ?? null;
}

export async function getBalance(userId: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from("loyalty_events")
    .select("points")
    .eq("user_id", userId);
  return (data ?? []).reduce((s, e) => s + (e.points ?? 0), 0);
}

async function isBirthdayMonth(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin.from("profiles").select("birthday").eq("id", userId).maybeSingle();
  if (!data?.birthday) return false;
  const bd = new Date(data.birthday);
  return bd.getUTCMonth() === new Date().getUTCMonth();
}

export async function awardOrderPoints(order: {
  id: string;
  customer_user_id: string | null;
  total_cents: number;
}): Promise<number> {
  if (!order.customer_user_id) return 0;
  const settings = await getLoyaltySettings();
  if (order.total_cents < settings.min_order_cents) return 0;

  let multiplier = 1;
  const now = new Date();
  if (settings.double_point_dows.includes(now.getDay())) multiplier = 2;
  if (await isBirthdayMonth(order.customer_user_id)) {
    multiplier = Math.max(multiplier, settings.birthday_multiplier);
  }

  const base = (order.total_cents * settings.points_per_euro) / 100;
  const points = Math.floor(base * multiplier);
  if (points <= 0) return 0;

  const { error } = await supabaseAdmin.from("loyalty_events").insert({
    user_id: order.customer_user_id,
    points,
    reason: `order:${order.id}`,
  });

  if (error && !error.message?.includes("duplicate")) {
    console.error("[loyalty] award error:", error.message);
    return 0;
  }
  return points;
}

export async function awardPointsForOrderIds(orderIds: string[]): Promise<void> {
  if (!orderIds.length) return;
  const { data: orders } = await supabaseAdmin
    .from("orders")
    .select("id, customer_user_id, total_cents")
    .in("id", orderIds);
  for (const o of orders ?? []) {
    await awardOrderPoints(o as any);
  }
}

export async function awardEventRsvpPoints(userId: string, eventId: string): Promise<number> {
  const settings = await getLoyaltySettings();
  if (settings.event_rsvp_points <= 0) return 0;
  const { error } = await supabaseAdmin.from("loyalty_events").insert({
    user_id: userId,
    points: settings.event_rsvp_points,
    reason: `rsvp:${eventId}`,
  });
  if (error && !error.message?.includes("duplicate")) {
    console.error("[loyalty] rsvp award error:", error.message);
    return 0;
  }
  return settings.event_rsvp_points;
}

export async function awardReferralPoints(referrerId: string, newUserId: string): Promise<number> {
  const settings = await getLoyaltySettings();
  if (settings.referral_points <= 0) return 0;
  const { error } = await supabaseAdmin.from("loyalty_events").insert({
    user_id: referrerId,
    points: settings.referral_points,
    reason: `referral:${newUserId}`,
  });
  if (error && !error.message?.includes("duplicate")) return 0;
  return settings.referral_points;
}

export function parseLoyaltyCode(code: string): string | null {
  const m = code.trim().match(/^loyalty:([0-9a-f-]{36})$/i);
  return m ? m[1] : null;
}

export function generateRedemptionCode(): string {
  // 8-char uppercase alphanum, readable
  const alpha = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 8; i++) s += alpha[Math.floor(Math.random() * alpha.length)];
  return s;
}
