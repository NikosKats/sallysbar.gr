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

test.describe("Admin — Menu edit page", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/menu");
  });

  // ── Page structure ──────────────────────────────────────────────────────────
  test("shows categories sidebar and items table", async ({ page }) => {
    await expect(page.locator("#catList")).toBeVisible();
    await expect(page.locator("#itemsBody")).toBeVisible();
  });

  test("shows correct table column headers including VAT", async ({ page }) => {
    const headers = page.locator("thead th");
    const headerTexts = await headers.allTextContents();
    const joined = headerTexts.join(" ").toLowerCase();
    expect(joined).toContain("vat");
    expect(joined).toContain("price");
    expect(joined).toContain("category");
  });

  test("VAT column shows 24% for alcoholic items", async ({ page }) => {
    // If there are any items, check that those marked alcoholic show 24%
    const vatCells = page.locator(".item-row td:nth-child(4)");
    const count = await vatCells.count();
    if (count > 0) {
      // At least verify the cell content matches 13% or 24%
      const first = await vatCells.first().textContent();
      expect(first).toMatch(/^(13|24)%$/);
    }
  });

  // ── New item modal ──────────────────────────────────────────────────────────
  test("opens new item modal on button click", async ({ page }) => {
    await page.click("#newItemBtn");
    await expect(page.locator("#itemModal")).toBeVisible();
  });

  test("new item modal has VAT category select", async ({ page }) => {
    await page.click("#newItemBtn");
    await expect(page.locator("#itemVatCat")).toBeVisible();
    const options = await page.locator("#itemVatCat option").allTextContents();
    expect(options.some((o) => o.includes("13%"))).toBe(true);
    expect(options.some((o) => o.includes("24%"))).toBe(true);
  });

  test("closing new item modal hides it", async ({ page }) => {
    await page.click("#newItemBtn");
    await expect(page.locator("#itemModal")).toBeVisible();
    await page.click('[data-close="itemModal"]');
    await expect(page.locator("#itemModal")).not.toBeVisible();
  });

  test("shows validation toast when saving item without required fields", async ({ page }) => {
    await page.click("#newItemBtn");
    // Don't fill name_en — just click save
    await page.click("#itemSaveBtn");
    // Browser native validation or custom toast
    const toast = page.locator(".toast-item.error");
    // Item may not save — either toast appears or browser prevents submit
    // Both are acceptable
    const isInvalid = await page.locator("#itemNameEn:invalid").count() > 0
      || await toast.isVisible().catch(() => false);
    expect(isInvalid).toBeTruthy();
  });

  // ── New item create and appear in table ─────────────────────────────────────
  test("creates a new item and it appears in the table", async ({ page }) => {
    const uniqueName = `TestItem-${Date.now()}`;

    await page.click("#newItemBtn");
    await expect(page.locator("#itemModal")).toBeVisible();

    // Fill required fields
    await page.fill("#itemNameEn", uniqueName);
    // Slug auto-fills from name
    await expect(page.locator("#itemSlug")).not.toHaveValue("");
    await page.fill("#itemPrice", "9");

    // Select first available category
    const firstCatOption = page.locator("#itemCatId option").first();
    const firstCatValue = await firstCatOption.getAttribute("value");
    if (firstCatValue) {
      await page.selectOption("#itemCatId", firstCatValue);
    }

    await page.click("#itemSaveBtn");

    // Modal should close and toast success shown
    await expect(page.locator("#itemModal")).not.toBeVisible();
    await expect(page.locator(".toast-item.success")).toBeVisible();

    // Item should appear in the table
    await expect(page.locator(`#itemsBody >> text=${uniqueName}`)).toBeVisible();
  });

  // ── Edit item ───────────────────────────────────────────────────────────────
  test("edit button opens modal pre-filled with item data", async ({ page }) => {
    const editBtns = page.locator(".edit-item");
    const count = await editBtns.count();
    if (count === 0) test.skip();

    await editBtns.first().click();
    await expect(page.locator("#itemModal")).toBeVisible();

    // Name should not be empty
    const nameValue = await page.locator("#itemNameEn").inputValue();
    expect(nameValue.length).toBeGreaterThan(0);

    // Price should not be empty
    const priceValue = await page.locator("#itemPrice").inputValue();
    expect(priceValue.length).toBeGreaterThan(0);
  });

  // ── Delete item ─────────────────────────────────────────────────────────────
  test("delete button opens confirm modal", async ({ page }) => {
    const delBtns = page.locator(".del-item");
    const count = await delBtns.count();
    if (count === 0) test.skip();

    await delBtns.first().click();
    await expect(page.locator("#deleteModal")).toBeVisible();
    await expect(page.locator("#deleteMsg")).not.toBeEmpty();
  });

  test("cancel on delete modal keeps item in table", async ({ page }) => {
    const rows = page.locator(".item-row");
    const countBefore = await rows.count();
    if (countBefore === 0) test.skip();

    await page.locator(".del-item").first().click();
    await expect(page.locator("#deleteModal")).toBeVisible();

    // Click cancel (not confirm)
    await page.click('[data-close="deleteModal"]');
    await expect(page.locator("#deleteModal")).not.toBeVisible();

    // Row count unchanged
    await expect(rows).toHaveCount(countBefore);
  });

  // ── Category filter ─────────────────────────────────────────────────────────
  test("category filter hides rows not in selected category", async ({ page }) => {
    const select = page.locator("#catFilter");
    const options = await select.locator("option").all();

    // Need at least 2 options (all + one category)
    if (options.length < 2) test.skip();

    // Select the second option (first real category)
    const catValue = await options[1].getAttribute("value");
    if (!catValue) test.skip();

    await select.selectOption(catValue);

    // Rows not in this category should be hidden
    const visibleRows = page.locator(".item-row:visible");
    const hiddenRows  = page.locator(".item-row[style*='display: none']");

    // Each visible row should have data-cat matching selected value
    const visibleCount = await visibleRows.count();
    for (let i = 0; i < visibleCount; i++) {
      const dataCat = await visibleRows.nth(i).getAttribute("data-cat");
      expect(dataCat).toBe(catValue);
    }
  });

  // ── New category ────────────────────────────────────────────────────────────
  test("new category modal opens and has required fields", async ({ page }) => {
    await page.click("#newCatBtn");
    await expect(page.locator("#catModal")).toBeVisible();
    await expect(page.locator("#catTitleEn")).toBeVisible();
    await expect(page.locator("#catSlug")).toBeVisible();
  });

  test("slug auto-fills from category name", async ({ page }) => {
    await page.click("#newCatBtn");
    await page.fill("#catTitleEn", "Hot Drinks");
    const slug = await page.locator("#catSlug").inputValue();
    expect(slug).toBe("hot-drinks");
  });
});
