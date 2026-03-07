import { vi, describe, it, expect, beforeEach } from "vitest";
import { makeRequest, makeCookies, readJson } from "./helpers";

// ── Supabase mock (set up BEFORE importing the handler) ──────────────────────
const mockAuthGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock("../../src/lib/supabase", () => ({
  createSupabaseServerClient: vi.fn(() => ({
    auth: { getUser: mockAuthGetUser },
  })),
  supabaseAdmin: new Proxy({}, { get: () => mockFrom }),
}));

// Import handlers after mocks are wired up
import { PATCH, DELETE } from "../../src/pages/api/admin/tips";

// ── Chain builder ─────────────────────────────────────────────────────────────
function makeChain(data: unknown, error: unknown = null) {
  const chain: any = {};
  ["select", "update", "delete", "eq", "not", "limit", "order", "in"].forEach(
    (m) => { chain[m] = vi.fn(() => chain); }
  );
  chain.single = vi.fn().mockResolvedValue({ data, error });
  const resolved = Promise.resolve({ data, error });
  chain.then = resolved.then.bind(resolved);
  chain.catch = resolved.catch.bind(resolved);
  return chain;
}

function setAdminUser() {
  mockAuthGetUser.mockResolvedValue({ data: { user: { id: "admin-uid" } }, error: null });
}

function setNoUser() {
  mockAuthGetUser.mockResolvedValue({ data: { user: null }, error: null });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── PATCH (edit tip) ──────────────────────────────────────────────────────────
describe("PATCH /api/admin/tips", () => {
  it("returns 403 when unauthenticated", async () => {
    setNoUser();
    const res = await PATCH({ request: makeRequest({ id: "1", amount_cents: 100 }, "PATCH"), cookies: makeCookies() } as any);
    expect(res.status).toBe(403);
    const body = await readJson(res) as any;
    expect(body.error).toBe("Forbidden");
  });

  it("returns 400 when id is missing", async () => {
    setAdminUser();
    mockFrom.mockImplementation(() => makeChain({ role: "admin" }));
    const res = await PATCH({ request: makeRequest({ amount_cents: 100 }, "PATCH"), cookies: makeCookies() } as any);
    expect(res.status).toBe(400);
    const body = await readJson(res) as any;
    expect(body.error).toMatch(/id required/i);
  });

  it("returns 400 when no updatable fields are provided", async () => {
    setAdminUser();
    mockFrom.mockImplementation(() => makeChain({ role: "admin" }));
    const res = await PATCH({ request: makeRequest({ id: "tip-1" }, "PATCH"), cookies: makeCookies() } as any);
    expect(res.status).toBe(400);
    const body = await readJson(res) as any;
    expect(body.error).toMatch(/nothing to update/i);
  });

  it("returns 400 for invalid tip type (not cash/card)", async () => {
    setAdminUser();
    mockFrom.mockImplementation(() => makeChain({ role: "admin" }));
    // "crypto" is not in ["cash","card"], so it's not added to update → Nothing to update
    const res = await PATCH({ request: makeRequest({ id: "tip-1", type: "crypto" }, "PATCH"), cookies: makeCookies() } as any);
    expect(res.status).toBe(400);
  });

  it("updates amount_cents successfully", async () => {
    setAdminUser();
    mockFrom.mockImplementation((table: string) => {
      if (table === "profiles") return makeChain({ role: "admin" });
      return makeChain(null, null);
    });
    const res = await PATCH({ request: makeRequest({ id: "tip-1", amount_cents: 500 }, "PATCH"), cookies: makeCookies() } as any);
    expect(res.status).toBe(200);
    const body = await readJson(res) as any;
    expect(body.ok).toBe(true);
  });

  it("updates type to 'card' successfully", async () => {
    setAdminUser();
    mockFrom.mockImplementation((table: string) => {
      if (table === "profiles") return makeChain({ role: "admin" });
      return makeChain(null, null);
    });
    const res = await PATCH({ request: makeRequest({ id: "tip-1", type: "card" }, "PATCH"), cookies: makeCookies() } as any);
    expect(res.status).toBe(200);
    const body = await readJson(res) as any;
    expect(body.ok).toBe(true);
  });

  it("returns 500 when supabase update fails", async () => {
    setAdminUser();
    mockFrom.mockImplementation((table: string) => {
      if (table === "profiles") return makeChain({ role: "admin" });
      return makeChain(null, { message: "DB error" });
    });
    const res = await PATCH({ request: makeRequest({ id: "tip-1", amount_cents: 200 }, "PATCH"), cookies: makeCookies() } as any);
    expect(res.status).toBe(500);
  });
});

// ── DELETE (remove tip) ───────────────────────────────────────────────────────
describe("DELETE /api/admin/tips", () => {
  it("returns 403 when unauthenticated", async () => {
    setNoUser();
    const res = await DELETE({ request: makeRequest({ id: "tip-1" }, "DELETE"), cookies: makeCookies() } as any);
    expect(res.status).toBe(403);
  });

  it("returns 400 when id is missing", async () => {
    setAdminUser();
    mockFrom.mockImplementation(() => makeChain({ role: "admin" }));
    const res = await DELETE({ request: makeRequest({}, "DELETE"), cookies: makeCookies() } as any);
    expect(res.status).toBe(400);
    const body = await readJson(res) as any;
    expect(body.error).toMatch(/id required/i);
  });

  it("deletes tip successfully", async () => {
    setAdminUser();
    mockFrom.mockImplementation((table: string) => {
      if (table === "profiles") return makeChain({ role: "admin" });
      return makeChain(null, null);
    });
    const res = await DELETE({ request: makeRequest({ id: "tip-1" }, "DELETE"), cookies: makeCookies() } as any);
    expect(res.status).toBe(200);
    const body = await readJson(res) as any;
    expect(body.ok).toBe(true);
  });

  it("returns 500 when supabase delete fails", async () => {
    setAdminUser();
    mockFrom.mockImplementation((table: string) => {
      if (table === "profiles") return makeChain({ role: "admin" });
      return makeChain(null, { message: "constraint violation" });
    });
    const res = await DELETE({ request: makeRequest({ id: "tip-1" }, "DELETE"), cookies: makeCookies() } as any);
    expect(res.status).toBe(500);
  });
});
