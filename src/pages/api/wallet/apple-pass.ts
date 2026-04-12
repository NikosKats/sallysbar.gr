import type { APIRoute } from "astro";

// Apple Wallet (.pkpass) generation requires:
//   - Apple Developer account with a Pass Type ID certificate
//   - APPLE_PASS_TYPE_ID           (e.g. "pass.gr.sallysbar.loyalty")
//   - APPLE_PASS_TEAM_ID           (10-char Apple Team ID)
//   - APPLE_PASS_CERT_P12_BASE64   (pass-type cert as PKCS#12 base64)
//   - APPLE_PASS_CERT_PASSWORD
//   - APPLE_WWDR_CERT_BASE64       (Apple WWDR G4 intermediate)
//
// Signing .pkpass with PKCS#7 in a Cloudflare Worker is non-trivial (no native PKCS#7 lib).
// This endpoint returns 501 until the signing pipeline is wired. As an interim workaround
// we suggest users screenshot the QR code and add it to Notes or the Files app.
export const POST: APIRoute = async ({ locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: "auth_required" }), { status: 401 });

  return new Response(JSON.stringify({
    error: "not_configured",
    message: "Apple Wallet signing requires a Pass Type ID certificate (APPLE_PASS_TYPE_ID, APPLE_PASS_TEAM_ID, APPLE_PASS_CERT_P12_BASE64, APPLE_PASS_CERT_PASSWORD, APPLE_WWDR_CERT_BASE64). Contact support.",
    fallback: "Long-press the loyalty QR above → 'Add to Photos' or 'Copy' — screenshot works at the bar.",
  }), { status: 501 });
};
