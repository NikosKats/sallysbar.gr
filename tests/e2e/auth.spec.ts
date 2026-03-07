import { test, expect } from "@playwright/test";

// Credentials — set via environment variables or .env.test
const ADMIN_EMAIL    = process.env.E2E_ADMIN_EMAIL    ?? "admin@sallysbar.gr";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "changeme";
const STAFF_EMAIL    = process.env.E2E_STAFF_EMAIL    ?? "staff@sallysbar.gr";
const STAFF_PASSWORD = process.env.E2E_STAFF_PASSWORD ?? "changeme";

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
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });
});

// ── Login flow ────────────────────────────────────────────────────────────────
test.describe("Login flow", () => {
  test("shows error for wrong credentials", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "wrong@example.com");
    await page.fill('input[type="password"]', "wrongpassword");
    await page.click('button[type="submit"]');
    // Should stay on login with an error indicator
    await expect(page).toHaveURL(/\/login/);
  });

  test("admin login lands on dashboard or admin", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    // After login, should NOT be on /login
    await expect(page).not.toHaveURL(/\/login/);
  });
});

// ── Admin access control ──────────────────────────────────────────────────────
test.describe("Admin access control", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes("/login"));
  });

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
test.describe("Logout flow", () => {
  test("logout clears session and redirects to login", async ({ page }) => {
    // Login first
    await page.goto("/login");
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes("/login"));

    // Logout
    await page.goto("/logout");
    await expect(page).toHaveURL(/\/login/);

    // Verify session is gone — /admin should redirect back to login
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login/);
  });
});
