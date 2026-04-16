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
  if (!expected) return false;
  const header = request.headers.get("x-vapi-secret") ?? "";
  return header === expected;
}

// Vapi function-call payloads come in two slightly different shapes depending on
// whether the assistant is using "legacy tools" or "server tools". Normalise.
export async function parseVapiToolCall(request: Request): Promise<{
  args: Record<string, any>;
  callId: string | null;
}> {
  const body = await request.json().catch(() => ({}));
  // New format: { message: { type: "tool-calls", toolCalls: [{ id, function: { name, arguments } }] } }
  const tc = body?.message?.toolCalls?.[0];
  if (tc?.function) {
    let args: any = tc.function.arguments ?? {};
    if (typeof args === "string") { try { args = JSON.parse(args); } catch {} }
    return { args, callId: body?.message?.call?.id ?? null };
  }
  // Legacy format: { message: { functionCall: { parameters } } }
  const fc = body?.message?.functionCall;
  if (fc) {
    let args: any = fc.parameters ?? fc.arguments ?? {};
    if (typeof args === "string") { try { args = JSON.parse(args); } catch {} }
    return { args, callId: body?.message?.call?.id ?? null };
  }
  // Fallback: treat body itself as the args (useful for manual curl testing)
  return { args: body ?? {}, callId: null };
}

// Vapi expects tool responses in a specific shape: { results: [{ toolCallId, result }] }
// For legacy tools it accepts { result } directly. We return the union so it works.
export function vapiToolResponse(result: unknown, toolCallId?: string | null) {
  const body: any = { result };
  if (toolCallId) body.results = [{ toolCallId, result }];
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
