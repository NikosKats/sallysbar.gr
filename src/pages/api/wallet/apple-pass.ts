import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";
import { getTiers, currentTier } from "../../../lib/loyalty";

// Builds the pass.json payload for the Sally's Bar loyalty card.
// Luxury template — black background with amber/gold accents, tier badge,
// points balance, QR code that encodes the user id so staff can scan.
async function buildPassJson(userId: string, email: string, displayName: string) {
  const passTypeId = import.meta.env.APPLE_PASS_TYPE_ID || "pass.gr.sallysbar.loyalty";
  const teamId     = import.meta.env.APPLE_PASS_TEAM_ID || "";

  // Points balance (same query pattern as /account page)
  const { data: events } = await supabaseAdmin
    .from("loyalty_events").select("points").eq("user_id", userId);
  const points = (events ?? []).reduce((s: number, e: any) => s + (e.points ?? 0), 0);

  const tiers = await getTiers();
  const tier = currentTier(tiers, points);
  const tierLabel = tier ? tier.label_en : "Member";
  const tierColor = tier?.color ?? "#fbbf24";

  return {
    formatVersion: 1,
    passTypeIdentifier: passTypeId,
    teamIdentifier: teamId,
    organizationName: "Sally's Bar",
    description: "Sally's Bar — Loyalty Card",
    serialNumber: userId,
    sharingProhibited: true,

    // Luxury black / gold colour palette
    backgroundColor: "rgb(11, 11, 16)",
    foregroundColor: "rgb(255, 255, 255)",
    labelColor:      "rgb(252, 211, 77)",

    logoText: "Sally's Bar",
    webServiceURL: undefined, // add later if you wire the push-updating endpoint
    associatedStoreIdentifiers: [],

    // Store card layout = loyalty card format
    storeCard: {
      headerFields: [
        { key: "points", label: "POINTS", value: points, textAlignment: "PKTextAlignmentRight" },
      ],
      primaryFields: [
        { key: "holder", label: "MEMBER", value: displayName },
      ],
      secondaryFields: [
        { key: "tier",  label: "TIER",     value: tierLabel, textAlignment: "PKTextAlignmentLeft" },
        { key: "venue", label: "LOCATION", value: "Skala · Kefalonia", textAlignment: "PKTextAlignmentRight" },
      ],
      auxiliaryFields: [
        { key: "note", label: "SHOW AT BAR", value: "Staff scans to credit your order" },
      ],
      backFields: [
        { key: "email",    label: "Email",              value: email },
        { key: "member",   label: "Member ID",          value: userId },
        { key: "perks",    label: "Your perks",         value: tier ? (tier.perk_en ?? "Thanks for being a member.") : "Thanks for being a member." },
        { key: "web",      label: "Account & rewards",  value: "https://sallysbar.gr/account" },
        { key: "support",  label: "Support",            value: "info@sallysbar.gr" },
        { key: "terms",    label: "Terms",              value: "Points have no cash value. Sally's Bar may change or end the program with 30 days' notice." },
      ],
    },

    // QR the waiter scans
    barcodes: [
      {
        format: "PKBarcodeFormatQR",
        message: `loyalty:${userId}`,
        messageEncoding: "iso-8859-1",
        altText: displayName,
      },
    ],

    // Optional: where to relevance-show it ("Nearby" on the lock screen)
    locations: [
      { latitude: 38.0748829, longitude: 20.7969726, relevantText: "Welcome to Sally's Bar" },
    ],
  };
}

export const POST: APIRoute = async ({ locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: "auth_required" }), { status: 401 });

  // If Apple signing isn't configured yet, return the pass.json template so you
  // can preview the content, plus a clear setup message. Once the cert env vars
  // are set you'll wire the PKCS#7 signing step below.
  const configured = !!(
    import.meta.env.APPLE_PASS_TYPE_ID &&
    import.meta.env.APPLE_PASS_TEAM_ID &&
    import.meta.env.APPLE_PASS_CERT_P12_BASE64 &&
    import.meta.env.APPLE_PASS_CERT_PASSWORD &&
    import.meta.env.APPLE_WWDR_CERT_BASE64
  );

  const displayName = (locals.user.user_metadata as any)?.full_name
    ?? locals.user.email?.split("@")[0] ?? "Member";

  const pass = await buildPassJson(locals.user.id, locals.user.email ?? "", displayName);

  if (!configured) {
    return new Response(JSON.stringify({
      error: "not_configured",
      message: [
        "Apple Wallet signing isn't set up yet.",
        "To enable the Add-to-Wallet button, provision these 5 env vars on Cloudflare Pages:",
        "  • APPLE_PASS_TYPE_ID        (e.g. pass.gr.sallysbar.loyalty)",
        "  • APPLE_PASS_TEAM_ID        (10-char Apple Team ID)",
        "  • APPLE_PASS_CERT_P12_BASE64 (pass-type .p12 as base64)",
        "  • APPLE_PASS_CERT_PASSWORD  (p12 password)",
        "  • APPLE_WWDR_CERT_BASE64    (Apple WWDR G4 intermediate as base64)",
        "Once set, this endpoint will return a signed .pkpass file.",
      ].join("\n"),
      pass_template_preview: pass,
    }, null, 2), {
      status: 501,
      headers: { "Content-Type": "application/json" },
    });
  }

  // SIGNING PIPELINE (unimplemented scaffold — enable when certs are in place)
  // The pipeline would:
  //   1. Zip: pass.json + manifest.json (SHA-1 of each file) + icon/logo PNGs
  //   2. PKCS#7 detached-sign manifest.json with the pass-type cert + WWDR chain
  //   3. Return application/vnd.apple.pkpass with the zip bytes
  // Recommended lib: node-forge (pure JS, works in CF Workers with nodejs_compat).
  return new Response(JSON.stringify({
    error: "signing_not_implemented",
    message: "Pass template ready; PKCS#7 signing pipeline to be wired in next iteration.",
    pass_template_preview: pass,
  }), { status: 501, headers: { "Content-Type": "application/json" } });
};
