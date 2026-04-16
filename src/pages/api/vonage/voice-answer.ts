import type { APIRoute } from "astro";

export const prerender = false;

// Vonage Voice API "Answer URL" — returns an NCCO describing what the caller
// hears. Two modes:
//
// 1. When VAPI_PHONE_NUMBER_ID is set → connect the call over SIP to the
//    Vapi AI assistant. Vapi handles STT/LLM/TTS/barge-in and can book
//    reservations, look up the menu, transfer to a human, etc.
//
// 2. Otherwise → fall back to the plain greeting + voicemail NCCO so nothing
//    breaks if the env var is empty or Vapi is down.
//
// Docs: https://developer.vonage.com/en/voice/voice-api/ncco-reference
//       https://docs.vapi.ai/phone-calls/sip-trunking

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

function readEnv(locals: any, key: string): string {
  return (locals as any)?.runtime?.env?.[key]
      ?? (globalThis as any)?.process?.env?.[key]
      ?? (import.meta.env as any)?.[key]
      ?? "";
}

export const GET: APIRoute = async ({ url, locals }) => {
  const origin = url.origin.replace(/^http:/, "https:");

  // Vapi SIP URI is derived from the phone-number ID the assistant is attached to.
  // Format: sip:<phoneNumberId>@sip.vapi.ai
  const vapiPhoneNumberId = String(readEnv(locals, "VAPI_PHONE_NUMBER_ID") ?? "").trim();
  const aiEnabled = String(readEnv(locals, "AI_VOICE_ENABLED") ?? "").toLowerCase() === "true";

  if (aiEnabled && vapiPhoneNumberId) {
    return json([
      {
        action: "connect",
        endpoint: [{
          type: "sip",
          uri: `sip:${vapiPhoneNumberId}@sip.vapi.ai`,
        }],
        eventUrl: [`${origin}/api/vonage/voice-events`],
      },
    ]);
  }

  // Fallback: plain voicemail NCCO (ASCII-safe punctuation — Vonage TTS
  // silently drops calls when em-dashes or curly quotes appear).
  return json([
    {
      action: "talk",
      language: "en-GB",
      text: "Hi, this is Sally's Bar in Skala, Kefalonia. We can't answer right now. Please leave a short message after the tone and we'll get back to you. Thanks!",
    },
    {
      action: "talk",
      language: "el-GR",
      text: "Gia sas. Kalesate to Sally's Bar stin Skala Kefalonias. Afiste ena syntomo minima meta ton ixo kai tha epikoinonisoume sytoma.",
    },
    {
      action: "record",
      format: "mp3",
      beepStart: true,
      endOnSilence: 4,
      endOnKey: "#",
      timeOut: 120,
      eventUrl: [`${origin}/api/vonage/voice-events`],
    },
    {
      action: "talk",
      language: "en-GB",
      text: "Thanks, got it. Bye!",
    },
  ]);
};

export const POST = GET;
