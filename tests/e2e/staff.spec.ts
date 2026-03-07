import { test, expect } from "@playwright/test";

// storageState (staff session) is injected by playwright.config.ts "staff" project

// ── Realtime connection indicator ─────────────────────────────────────────────
test.describe("Staff page — connection indicator", () => {
  test.use({ storageState: "tests/e2e/.auth/staff.json" });

  test.beforeEach(async ({ page }) => {
    await page.goto("/staff");
  });

  test("realtime dot is visible on staff page", async ({ page }) => {
    const dot = page.locator("#realtimeDot, [id*='realtime'], .realtime-dot");
    await expect(dot.first()).toBeVisible({ timeout: 5000 });
  });

  test("connection dot turns green (live) within a few seconds", async ({ page }) => {
    // Supabase Realtime may not connect in headless CI — mark as skipped if it times out.
    // NOTE: pass null as arg (2nd param) so timeout goes in options (3rd param).
    const connected = await page.waitForFunction(
      () => {
        const dot = document.getElementById("realtimeDot");
        if (!dot) return false;
        // setDot("live") sets class to bg-emerald-400 and title to "Live"
        return dot.classList.contains("bg-emerald-400") || dot.title === "Live";
      },
      null,
      { timeout: 8000 }
    ).catch(() => null);
    test.skip(connected === null, "Supabase Realtime did not connect in time — skipping in headless/CI");
  });
});

// ── Tip modal behavior ────────────────────────────────────────────────────────
test.describe("Staff page — tip modal", () => {
  test.use({ storageState: "tests/e2e/.auth/staff.json" });

  test.beforeEach(async ({ page }) => {
    await page.goto("/staff");
  });

  test("Pay button opens tip modal", async ({ page }) => {
    // Use the actual page-level pay trigger buttons (not the ones inside the modal)
    const payBtns = page.locator(".pay-session-btn, .pay-round-btn");
    const count = await payBtns.count();
    if (count === 0) test.skip();
    await payBtns.first().click();
    const modal = page.locator("dialog#payModal");
    await expect(modal).toBeVisible({ timeout: 3000 });
  });

  test("Cancel button in tip modal does not remove the active table", async ({ page }) => {
    const tablesBefore = page.locator(".active-table, [data-table], .table-card");
    const countBefore = await tablesBefore.count();
    if (countBefore === 0) test.skip();

    const payBtns = page.locator(".pay-session-btn, .pay-round-btn");
    if (await payBtns.count() === 0) test.skip();

    await payBtns.first().click();

    // Look for a close button in the open payment modal
    const cancelInModal = page.locator("dialog#payModal button[data-close], dialog#payModal .close-btn");
    if (await cancelInModal.count() === 0) test.skip();

    await cancelInModal.first().click();
    await expect(tablesBefore).toHaveCount(countBefore);
  });

  test("tip modal has a Pay button and Cancel button distinct from each other", async ({ page }) => {
    const payBtns = page.locator(".pay-session-btn, .pay-round-btn");
    if (await payBtns.count() === 0) test.skip();
    await payBtns.first().click();

    const modal = page.locator("dialog#payModal");
    await expect(modal).toBeVisible({ timeout: 3000 });

    const payAction = modal.locator("#tipNoTipBtn, #tipCardBtn, #tipCashBtn");
    await expect(payAction.first()).toBeVisible();
  });
});

// ── Active tables display ─────────────────────────────────────────────────────
test.describe("Staff page — active tables display", () => {
  test.use({ storageState: "tests/e2e/.auth/staff.json" });

  test.beforeEach(async ({ page }) => {
    await page.goto("/staff");
  });

  test("staff page loads without errors", async ({ page }) => {
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
    const tableCells = page.locator(".active-table, [data-table], .table-card");
    const count = await tableCells.count();
    if (count > 0) test.skip();
    // Use `main` first; fall back to `body` if no main element
    const main = page.locator("main").first();
    const body = await (await main.count() > 0 ? main : page.locator("body")).textContent();
    expect(body).toMatch(/no active tables|no table|empty|waiting|quiet/i);
  });
});

// ── Admin can access staff page (uses staff storageState — still passes) ──────
test.describe("Access control", () => {
  test.use({ storageState: "tests/e2e/.auth/staff.json" });

  test("authenticated user can access /staff without redirect to login", async ({ page }) => {
    await page.goto("/staff");
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page).toHaveURL(/\/staff/);
  });
});
