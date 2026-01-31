import { mockCategories, mockItems } from "../data/menu.mock";

export async function getMenu() {
  // Later: replace with `fetch("/api/menu").then(r => r.json())`
  const categories = [...mockCategories]
    .filter(c => c.is_visible)
    .sort((a, b) => a.sort - b.sort);

  const items = [...mockItems]
    .filter(i => i.is_visible)
    .sort((a, b) => (a.category_id - b.category_id) || (a.sort - b.sort));

  return { categories, items };
}

export function formatPriceEUR(price_cents: number) {
  return `€${(price_cents / 100).toFixed(0)}`;
}