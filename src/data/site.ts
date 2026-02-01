export type Lang = "en" | "el";

export const site = {
  name: "Sally’s Bar",

  // bilingual copy
  tagline_en: "Cocktails • Lounge • Late Night in Skala, Kefalonia",
  tagline_el: "Κοκτέιλ • Lounge • Βραδινή έξοδος στη Σκάλα, Κεφαλονιά",

  description_en:
    "Sally’s Bar in Skala, Kefalonia — premium cocktails (€5–10), friendly staff, and the perfect vibe: classy early, lively late. Walk in, sip, stay.",
  description_el:
    "Το Sally’s Bar στη Σκάλα, Κεφαλονιά — premium κοκτέιλ (€5–10), φιλικό προσωπικό και η ιδανική ατμόσφαιρα: κομψά νωρίς, πιο ζωντανά αργά. Ελάτε χωρίς κράτηση, απολαύστε, μείνετε.",

  phoneDisplay: "694 627 2083",
  phoneE164: "+306946272083",

 addressShort_en: "Skala 280 86",
  addressShort_el: "Σκάλα 280 86",

  addressFull_en: "Skala 280 86, Kefalonia, Greece",
  addressFull_el: "Σκάλα 280 86, Κεφαλονιά, Ελλάδα",


  mapsShareUrl:
    "https://www.google.com/maps/dir//Sally's+Bar,+Skala+280+86/@38.0749985,20.7974741,18.27z/data=!4m16!1m7!3m6!1s0x13675f4867a5e573:0x842020188aa33527!2sSally's+Bar!8m2!3d38.0748829!4d20.7969726!16s%2Fg%2F11cnb3kb_m!4m7!1m0!1m5!1m1!1s0x13675f4867a5e573:0x842020188aa33527!2m2!1d20.7969363!2d38.0748852?entry=ttu&g_ep=EgoyMDI2MDEyOC4wIKXMDSoASAFQAw%3D%3D",

  hours: {
    days: "Daily",
    opens: "18:00",
    closes: "02:00",
    text_en: "Open daily 6PM–2AM (summer season)",
    text_el: "Ανοιχτά καθημερινά 18:00–02:00 (καλοκαιρινή σεζόν)",
  },

  ratings: {
    google: { rating: 4.4, count: 174 },
  },

  reviews: {
    googleUrl:
      "https://www.google.com/maps/place/Sally's+Bar/@38.0748829,18.5557617,8z/data=!4m8!3m7!1s0x13675f4867a5e573:0x842020188aa33527!8m2!3d38.0748829!4d20.7969726!9m1!1b1!16s%2Fg%2F11cnb3kb_m?entry=ttu&g_ep=EgoyMDI2MDEyOC4wIKXMDSoASAFQAw%3D%3D",
  },

  socials: {
    instagram: "https://www.instagram.com/sallys_bar/",
    tripadvisor:
      "https://www.tripadvisor.com/Attraction_Review-g664630-d8640650-Reviews-Sally_s_Bar-Skala_Kefalonia_Ionian_Islands.html",
    facebook: "https://www.facebook.com/groups/10894111027/",
    google:
      "https://www.google.com/maps/place/Sally's+Bar/@38.0748829,18.5557617,8z/data=!4m8!3m7!1s0x13675f4867a5e573:0x842020188aa33527!8m2!3d38.0748829!4d20.7969726!9m1!1b1!16s%2Fg%2F11cnb3kb_m?entry=ttu&g_ep=EgoyMDI2MDEyOC4wIKXMDSoASAFQAw%3D%3D",
  },

  season: {
    isOpenNow: false,
    opensFromText_en:
      "Seasonal venue — opening for summer. Follow Instagram for updates and opening night.",
    opensFromText_el:
      "Εποχιακό κατάστημα — ανοίγουμε για το καλοκαίρι. Ακολουθήστε μας στο Instagram για ενημερώσεις και τη βραδιά έναρξης.",
  },
} as const;

export function getSiteCopy(lang: Lang) {
  return {
    tagline: lang === "el" ? site.tagline_el : site.tagline_en,
    description: lang === "el" ? site.description_el : site.description_en,

    addressShort:
      lang === "el" ? site.addressShort_el : site.addressShort_en,

    addressFull:
      lang === "el" ? site.addressFull_el : site.addressFull_en,

    hoursText:
      lang === "el" ? site.hours.text_el : site.hours.text_en,

    opensFromText:
      lang === "el"
        ? site.season.opensFromText_el
        : site.season.opensFromText_en,
  };
}