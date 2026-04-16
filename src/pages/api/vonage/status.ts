import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

export const prerender = false;

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

// Vonage Messages API status webhook.
// Docs: https://developer.vonage.com/en/messages/concepts/message-status
// Fires for every state change: submitted → delivered / rejected / read / undeliverable.
async function parseBody(request: Request): Promise<any> {
  const ctype = request.headers.get("content-type") ?? "";
  const raw = await request.text();
  if (!raw) return {};
  if (ctype.includes("application/json")) {
    try { return JSON.parse(raw); } catch { return { _unparsed: raw }; }
  }
  if (ctype.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(raw);
    const obj: Record<string, string> = {};
    for (const [k, v] of params) obj[k] = v;
    return obj;
  }
  // Last-ditch: try JSON anyway
  try { return JSON.parse(raw); } catch { return { _unparsed: raw, _ctype: ctype }; }
}

async function handle(payload: any) {
  const messageUuid = String(payload.message_uuid ?? payload.messageUuid ?? "");
  const channel     = String(payload.channel ?? "sms");
  const status      = String(payload.status ?? "unknown");
  const to          = String(payload.to ?? "");
  const errorCode   = payload.error?.type ?? payload.error?.code ?? null;
  const errorReason = payload.error?.message ?? payload.error?.detail ?? null;
  const priceEur    = payload.usage?.price ? Number(payload.usage.price) : null;

  console.log("[vonage/status] hit", { messageUuid, channel, status, to });

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
}

export const POST: APIRoute = async ({ request }) => handle(await parseBody(request));
// Some older Vonage configs send GET for the first webhook verification ping
export const GET: APIRoute = async ({ request }) => {
  const u = new URL(request.url);
  // If any query params are present, treat it like a real callback (legacy SMS API behavior)
  if ([...u.searchParams.keys()].length > 0) {
    const obj: Record<string, string> = {};
    for (const [k, v] of u.searchParams) obj[k] = v;
    return handle(obj);
  }
  return json({ ok: true, endpoint: "vonage_status" });
};
