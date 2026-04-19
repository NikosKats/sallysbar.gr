// Single source of truth for "how many tables are left for date X". Used by
// the AI voice tool, the admin dashboard, and the manage page so they all
// agree on capacity. Counts every reservation that's still consuming a table
// (pending, pending_ai, confirmed) — cancelled / rejected rows free space.

import { supabaseAdmin } from "./supabase";
import { site } from "../data/site";

export type DayCapacity = {
  date: string;
  capacity: number;
  used: number;
  remaining: number;
  isFull: boolean;
};

const ACTIVE_STATUSES = ["pending", "pending_ai", "confirmed"];

export async function getDayCapacity(date: string, opts?: { excludeId?: string }): Promise<DayCapacity> {
  const capacity = site.dailyTableCapacity ?? 20;
  let query = supabaseAdmin
    .from("reservations")
    .select("id", { count: "exact", head: true })
    .eq("date", date)
    .in("status", ACTIVE_STATUSES);
  if (opts?.excludeId) query = query.neq("id", opts.excludeId);

  const { count, error } = await query;
  if (error) {
    // On DB error, be conservative: report zero remaining so we don't oversell.
    console.error("[booking-capacity] count error:", error.message);
    return { date, capacity, used: capacity, remaining: 0, isFull: true };
  }
  const used = count ?? 0;
  const remaining = Math.max(0, capacity - used);
  return { date, capacity, used, remaining, isFull: remaining <= 0 };
}
