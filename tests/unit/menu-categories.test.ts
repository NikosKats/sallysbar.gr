import { vi, describe, it, expect, beforeEach } from "vitest";
import { makeRequest, makeCookies, readJson } from "./helpers";

const mockFrom = vi.fn();

vi.mock("../../src/lib/supabase", () => {
  const mockServerClient = { auth: { getUser: vi.fn() } };
  return {
    createSupabaseServerClient: vi.fn(() => mockServerClient),
    supabaseAdmin: new Proxy({}, { get: () => mockFrom }),
  };
});

import { createSupabaseServerClient } from "../../src/lib/supabase";

function makeChain(data: unknown, error: unknown = null) {
  const chain: any = {};
  ["select", "insert", "update", "delete", "eq", "limit", "single", "order"].forEach(
    (m) => { chain[m] = vi.fn(() => chain); }
  );
  chain.single = vi.fn().mockResolvedValue({ data, error });
  const resolved = Promise.resolve({ data, error });
  chain.then = resolved.then.bind(resolved);
  chain.catch = resolved.catch.bind(resolved);
  return chain;
}

function setAdmin() {
  (createSupabaseServerClient as any).mockReturnValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "admin" } }, error: null }) },
  });
}

function setNoUser() {
  (createSupabaseServerClient as any).mockReturnValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
  });
}

let POST: any, PUT: any, DELETE: any;

beforeEach(async () => {
  vi.resetModules();
  const mod = await import("../../src/pages/api/admin/menu/categories");
  POST = mod.POST;
  PUT = mod.PUT;
  DELETE = mod.DELETE;
  vi.clearAllMocks();
});

describe("POST /api/admin/menu/categories", () => {
  it("returns 403 for non-admin", async () => {
    setNoUser();
    const res = await POST({ request: makeRequest({}), cookies: makeCookies() } as any);
    expect(res.status).toBe(403);
  });

  it("returns 400 when title_en is missing", async () => {
    setAdmin();
    mockFrom.mockImplementation(() => makeChain({ role: "admin" }));
    const res = await POST({ request: makeRequest({ slug: "drinks" }), cookies: makeCookies() } as any);
    expect(res.status).toBe(400);
  });

  it("returns 400 when slug is missing", async () => {
    setAdmin();
    mockFrom.mockImplementation(() => makeChain({ role: "admin" }));
    const res = await POST({ request: makeRequest({ title_en: "Drinks" }), cookies: makeCookies() } as any);
    expect(res.status).toBe(400);
  });

  it("creates category and returns it", async () => {
    setAdmin();
    const newCat = { id: 1, title_en: "Cocktails", slug: "cocktails", sort: 0, is_visible: true };
    mockFrom.mockImplementation((table: string) => {
      if (table === "profiles") return makeChain({ role: "admin" });
      return makeChain(newCat);
    });
    const res = await POST({
      request: makeRequest({ title_en: "Cocktails", slug: "cocktails" }),
      cookies: makeCookies(),
    } as any);
    expect(res.status).toBe(200);
    const body = await readJson(res) as any;
    expect(body.ok).toBe(true);
    expect(body.category.title_en).toBe("Cocktails");
  });

  it("falls back title_el to title_en when not provided", async () => {
    setAdmin();
    let insertedData: any = null;
    mockFrom.mockImplementation((table: string) => {
      if (table === "profiles") return makeChain({ role: "admin" });
      const ch = makeChain({ id: 2, title_en: "Beer", title_el: "Beer" });
      ch.insert = vi.fn((data: any) => { insertedData = data; return ch; });
      return ch;
    });
    await POST({
      request: makeRequest({ title_en: "Beer", slug: "beer" }),
      cookies: makeCookies(),
    } as any);
    if (insertedData) {
      expect(insertedData.title_el).toBe("Beer");
    }
  });
});

describe("PUT /api/admin/menu/categories", () => {
  it("returns 403 for non-admin", async () => {
    setNoUser();
    const res = await PUT({ request: makeRequest({ id: 1 }, "PUT"), cookies: makeCookies() } as any);
    expect(res.status).toBe(403);
  });

  it("returns 400 when id is missing", async () => {
    setAdmin();
    mockFrom.mockImplementation(() => makeChain({ role: "admin" }));
    const res = await PUT({ request: makeRequest({}, "PUT"), cookies: makeCookies() } as any);
    expect(res.status).toBe(400);
    const body = await readJson(res) as any;
    expect(body.error).toMatch(/id required/i);
  });

  it("updates sort order and returns updated category", async () => {
    setAdmin();
    const updated = { id: 1, title_en: "Cocktails", sort: 5, is_visible: true };
    mockFrom.mockImplementation((table: string) => {
      if (table === "profiles") return makeChain({ role: "admin" });
      return makeChain(updated);
    });
    const res = await PUT({
      request: makeRequest({ id: 1, sort: 5 }, "PUT"),
      cookies: makeCookies(),
    } as any);
    expect(res.status).toBe(200);
    const body = await readJson(res) as any;
    expect(body.category.sort).toBe(5);
  });

  it("ignores disallowed fields", async () => {
    setAdmin();
    let capturedUpdate: any = null;
    mockFrom.mockImplementation((table: string) => {
      if (table === "profiles") return makeChain({ role: "admin" });
      const ch = makeChain({ id: 1 });
      ch.update = vi.fn((data: any) => { capturedUpdate = data; return ch; });
      return ch;
    });
    await PUT({
      request: makeRequest({ id: 1, title_en: "OK", injected: "xss" }, "PUT"),
      cookies: makeCookies(),
    } as any);
    if (capturedUpdate) {
      expect(capturedUpdate).not.toHaveProperty("injected");
    }
  });
});

describe("DELETE /api/admin/menu/categories", () => {
  it("returns 403 for non-admin", async () => {
    setNoUser();
    const res = await DELETE({ request: makeRequest({ id: 1 }, "DELETE"), cookies: makeCookies() } as any);
    expect(res.status).toBe(403);
  });

  it("returns 400 when id is missing", async () => {
    setAdmin();
    mockFrom.mockImplementation(() => makeChain({ role: "admin" }));
    const res = await DELETE({ request: makeRequest({}, "DELETE"), cookies: makeCookies() } as any);
    expect(res.status).toBe(400);
  });

  it("deletes category and returns ok", async () => {
    setAdmin();
    mockFrom.mockImplementation((table: string) => {
      if (table === "profiles") return makeChain({ role: "admin" });
      return makeChain(null, null);
    });
    const res = await DELETE({ request: makeRequest({ id: 3 }, "DELETE"), cookies: makeCookies() } as any);
    expect(res.status).toBe(200);
    const body = await readJson(res) as any;
    expect(body.ok).toBe(true);
  });
});
