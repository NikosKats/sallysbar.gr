/**
 * Menu seed script — run once to populate Supabase with the full menu.
 * Usage: node scripts/seed-menu.mjs
 */

import { createClient } from "@supabase/supabase-js";

import { readFileSync } from "fs";

const SUPABASE_URL = "https://nbhzodginrdblczjccuk.supabase.co";

function loadServiceKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    const lines = readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n");
    const line = lines.find(l => l.startsWith("SUPABASE_SERVICE_ROLE_KEY="));
    return line?.split("=").slice(1).join("=").trim() ?? "";
  } catch { return ""; }
}
const SERVICE_KEY = loadServiceKey();

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ── Categories ──────────────────────────────────────────────────────────────
const CATEGORIES = [
  { slug: "signature-cocktails", title_en: "Signature Cocktails", title_el: "Signature Κοκτέιλ", sort: 10, is_visible: true },
  { slug: "classic-cocktails",   title_en: "Classic Cocktails",   title_el: "Κλασικά Κοκτέιλ",   sort: 20, is_visible: true },
  { slug: "mocktails",           title_en: "Mocktails",           title_el: "Mocktails",           sort: 30, is_visible: true },
  { slug: "beers",               title_en: "Beers",               title_el: "Μπύρες",              sort: 40, is_visible: true },
  { slug: "wines",               title_en: "Wines",               title_el: "Κρασιά",              sort: 50, is_visible: true },
  { slug: "soft-drinks",         title_en: "Soft Drinks",         title_el: "Αναψυκτικά",          sort: 60, is_visible: true },
  { slug: "drinks",              title_en: "Drinks",              title_el: "Ποτά",                sort: 70, is_visible: true },
  { slug: "ciders",              title_en: "Ciders",              title_el: "Ciders",              sort: 80, is_visible: true },
];

// ── Items factory (categorySlug → items) ────────────────────────────────────
const ITEMS_BY_CAT = {
  "signature-cocktails": [
    // Rum Based
    { name_en: "Skala's Passion",   name_el: "Skala's Passion",  description_en: "Rum combined with cinnamon, passion fruit, pineapple and bitters",                      description_el: "Ρούμι με κανέλα, φρούτο του πάθους, ανανά και bitters",                     price_cents: 900, sort: 10, tags: ["signature","rum"] },
    { name_en: "Mandola Tai",       name_el: "Mandola Tai",       description_en: "Rum blend combined with orgeat, orange curaçao, lime juice, bitters and almond foam",    description_el: "Blend ρούμι με orgeat, orange curaçao, λάιμ, bitters και αφρό αμυγδάλου",   price_cents: 900, sort: 20, tags: ["signature","rum"] },
    { name_en: "Dubai Chocolate",   name_el: "Dubai Chocolate",   description_en: "Blend of rums, baklava syrup, chocolate syrup, pistachio syrup, lime",                   description_el: "Blend ρούμι, σιρόπι μπακλαβά, σοκολάτα, φυστίκι, λάιμ",                      price_cents: 900, sort: 30, tags: ["signature","rum"] },
    { name_en: "Velvet Touch",      name_el: "Velvet Touch",      description_en: "Red velvet foam, rum, piña colada cordial",                                               description_el: "Αφρός κόκκινου βελούδου, ρούμι, piña colada cordial",                         price_cents: 900, sort: 40, tags: ["signature","rum"] },
    // Gin Based
    { name_en: "Collie's Heaven",   name_el: "Collie's Heaven",   description_en: "Gin combined with masticha, cucumber, green apple and ginger essence",                   description_el: "Τζιν με μαστίχα, αγγούρι, πράσινο μήλο και ginger essence",                 price_cents: 900, sort: 50, tags: ["signature","gin"] },
    { name_en: "Pink Oasis",        name_el: "Pink Oasis",        description_en: "Gin paired with grapefruit liqueur, mint and sugar",                                     description_el: "Τζιν με γκρέιπφρουτ λικέρ, μέντα και ζάχαρη",                               price_cents: 900, sort: 60, tags: ["signature","gin"] },
    { name_en: "Violet Bliss",      name_el: "Violet Bliss",      description_en: "Gin, batida de coco, violet syrup, fresh lemon, strawberry purée",                       description_el: "Τζιν, batida de coco, σιρόπι βιολέτας, φρέσκο λεμόνι, φράουλα",             price_cents: 900, sort: 70, tags: ["signature","gin"] },
    { name_en: "Ionian Breeze",     name_el: "Ionian Breeze",     description_en: "Hyacinth, green apple, yuzu, gin, greek tonic flavours",                                 description_el: "Υάκινθος, πράσινο μήλο, yuzu, τζιν, ελληνικό τόνικ",                        price_cents: 900, sort: 80, tags: ["signature","gin"] },
    { name_en: "Basil Pleasure",    name_el: "Basil Pleasure",    description_en: "Basil cordial, gin, greek tonic flavours",                                               description_el: "Cordial βασιλικού, τζιν, ελληνικό τόνικ",                                    price_cents: 900, sort: 90, tags: ["signature","gin"] },
    // Vodka Based
    { name_en: "Red Monkey",        name_el: "Red Monkey",        description_en: "Vodka, lime, strawberry, vanilla syrup, banoffee and yoghurt",                           description_el: "Βότκα, λάιμ, φράουλα, σιρόπι βανίλιας, banoffee και γιαούρτι",              price_cents: 900, sort: 100, tags: ["signature","vodka"] },
    { name_en: "Romeo",             name_el: "Romeo",             description_en: "Vodka, popcorn syrup, lime, butterscotch syrup",                                         description_el: "Βότκα, σιρόπι ποπκόρν, λάιμ, σιρόπι butterscotch",                          price_cents: 900, sort: 110, tags: ["signature","vodka"] },
    // Tequila Based
    { name_en: "Paloma Our Way",    name_el: "Paloma Our Way",    description_en: "Tequila blanco paired with agave, lime and pink grapefruit soda",                        description_el: "Tequila blanco με agave, λάιμ και ροζ γκρέιπφρουτ σόδα",                    price_cents: 900, sort: 120, tags: ["signature","tequila"] },
    { name_en: "Bloody Tequila",    name_el: "Bloody Tequila",    description_en: "Tequila reposado, pistachio syrup, wafers syrup, blood orange purée, lime",              description_el: "Tequila reposado, σιρόπι φυστικιού, σιρόπι γκοφρέτας, ματωμένο πορτοκάλι", price_cents: 900, sort: 130, tags: ["signature","tequila"] },
    // Whiskey Based
    { name_en: "Golden Orchard",    name_el: "Golden Orchard",    description_en: "Whiskey, vanilla, pear flavour, ginger beer",                                            description_el: "Ουίσκι, βανίλια, άρωμα αχλαδιού, ginger beer",                              price_cents: 900, sort: 140, tags: ["signature","whiskey"] },
    // Cognac Based
    { name_en: "Mythic Tart",       name_el: "Mythic Tart",       description_en: "Metaxa, apple purée, apple pie syrup, cinnamon, biscuit syrup, lime",                   description_el: "Metaxa, πουρέ μήλου, σιρόπι μηλόπιτας, κανέλα, σιρόπι μπισκότου, λάιμ",  price_cents: 900, sort: 150, tags: ["signature","cognac"] },
    // Ouzo Based
    { name_en: "Greek Lad",         name_el: "Greek Lad",         description_en: "Ouzo, tropical purée, lime, grapefruit liqueur, honey",                                  description_el: "Ούζο, τροπικό πουρέ, λάιμ, λικέρ γκρέιπφρουτ, μέλι",                       price_cents: 900, sort: 160, tags: ["signature","ouzo"] },
  ],

  "classic-cocktails": [
    // Rum Based
    { name_en: "Pina Colada",       name_el: "Pina Colada",       description_en: "Rum with coconut and pineapple (non-alcoholic option available)",                        description_el: "Ρούμι με καρύδα και ανανά (διαθέσιμο και χωρίς αλκοόλ)",                   price_cents: 800, sort: 10, tags: ["classic","rum"] },
    { name_en: "Daquiri",           name_el: "Daquiri",           description_en: "Rum, lime, sugar (+optional flavour: strawberry or passion fruit)",                      description_el: "Ρούμι, λάιμ, ζάχαρη (προαιρετικά φράουλα ή φρούτο πάθους)",               price_cents: 800, sort: 20, tags: ["classic","rum"] },
    { name_en: "Mojito",            name_el: "Mojito",            description_en: "Rum, lime, mint, sugar, soda (non-alcoholic option available)",                          description_el: "Ρούμι, λάιμ, μέντα, ζάχαρη, σόδα (διαθέσιμο και χωρίς αλκοόλ)",          price_cents: 800, sort: 30, tags: ["classic","rum"] },
    { name_en: "Mai Tai",           name_el: "Mai Tai",           description_en: "Rum blend combined with orgeat, orange curaçao, lime juice and bitters",                 description_el: "Blend ρούμι με orgeat, orange curaçao, λάιμ και bitters",                   price_cents: 800, sort: 40, tags: ["classic","rum"] },
    // Vodka Based
    { name_en: "Pornstar Martini",  name_el: "Pornstar Martini",  description_en: "Vodka, vanilla, passion fruit, lime",                                                    description_el: "Βότκα, βανίλια, φρούτο του πάθους, λάιμ",                                   price_cents: 800, sort: 50, tags: ["classic","vodka"] },
    { name_en: "Espresso Martini",  name_el: "Espresso Martini",  description_en: "Vodka, espresso, coffee liqueur, vanilla",                                               description_el: "Βότκα, espresso, λικέρ καφέ, βανίλια",                                      price_cents: 800, sort: 60, tags: ["classic","vodka"] },
    { name_en: "Bloody Mary",       name_el: "Bloody Mary",       description_en: "Vodka, tomato juice, lemon, salt, pepper, worcestershire sauce, celery bitters",         description_el: "Βότκα, χυμός τομάτας, λεμόνι, αλάτι, πιπέρι, worcestershire, bitters σέλινου", price_cents: 800, sort: 70, tags: ["classic","vodka"] },
    // Tequila Based
    { name_en: "Margarita",         name_el: "Margarita",         description_en: "Tequila blanco, lime, triple sec",                                                       description_el: "Tequila blanco, λάιμ, triple sec",                                           price_cents: 800, sort: 80, tags: ["classic","tequila"] },
    // Gin Based
    { name_en: "Negroni",           name_el: "Negroni",           description_en: "Gin, sweet vermouth, campari",                                                           description_el: "Τζιν, γλυκό βερμούτ, campari",                                              price_cents: 800, sort: 90, tags: ["classic","gin"] },
    // Whiskey Based
    { name_en: "Old Fashioned",     name_el: "Old Fashioned",     description_en: "Bourbon whisky, sugar, bitters",                                                         description_el: "Bourbon ουίσκι, ζάχαρη, bitters",                                           price_cents: 800, sort: 100, tags: ["classic","whiskey"] },
    // Aperol Based
    { name_en: "Aperol Spritz",     name_el: "Aperol Spritz",     description_en: "Aperol, prosecco and soda",                                                              description_el: "Aperol, prosecco και σόδα",                                                  price_cents: 800, sort: 110, tags: ["classic","aperol"] },
  ],

  "mocktails": [
    { name_en: "Skala's Passion",   name_el: "Skala's Passion",   description_en: "Pineapple, cinnamon, passion fruit purée, lime",                                         description_el: "Ανανάς, κανέλα, πουρές φρούτου πάθους, λάιμ",                               price_cents: 600, sort: 10, tags: ["mocktail","non-alcoholic"] },
    { name_en: "Dragon of Eden",    name_el: "Dragon of Eden",    description_en: "Apple juice, raspberry purée, lemon, ginger, egg white",                                 description_el: "Χυμός μήλου, πουρές βατόμουρου, λεμόνι, τζίντζερ, ασπράδι αυγού",          price_cents: 600, sort: 20, tags: ["mocktail","non-alcoholic"] },
    { name_en: "Romeo",             name_el: "Romeo",             description_en: "Strawberry juice, popcorn syrup, lime, caramel syrup",                                   description_el: "Χυμός φράουλας, σιρόπι ποπκόρν, λάιμ, σιρόπι καραμέλας",                   price_cents: 600, sort: 30, tags: ["mocktail","non-alcoholic"] },
  ],

  "beers": [
    { name_en: "Draught Pills Hellas Large",  name_el: "Βαρελίσια Pills Hellas Μεγάλη", description_en: "", description_el: "", price_cents: 500, sort: 10,  tags: ["draught"] },
    { name_en: "Draught Pills Hellas Small",  name_el: "Βαρελίσια Pills Hellas Μικρή",  description_en: "", description_el: "", price_cents: 400, sort: 20,  tags: ["draught"] },
    { name_en: "Heineken",                    name_el: "Heineken",                       description_en: "", description_el: "", price_cents: 450, sort: 30,  tags: ["bottle"] },
    { name_en: "Mythos",                      name_el: "Mythos",                         description_en: "", description_el: "", price_cents: 400, sort: 40,  tags: ["bottle","greek"] },
    { name_en: "Alfa",                        name_el: "Alfa",                           description_en: "", description_el: "", price_cents: 400, sort: 50,  tags: ["bottle","greek"] },
    { name_en: "Eza Lager",                   name_el: "Eza Lager",                      description_en: "", description_el: "", price_cents: 400, sort: 60,  tags: ["bottle"] },
    { name_en: "Pills Hellas 0% Alcohol",     name_el: "Pills Hellas 0% Αλκοόλ",        description_en: "Non-alcoholic", description_el: "Χωρίς αλκοόλ",  price_cents: 400, sort: 70,  tags: ["bottle","non-alcoholic"] },
    { name_en: "Pills Hellas Radler",         name_el: "Pills Hellas Radler",            description_en: "", description_el: "", price_cents: 400, sort: 80,  tags: ["bottle"] },
    { name_en: "Corona",                      name_el: "Corona",                         description_en: "", description_el: "", price_cents: 500, sort: 90,  tags: ["bottle"] },
    { name_en: "Menabrea",                    name_el: "Menabrea",                       description_en: "", description_el: "", price_cents: 500, sort: 100, tags: ["bottle"] },
    { name_en: "Stella Barcelona",            name_el: "Stella Barcelona",               description_en: "", description_el: "", price_cents: 500, sort: 110, tags: ["bottle"] },
    { name_en: "Paulaner",                    name_el: "Paulaner",                       description_en: "", description_el: "", price_cents: 500, sort: 120, tags: ["bottle"] },
    { name_en: "Guinness",                    name_el: "Guinness",                       description_en: "", description_el: "", price_cents: 550, sort: 130, tags: ["bottle"] },
  ],

  "wines": [
    { name_en: "Robola",              name_el: "Ρομπόλα",           description_en: "Robola, Kefalonia — crisp white",                   description_el: "Ρομπόλα Κεφαλονιάς — λευκό",              price_cents: 600, sort: 10, tags: ["white","greek"] },
    { name_en: "Skouras Akres White", name_el: "Skouras Akres Λευκό", description_en: "Roditis — refreshing Greek white",                description_el: "Ροδίτης — δροσερό ελληνικό λευκό",        price_cents: 600, sort: 20, tags: ["white","greek"] },
    { name_en: "Skouras Akres Rosé",  name_el: "Skouras Akres Ροζέ",  description_en: "Agiorgitiko, Moschofilero — elegant rosé",        description_el: "Αγιωργίτικο, Μοσχοφίλερο — κομψό ροζέ",  price_cents: 600, sort: 30, tags: ["rose","greek"] },
    { name_en: "Skouras Akres Red",   name_el: "Skouras Akres Κόκκινο", description_en: "Cabernet Sauvignon, Agiorgitiko",               description_el: "Cabernet Sauvignon, Αγιωργίτικο",         price_cents: 600, sort: 40, tags: ["red","greek"] },
    { name_en: "Prosecco",            name_el: "Prosecco",           description_en: "Sparkling Italian white wine",                     description_el: "Αφρώδες ιταλικό λευκό κρασί",              price_cents: 600, sort: 50, tags: ["sparkling"] },
    { name_en: "Moscato D'Asti",      name_el: "Moscato D'Asti",     description_en: "Sweet, low-alcohol Italian sparkling white",       description_el: "Γλυκό ιταλικό αφρώδες λευκό",             price_cents: 600, sort: 60, tags: ["sparkling","sweet"] },
    { name_en: "Rossini",             name_el: "Rossini",            description_en: "Prosecco with strawberry purée",                   description_el: "Prosecco με πουρέ φράουλας",               price_cents: 700, sort: 70, tags: ["sparkling"] },
    { name_en: "Bellini",             name_el: "Bellini",            description_en: "Prosecco with peach purée",                        description_el: "Prosecco με πουρέ ροδάκινου",              price_cents: 700, sort: 80, tags: ["sparkling"] },
  ],

  "soft-drinks": [
    { name_en: "Coca Cola / Sprite / Soda / Orangeade / Lemonade", name_el: "Coca Cola / Sprite / Σόδα / Πορτοκαλάδα / Λεμονάδα", description_en: "", description_el: "", price_cents: 300, sort: 10, tags: [] },
    { name_en: "3Cents Carbonated Drinks",  name_el: "3Cents Carbonated Drinks", description_en: "Pink Grapefruit Soda, Ginger Beer",          description_el: "Ροζ γκρέιπφρουτ σόδα, Ginger Beer",   price_cents: 400, sort: 20, tags: [] },
    { name_en: "Red Bull",                  name_el: "Red Bull",                 description_en: "",                                            description_el: "",                                     price_cents: 400, sort: 30, tags: ["energy"] },
    { name_en: "Ice Tea Yamas",             name_el: "Ice Tea Yamas",            description_en: "Blueberry with honey / Lemon with honey",     description_el: "Βατόμουρο με μέλι / Λεμόνι με μέλι",  price_cents: 400, sort: 40, tags: [] },
  ],

  "drinks": [
    { name_en: "Drinks",         name_el: "Ποτά",          description_en: "", description_el: "", price_cents: 300, sort: 10, tags: [] },
    { name_en: "Special Drinks", name_el: "Ειδικά Ποτά",   description_en: "", description_el: "", price_cents: 500, sort: 20, tags: [] },
  ],

  "ciders": [
    { name_en: "Kopparberg Strawberry & Lime", name_el: "Kopparberg Φράουλα & Λάιμ", description_en: "Swedish fruit cider", description_el: "Σουηδικό φρουτένιο σίδερ", price_cents: 500, sort: 10, tags: [] },
    { name_en: "Magners",                      name_el: "Magners",                   description_en: "Irish apple cider",    description_el: "Ιρλανδικό μηλόσιδερ",      price_cents: 500, sort: 20, tags: [] },
    { name_en: "Wine Spritzer Strawberry",     name_el: "Wine Spritzer Φράουλα",     description_en: "",                     description_el: "",                          price_cents: 500, sort: 30, tags: [] },
  ],
};

// ── Run ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("Seeding menu…");

  // 1. Clear existing data
  await supabase.from("menu_items").delete().gt("id", 0);
  await supabase.from("menu_categories").delete().gt("id", 0);
  console.log("Cleared existing data.");

  // 2. Insert categories
  const { data: insertedCats, error: catErr } = await supabase
    .from("menu_categories")
    .insert(CATEGORIES)
    .select();

  if (catErr) { console.error("Category insert failed:", catErr.message); process.exit(1); }
  console.log(`Inserted ${insertedCats.length} categories.`);

  // Build slug → id map
  const catIdBySlug = Object.fromEntries(insertedCats.map(c => [c.slug, c.id]));

  // 3. Build all items with correct category_id
  const allItems = [];
  for (const [slug, items] of Object.entries(ITEMS_BY_CAT)) {
    const catId = catIdBySlug[slug];
    if (!catId) { console.warn(`Category not found for slug: ${slug}`); continue; }
    for (const item of items) {
      allItems.push({
        category_id: catId,
        slug: item.name_en.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
        name_en: item.name_en,
        name_el: item.name_el,
        description_en: item.description_en,
        description_el: item.description_el,
        price_cents: item.price_cents,
        currency: "EUR",
        sort: item.sort,
        is_visible: true,
        tags: item.tags,
      });
    }
  }

  // 4. Insert items in batches of 50
  let total = 0;
  for (let i = 0; i < allItems.length; i += 50) {
    const batch = allItems.slice(i, i + 50);
    const { data, error } = await supabase.from("menu_items").insert(batch).select();
    if (error) { console.error("Item insert failed:", error.message); process.exit(1); }
    total += data.length;
  }
  console.log(`Inserted ${total} items.`);
  console.log("Done!");
}

main();
