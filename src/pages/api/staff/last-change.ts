import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

export const prerender = false;

// Cheap polling endpoint for /staff — returns the max(created_at, updated_at)
// timestamp across orders + table_sessions. The client compares this to its
// cached value and reloads if it changed. Safe to hit every 15s.

function maxTs(rows: any[], fields: string[]): number {
  let m = 0;
  for (const r of rows ?? []) {
    for (const f of fields) {
      if (r?.[f]) {
        const t = new Date(r[f]).getTime();
        if (t > m) m = t;
      }
    }
  }
  return m;
}

export const GET: APIRoute = async ({ locals }) => {
  // Gate to logged-in staff-ish roles so it can't be abused by anonymous polling.
  const role = locals.role ?? "";
  if (!["employee", "staff", "waiter", "barman", "admin", "super_admin"].includes(role)) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });
  }

  // Last 24h is plenty — anything older won't affect live board.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Pull just enough rows to compute a max timestamp. Head:true + count would
  // be cheaper but we need the actual timestamps, not just a count.
  const [{ data: orders }, { data: sessions }] = await Promise.all([
    supabaseAdmin
      .from("orders")
      .select("created_at, prepared_at, ready_at, delivered_at, paid_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(100),
    supabaseAdmin
      .from("table_sessions")
      .select("created_at, closed_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const latest = Math.max(
    maxTs(orders ?? [], ["created_at", "prepared_at", "ready_at", "delivered_at", "paid_at"]),
    maxTs(sessions ?? [], ["created_at", "closed_at"]),
  );

  return new Response(JSON.stringify({ latest_ts: latest }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
};
