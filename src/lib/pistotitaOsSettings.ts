// Lightweight cache around the pistotita_os_settings row so the two public
// pages and Footer.astro can check visibility on every request without
// hammering Supabase. 60s TTL is plenty — the super admin toggles these
// rarely and they're non-critical (a stale cache just means the change
// takes up to a minute to propagate).

import { supabaseAdmin } from "./supabase";

export type PistotitaOsFlags = {
  page_enabled: boolean;
  compare_page_enabled: boolean;
  footer_link_enabled: boolean;
};

const DEFAULTS: PistotitaOsFlags = {
  page_enabled: true,
  compare_page_enabled: true,
  footer_link_enabled: true,
};

let cache: { v: PistotitaOsFlags; at: number } | null = null;
const TTL = 60_000;

export async function getPistotitaOsFlags(): Promise<PistotitaOsFlags> {
  if (cache && Date.now() - cache.at < TTL) return cache.v;
  try {
    const { data } = await supabaseAdmin
      .from("pistotita_os_settings")
      .select("page_enabled, compare_page_enabled, footer_link_enabled")
      .eq("id", 1)
      .maybeSingle();
    const v: PistotitaOsFlags = {
      page_enabled:         data?.page_enabled !== false,
      compare_page_enabled: data?.compare_page_enabled !== false,
      footer_link_enabled:  data?.footer_link_enabled !== false,
    };
    cache = { v, at: Date.now() };
    return v;
  } catch {
    // Fail open — if the DB / table is missing, keep pages visible (default).
    return DEFAULTS;
  }
}

export function clearPistotitaOsFlagsCache() { cache = null; }
