import { mockCategories, mockItems, type Lang } from "../data/menu.mock";

export async function getMenu(lang: Lang = "en") {
  const categories = [...mockCategories]
    .filter((c) => c.is_visible)
    .sort((a, b) => a.sort - b.sort)
    .map((c) => ({
      id: c.id,
      slug: c.slug,
      name: lang === "el" ? c.title_el : c.title_en,
      sort: c.sort,
      is_visible: c.is_visible,
    }));

  const items = [...mockItems]
    .filter((i) => i.is_visible)
    .sort((a, b) => (a.category_id - b.category_id) || (a.sort - b.sort))
    .map((i) => ({
      id: i.id,
      category_id: i.category_id,
      slug: i.slug,
      name: lang === "el" ? i.name_el : i.name_en,
      description: lang === "el" ? (i.description_el ?? "") : (i.description_en ?? ""),
      price_cents: i.price_cents,
      currency: i.currency,
      sort: i.sort,
      is_visible: i.is_visible,
      tags: i.tags ?? [],
    }));

  return { categories, items };
}

export function formatPriceEUR(price_cents: number) {
  return `€${(price_cents / 100).toFixed(0)}`;
}