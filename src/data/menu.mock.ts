export type Lang = "en" | "el";

export type MenuCategory = {
  id: number;
  slug: string;
  title_en: string;
  title_el: string;
  sort: number;
  is_visible: boolean;
};

export type MenuItem = {
  id: number;
  category_id: number;
  slug: string;
  name_en: string;
  name_el: string;
  description_en?: string;
  description_el?: string;
  price_cents: number;
  currency: "EUR";
  sort: number;
  is_visible: boolean;
  tags?: string[];
};

export const mockCategories: MenuCategory[] = [
  { id: 1, slug: "signature-cocktails", title_en: "Signature Cocktails", title_el: "Signature Κοκτέιλ", sort: 10, is_visible: true },
  { id: 2, slug: "classic-cocktails",   title_en: "Classic Cocktails",   title_el: "Κλασικά Κοκτέιλ",   sort: 20, is_visible: true },
  { id: 3, slug: "beers",              title_en: "Beers",              title_el: "Μπύρες",            sort: 30, is_visible: true },
  { id: 4, slug: "wines",              title_en: "Wines",              title_el: "Κρασιά",            sort: 40, is_visible: true },
  { id: 5, slug: "soft-drinks",        title_en: "Soft Drinks",        title_el: "Αναψυκτικά",        sort: 50, is_visible: true },
];

export const mockItems: MenuItem[] = [
  // Signature
  {
    id: 101, category_id: 1, slug: "skalas-passion",
    name_en: "Skala’s Passion",
    name_el: "Skala’s Passion",
    description_en: "Pineapple, cinnamon, passion fruit puree, lime",
    description_el: "Ανανάς, κανέλα, πουρές φρούτου του πάθους, λάιμ",
    price_cents: 900, currency: "EUR", sort: 10, is_visible: true, tags: ["signature"]
  },
  {
    id: 102, category_id: 1, slug: "mandola-tai",
    name_en: "Mandola Tai",
    name_el: "Mandola Tai",
    description_en: "Rum blend, citrus, almond",
    description_el: "Blend ρούμι, εσπεριδοειδή, αμύγδαλο",
    price_cents: 900, currency: "EUR", sort: 20, is_visible: true, tags: ["signature"]
  },

  // Classic
  {
    id: 201, category_id: 2, slug: "margarita",
    name_en: "Margarita",
    name_el: "Margarita",
    description_en: "Tequila, lime, triple sec",
    description_el: "Τεκίλα, λάιμ, triple sec",
    price_cents: 800, currency: "EUR", sort: 10, is_visible: true, tags: ["classic"]
  },
  {
    id: 202, category_id: 2, slug: "mojito",
    name_en: "Mojito",
    name_el: "Mojito",
    description_en: "Rum, lime, mint, sugar, soda",
    description_el: "Ρούμι, λάιμ, μέντα, ζάχαρη, σόδα",
    price_cents: 800, currency: "EUR", sort: 20, is_visible: true, tags: ["classic"]
  },

  // Beers
  {
    id: 301, category_id: 3, slug: "heineken",
    name_en: "Heineken",
    name_el: "Heineken",
    description_en: "",
    description_el: "",
    price_cents: 450, currency: "EUR", sort: 10, is_visible: true
  },
  {
    id: 302, category_id: 3, slug: "corona",
    name_en: "Corona",
    name_el: "Corona",
    description_en: "",
    description_el: "",
    price_cents: 550, currency: "EUR", sort: 20, is_visible: true
  },

  // Soft drinks
  {
    id: 501, category_id: 5, slug: "coca-cola",
    name_en: "Coca-Cola",
    name_el: "Coca-Cola",
    description_en: "",
    description_el: "",
    price_cents: 300, currency: "EUR", sort: 10, is_visible: true
  },
];