import { test, expect, Page } from "@playwright/test";

const ADMIN_EMAIL    = process.env.E2E_ADMIN_EMAIL    ?? "admin@sallysbar.gr";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "changeme";

async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.fill('input[type="email"]', ADMIN_EMAIL);
  await page.fill('input[type="password"]', ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes("/login"));
}

test.describe("Admin — Tips page", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/tips");
  });

  // ── Page structure ──────────────────────────────────────────────────────────
  test("renders tips table with Date, Amount, Type, Edit, Delete columns", async ({ page }) => {
    const headers = page.locator("thead th");
    const texts = await headers.allTextContents();
    const joined = texts.join(" ").toLowerCase();
    expect(joined).toContain("date");
    expect(joined).toContain("amount");
    expect(joined).toContain("type");
    // Edit and Delete are in action cells, not headers — check for buttons
    const editBtns = page.locator("[data-action='edit']");
    const delBtns  = page.locator("[data-action='delete']");
    const tipRows = page.locator("#tipsTableBody tr");
    const rowCount = await tipRows.count();
    if (rowCount > 0) {
      await expect(editBtns.first()).toBeVisible();
      await expect(delBtns.first()).toBeVisible();
    }
  });

  // ── Edit tip ────────────────────────────────────────────────────────────────
  test("edit button opens edit modal pre-filled with tip data", async ({ page }) => {
    const editBtns = page.locator("[data-action='edit']");
    const count = await editBtns.count();
    if (count === 0) test.skip();

    await editBtns.first().click();

    // Edit modal should be visible
    const editModal = page.locator("#editTipModal");
    await expect(editModal).toBeVisible();

    // Amount field should have a value
    const amountInput = editModal.locator("input[type='number'], input[name='amount']");
    if (await amountInput.count() > 0) {
      const val = await amountInput.first().inputValue();
      expect(Number(val)).toBeGreaterThan(0);
    }
  });

  test("closing edit modal without saving does not change tip", async ({ page }) => {
    const editBtns = page.locator("[data-action='edit']");
    const count = await editBtns.count();
    if (count === 0) test.skip();

    // Get original amount text of first row
    const firstRow = page.locator("#tipsTableBody tr").first();
    const originalText = await firstRow.textContent();

    await editBtns.first().click();
    const editModal = page.locator("#editTipModal");
    await expect(editModal).toBeVisible();

    // Close without saving
    await page.keyboard.press("Escape");
    await expect(editModal).not.toBeVisible();

    // Row should be unchanged
    const updatedText = await firstRow.textContent();
    expect(updatedText).toBe(originalText);
  });

  // ── Delete tip ──────────────────────────────────────────────────────────────
  test("delete button opens confirm modal", async ({ page }) => {
    const delBtns = page.locator("[data-action='delete']");
    const count = await delBtns.count();
    if (count === 0) test.skip();

    await delBtns.first().click();
    const deleteModal = page.locator("#deleteTipModal");
    await expect(deleteModal).toBeVisible();
  });

  test("confirming delete removes tip row", async ({ page }) => {
    const tipRows = page.locator("#tipsTableBody tr");
    const countBefore = await tipRows.count();
    if (countBefore === 0) test.skip();

    const delBtns = page.locator("[data-action='delete']");
    await delBtns.first().click();

    const deleteModal = page.locator("#deleteTipModal");
    await expect(deleteModal).toBeVisible();

    // Confirm delete
    const confirmBtn = deleteModal.locator("button[data-confirm], button.btn-danger").first();
    await confirmBtn.click();

    await expect(deleteModal).not.toBeVisible();
    await expect(tipRows).toHaveCount(countBefore - 1);
  });

  test("cancelling delete keeps the row", async ({ page }) => {
    const tipRows = page.locator("#tipsTableBody tr");
    const countBefore = await tipRows.count();
    if (countBefore === 0) test.skip();

    const delBtns = page.locator("[data-action='delete']");
    await delBtns.first().click();

    const deleteModal = page.locator("#deleteTipModal");
    await expect(deleteModal).toBeVisible();

    // Cancel
    const cancelBtn = deleteModal.locator("button[data-close], button.btn-ghost").first();
    await cancelBtn.click();

    await expect(deleteModal).not.toBeVisible();
    await expect(tipRows).toHaveCount(countBefore);
  });

  // ── Date column ─────────────────────────────────────────────────────────────
  test("date column shows a non-empty date string for each tip", async ({ page }) => {
    const tipRows = page.locator("#tipsTableBody tr");
    const count = await tipRows.count();
    if (count === 0) test.skip();

    // First date cell (column index depends on layout — find td with date-like content)
    const firstRowText = await tipRows.first().textContent();
    // Should contain a date-like pattern (year or slash or hyphen separated)
    expect(firstRowText).toMatch(/\d{4}|\d{1,2}\/\d{1,2}|\d{1,2}-\d{1,2}/);
  });
});
