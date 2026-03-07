import { vi, describe, it, expect, beforeEach } from "vitest";

// ── Supabase admin mock ───────────────────────────────────────────────────────
const mockFrom = vi.fn();

vi.mock("../../src/lib/supabase", () => ({
  createSupabaseServerClient: vi.fn(),
  supabaseAdmin: new Proxy({}, { get: () => mockFrom }),
}));

// ── Telegram lib mock ─────────────────────────────────────────────────────────
const mockSendMessage = vi.fn().mockResolvedValue({ ok: true, result: { message_id: 999 } });
const mockEditMessageText = vi.fn().mockResolvedValue({ ok: true });
const mockAnswerCallbackQuery = vi.fn().mockResolvedValue({ ok: true });

vi.mock("../../src/lib/telegram", () => ({
  sendMessage: mockSendMessage,
  editMessageText: mockEditMessageText,
  answerCallbackQuery: mockAnswerCallbackQuery,
}));

// ── Chain builder ─────────────────────────────────────────────────────────────
function makeChain(data: unknown, error: unknown = null) {
  const chain: any = {};
  ["select", "update", "eq", "not", "limit", "order", "in"].forEach(
    (m) => { chain[m] = vi.fn(() => chain); }
  );
  chain.single = vi.fn().mockResolvedValue({ data, error });
  const resolved = Promise.resolve({ data, error });
  chain.then = resolved.then.bind(resolved);
  chain.catch = resolved.catch.bind(resolved);
  return chain;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeCallbackBody(action: string, orderId: string, messageId = 100, chatId = 12345) {
  return {
    callback_query: {
      id: "cb-id-1",
      data: `${action}:${orderId}`,
      message: {
        message_id: messageId,
        chat: { id: chatId },
      },
    },
  };
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/telegram-webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ORDER_ID = "order-uuid-abc";
const BASE_ORDER = {
  id: ORDER_ID,
  status: "pending",
  table_number: 5,
  items: [{ name: "Beer", qty: 2, price_cents: 500 }],
  note: null,
  session_id: "sess-1",
  barman_message_id: 200,
  waiter_message_id: null,
};

let POST: any;

beforeEach(async () => {
  vi.resetModules();
  const mod = await import("../../src/pages/api/telegram-webhook");
  POST = mod.POST;
  vi.clearAllMocks();
  // Reset telegram mocks
  mockSendMessage.mockResolvedValue({ ok: true, result: { message_id: 999 } });
  mockEditMessageText.mockResolvedValue({ ok: true });
  mockAnswerCallbackQuery.mockResolvedValue({ ok: true });
});

// ── Body parsing ──────────────────────────────────────────────────────────────
describe("POST /api/telegram-webhook — parsing", () => {
  it("returns ok for invalid JSON body", async () => {
    const req = new Request("http://localhost/api/telegram-webhook", {
      method: "POST",
      body: "not json",
    });
    const res = await POST({ request: req } as any);
    expect(res.status).toBe(200);
  });

  it("returns ok when no callback_query in body", async () => {
    const req = makeRequest({ message: { text: "hello" } });
    const res = await POST({ request: req } as any);
    expect(res.status).toBe(200);
  });

  it("returns ok for unknown action:orderId format", async () => {
    mockFrom.mockImplementation(() => makeChain(BASE_ORDER));
    const req = makeRequest(makeCallbackBody("unknown", ORDER_ID));
    const res = await POST({ request: req } as any);
    expect(res.status).toBe(200);
    expect(mockAnswerCallbackQuery).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("preparing")
    );
  });

  it("returns ok when callback_data is missing colon separator", async () => {
    const body = {
      callback_query: {
        id: "cb-1",
        data: "nocodelonformat",
        message: { message_id: 1, chat: { id: 1 } },
      },
    };
    const req = makeRequest(body);
    const res = await POST({ request: req } as any);
    expect(res.status).toBe(200);
    // answerCallbackQuery called with unknown action message
    expect(mockAnswerCallbackQuery).toHaveBeenCalledWith("cb-1", "Unknown action.");
  });
});

// ── Order not found ───────────────────────────────────────────────────────────
describe("POST /api/telegram-webhook — order not found", () => {
  it("answers with 'Order not found.' when order is missing", async () => {
    mockFrom.mockImplementation(() => makeChain(null)); // single() returns null data
    const req = makeRequest(makeCallbackBody("preparing", "nonexistent-id"));
    await POST({ request: req } as any);
    expect(mockAnswerCallbackQuery).toHaveBeenCalledWith(
      "cb-id-1",
      "Order not found."
    );
  });
});

// ── "preparing" action ────────────────────────────────────────────────────────
describe("POST /api/telegram-webhook — preparing", () => {
  it("updates order status to 'preparing'", async () => {
    let updateCalled = false;
    mockFrom.mockImplementation((table: string) => {
      if (table === "orders") {
        const ch = makeChain(BASE_ORDER);
        ch.update = vi.fn((data: any) => {
          if (data.status === "preparing") updateCalled = true;
          return ch;
        });
        return ch;
      }
      return makeChain(null);
    });
    await POST({ request: makeRequest(makeCallbackBody("preparing", ORDER_ID)) } as any);
    expect(updateCalled).toBe(true);
  });

  it("edits barman message and answers callback", async () => {
    mockFrom.mockImplementation(() => makeChain(BASE_ORDER));
    await POST({ request: makeRequest(makeCallbackBody("preparing", ORDER_ID)) } as any);
    expect(mockEditMessageText).toHaveBeenCalled();
    expect(mockAnswerCallbackQuery).toHaveBeenCalledWith("cb-id-1", "Marked as preparing.");
  });
});

// ── "ready" action ────────────────────────────────────────────────────────────
describe("POST /api/telegram-webhook — ready", () => {
  it("updates order status to 'ready' and notifies waiter", async () => {
    mockFrom.mockImplementation(() => makeChain(BASE_ORDER));
    await POST({ request: makeRequest(makeCallbackBody("ready", ORDER_ID)) } as any);
    expect(mockSendMessage).toHaveBeenCalled();
    expect(mockAnswerCallbackQuery).toHaveBeenCalledWith("cb-id-1", "Waiter notified! ✅");
  });
});

// ── "delivered" action ────────────────────────────────────────────────────────
describe("POST /api/telegram-webhook — delivered", () => {
  it("updates order status to 'delivered' and answers callback", async () => {
    const orderWithWaiterMsg = { ...BASE_ORDER, waiter_message_id: 300 };
    mockFrom.mockImplementation(() => makeChain(orderWithWaiterMsg));
    await POST({ request: makeRequest(makeCallbackBody("delivered", ORDER_ID)) } as any);
    expect(mockEditMessageText).toHaveBeenCalled();
    expect(mockAnswerCallbackQuery).toHaveBeenCalledWith("cb-id-1", "Order delivered! ✅");
  });
});

// ── "cancel" action + session close ──────────────────────────────────────────
describe("POST /api/telegram-webhook — cancel", () => {
  it("updates order status to 'cancelled'", async () => {
    let cancelUpdateCalled = false;
    let orderCallCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "orders") {
        orderCallCount++;
        // call 1: select order by id
        if (orderCallCount === 1) return makeChain(BASE_ORDER);
        // call 2: update({status:"cancelled"}) — spy on this one
        if (orderCallCount === 2) {
          const ch = makeChain(null);
          ch.update = vi.fn((data: any) => {
            if (data.status === "cancelled") cancelUpdateCalled = true;
            return ch;
          });
          return ch;
        }
        // call 3: remaining orders check — still has remaining
        return makeChain([{ id: "other" }]);
      }
      return makeChain(null);
    });

    await POST({ request: makeRequest(makeCallbackBody("cancel", ORDER_ID)) } as any);
    expect(cancelUpdateCalled).toBe(true);
    expect(mockAnswerCallbackQuery).toHaveBeenCalledWith("cb-id-1", "Order cancelled.");
  });

  it("closes session when cancel is the last active order", async () => {
    let sessionUpdateCalled = false;
    let orderCallCount = 0;

    mockFrom.mockImplementation((table: string) => {
      if (table === "orders") {
        orderCallCount++;
        if (orderCallCount === 1) return makeChain(BASE_ORDER);
        if (orderCallCount === 2) return makeChain(null); // cancel update
        // remaining check: empty
        return makeChain([]);
      }
      if (table === "table_sessions") {
        const ch = makeChain(null);
        ch.update = vi.fn((data: any) => {
          if (data.status === "closed") sessionUpdateCalled = true;
          return ch;
        });
        return ch;
      }
      return makeChain(null);
    });

    await POST({ request: makeRequest(makeCallbackBody("cancel", ORDER_ID)) } as any);
    expect(sessionUpdateCalled).toBe(true);
  });

  it("does NOT close session when other orders remain", async () => {
    let sessionUpdateCalled = false;
    let orderCallCount = 0;

    mockFrom.mockImplementation((table: string) => {
      if (table === "orders") {
        orderCallCount++;
        if (orderCallCount === 1) return makeChain(BASE_ORDER);
        if (orderCallCount === 2) return makeChain(null);
        return makeChain([{ id: "remaining-order" }]);
      }
      if (table === "table_sessions") {
        const ch = makeChain(null);
        ch.update = vi.fn(() => { sessionUpdateCalled = true; return ch; });
        return ch;
      }
      return makeChain(null);
    });

    await POST({ request: makeRequest(makeCallbackBody("cancel", ORDER_ID)) } as any);
    expect(sessionUpdateCalled).toBe(false);
  });

  it("edits both barman and waiter messages when both exist", async () => {
    const orderWithBoth = { ...BASE_ORDER, barman_message_id: 200, waiter_message_id: 300 };
    mockFrom.mockImplementation((table: string) => {
      if (table === "orders") return makeChain(orderWithBoth);
      return makeChain(null);
    });
    await POST({ request: makeRequest(makeCallbackBody("cancel", ORDER_ID)) } as any);
    expect(mockEditMessageText).toHaveBeenCalledTimes(2);
  });
});
