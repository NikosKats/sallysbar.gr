import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

export const prerender = false;

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

// Vonage Messages API status webhook.
// Docs: https://developer.vonage.com/en/messages/concepts/message-status
// Fires for every state change: submitted → delivered / rejected / read / undeliverable.
export const POST: APIRoute = async ({ request }) => {
  let payload: any;
  try { payload = await request.json(); } catch { return json({ ok: false, error: "bad_json" }, 400); }

  const messageUuid = String(payload.message_uuid ?? payload.messageUuid ?? "");
  const channel     = String(payload.channel ?? "sms");
  const status      = String(payload.status ?? "unknown");
  const to          = String(payload.to ?? "");
  const errorCode   = payload.error?.type ?? payload.error?.code ?? null;
  const errorReason = payload.error?.message ?? payload.error?.detail ?? null;
  const priceEur    = payload.usage?.price ? Number(payload.usage.price) : null;

  const { error } = await supabaseAdmin.from("vonage_message_status").insert({
    message_uuid: messageUuid || "",
    channel,
    status,
    to_address: to || null,
    error_code: errorCode ? String(errorCode) : null,
    error_reason: errorReason ? String(errorReason) : null,
    price_eur: Number.isFinite(priceEur) ? priceEur : null,
    raw: payload,
  });
  if (error) console.error("[vonage/status] insert error:", error.message);

  // Promote useful statuses back into marketing_log.meta so campaign dashboards
  // can show "delivered 47 · read 12 · failed 3" at a glance.
  if (messageUuid && ["delivered", "read", "rejected", "undeliverable", "failed"].includes(status)) {
    try {
      const patch: any = {
        delivery_status: status,
        delivery_at: new Date().toISOString(),
      };
      if (errorReason) patch.delivery_error = String(errorReason);
      if (Number.isFinite(priceEur)) patch.actual_cost_eur = priceEur;

      // Fetch current meta, shallow-merge
      const { data: row } = await supabaseAdmin
        .from("marketing_log").select("id, meta")
        .like("meta->>message_uuid", messageUuid).maybeSingle();
      // Fallback: match the uuid we stored at send time (not always set — best-effort)
      if (row) {
        const merged = { ...(row.meta ?? {}), ...patch };
        await supabaseAdmin.from("marketing_log").update({ meta: merged }).eq("id", row.id);
      }
    } catch {}
  }

  return json({ ok: true });
};

export const GET: APIRoute = async () => json({ ok: true, endpoint: "vonage_status" });
