import type { APIRoute } from "astro";
import { sendMessage, setRuntimeEnv } from "../../../lib/vonage-messages";

export const prerender = false;

// Diagnostic: GET /api/ai-voice/vonage-diag
//   → reports which Vonage env vars are configured (no values, just lengths)
// Test send: GET /api/ai-voice/vonage-diag?test=+306943649190&token=<VAPI_TOOL_SECRET>
//   → attempts an SMS via Vonage; returns the full API response so you can
//     see whether credentials / base URL / sender ID are correct.
//
// Auth: the `token` query param must match VAPI_TOOL_SECRET (reusing it so we
// don't invent yet another secret). Without `test=`, the route is read-only
// and doesn't expose secrets, so auth isn't required.

function readEnv(locals: any, key: string): string {
  return (locals as any)?.runtime?.env?.[key]
      ?? (globalThis as any)?.process?.env?.[key]
      ?? (import.meta.env as any)?.[key]
      ?? "";
}

function mask(v: string): { present: boolean; len: number; head?: string; tail?: string } {
  const s = String(v ?? "").trim();
  if (!s) return { present: false, len: 0 };
  return { present: true, len: s.length, head: s.slice(0, 3), tail: s.slice(-3) };
}

export const GET: APIRoute = async ({ request, locals }) => {
  const url = new URL(request.url);
  // URL query strings decode '+' to space — normalise the leading space back
  // to '+' so callers can write ?test=+30… without URL-encoding by hand.
  const testToRaw = url.searchParams.get("test") ?? "";
  const testTo = testToRaw
    ? (testToRaw.startsWith(" ") ? "+" + testToRaw.trimStart() : testToRaw.trim())
    : null;
  // Accept the token from a header too — query-string decodes '+' as space,
  // which breaks base64-style secrets that contain '+' or '='.
  const token = (request.headers.get("x-diag-token")
               ?? url.searchParams.get("token")
               ?? "").trim();

  const env = {
    VONAGE_MESSAGES_API_KEY:    mask(readEnv(locals, "VONAGE_MESSAGES_API_KEY")),
    VONAGE_MESSAGES_API_SECRET: mask(readEnv(locals, "VONAGE_MESSAGES_API_SECRET")),
    VONAGE_MESSAGES_BASE:              readEnv(locals, "VONAGE_MESSAGES_BASE")  || "(default) https://messages-sandbox.nexmo.com",
    VONAGE_SMS_FROM:                   readEnv(locals, "VONAGE_SMS_FROM")        || "(default) SallysBar",
    VONAGE_WA_FROM:                    readEnv(locals, "VONAGE_WA_FROM")         || "(default) 14157386102",
  };

  if (!testTo) {
    return new Response(JSON.stringify({ ok: true, env }, null, 2), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Gate the test-send behind VAPI_TOOL_SECRET so only the operator can trigger real billing.
  const expected = String(readEnv(locals, "VAPI_TOOL_SECRET") ?? "").trim();
  if (!expected || token !== expected) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  setRuntimeEnv((locals as any)?.runtime?.env);
  const result = await sendMessage(testTo, "Sally's Bar · test SMS (diagnostic)", { channel: "sms" });
  return new Response(JSON.stringify({ ok: true, env, test_to: testTo, result }, null, 2), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
