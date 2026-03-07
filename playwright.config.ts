import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:4321",
    trace: "on-first-retry",
    // Default: no pre-auth (unauthenticated tests use this)
  },
  projects: [
    // ── Unauthenticated (redirect / public page tests) ────────────────────────
    {
      name: "unauth",
      testMatch: "**/auth.spec.ts",
      use: { ...devices["Desktop Chrome"] },
    },
    // ── Admin-authenticated tests ─────────────────────────────────────────────
    {
      name: "admin",
      testMatch: ["**/admin-menu.spec.ts", "**/admin-tips.spec.ts"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: "tests/e2e/.auth/admin.json",
      },
    },
    // ── Staff-authenticated tests ─────────────────────────────────────────────
    {
      name: "staff",
      testMatch: "**/staff.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "tests/e2e/.auth/staff.json",
      },
    },
  ],
  webServer: process.env.CI
    ? {
        command: "npm run preview",
        url: "http://localhost:4321",
        reuseExistingServer: false,
      }
    : undefined,
});
