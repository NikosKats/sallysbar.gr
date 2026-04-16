import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

export const prerender = false;

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

export const POST: APIRoute = async ({ request, locals }) => {
  if (!["admin", "super_admin"].includes(locals.role ?? "")) return json({ ok: false, error: "forbidden" });

  let body: any;
  try { body = await request.json(); } catch { return json({ ok: false, error: "bad_json" }); }

  const userId = String(body?.user_id ?? "");
  const kind   = String(body?.kind ?? "social"); // "social" toggles card_public
  if (!userId) return json({ ok: false, error: "missing_user_id" });

  if (kind !== "social") return json({ ok: false, error: "unsupported_kind" });

  const { data: cur } = await supabaseAdmin
    .from("profiles").select("card_public").eq("id", userId).maybeSingle();
  const next = !(cur?.card_public ?? true);

  const { error } = await supabaseAdmin
    .from("profiles").update({ card_public: next }).eq("id", userId);
  if (error) return json({ ok: false, error: error.message });

  return json({ ok: true, card_public: next });
};
