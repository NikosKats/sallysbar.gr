import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";
import { sendMessage } from "../../../lib/vonage-messages";
import { setEngineRuntimeEnv } from "../../../lib/marketing-engine";

export const prerender = false;

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

export const POST: APIRoute = async ({ request, locals }) => {
  if (!["admin", "super_admin"].includes(locals.role ?? "")) return json({ ok: false, error: "forbidden" });
  setEngineRuntimeEnv((locals as any).runtime?.env);

  let body: any;
  try { body = await request.json(); } catch { return json({ ok: false, error: "bad_json" }); }
  const id = Number(body?.id);
  const text = String(body?.text ?? "").trim();
  if (!Number.isFinite(id) || !text) return json({ ok: false, error: "missing_id_or_text" });

  // Fetch original inbound message to know who + which channel to reply on
  const { data: msg } = await supabaseAdmin
    .from("vonage_inbound_messages")
    .select("id, channel, from_address, matched_user_id").eq("id", id).maybeSingle();
  if (!msg) return json({ ok: false, error: "original_not_found" });

  // Push / email replies not wired — only Vonage channels support bidirectional through this endpoint.
  if (!["sms", "whatsapp", "viber_service", "messenger", "instagram"].includes(msg.channel)) {
    return json({ ok: false, error: "channel_not_supported_for_reply" });
  }

  const r = await sendMessage(msg.from_address, text, { channel: msg.channel as any });
  if (!r.ok) {
    return json({ ok: false, error: r.error });
  }

  // Log the reply + mark the thread handled
  await supabaseAdmin.from("marketing_log").insert({
    trigger_key: `reply_${id}`,
    user_id: msg.matched_user_id,
    channel: msg.channel,
    to_address: msg.from_address,
    preview: text.slice(0, 200),
    success: true,
    error_text: null,
    meta: { reply_to_inbound_id: id, message_uuid: r.message_uuid },
  });
  await supabaseAdmin
    .from("vonage_inbound_messages").update({ handled: true }).eq("id", id);

  return json({ ok: true, message_uuid: r.message_uuid });
};
