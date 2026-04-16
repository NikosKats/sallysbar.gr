import type { APIRoute } from "astro";

export const prerender = false;

// Vonage Voice API "Answer URL" — returns an NCCO (Nexmo Call Control Object)
// describing what the caller hears. Fires once when the call connects.
// Docs: https://developer.vonage.com/en/voice/voice-api/ncco-reference
//
// Current behaviour: greet the caller in EN + EL, record a voicemail, upload
// the recording to our /api/vonage/voice-events webhook when done.
//
// To route calls to a real human phone, swap the "record" action for:
//   { action: "connect", endpoint: [{ type: "phone", number: "30XXXXXXXX" }] }

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

export const GET: APIRoute = async ({ url }) => {
  const origin = url.origin.replace(/^http:/, "https:");
  // ASCII-safe punctuation only (no em-dash, no curly quotes) — Vonage's TTS
  // has been silently dropping calls when those appear in NCCO text.
  const ncco = [
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
  ];
  return json(ncco);
};

export const POST = GET;
