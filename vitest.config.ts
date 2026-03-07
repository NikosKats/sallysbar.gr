import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/unit/**/*.test.ts"],
    setupFiles: ["./tests/unit/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/pages/api/**/*.ts"],
      reporter: ["text", "html"],
    },
  },
  define: {
    // Provide env vars available to tested modules via import.meta.env
    "import.meta.env.PUBLIC_SUPABASE_URL": JSON.stringify(
      process.env.PUBLIC_SUPABASE_URL ?? "https://test.supabase.co"
    ),
    "import.meta.env.PUBLIC_SUPABASE_ANON_KEY": JSON.stringify(
      process.env.PUBLIC_SUPABASE_ANON_KEY ?? "test-anon-key"
    ),
    "import.meta.env.SUPABASE_SERVICE_ROLE_KEY": JSON.stringify(
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? "test-service-role-key"
    ),
    "import.meta.env.TELEGRAM_BARMAN_CHAT_ID": JSON.stringify("12345"),
    "import.meta.env.TELEGRAM_WAITER_CHAT_ID": JSON.stringify("67890"),
  },
  resolve: {
    alias: {
      // Stub Astro virtual modules so imports resolve in Node/Vitest
      "astro:middleware": fileURLToPath(
        new URL("./tests/__mocks__/astro-middleware.ts", import.meta.url)
      ),
    },
  },
});
