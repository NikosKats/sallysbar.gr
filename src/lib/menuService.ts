import { supabaseAdmin } from "./supabase";

export type Lang = "en" | "el";

export type Menu = {
  id: number;
  slug: string;
  name_en: string;
  name_el: string;
  is_active: boolean;
  start_time: string | null; // "HH:MM:SS"
  end_time:   string | null;
  sort: number;
};

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:00`;
}

/** Returns menus currently visible to guests: is_active + inside time window (or no window). */
export async function getActiveMenus(): Promise<Menu[]> {
  const { data } = await supabaseAdmin
    .from("menus").select("*").eq("is_active", true).order("sort");
  const now = nowHHMM();
  return (data ?? []).filter((m: any) => {
    if (!m.start_time && !m.end_time) return true;
    const s = m.start_time ?? "00:00:00";
    const e = m.end_time   ?? "23:59:59";
    if (s <= e) return now >= s && now <= e;
    // wrap past midnight
    return now >= s || now <= e;
  });
}

export async function getMenu(lang: Lang = "en", menuId?: number) {
  const menus = await getActiveMenus();
  const chosen = menuId ? menus.find(m => m.id === menuId) : menus[0];
  if (!chosen) return { menu: null, menus: [], categories: [], items: [] };

  const { data: rawCats } = await supabaseAdmin
    .from("menu_categories")
    .select("*")
    .eq("is_visible", true)
    .eq("menu_id", chosen.id)
    .order("sort");

  const catIds = (rawCats ?? []).map((c: any) => c.id);
  const { data: rawItems } = catIds.length
    ? await supabaseAdmin
        .from("menu_items")
        .select("*")
        .eq("is_visible", true)
        .in("category_id", catIds)
        .order("sort")
    : { data: [] as any[] };

  const categories = (rawCats ?? []).map((c: any) => ({
    id: c.id, slug: c.slug, menu_id: c.menu_id,
    name: lang === "el" ? c.title_el : c.title_en,
    sort: c.sort, is_visible: c.is_visible,
  }));

  const items = (rawItems ?? []).map((i: any) => ({
    id: i.id, category_id: i.category_id, slug: i.slug,
    name: lang === "el" ? i.name_el : i.name_en,
    description: lang === "el" ? (i.description_el ?? "") : (i.description_en ?? ""),
    price_cents: i.price_cents, currency: i.currency ?? "EUR",
    sort: i.sort, is_visible: i.is_visible, tags: i.tags ?? [],
  }));

  return { menu: chosen, menus, categories, items };
}

/** Returns items from every currently-active menu, merged — used by staff & AI chat. */
export async function getMenuAll(lang: Lang = "en") {
  const menus = await getActiveMenus();
  if (!menus.length) return { menus: [], categories: [], items: [] };

  const menuIds = menus.map(m => m.id);
  const { data: rawCats } = await supabaseAdmin
    .from("menu_categories").select("*").eq("is_visible", true).in("menu_id", menuIds).order("sort");
  const catIds = (rawCats ?? []).map((c: any) => c.id);
  const { data: rawItems } = catIds.length
    ? await supabaseAdmin.from("menu_items").select("*").eq("is_visible", true).in("category_id", catIds).order("sort")
    : { data: [] as any[] };

  const categories = (rawCats ?? []).map((c: any) => ({
    id: c.id, slug: c.slug, menu_id: c.menu_id,
    name: lang === "el" ? c.title_el : c.title_en,
    sort: c.sort, is_visible: c.is_visible,
  }));
  const items = (rawItems ?? []).map((i: any) => ({
    id: i.id, category_id: i.category_id, slug: i.slug,
    name: lang === "el" ? i.name_el : i.name_en,
    description: lang === "el" ? (i.description_el ?? "") : (i.description_en ?? ""),
    price_cents: i.price_cents, currency: i.currency ?? "EUR",
    sort: i.sort, is_visible: i.is_visible, tags: i.tags ?? [],
  }));
  return { menus, categories, items };
}

/** Admin view — returns all menus + categories + items, unfiltered. */
export async function getMenuAdmin() {
  const [{ data: menus }, { data: categories }, { data: items }] = await Promise.all([
    supabaseAdmin.from("menus").select("*").order("sort"),
    supabaseAdmin.from("menu_categories").select("*").order("sort"),
    supabaseAdmin.from("menu_items").select("*").order("category_id").order("sort"),
  ]);
  return {
    menus: (menus ?? []) as any[],
    categories: (categories ?? []) as any[],
    items: (items ?? []) as any[],
  };
}

export function formatPriceEUR(price_cents: number) {
  return `€${(price_cents / 100).toFixed(0)}`;
}
