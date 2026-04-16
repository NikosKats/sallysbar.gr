# Vapi AI voice agent — setup runbook

Single reference for wiring up the Vapi assistant that answers both Vonage numbers
(+1 207 503 7391 and +44 7441 475768) for Sally's Bar.

## 1 · Secrets you need to upload to Cloudflare Pages

```bash
# Shared secret Vapi sends in x-vapi-secret header on every tool/webhook call.
# Generate: openssl rand -base64 32
printf '%s' 'REPLACE_WITH_OPENSSL_RAND' | npx wrangler pages secret put VAPI_TOOL_SECRET --project-name=sallysbar

# Vapi's "phone number ID" from the phoneNumbers record created in step 5 below.
printf '%s' 'PHONE_NUMBER_ID_FROM_VAPI' | npx wrangler pages secret put VAPI_PHONE_NUMBER_ID --project-name=sallysbar

# Master flag. Set to "true" only when you're ready to go live on both numbers.
printf '%s' 'true' | npx wrangler pages secret put AI_VOICE_ENABLED --project-name=sallysbar
```

## 2 · Supabase migration

```bash
# Run once in Supabase SQL editor
scripts/add-ai-voice.sql
```

## 3 · Vapi account prep

1. Sign up at https://vapi.ai with `nikolaos.katsilidis@gmail.com`.
2. Fund $50 credit (Stripe, covers first month + buffer).
3. **Provider keys** (Settings → Keys) — paste your own so costs roll up on *your* accounts, not Vapi's markup:
   - OpenAI API key (the same one already in the project)
   - ElevenLabs API key (free tier is fine at current volume)
   - Deepgram API key (free tier is fine)
4. **Spend cap** — Dashboard → Org → set monthly cap at `$45`. Hard stops billing when hit.

## 4 · Create the assistant (Dashboard → Assistants → New)

Paste this JSON into the raw-config editor:

```json
{
  "name": "Sally's Bar receptionist",
  "firstMessage": "Hello, you've reached Sally's Bar in Skala, Kefalonia. How can I help you tonight?",
  "firstMessageMode": "assistant-speaks-first",
  "voice": {
    "provider": "11labs",
    "voiceId": "Xb7hH8MSUJpSbSDYk0k2",
    "model": "eleven_multilingual_v2",
    "stability": 0.55,
    "similarityBoost": 0.75,
    "style": 0.35,
    "useSpeakerBoost": true
  },
  "model": {
    "provider": "openai",
    "model": "gpt-4o-mini",
    "temperature": 0.5,
    "messages": [
      {
        "role": "system",
        "content": "You are the receptionist for Sally's Bar in Skala, Kefalonia, Greece. You answer every call the owners miss or that comes in outside of staff capacity. You speak English and Greek fluently — auto-detect the caller's language from their first sentence and stay in that language unless they switch. Keep answers short, warm, and practical: this is a bar, not a tech support line. NEVER invent facts — if you don't know, say 'let me check with the team and we'll call you back'. If the caller insists on talking to a human, call the transfer action. You have four tools: get_hours_info for anything about when we're open / address / directions / events; menu_lookup when asked about drinks, food, allergens, prices; create_reservation to book a table (ALWAYS read back the date, time and party size and ask for confirmation BEFORE calling the tool); transfer_to_owner for any dispute, complaint, lost property, or when caller asks for manager/human. After booking, tell the caller the manager will confirm by SMS shortly. Never quote a price you aren't 100% sure of — use menu_lookup first."
      }
    ],
    "tools": [
      {
        "type": "function",
        "async": false,
        "function": {
          "name": "get_hours_info",
          "description": "Get opening hours, address, directions, and tonight's events.",
          "parameters": { "type": "object", "properties": {}, "required": [] }
        },
        "server": {
          "url": "https://www.sallysbar.gr/api/ai-voice/hours-info",
          "secret": "REPLACE_WITH_VAPI_TOOL_SECRET"
        }
      },
      {
        "type": "function",
        "async": false,
        "function": {
          "name": "menu_lookup",
          "description": "Search the menu for drinks or food. Use the customer's own words as the query.",
          "parameters": {
            "type": "object",
            "properties": {
              "query": { "type": "string", "description": "Free-text search (e.g. 'mojito', 'gluten free', 'cocktails under 10 euros')." },
              "lang":  { "type": "string", "enum": ["en", "el"], "description": "Caller's language." }
            },
            "required": ["query"]
          }
        },
        "server": {
          "url": "https://www.sallysbar.gr/api/ai-voice/menu-lookup",
          "secret": "REPLACE_WITH_VAPI_TOOL_SECRET"
        }
      },
      {
        "type": "function",
        "async": false,
        "function": {
          "name": "create_reservation",
          "description": "Create a pending reservation. Owner approves → customer gets SMS confirmation.",
          "parameters": {
            "type": "object",
            "properties": {
              "date":        { "type": "string", "description": "ISO date YYYY-MM-DD." },
              "time":        { "type": "string", "description": "HH:MM 24-hour format." },
              "party_size":  { "type": "integer", "description": "Number of guests, 1–20." },
              "name":        { "type": "string", "description": "Customer's first and last name." },
              "phone":       { "type": "string", "description": "E.164 phone number — falls back to caller ID if not given." },
              "notes":       { "type": "string", "description": "Optional: special requests (window seat, wheelchair, etc)." }
            },
            "required": ["date", "time", "party_size", "name"]
          }
        },
        "server": {
          "url": "https://www.sallysbar.gr/api/ai-voice/create-reservation",
          "secret": "REPLACE_WITH_VAPI_TOOL_SECRET"
        }
      },
      {
        "type": "transferCall",
        "function": {
          "name": "transfer_to_owner",
          "description": "Transfer the caller to the owner's mobile (+30 694 627 2083) when they explicitly ask for a human, want to make a complaint, or describe something outside our scope."
        },
        "destinations": [
          { "type": "number", "number": "+306946272083", "message": "Connecting you to the owner now — one moment." }
        ]
      }
    ],
    "knowledgeBase": null
  },
  "transcriber": {
    "provider": "deepgram",
    "model": "nova-2",
    "language": "multi"
  },
  "serverUrl": "https://www.sallysbar.gr/api/ai-voice/call-ended",
  "serverUrlSecret": "REPLACE_WITH_VAPI_TOOL_SECRET",
  "serverMessages": ["end-of-call-report"],
  "endCallMessage": "Thanks for calling Sally's Bar. Have a great evening!",
  "endCallPhrases": ["goodbye", "γεια σας", "bye bye"],
  "maxDurationSeconds": 600,
  "silenceTimeoutSeconds": 20,
  "backgroundSound": "office",
  "backchannelingEnabled": true,
  "backgroundDenoisingEnabled": true,
  "modelOutputInMessagesEnabled": true
}
```

Replace every `REPLACE_WITH_VAPI_TOOL_SECRET` with the same value you uploaded to
Cloudflare as `VAPI_TOOL_SECRET`.

## 5 · Create a phone-number record (Dashboard → Phone Numbers → BYO SIP)

- **Provider**: BYO (Bring Your Own)
- **Credential**: leave default Vapi inbound
- **Assistant**: "Sally's Bar receptionist"

Save. Copy the `phoneNumberId` from the URL or the Copy button — this is what
goes into `VAPI_PHONE_NUMBER_ID` (step 1 above). The resulting SIP URI is:

```
sip:<phoneNumberId>@sip.vapi.ai
```

## 6 · Vonage: route both numbers to the Vapi SIP URI

Already handled by `voice-answer.ts` — when `AI_VOICE_ENABLED=true` and
`VAPI_PHONE_NUMBER_ID` is set, the NCCO issues a `connect` to the Vapi SIP URI.

In the Vonage dashboard, just confirm both numbers (`+12075037391`,
`+447441475768`) are linked to the same Voice Application whose Answer URL
is `https://www.sallysbar.gr/api/vonage/voice-answer`.

## 7 · Test plan (before flipping `AI_VOICE_ENABLED=true`)

1. Call the UK number, hear the Vapi greeting.
2. Ask "are you open tonight?" → agent calls `get_hours_info` → reads the answer.
3. Ask "do you have mojitos?" → agent calls `menu_lookup`.
4. Ask "can I book a table for 4 on Friday at 8?" → agent calls
   `create_reservation`. Check `/admin/reservations?status=pending_ai`.
5. Owner's WhatsApp (+30 694 627 2083) should receive the notification.
6. Approve in `/admin/reservations` → customer gets SMS (check your other phone).
7. Ask "can I speak to a human?" → agent transfers to owner's mobile.
8. Hang up. Wait 30 sec. Check `/admin/inbox` — voice row should show 🤖 AI
   badge + summary + expandable transcript.

## 8 · Cost model at current settings

- Vapi platform: $0.05/min
- OpenAI gpt-4o-mini: ~$0.008/min (~50 tokens/sec)
- ElevenLabs multilingual v2: ~$0.05/min
- Deepgram nova-2: ~$0.013/min
- Vonage SIP egress (inbound A→B): ~€0.015/min

**Blended ≈ €0.11/min.** Monthly cap set at $45 gives ~370 min or ~120 calls
at a 3-minute average.

## 9 · Rollback

If something goes wrong, set `AI_VOICE_ENABLED=false` (or delete the secret)
and redeploy. NCCO immediately falls back to the static voicemail greeting —
no Vapi involvement, no cost.
