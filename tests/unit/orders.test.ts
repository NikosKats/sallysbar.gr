import { vi, describe, it, expect, beforeEach } from "vitest";
import { makeRequest, makeCookies, readJson } from "./helpers";

// ── Supabase mocks ────────────────────────────────────────────────────────────
const mockFrom = vi.fn();

vi.mock("../../src/lib/supabase", () => {
  const mockServerClient = {
    auth: { getUser: vi.fn() },
  };
  return {
    createSupabaseServerClient: vi.fn(() => mockServerClient),
    supabaseAdmin: new Proxy({}, { get: () => mockFrom }),
  };
});

import { createSupabaseServerClient } from "../../src/lib/supabase";

// ── Chain builder ─────────────────────────────────────────────────────────────
function makeChain(data: unknown, error: unknown = null) {
  const chain: any = {};
  ["select", "update", "delete", "eq", "not", "limit", "order", "single", "in", "insert"].forEach(
    (m) => { chain[m] = vi.fn(() => chain); }
  );
  chain.single = vi.fn().mockResolvedValue({ data, error });
  const resolved = Promise.resolve({ data, error });
  chain.then = resolved.then.bind(resolved);
  chain.catch = resolved.catch.bind(resolved);
  return chain;
}

function setAuthUser(userId = "staff-uid") {
  (createSupabaseServerClient as any).mockReturnValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } }, error: null }) },
  });
}

function setNoUser() {
  (createSupabaseServerClient as any).mockReturnValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
  });
}

let PATCH: any;

beforeEach(async () => {
  vi.resetModules();
  const mod = await import("../../src/pages/api/staff/orders");
  PATCH = mod.PATCH;
  vi.clearAllMocks();
});

// ── Auth guard ────────────────────────────────────────────────────────────────
describe("PATCH /api/staff/orders — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    setNoUser();
    const res = await PATCH({
      request: makeRequest({ action: "cancel", id: "order-1" }, "PATCH"),
      cookies: makeCookies(),
    } as any);
    expect(res.status).toBe(401);
    const body = await readJson(res) as any;
    expect(body.error).toMatch(/unauthorized/i);
  });
});

// ── Cancel action ─────────────────────────────────────────────────────────────
describe("PATCH /api/staff/orders — cancel", () => {
  const ORDER_ID = "order-uuid-1";
  const SESSION_ID = "session-uuid-1";

  it("returns 400 when id is missing", async () => {
    setAuthUser();
    mockFrom.mockImplementation(() => makeChain(null));
    const res = await PATCH({
      request: makeRequest({ action: "cancel" }, "PATCH"),
      cookies: makeCookies(),
    } as any);
    expect(res.status).toBe(400);
  });

  it("returns 404 when order does not exist", async () => {
    setAuthUser();
    mockFrom.mockImplementation(() => makeChain(null)); // single() resolves with null data
    const res = await PATCH({
      request: makeRequest({ action: "cancel", id: ORDER_ID }, "PATCH"),
      cookies: makeCookies(),
    } as any);
    expect(res.status).toBe(404);
  });

  it("returns 400 when cancelling a non-pending order", async () => {
    setAuthUser();
    const order = { id: ORDER_ID, status: "preparing", session_id: SESSION_ID };
    mockFrom.mockImplementation(() => makeChain(order));
    const res = await PATCH({
      request: makeRequest({ action: "cancel", id: ORDER_ID }, "PATCH"),
      cookies: makeCookies(),
    } as any);
    expect(res.status).toBe(400);
    const body = await readJson(res) as any;
    expect(body.error).toMatch(/pending/i);
  });

  it("cancels a pending order successfully", async () => {
    setAuthUser();
    const order = {
      id: ORDER_ID, status: "pending",
      session_id: SESSION_ID, waiter_id: "w1",
      table_number: 3, items: [], note: null,
    };
    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "orders") {
        callCount++;
        // First call: select order by id
        if (callCount === 1) return makeChain(order);
        // Second call: update order status
        if (callCount === 2) return makeChain(null);
        // Third call: check remaining orders (no remaining → close session)
        if (callCount === 3) return makeChain([]); // data=[] means no remaining
      }
      if (table === "table_sessions") return makeChain(null);
      return makeChain(null);
    });

    const res = await PATCH({
      request: makeRequest({ action: "cancel", id: ORDER_ID }, "PATCH"),
      cookies: makeCookies(),
    } as any);
    expect(res.status).toBe(200);
    const body = await readJson(res) as any;
    expect(body.ok).toBe(true);
  });

  it("closes the session when cancel removes last active order", async () => {
    setAuthUser();
    const order = {
      id: ORDER_ID, status: "pending",
      session_id: SESSION_ID, waiter_id: "w1",
      table_number: 3, items: [], note: null,
    };
    const sessionUpdateChain = makeChain(null);
    const updateSpy = vi.fn(() => sessionUpdateChain);

    let orderCallCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "orders") {
        orderCallCount++;
        if (orderCallCount === 1) return makeChain(order);
        if (orderCallCount === 2) return makeChain(null); // cancel update
        // remaining check — empty array means all paid/cancelled
        return makeChain([]);
      }
      if (table === "table_sessions") {
        // track that update was called
        const ch = makeChain(null);
        ch.update = updateSpy;
        return ch;
      }
      return makeChain(null);
    });

    const res = await PATCH({
      request: makeRequest({ action: "cancel", id: ORDER_ID }, "PATCH"),
      cookies: makeCookies(),
    } as any);
    expect(res.status).toBe(200);
    // Session update should have been called
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ status: "closed" })
    );
  });

  it("does NOT close the session when other active orders remain", async () => {
    setAuthUser();
    const order = {
      id: ORDER_ID, status: "pending",
      session_id: SESSION_ID, waiter_id: "w1",
      table_number: 3, items: [], note: null,
    };
    const sessionUpdateSpy = vi.fn();

    let orderCallCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "orders") {
        orderCallCount++;
        if (orderCallCount === 1) return makeChain(order);
        if (orderCallCount === 2) return makeChain(null); // update
        // remaining: still has an active order
        return makeChain([{ id: "other-order" }]);
      }
      if (table === "table_sessions") {
        const ch = makeChain(null);
        ch.update = sessionUpdateSpy;
        return ch;
      }
      return makeChain(null);
    });

    await PATCH({
      request: makeRequest({ action: "cancel", id: ORDER_ID }, "PATCH"),
      cookies: makeCookies(),
    } as any);

    expect(sessionUpdateSpy).not.toHaveBeenCalled();
  });
});

// ── Unknown action ────────────────────────────────────────────────────────────
describe("PATCH /api/staff/orders — unknown action", () => {
  it("returns 400 for unknown action", async () => {
    setAuthUser();
    const order = { id: "o1", status: "pending", session_id: "s1", table_number: 1, items: [], note: null };
    mockFrom.mockImplementation(() => makeChain(order));
    const res = await PATCH({
      request: makeRequest({ action: "fly", id: "o1" }, "PATCH"),
      cookies: makeCookies(),
    } as any);
    expect(res.status).toBe(400);
    const body = await readJson(res) as any;
    expect(body.error).toMatch(/unknown action/i);
  });
});

// ── Missing action field ──────────────────────────────────────────────────────
describe("PATCH /api/staff/orders — validation", () => {
  it("returns 400 when action is missing", async () => {
    setAuthUser();
    mockFrom.mockImplementation(() => makeChain(null));
    const res = await PATCH({
      request: makeRequest({ id: "o1" }, "PATCH"),
      cookies: makeCookies(),
    } as any);
    expect(res.status).toBe(400);
    const body = await readJson(res) as any;
    expect(body.error).toMatch(/action required/i);
  });
});
