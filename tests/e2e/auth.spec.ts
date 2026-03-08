import { test, expect } from "@playwright/test";

// This spec runs without any storageState (unauthenticated / login-flow tests).
// The "unauth" project in playwright.config.ts handles this file.

// ── Unauthenticated access ────────────────────────────────────────────────────
test.describe("Unauthenticated access", () => {
  test("redirects /admin to /login", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login/);
  });

  test("redirects /staff to /login", async ({ page }) => {
    await page.goto("/staff");
    await expect(page).toHaveURL(/\/login/);
  });

  test("redirects /admin/menu to /login", async ({ page }) => {
    await page.goto("/admin/menu");
    await expect(page).toHaveURL(/\/login/);
  });

  test("redirects /admin/users to /login", async ({ page }) => {
    await page.goto("/admin/users");
    await expect(page).toHaveURL(/\/login/);
  });

  test("login page renders email and password fields", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    // Submit button exists (may be disabled until Turnstile passes)
    await expect(page.locator("#loginSubmitBtn")).toBeVisible();
  });
});

// ── Login form — wrong credentials (bypass Turnstile, submit, expect error) ───
test.describe("Login flow — wrong credentials", () => {
  test("shows error URL param for wrong credentials", async ({ page }) => {
    await page.goto("/login");
    await page.fill("#email", "wrong@example.com");
    await page.fill("#password", "wrongpassword");

    // Bypass Turnstile disable guard
    await page.evaluate(() => {
      const btn = document.getElementById("loginSubmitBtn") as HTMLButtonElement;
      if (btn) btn.disabled = false;
    });

    await Promise.all([
      page.waitForURL((url) => url.searchParams.has("error") || url.pathname !== "/login", {
        timeout: 15000,
      }),
      page.click("#loginSubmitBtn"),
    ]);

    // Should stay on /login with error param
    await expect(page).toHaveURL(/\/login.*error=/);
  });
});

// ── Admin access control (uses pre-saved admin storageState) ──────────────────
// These run in the "admin" project which has storageState already set.
// We add them here as a separate describe that can also be run standalone.
test.describe("Admin access control", () => {
  test.use({ storageState: "tests/e2e/.auth/admin-auth.json" });

  test("admin can access /admin", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page).toHaveURL(/\/admin/);
  });

  test("admin can access /admin/menu", async ({ page }) => {
    await page.goto("/admin/menu");
    await expect(page).toHaveURL(/\/admin\/menu/);
  });

  test("admin can access /admin/users", async ({ page }) => {
    await page.goto("/admin/users");
    await expect(page).toHaveURL(/\/admin\/users/);
  });

  test("admin can access /admin/tips", async ({ page }) => {
    await page.goto("/admin/tips");
    await expect(page).toHaveURL(/\/admin\/tips/);
  });
});

// ── Logout flow ───────────────────────────────────────────────────────────────
// Uses a dedicated session so the logout does not invalidate the shared admin.json
// session used by admin-menu and admin-tips tests.
test.describe("Logout flow", () => {
  test.use({ storageState: "tests/e2e/.auth/admin-logout.json" });

  test("logout clears session and redirects away from protected pages", async ({ page }) => {
    // Confirm admin session works
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin/);

    // Logout — the app redirects to "/" (homepage)
    await page.goto("/logout");
    await expect(page).not.toHaveURL(/\/admin/);

    // Session gone — /admin should now redirect to login
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login/);
  });
});
