import { vi } from "vitest";

// ── Supabase chain builder ────────────────────────────────────────────────────
// Returns an object that mimics the Supabase query builder fluent API.
// Call `mockChain({ data, error })` to set what .single() / .limit() resolve with.

export type MockChainResult = { data: unknown; error: unknown };

export function makeMockChain(result: MockChainResult) {
  const chain: Record<string, unknown> = {};
  const methods = [
    "from", "select", "insert", "update", "delete",
    "eq", "neq", "not", "in", "limit", "order",
  ];
  for (const m of methods) {
    chain[m] = vi.fn(() => chain);
  }
  (chain as any).single = vi.fn().mockResolvedValue(result);
  (chain as any).limit = vi.fn().mockResolvedValue(result);

  // allow chaining after limit (for .limit(1) without .single())
  const origLimit = (chain as any).limit;
  (chain as any).limit = vi.fn((...args: any[]) => {
    const r = origLimit(...args);
    // return a thenable that also resolves with result
    return Object.assign(Promise.resolve(result), chain);
  });

  return chain;
}

// ── Minimal Request factory ───────────────────────────────────────────────────
export function makeRequest(body: unknown, method = "POST"): Request {
  return new Request("http://localhost/api/test", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── Minimal AstroCookies stub ─────────────────────────────────────────────────
export function makeCookies() {
  return {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    has: vi.fn(() => false),
  } as unknown as import("astro").AstroCookies;
}

// ── Read JSON from a Response ─────────────────────────────────────────────────
export async function readJson(res: Response): Promise<unknown> {
  return res.json();
}
