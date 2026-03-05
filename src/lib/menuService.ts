import { supabaseAdmin } from "./supabase";

export type Lang = "en" | "el";

export async function getMenu(lang: Lang = "en") {
  const { data: rawCats } = await supabaseAdmin
    .from("menu_categories")
    .select("*")
    .eq("is_visible", true)
    .order("sort");

  const { data: rawItems } = await supabaseAdmin
    .from("menu_items")
    .select("*")
    .eq("is_visible", true)
    .order("sort");

  const categories = (rawCats ?? []).map((c: any) => ({
    id: c.id,
    slug: c.slug,
    name: lang === "el" ? c.title_el : c.title_en,
    sort: c.sort,
    is_visible: c.is_visible,
  }));

  const items = (rawItems ?? []).map((i: any) => ({
    id: i.id,
    category_id: i.category_id,
    slug: i.slug,
    name: lang === "el" ? i.name_el : i.name_en,
    description: lang === "el" ? (i.description_el ?? "") : (i.description_en ?? ""),
    price_cents: i.price_cents,
    currency: i.currency ?? "EUR",
    sort: i.sort,
    is_visible: i.is_visible,
    tags: i.tags ?? [],
  }));

  return { categories, items };
}

/** Returns raw DB rows with all fields — for admin use only. */
export async function getMenuAdmin() {
  const { data: categories } = await supabaseAdmin
    .from("menu_categories")
    .select("*")
    .order("sort");

  const { data: items } = await supabaseAdmin
    .from("menu_items")
    .select("*")
    .order("category_id")
    .order("sort");

  return {
    categories: (categories ?? []) as any[],
    items: (items ?? []) as any[],
  };
}

export function formatPriceEUR(price_cents: number) {
  return `€${(price_cents / 100).toFixed(0)}`;
}