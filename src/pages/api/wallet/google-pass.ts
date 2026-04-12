import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";
import { getTiers, currentTier, nextTier } from "../../../lib/loyalty";

// Google Wallet "Save to Google" JWT link generator.
// Requires env vars:
//   GOOGLE_WALLET_ISSUER_ID        — numeric issuer ID from pay.google.com/business/console
//   GOOGLE_WALLET_CLASS_ID         — existing loyalty class ID (e.g. "<issuer>.sallysbar_loyalty")
//   GOOGLE_WALLET_SA_EMAIL         — service account email
//   GOOGLE_WALLET_SA_PRIVATE_KEY   — service account private key PEM (with \n newlines)

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
      message: [
        "Google Wallet isn't configured yet.",
        "One-time setup at https://pay.google.com/business/console:",
        "  1. Create an Issuer → copy the numeric Issuer ID.",
        "  2. Create a Loyalty Class (branding, logo, colors) → copy class ID (looks like <issuer>.sallysbar_loyalty).",
        "  3. Google Cloud Console → enable Google Wallet API → create a service account → download JSON key.",
        "  4. In Wallet Console → Users → invite the service account email with 'Developer' role.",
        "Then set these env vars in Cloudflare Pages and redeploy:",
        "  • GOOGLE_WALLET_ISSUER_ID",
        "  • GOOGLE_WALLET_CLASS_ID",
        "  • GOOGLE_WALLET_SA_EMAIL",
        "  • GOOGLE_WALLET_SA_PRIVATE_KEY (paste the PEM private_key from the JSON — replace actual newlines with \\n)",
      ].join("\n"),
    }), { status: 501, headers: { "Content-Type": "application/json" } });
  }

  const userId = locals.user.id;
  const displayName = (locals.user.user_metadata as any)?.full_name ?? locals.user.email?.split("@")[0] ?? "Member";
  const objectId = `${issuerId}.${userId.replace(/-/g, "")}`;

  // Live data: points, tier, progress
  const [{ data: events }, tiers] = await Promise.all([
    supabaseAdmin.from("loyalty_events").select("points").eq("user_id", userId),
    getTiers(),
  ]);
  const points = (events ?? []).reduce((s: number, e: any) => s + (e.points ?? 0), 0);
  const tier   = currentTier(tiers, points);
  const next   = nextTier(tiers, points);
  const tierLabel = tier ? `${tier.icon ?? ""} ${tier.label_en}`.trim() : "Member";
  const nextLabel = next ? `${next.threshold - points} pts to ${next.label_en}` : "Top tier reached";
  const perk = tier?.perk_en ?? "";

  const loyaltyObject: Record<string, unknown> = {
    id: objectId,
    classId,
    state: "ACTIVE",
    accountId: userId,
    accountName: displayName,

    loyaltyPoints: {
      label: "Points",
      balance: { string: String(points) },
    },
    secondaryLoyaltyPoints: {
      label: "Tier",
      balance: { string: tierLabel },
    },

    barcode: {
      type: "QR_CODE",
      value: `loyalty:${userId}`,
      alternateText: displayName,
    },

    textModulesData: [
      { id: "next_tier", header: "NEXT TIER",   body: nextLabel },
      ...(perk ? [{ id: "perk", header: "YOUR PERK", body: perk }] : []),
    ],

    linksModuleData: {
      uris: [
        { uri: "https://sallysbar.gr/account",  description: "My account" },
        { uri: "https://sallysbar.gr/loyalty",  description: "Rewards" },
        { uri: "tel:+306946272083",             description: "Call the bar" },
        { uri: "https://www.google.com/maps/dir//Sally's+Bar,+Skala+280+86", description: "Directions" },
      ],
    },

    // Relevance — geofence so the pass surfaces on the user's lock screen near the bar
    locations: [{ latitude: 38.0748829, longitude: 20.7969726 }],

    // Optional hero image for the full-card view (must be publicly hosted https)
    heroImage: {
      sourceUri: { uri: "https://sallysbar.gr/photos/1.sallys-bar-cocktails-skala.webp" },
      contentDescription: { defaultValue: { language: "en-US", value: "Sally's Bar — Skala, Kefalonia" } },
    },
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

  return new Response(JSON.stringify({
    ok: true,
    saveUrl: `https://pay.google.com/gp/v/save/${jwt}`,
  }), { headers: { "Content-Type": "application/json" } });
};
