import type { APIRoute } from "astro";
import { signVonageJwt } from "../../../lib/vonage-jwt";

export const prerender = false;

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

function readEnv(locals: any, key: string): string {
  const cf = locals?.runtime?.env?.[key];
  if (cf) return String(cf);
  const pe = (globalThis as any)?.process?.env?.[key];
  if (pe) return String(pe);
  return String((import.meta.env as any)?.[key] ?? "");
}

// GET /api/vonage/recording?uuid=<recording_uuid>
// Authenticates to Vonage with a short-lived JWT and streams the MP3 back
// through our domain so the <audio> tag / Listen link works without leaking creds.
// Admin-only — recordings contain private customer voice.
export const GET: APIRoute = async ({ url, locals }) => {
  if (!["admin", "super_admin"].includes(locals.role ?? "")) return json({ ok: false, error: "forbidden" }, 403);

  const uuid = (url.searchParams.get("uuid") ?? "").trim();
  if (!/^[a-f0-9-]{20,}$/i.test(uuid)) return json({ ok: false, error: "bad_uuid" }, 400);

  const appId       = readEnv(locals, "VONAGE_APP_ID");
  const privateKey  = readEnv(locals, "VONAGE_APP_PRIVATE_KEY");
  if (!appId || !privateKey) return json({ ok: false, error: "vonage_app_not_configured" }, 503);

  let jwt: string;
  try {
    jwt = await signVonageJwt(appId, privateKey, 120);
  } catch (e: any) {
    return json({ ok: false, error: `jwt_sign_failed: ${e?.message ?? e}` }, 500);
  }

  // Vonage stores recordings at api-eu.nexmo.com (EU region) or api.nexmo.com (US).
  // Try EU first (matches our app's region); fall back to US.
  const endpoints = [
    `https://api-eu.nexmo.com/v1/files/${uuid}`,
    `https://api.nexmo.com/v1/files/${uuid}`,
  ];

  for (const ep of endpoints) {
    const r = await fetch(ep, { headers: { Authorization: `Bearer ${jwt}` } });
    if (r.ok) {
      return new Response(r.body, {
        status: 200,
        headers: {
          "Content-Type": r.headers.get("Content-Type") ?? "audio/mpeg",
          "Content-Disposition": `inline; filename="${uuid}.mp3"`,
          "Cache-Control": "private, max-age=3600",
        },
      });
    }
    if (r.status === 404) continue; // try next endpoint
    const detail = await r.text().catch(() => "");
    return json({ ok: false, error: `vonage_${r.status}`, detail: detail.slice(0, 200) }, r.status);
  }

  return json({ ok: false, error: "recording_not_found" }, 404);
};
