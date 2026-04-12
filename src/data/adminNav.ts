// Single source of truth for the admin navigation tree.
// Consumed by src/components/AdminNav.astro AND src/components/Header.astro so
// the public-site profile dropdown shows the exact same groups/items/icons as
// the admin sidebar.
import { withLangPrefix } from "../i18n";

export type AdminNavItem = { key: string; label: string; href: string; icon: string };
export type AdminNavGroup = { title: string; items: AdminNavItem[] };

// Icon SVG path fragments (paired with a wrapping <svg> at render time)
export const I = {
  overview:     `<path d="M3 12L12 4l9 8M5 10v10h14V10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`,
  analytics:    `<path d="M4 20V10M10 20V4M16 20v-8M22 20H2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`,
  calendar:     `<rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M3 9h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`,
  reservations: `<path d="M4 7h16M4 12h16M4 17h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`,
  events:       `<path d="M12 2l2.5 5 5.5.8-4 3.9.9 5.5L12 14.8 7.1 17.2 8 11.7 4 7.8 9.5 7 12 2z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>`,
  loyalty:      `<path d="M12 21s-7-4.5-7-11a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6.5-7 11-7 11h-4z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>`,
  orders:       `<path d="M3 6h18l-2 12H5L3 6zM3 6l-1-3H0" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/><circle cx="9" cy="21" r="1" fill="currentColor"/><circle cx="17" cy="21" r="1" fill="currentColor"/>`,
  tips:         `<path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`,
  editMenu:     `<path d="M4 4h16v4H4zM4 12h16v4H4zM4 20h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`,
  careers:      `<rect x="3" y="7" width="18" height="13" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" stroke-width="1.6"/>`,
  users:        `<circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.6"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`,
  qrcodes:      `<rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.6"/><rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.6"/><rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.6"/><path d="M14 14h3v3M20 14v7M14 20h3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`,
  help:         `<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/><path d="M9 9a3 3 0 1 1 4.5 2.6c-.9.6-1.5 1.2-1.5 2.4M12 17h.01" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`,
  marketing:    `<path d="M3 11l18-7v16L3 13v-2z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M7 13v5a2 2 0 0 0 4 0v-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`,
  quests:       `<path d="M12 2l2.5 5.5 6 .6-4.5 4.1 1.3 5.9L12 15.3 6.7 18.1 8 12.2 3.5 8.1l6-.6L12 2z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>`,
  scratch:      `<rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M7 9l3 3-3 3M13 15h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`,
  activeOrders: `<path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><rect x="9" y="3" width="6" height="4" rx="1" stroke="currentColor" stroke-width="1.6"/><path d="M9 12h6M9 16h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`,
  newOrder:     `<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/><path d="M12 8v8M8 12h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`,
};

export function getAdminNavGroups(lang: "en" | "el", t: any): AdminNavGroup[] {
  const isEl = lang === "el";
  return [
    { title: isEl ? "Πίνακας" : "Dashboard", items: [
      { key: "overview",  label: t.admin.nav.overview,  href: withLangPrefix(lang, "/admin"),          icon: I.overview },
      { key: "analytics", label: t.admin.nav.analytics, href: withLangPrefix(lang, "/admin/analytics"), icon: I.analytics },
      { key: "calendar",  label: t.admin.nav.calendar,  href: withLangPrefix(lang, "/admin/calendar"),  icon: I.calendar },
    ]},
    { title: isEl ? "Λειτουργία" : "Operations", items: [
      { key: "reservations",        label: t.admin.nav.reservations,                       href: withLangPrefix(lang, "/admin/reservations"),        icon: I.reservations },
      { key: "events",              label: t.admin.nav.events,                             href: withLangPrefix(lang, "/admin/events"),              icon: I.events },
      { key: "orders",              label: t.admin.nav.orders,                             href: withLangPrefix(lang, "/admin/orders"),              icon: I.orders },
      { key: "tips",                label: t.admin.nav.tips,                               href: withLangPrefix(lang, "/admin/tips"),                icon: I.tips },
      { key: "marketing",           label: isEl ? "Marketing" : "Marketing",               href: withLangPrefix(lang, "/admin/marketing"),           icon: I.marketing },
      { key: "marketing-analytics", label: isEl ? "Marketing Analytics" : "Marketing Analytics", href: withLangPrefix(lang, "/admin/marketing-analytics"), icon: I.analytics },
      { key: "quests",              label: isEl ? "Αποψινές Αποστολές" : "Tonight's Quests", href: withLangPrefix(lang, "/admin/quests"),            icon: I.quests },
      { key: "scratch",             label: isEl ? "Scratch Cards" : "Scratch Cards",       href: withLangPrefix(lang, "/admin/scratch"),             icon: I.scratch },
    ]},
    { title: isEl ? "Περιεχόμενο" : "Content", items: [
      { key: "editMenu", label: t.admin.nav.editMenu,         href: withLangPrefix(lang, "/admin/menu"),    icon: I.editMenu },
      { key: "loyalty",  label: t.admin.nav.loyalty,          href: withLangPrefix(lang, "/admin/loyalty"), icon: I.loyalty },
      { key: "careers",  label: isEl ? "Καριέρα" : "Careers", href: withLangPrefix(lang, "/admin/careers"), icon: I.careers },
    ]},
    { title: isEl ? "Staff" : "Staff", items: [
      { key: "staff-orders",    label: t.user?.activeOrders ?? (isEl ? "Ενεργές Παραγγελίες" : "Active Orders"), href: withLangPrefix(lang, "/staff"),       icon: I.activeOrders },
      { key: "staff-new-order", label: t.user?.newOrder     ?? (isEl ? "Νέα Παραγγελία" : "New Order"),        href: withLangPrefix(lang, "/staff/order"), icon: I.newOrder },
    ]},
    { title: isEl ? "Σύστημα" : "System", items: [
      { key: "users",   label: t.admin.nav.users,                href: withLangPrefix(lang, "/admin/users"),   icon: I.users },
      { key: "qrcodes", label: isEl ? "QR Codes" : "QR Codes",   href: withLangPrefix(lang, "/admin/qrcodes"), icon: I.qrcodes },
      { key: "help",    label: isEl ? "Οδηγός" : "Help & Guide", href: withLangPrefix(lang, "/admin/help"),    icon: I.help },
    ]},
  ];
}
