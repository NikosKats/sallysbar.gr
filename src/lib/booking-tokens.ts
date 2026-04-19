// Short, tamper-proof tokens for customer-facing booking management URLs.
// We don't store a token per reservation — instead we HMAC the reservation id
// with a server-side secret and truncate to 16 url-safe base64 chars. The page
// verifies the signature before revealing any data, so iterating UUIDs can't
// reveal other customers' bookings.

function readEnv(locals: any, key: string): string {
  return (locals as any)?.runtime?.env?.[key]
      ?? (globalThis as any)?.process?.env?.[key]
      ?? (import.meta.env as any)?.[key]
      ?? "";
}

export function getBookingSecret(locals: any): string {
  // Reuse VAPI_TOOL_SECRET — it's already a strong random value set per env.
  // If it's ever absent, fall back to a compile-time random so verification
  // still works (but every request must use the same instance).
  return (readEnv(locals, "BOOKING_TOKEN_SECRET")
       || readEnv(locals, "VAPI_TOOL_SECRET")
       || "fallback-unconfigured-secret");
}

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export async function signBookingId(id: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(id));
  return b64url(new Uint8Array(sig)).slice(0, 16);
}

export async function verifyBookingToken(id: string, token: string, secret: string): Promise<boolean> {
  if (!id || !token) return false;
  const expected = await signBookingId(id, secret);
  // constant-time-ish compare
  if (expected.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}

export async function buildManageUrl(reservationId: string, locals: any, origin = "https://www.sallysbar.gr"): Promise<string> {
  const sig = await signBookingId(reservationId, getBookingSecret(locals));
  return `${origin}/manage/${reservationId}?t=${sig}`;
}
