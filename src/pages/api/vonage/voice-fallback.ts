import type { APIRoute } from "astro";

export const prerender = false;

// Vonage Voice API "Fallback URL" — called when the primary Answer URL fails
// (timeout, 5xx, DNS error, etc). Returns a minimal NCCO so the caller doesn't
// hear silence, plus logs the failure to our events endpoint for visibility.
// Docs: https://developer.vonage.com/en/voice/voice-api/webhook-reference#fallback-url

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

export const GET: APIRoute = async ({ url }) => {
  const origin = url.origin.replace(/^http:/, "https:");
  const ncco = [
    {
      action: "talk",
      language: "en-GB",
      text: "Sally's Bar — our system is briefly unavailable. Please call back in a few minutes, or send us a message on WhatsApp. Thanks for your patience.",
    },
    {
      action: "talk",
      language: "el-GR",
      text: "Sally's Bar — το σύστημά μας είναι προσωρινά μη διαθέσιμο. Παρακαλώ καλέστε ξανά σε λίγα λεπτά ή στείλτε WhatsApp. Ευχαριστούμε.",
    },
    // Still record a voicemail so the caller isn't stuck in limbo.
    {
      action: "record",
      format: "mp3",
      beepStart: true,
      endOnSilence: 4,
      endOnKey: "#",
      timeOut: 60,
      eventUrl: [`${origin}/api/vonage/voice-events`],
    },
    {
      action: "talk",
      language: "en-GB",
      text: "Got it, thanks.",
    },
  ];
  return json(ncco);
};

export const POST = GET;
