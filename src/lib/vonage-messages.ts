// Vonage Messages API wrapper — WhatsApp, SMS, Viber, Messenger, Instagram.
// Docs: https://developer.vonage.com/messages/code-snippets/send-a-message
// Auth: basic with API_KEY:API_SECRET.
//
// Recipient format per channel:
//   sms / whatsapp / viber_service  → E.164 phone number (digits only)
//   messenger                        → Facebook Page-scoped user ID (PSID)
//   instagram                        → Instagram-scoped user ID
//
// Sender (from) per channel:
//   sms       → alphanumeric sender ID or long number
//   whatsapp  → WhatsApp Business number (digits)
//   viber     → Viber service ID (digits)
//   messenger → Facebook Page ID (digits)
//   instagram → Instagram Business account ID (digits)

type Channel = "whatsapp" | "sms" | "viber_service" | "messenger" | "instagram";

export type SendResult = { ok: true; message_uuid: string } | { ok: false; error: string; status?: number };

function digits(phone: string): string {
  return String(phone).replace(/\D/g, "");
}

// Cloudflare Pages: runtime env (secrets) is NOT on import.meta.env — it lives
// on locals.runtime.env. Callers can set it once per request via setRuntimeEnv.
let _runtimeEnv: Record<string, any> | null = null;
export function setRuntimeEnv(env: Record<string, any> | null | undefined) {
  _runtimeEnv = env ?? null;
}
function readEnv(key: string): string {
  const fromRuntime = _runtimeEnv?.[key];
  if (fromRuntime != null && String(fromRuntime)) return String(fromRuntime);
  const fromProcess = (globalThis as any)?.process?.env?.[key];
  if (fromProcess != null && String(fromProcess)) return String(fromProcess);
  const fromVite = (import.meta.env as any)?.[key];
  return fromVite != null ? String(fromVite) : "";
}

export async function sendMessage(
  to: string,
  text: string,
  opts: { channel?: Channel; from?: string } = {},
): Promise<SendResult> {
  const apiKey    = readEnv("VONAGE_MESSAGES_API_KEY");
  const apiSecret = readEnv("VONAGE_MESSAGES_API_SECRET");
  const base      = readEnv("VONAGE_MESSAGES_BASE") || "https://messages-sandbox.nexmo.com";
  if (!apiKey || !apiSecret || apiSecret === "REPLACE_WITH_API_SECRET") {
    return { ok: false, error: "vonage_messages_not_configured" };
  }
  const channel = opts.channel ?? "whatsapp";

  // Channel-aware sender default (falls back to sandbox IDs for Viber/Messenger/Instagram).
  const defaultFrom: Record<string, string> = {
    whatsapp:      readEnv("VONAGE_WA_FROM")        || "14157386102",
    sms:           readEnv("VONAGE_SMS_FROM")       || "SallysBar",
    viber_service: readEnv("VONAGE_VIBER_FROM")     || "22353",              // Vonage sandbox Viber ID
    messenger:     readEnv("VONAGE_MESSENGER_FROM") || "100614398987044",    // Vonage sandbox FB page
    instagram:     readEnv("VONAGE_INSTAGRAM_FROM") || "17841449184623529",  // Vonage sandbox IG page
  };
  const from = opts.from ?? defaultFrom[channel] ?? "";

  // Messenger & Instagram recipient IDs are NOT phone numbers — pass through raw.
  const phoneBased = channel === "sms" || channel === "whatsapp" || channel === "viber_service";
  const toValue = phoneBased ? digits(to) : String(to).trim();
  if (phoneBased && toValue.length < 8) return { ok: false, error: "invalid_to" };
  if (!phoneBased && !toValue) return { ok: false, error: "invalid_recipient_id" };

  const body = {
    from,
    to: toValue,
    message_type: "text",
    text,
    channel,
  };

  try {
    // Scrub any accidental whitespace/newlines from env values (common copy-paste bug)
    const k = String(apiKey).trim();
    const sec = String(apiSecret).trim();

    const r = await fetch(`${base}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": "Basic " + btoa(`${k}:${sec}`),
      },
      body: JSON.stringify(body),
    });
    const raw = await r.text().catch(() => "");
    let j: any = {};
    try { j = JSON.parse(raw); } catch {}
    if (r.ok && j.message_uuid) return { ok: true, message_uuid: j.message_uuid };
    const reason = j?.title || j?.detail || j?.error?.message || raw.slice(0, 160) || `http_${r.status}`;
    return { ok: false, error: `${reason} [http ${r.status} · base=${base}]`, status: r.status };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "network" };
  }
}

export async function sendWhatsApp(to: string, text: string): Promise<SendResult> {
  return sendMessage(to, text, { channel: "whatsapp" });
}
export async function sendSMS(to: string, text: string): Promise<SendResult> {
  return sendMessage(to, text, { channel: "sms" });
}
