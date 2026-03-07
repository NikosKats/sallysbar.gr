import { vi } from "vitest";

// Global stubs for @supabase/ssr parseCookieHeader (used by createSupabaseServerClient)
vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
  })),
  parseCookieHeader: vi.fn(() => []),
}));
