import type { APIRoute } from "astro";

// Google Wallet "Save to Google" JWT link generator.
// Requires env vars:
//   GOOGLE_WALLET_ISSUER_ID        — numeric issuer ID from pay.google.com/business/console
//   GOOGLE_WALLET_CLASS_ID         — existing loyalty class ID (e.g. "<issuer>.sallysbar_loyalty")
//   GOOGLE_WALLET_SA_EMAIL         — service account email
//   GOOGLE_WALLET_SA_PRIVATE_KEY   — service account private key PEM (with \n newlines)
// If any are missing, returns 501 with setup instructions.

function b64url(data: ArrayBuffer | Uint8Array | string) {
  const bytes = typeof data === "string"
    ? new TextEncoder().encode(data)
    : data instanceof Uint8Array ? data : new Uint8Array(data);
  let s = ""; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function importPkcs8(pem: string): Promise<CryptoKey> {
  const body = pem.replace(/-----BEGIN [^-]+-----|-----END [^-]+-----|\s+/g, "");
  const bin = Uint8Array.from(atob(body), c => c.charCodeAt(0));
  return crypto.subtle.importKey("pkcs8", bin, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
}

export const POST: APIRoute = async ({ locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: "auth_required" }), { status: 401 });

  const issuerId = import.meta.env.GOOGLE_WALLET_ISSUER_ID;
  const classId  = import.meta.env.GOOGLE_WALLET_CLASS_ID;
  const saEmail  = import.meta.env.GOOGLE_WALLET_SA_EMAIL;
  const saKey    = import.meta.env.GOOGLE_WALLET_SA_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!issuerId || !classId || !saEmail || !saKey) {
    return new Response(JSON.stringify({
      error: "not_configured",
      message: "Google Wallet not configured. Set GOOGLE_WALLET_ISSUER_ID, GOOGLE_WALLET_CLASS_ID, GOOGLE_WALLET_SA_EMAIL, GOOGLE_WALLET_SA_PRIVATE_KEY.",
    }), { status: 501 });
  }

  const userId = locals.user.id;
  const displayName = locals.user.user_metadata?.full_name ?? locals.user.email?.split("@")[0] ?? "Member";
  const objectId = `${issuerId}.${userId.replace(/-/g, "")}`;

  const loyaltyObject = {
    id: objectId,
    classId,
    state: "ACTIVE",
    accountId: userId,
    accountName: displayName,
    barcode: { type: "QR_CODE", value: `loyalty:${userId}` },
  };

  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: saEmail,
    aud: "google",
    typ: "savetowallet",
    iat: Math.floor(Date.now() / 1000),
    origins: [new URL(import.meta.env.PUBLIC_SITE_URL ?? "https://sallysbar.gr").origin],
    payload: { loyaltyObjects: [loyaltyObject] },
  };

  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const key = await importPkcs8(saKey);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signingInput));
  const jwt = `${signingInput}.${b64url(sig)}`;

  return new Response(JSON.stringify({ ok: true, saveUrl: `https://pay.google.com/gp/v/save/${jwt}` }));
};
