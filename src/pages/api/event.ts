import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../lib/supabase";

const ALLOWED = new Set(["table_scan", "card_view", "menu_view"]);

export const POST: APIRoute = async ({ request, locals }) => {
  let body: any;
  try { body = await request.json(); } catch { return new Response("bad", { status: 400 }); }
  const kind = String(body?.kind ?? "");
  if (!ALLOWED.has(kind)) return new Response("bad", { status: 400 });
  const ref_id = typeof body?.ref_id === "string" ? body.ref_id.slice(0, 80) : null;

  await supabaseAdmin.from("page_events").insert({
    kind,
    ref_id,
    user_id: locals.user?.id ?? null,
  });
  return new Response("ok");
};
