import { test, expect, Page } from "@playwright/test";

const STAFF_EMAIL    = process.env.E2E_STAFF_EMAIL    ?? "staff@sallysbar.gr";
const STAFF_PASSWORD = process.env.E2E_STAFF_PASSWORD ?? "changeme";
const ADMIN_EMAIL    = process.env.E2E_ADMIN_EMAIL    ?? "admin@sallysbar.gr";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "changeme";

async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes("/login"));
}

// ── Realtime connection indicator ─────────────────────────────────────────────
test.describe("Staff page — connection indicator", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, STAFF_EMAIL, STAFF_PASSWORD);
    await page.goto("/staff");
  });

  test("realtime dot is visible on staff page", async ({ page }) => {
    // The dot element should be present
    const dot = page.locator("#realtimeDot, [id*='realtime'], .realtime-dot");
    await expect(dot.first()).toBeVisible({ timeout: 5000 });
  });

  test("connection dot turns green (live) within a few seconds", async ({ page }) => {
    // Wait for connection to establish (up to 8s)
    await page.waitForFunction(
      () => {
        const dot = document.querySelector("[id*='realtime'], .realtime-dot, #realtimeDot");
        if (!dot) return false;
        const style = window.getComputedStyle(dot);
        // Green background means connected
        return style.backgroundColor.includes("34, 197") || // rgb(34,197,94) = green-400
          dot.classList.contains("bg-green-400") ||
          dot.getAttribute("data-status") === "live";
      },
      { timeout: 8000 }
    );
  });
});

// ── Tip modal behavior ────────────────────────────────────────────────────────
test.describe("Staff page — tip modal", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, STAFF_EMAIL, STAFF_PASSWORD);
    await page.goto("/staff");
  });

  test("Pay button opens tip modal", async ({ page }) => {
    const payBtns = page.locator("button:has-text('Pay'), button[data-action='pay']");
    const count = await payBtns.count();
    if (count === 0) {
      test.skip(); // No active tables to pay
    }
    await payBtns.first().click();
    // Tip modal or step should appear
    const modal = page.locator("dialog[open], [id*='tip']:visible, [id*='modal']:visible");
    await expect(modal.first()).toBeVisible({ timeout: 3000 });
  });

  test("Cancel button in tip modal does not remove the active table", async ({ page }) => {
    const tablesBefore = page.locator(".active-table, [data-table], .table-card");
    const countBefore = await tablesBefore.count();
    if (countBefore === 0) test.skip();

    const payBtns = page.locator("button:has-text('Pay'), button[data-action='pay']");
    if (await payBtns.count() === 0) test.skip();

    await payBtns.first().click();

    // Look for a Cancel button (not the pay button)
    const cancelInModal = page.locator(
      "dialog[open] button:has-text('Cancel'), " +
      "[id*='tipCancelBtn'], " +
      "button[id*='cancel']:visible"
    );

    if (await cancelInModal.count() === 0) test.skip();

    await cancelInModal.first().click();

    // Table count should be unchanged
    await expect(tablesBefore).toHaveCount(countBefore);
  });

  test("tip modal has a Pay button and Cancel button distinct from each other", async ({ page }) => {
    const payBtns = page.locator("button:has-text('Pay'), button[data-action='pay']");
    if (await payBtns.count() === 0) test.skip();
    await payBtns.first().click();

    const modal = page.locator("dialog[open]");
    await expect(modal.first()).toBeVisible({ timeout: 3000 });

    // Should have both pay-type action and cancel
    const cancelBtn = modal.locator("button:has-text('Cancel'), button:has-text('cancel')");
    const payAction = modal.locator(
      "button:has-text('Pay'), button:has-text('cash'), button:has-text('card')"
    );
    await expect(cancelBtn.first()).toBeVisible();
    await expect(payAction.first()).toBeVisible();
  });
});

// ── Active tables display ─────────────────────────────────────────────────────
test.describe("Staff page — active tables display", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, STAFF_EMAIL, STAFF_PASSWORD);
    await page.goto("/staff");
  });

  test("staff page loads without errors", async ({ page }) => {
    // No JS errors on load
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.waitForLoadState("networkidle");
    expect(errors.filter((e) => !e.includes("Supabase"))).toHaveLength(0);
  });

  test("page title or heading contains Sally or Bar", async ({ page }) => {
    const title = await page.title();
    const heading = page.locator("h1, h2");
    const headingText = await heading.first().textContent().catch(() => "");
    expect(title + headingText).toMatch(/sally|bar|staff/i);
  });

  test("shows empty state message when no active tables", async ({ page }) => {
    // This test only runs when there are no active tables
    const tableCells = page.locator(".active-table, [data-table], .table-card");
    const count = await tableCells.count();
    if (count > 0) test.skip();

    // Should show some kind of empty state
    const body = await page.locator("main, body").textContent();
    expect(body).toMatch(/no table|empty|waiting|quiet/i);
  });
});

// ── Admin access to staff page ────────────────────────────────────────────────
test.describe("Admin access to staff page", () => {
  test("admin can also access /staff", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/staff");
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page).toHaveURL(/\/staff/);
  });
});
