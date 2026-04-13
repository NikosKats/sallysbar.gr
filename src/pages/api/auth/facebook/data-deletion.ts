import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../../lib/supabase";

// Facebook Data Deletion Callback.
// Spec: https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback
// Facebook POSTs `signed_request=<jwt-like>` (form-encoded). We verify it with our App Secret,
// extract the Facebook user id, delete that user from Supabase, and respond with:
//   { url: "https://sallysbar.gr/data-deletion?code=<id>", confirmation_code: "<id>" }

function b64urlToBytes(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function verifySignedRequest(signedRequest: string, appSecret: string): Promise<any | null> {
  const [encSig, encPayload] = signedRequest.split(".");
  if (!encSig || !encPayload) return null;

  // The signature is HMAC-SHA256 of the *encoded* payload string (not decoded).
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encPayload));
  const expected = new Uint8Array(sigBuf);
  const provided = b64urlToBytes(encSig);

  if (expected.length !== provided.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ provided[i];
  if (diff !== 0) return null;

  try {
    const json = new TextDecoder().decode(b64urlToBytes(encPayload));
    return JSON.parse(json);
  } catch { return null; }
}

export const POST: APIRoute = async ({ request }) => {
  const appSecret = import.meta.env.FACEBOOK_APP_SECRET || "";
  if (!appSecret) {
    return new Response(JSON.stringify({ error: "facebook_secret_missing" }), { status: 500 });
  }

  const form = await request.formData().catch(() => null);
  const signedRequest = form?.get("signed_request")?.toString();
  if (!signedRequest) {
    return new Response(JSON.stringify({ error: "no_signed_request" }), { status: 400 });
  }

  const payload = await verifySignedRequest(signedRequest, appSecret);
  if (!payload || !payload.user_id) {
    return new Response(JSON.stringify({ error: "invalid_signature" }), { status: 401 });
  }

  const fbUserId: string = String(payload.user_id);

  // Look up the Supabase user via their Facebook OAuth identity.
  // Supabase stores OAuth identities in auth.users.identities array; we find
  // the matching one by provider='facebook' AND the provider id.
  let supabaseUserId: string | null = null;
  try {
    // Fetch up to 1000 users (small bar — fine). For larger scale, paginate.
    const { data: list } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    for (const u of list?.users ?? []) {
      const idents = (u as any).identities ?? [];
      for (const i of idents) {
        if (i.provider === "facebook" && (i.id === fbUserId || i.identity_id === fbUserId)) {
          supabaseUserId = u.id;
          break;
        }
      }
      if (supabaseUserId) break;
    }
  } catch (e) {
    console.error("[fb-data-deletion] lookup failed", e);
  }

  // Use the Facebook user id as the confirmation code so a user can verify
  // by visiting /data-deletion?code=<fb-user-id> and seeing it acknowledged.
  const confirmation_code = fbUserId;

  if (supabaseUserId) {
    try {
      // Cascading FKs (profiles → loyalty_events / scratch_cards / quest_claims / etc) handle the rest.
      await supabaseAdmin.auth.admin.deleteUser(supabaseUserId);
    } catch (e) {
      console.error("[fb-data-deletion] delete failed", e);
      // Still return 200 with the URL — Facebook will surface our public page where
      // the user can email privacy@sallysbar.gr if anything didn't get cleaned up.
    }
  }

  // Always return the required envelope so Facebook accepts the callback.
  return new Response(JSON.stringify({
    url: `https://sallysbar.gr/data-deletion?code=${encodeURIComponent(confirmation_code)}`,
    confirmation_code,
  }), { status: 200, headers: { "Content-Type": "application/json" } });
};
