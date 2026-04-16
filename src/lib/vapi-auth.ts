// Shared auth helper for Vapi tool endpoints. Vapi calls our /api/ai-voice/*
// routes with a secret header configured in the assistant settings. If the
// header doesn't match we reject — this is the only thing preventing a random
// actor from booking fake reservations by posting to our public endpoint.

function readEnv(locals: any, key: string): string {
  return (locals as any)?.runtime?.env?.[key]
      ?? (globalThis as any)?.process?.env?.[key]
      ?? (import.meta.env as any)?.[key]
      ?? "";
}

export function isVapiAuthed(request: Request, locals: any): boolean {
  const expected = String(readEnv(locals, "VAPI_TOOL_SECRET") ?? "").trim();
  const header = request.headers.get("x-vapi-secret") ?? "";
  // Temporary: if the bypass flag is set, allow the call through but log what
  // we received so we can diagnose the mismatch. Turn bypass back off once the
  // header is correctly configured in Vapi.
  const bypass = String(readEnv(locals, "VAPI_AUTH_BYPASS") ?? "").toLowerCase() === "true";
  if (bypass) {
    const fmt = (s: string) => s ? `len=${s.length} ${s.slice(0,3)}…${s.slice(-3)}` : "<empty>";
    const allHeaders: Record<string, string> = {};
    for (const [k, v] of request.headers) allHeaders[k] = v.length > 80 ? `${v.slice(0, 40)}…${v.slice(-20)}` : v;
    console.warn("[vapi-auth] BYPASS", JSON.stringify({
      expected: fmt(expected),
      got: fmt(header),
      match: expected !== "" && header === expected,
      all_headers: allHeaders,
    }));
    return true;
  }
  if (!expected) return false;
  return header === expected;
}

// Diagnostic — reveals just enough about the secret comparison to debug a
// mismatch without leaking the actual secret. First/last 3 chars + length is
// enough to spot URL-encoding, trimming, or plain-typo mistakes.
export function authDiag(request: Request, locals: any) {
  const expected = String(readEnv(locals, "VAPI_TOOL_SECRET") ?? "").trim();
  const got = request.headers.get("x-vapi-secret") ?? "";
  const fmt = (s: string) => s ? `len=${s.length} ${s.slice(0,3)}…${s.slice(-3)}` : "<empty>";
  return {
    expected: fmt(expected),
    got: fmt(got),
    match: expected !== "" && got === expected,
    header_names: [...request.headers.keys()].filter(k => k.toLowerCase().includes("vapi") || k.toLowerCase().includes("secret") || k.toLowerCase().includes("auth")),
  };
}

// Vapi function-call payloads come in two slightly different shapes depending on
// whether the assistant is using "legacy tools" or "server tools". Normalise.
export async function parseVapiToolCall(request: Request): Promise<{
  args: Record<string, any>;
  callId: string | null;        // the parent phone-call id
  toolCallId: string | null;    // the specific tool invocation id (match in the response)
}> {
  const body = await request.json().catch(() => ({}));
  // New format: { message: { type: "tool-calls", toolCalls: [{ id, function: { name, arguments } }] } }
  const tc = body?.message?.toolCalls?.[0];
  if (tc?.function) {
    let args: any = tc.function.arguments ?? {};
    if (typeof args === "string") { try { args = JSON.parse(args); } catch {} }
    return {
      args,
      callId: body?.message?.call?.id ?? null,
      toolCallId: tc.id ?? null,
    };
  }
  // Legacy format: { message: { functionCall: { parameters, id } } }
  const fc = body?.message?.functionCall;
  if (fc) {
    let args: any = fc.parameters ?? fc.arguments ?? {};
    if (typeof args === "string") { try { args = JSON.parse(args); } catch {} }
    return {
      args,
      callId: body?.message?.call?.id ?? null,
      toolCallId: fc.id ?? body?.message?.toolCallList?.[0]?.id ?? null,
    };
  }
  // Fallback: treat body itself as the args (useful for manual curl testing)
  return { args: body ?? {}, callId: null, toolCallId: null };
}

// Vapi expects tool responses in the shape:
// { results: [{ toolCallId: "<matching id>", result: "<string or json>" }] }
// Vapi will stringify the `result` for the LLM. Including a matching
// `toolCallId` is REQUIRED — otherwise Vapi shows "No result returned".
export function vapiToolResponse(result: unknown, toolCallId?: string | null) {
  const stringResult = typeof result === "string" ? result : JSON.stringify(result);
  const body: any = {
    // Preferred shape
    results: [{ toolCallId: toolCallId ?? "unknown", result: stringResult }],
    // Also include the top-level `result` for any legacy consumer / direct curl
    result,
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
    },
  });
}

// Open CORS so Vapi's dashboard "Test" button works (it fetches from the
// browser). Auth is still enforced via x-vapi-secret, so this is safe.
export function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-vapi-secret, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

// OPTIONS preflight helper for endpoints that need CORS.
export function corsPreflight() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}
