import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

export const GET: APIRoute = async ({ url, locals }) => {
  if (!["admin","super_admin"].includes(locals.role ?? "")) return new Response("Forbidden", { status: 403 });
  const days = Math.max(1, Math.min(365, Number(url.searchParams.get("days") ?? 30)));
  const since = new Date(Date.now() - days * 86400_000).toISOString();

  const [scans, cards, signups, cardMembers] = await Promise.all([
    supabaseAdmin.from("page_events").select("id", { count: "exact", head: true }).gte("created_at", since).eq("kind", "table_scan").then(r => r.count ?? 0),
    supabaseAdmin.from("page_events").select("id", { count: "exact", head: true }).gte("created_at", since).eq("kind", "card_view").then(r => r.count ?? 0),
    supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", since).then(r => r.count ?? 0),
    supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", since).not("card_issued_at", "is", null).then(r => r.count ?? 0),
  ]);

  const rows = [
    ["metric", "value"],
    ["range_days", String(days)],
    ["table_scans", String(scans)],
    ["card_views", String(cards)],
    ["new_signups", String(signups)],
    ["activated_cards", String(cardMembers)],
  ];
  const csv = rows.map(r => r.map(c => /[,"\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c).join(",")).join("\n");
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sallys-metrics-${days}d.csv"`,
    },
  });
};
