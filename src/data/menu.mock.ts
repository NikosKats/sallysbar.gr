export type MenuCategory = {
  id: number;
  slug: string;
  name: string;
  sort: number;
  is_visible: boolean;
};

export type MenuItem = {
  id: number;
  category_id: number;
  slug: string;
  name: string;
  description?: string;
  price_cents: number;
  currency: "EUR";
  sort: number;
  is_visible: boolean;
  tags?: string[];
};

export const mockCategories: MenuCategory[] = [
  { id: 1, slug: "signature-cocktails", name: "Signature Cocktails", sort: 10, is_visible: true },
  { id: 2, slug: "classic-cocktails", name: "Classic Cocktails", sort: 20, is_visible: true },
  { id: 3, slug: "beers", name: "Beers", sort: 30, is_visible: true },
  { id: 4, slug: "wines", name: "Wines", sort: 40, is_visible: true },
  { id: 5, slug: "soft-drinks", name: "Soft Drinks", sort: 50, is_visible: true },
];

export const mockItems: MenuItem[] = [
  // Signature
  { id: 101, category_id: 1, slug: "skalas-passion", name: "Skala’s Passion", description: "Pineapple, cinnamon, passion fruit puree, lime", price_cents: 900, currency: "EUR", sort: 10, is_visible: true, tags: ["signature"] },
  { id: 102, category_id: 1, slug: "mandola-tai", name: "Mandola Tai", description: "Rum blend, citrus, almond", price_cents: 900, currency: "EUR", sort: 20, is_visible: true, tags: ["signature"] },

  // Classic
  { id: 201, category_id: 2, slug: "margarita", name: "Margarita", description: "Tequila, lime, triple sec", price_cents: 800, currency: "EUR", sort: 10, is_visible: true, tags: ["classic"] },
  { id: 202, category_id: 2, slug: "mojito", name: "Mojito", description: "Rum, lime, mint, sugar, soda", price_cents: 800, currency: "EUR", sort: 20, is_visible: true, tags: ["classic"] },

  // Beers
  { id: 301, category_id: 3, slug: "heineken", name: "Heineken", description: "", price_cents: 450, currency: "EUR", sort: 10, is_visible: true },
  { id: 302, category_id: 3, slug: "corona", name: "Corona", description: "", price_cents: 550, currency: "EUR", sort: 20, is_visible: true },

  // Soft drinks
  { id: 501, category_id: 5, slug: "coca-cola", name: "Coca-Cola", price_cents: 300, currency: "EUR", sort: 10, is_visible: true },
];