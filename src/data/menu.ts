export type MenuItem = {
  name: string;
  desc?: string;
  price?: string;      // keep string (e.g. "€8", "€8–10")
  abv?: string;        // optional
  tags?: string[];     // e.g. ["signature", "popular"]
};

export type MenuSection = {
  id: string;          // used for anchors + QR links
  title: string;
  note?: string;
  items: MenuItem[];
};

export const menu: MenuSection[] = [
  {
    id: "signature-cocktails",
    title: "Signature Cocktails",
    note: "Ask our staff for today’s specials.",
    items: [
      // we'll fill these from your menu image next
    ],
  },
  {
    id: "classic-cocktails",
    title: "Classic Cocktails",
    items: [],
  },
  {
    id: "mocktails",
    title: "Mocktails",
    items: [],
  },
  {
    id: "beer",
    title: "Beer",
    items: [],
  },
  {
    id: "wine",
    title: "Wine",
    items: [],
  },
  {
    id: "spirits",
    title: "Spirits",
    items: [],
  },
  {
    id: "soft-drinks",
    title: "Soft Drinks",
    items: [],
  },
];
