import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

function isAdmin(locals: App.Locals) { return locals.role === "admin"; }

export const POST: APIRoute = async ({ request, locals }) => {
  if (!isAdmin(locals)) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  let body: any;
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 }); }

  const tiers = Array.isArray(body.tiers) ? body.tiers : null;
  if (!tiers) return new Response(JSON.stringify({ error: "tiers[] required" }), { status: 400 });

  for (const t of tiers) {
    if (!t.key || typeof t.key !== "string") return new Response(JSON.stringify({ error: "key required" }), { status: 400 });
    const threshold = Number(t.threshold);
    if (!Number.isInteger(threshold) || threshold < 0) {
      return new Response(JSON.stringify({ error: `invalid threshold for ${t.key}` }), { status: 400 });
    }
    const { error } = await supabaseAdmin.from("loyalty_tiers").upsert({
      key: t.key,
      label_en: String(t.label_en ?? ""),
      label_el: String(t.label_el ?? ""),
      icon: String(t.icon ?? ""),
      color: String(t.color ?? "#94a3b8"),
      threshold,
      perk_en: String(t.perk_en ?? ""),
      perk_el: String(t.perk_el ?? ""),
      sort_order: Number(t.sort_order ?? 0),
      updated_at: new Date().toISOString(),
    }, { onConflict: "key" });
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }));
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  if (!isAdmin(locals)) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  const { key } = await request.json().catch(() => ({}));
  if (!key) return new Response(JSON.stringify({ error: "key required" }), { status: 400 });
  const { error } = await supabaseAdmin.from("loyalty_tiers").delete().eq("key", key);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify({ ok: true }));
};
