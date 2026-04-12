import { supabaseAdmin } from "./supabase";

// Weighted reward pool. Tune weights to control your cost-per-card.
export const SCRATCH_POOL = [
  { type: "points",     value: 10,  label_en: "+10 points",         label_el: "+10 πόντοι",             weight: 40 },
  { type: "points",     value: 25,  label_en: "+25 points",         label_el: "+25 πόντοι",             weight: 25 },
  { type: "points",     value: 50,  label_en: "+50 points",         label_el: "+50 πόντοι",             weight: 12 },
  { type: "points",     value: 100, label_en: "+100 points",        label_el: "+100 πόντοι",            weight: 6 },
  { type: "free_shot",  value: 1,   label_en: "Free shot 🥃",        label_el: "Δωρεάν σφηνάκι 🥃",      weight: 8 },
  { type: "discount",   value: 10,  label_en: "10% off next round", label_el: "10% στην επόμενη γύρα",  weight: 5 },
  { type: "free_drink", value: 1,   label_en: "Free cocktail 🍸",    label_el: "Δωρεάν cocktail 🍸",     weight: 3 },
  { type: "custom",     value: 0,   label_en: "Skip-the-line pass", label_el: "Pass χωρίς ουρά",        weight: 1 },
] as const;

export function rollReward() {
  const total = SCRATCH_POOL.reduce((s, r) => s + r.weight, 0);
  let roll = Math.random() * total;
  for (const r of SCRATCH_POOL) {
    if ((roll -= r.weight) <= 0) return r;
  }
  return SCRATCH_POOL[0];
}

export type ScratchSettings = {
  auto_on_order: boolean;
  order_min_cents: number;
  cards_per_order: number;
  auto_on_rsvp: boolean;
  auto_on_checkin: boolean;
  auto_on_referral: boolean;
  daily_drop_enabled: boolean;
  daily_drop_hour: number;
  birthday_enabled: boolean;
  default_expires_hours: number | null;
};

const DEFAULTS: ScratchSettings = {
  auto_on_order: false, order_min_cents: 500, cards_per_order: 1,
  auto_on_rsvp: false, auto_on_checkin: false, auto_on_referral: false,
  daily_drop_enabled: false, daily_drop_hour: 21,
  birthday_enabled: false, default_expires_hours: null,
};

export async function getScratchSettings(): Promise<ScratchSettings> {
  const { data } = await supabaseAdmin.from("scratch_settings").select("*").eq("id", 1).maybeSingle();
  if (!data) return DEFAULTS;
  return { ...DEFAULTS, ...data };
}

export async function issueScratchCard(
  user_id: string,
  trigger: string,
  opts: { expires_at?: string | null; count?: number } = {},
): Promise<number> {
  const n = Math.max(1, Math.min(10, opts.count ?? 1));
  const rows = Array.from({ length: n }, () => {
    const r = rollReward();
    return {
      user_id,
      reward_type: r.type,
      reward_value: r.value,
      reward_label: r.label_en,
      trigger,
      expires_at: opts.expires_at ?? null,
    };
  });
  const { error, data } = await supabaseAdmin.from("scratch_cards").insert(rows).select("id");
  if (error) {
    // Unique-index violation means the idempotent trigger already fired today — that's fine.
    if (error.code === "23505") return 0;
    console.error("[scratch] issue error", error.message);
    return 0;
  }
  return data?.length ?? 0;
}

export function expiresAt(hours: number | null): string | null {
  if (!hours || hours <= 0) return null;
  return new Date(Date.now() + hours * 3600 * 1000).toISOString();
}
