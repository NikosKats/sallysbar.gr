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
  wheel:        `<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4" stroke="currentColor" stroke-width="1.6"/>`,
  coasters:     `<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="5" stroke="currentColor" stroke-width="1.6"/>`,
  activeOrders: `<path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><rect x="9" y="3" width="6" height="4" rx="1" stroke="currentColor" stroke-width="1.6"/><path d="M9 12h6M9 16h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`,
  newOrder:     `<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/><path d="M12 8v8M8 12h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`,
  chat:         `<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`,
};

export function getAdminNavGroups(lang: "en" | "el", t: any, role?: string | null): AdminNavGroup[] {
  const isEl = lang === "el";
  const isSuper = role === "super_admin";
  const groups: AdminNavGroup[] = [
    { title: isEl ? "Πίνακας" : "Dashboard", items: [
      { key: "overview",  label: t.admin.nav.overview,  href: withLangPrefix(lang, "/admin"),          icon: I.overview },
      { key: "analytics", label: t.admin.nav.analytics, href: withLangPrefix(lang, "/admin/analytics"), icon: I.analytics },
      { key: "operations-analytics", label: isEl ? "Ops Analytics (χρόνοι)" : "Ops Analytics (timings)", href: withLangPrefix(lang, "/admin/operations-analytics"), icon: I.analytics },
      { key: "calendar",  label: t.admin.nav.calendar,  href: withLangPrefix(lang, "/admin/calendar"),  icon: I.calendar },
    ]},
    { title: isEl ? "Λειτουργία" : "Operations", items: [
      { key: "reservations",        label: t.admin.nav.reservations,                       href: withLangPrefix(lang, "/admin/reservations"),        icon: I.reservations },
      { key: "events",              label: t.admin.nav.events,                             href: withLangPrefix(lang, "/admin/events"),              icon: I.events },
      { key: "orders",              label: t.admin.nav.orders,                             href: withLangPrefix(lang, "/admin/orders"),              icon: I.orders },
      { key: "tips",                label: t.admin.nav.tips,                               href: withLangPrefix(lang, "/admin/tips"),                icon: I.tips },
      { key: "marketing",           label: isEl ? "Marketing" : "Marketing",               href: withLangPrefix(lang, "/admin/marketing"),           icon: I.marketing },
      { key: "marketing-analytics", label: isEl ? "Marketing Analytics" : "Marketing Analytics", href: withLangPrefix(lang, "/admin/marketing-analytics"), icon: I.analytics },
      { key: "marketing-automation", label: isEl ? "⚙️ Αυτοματισμοί Marketing" : "⚙️ Marketing Automation", href: withLangPrefix(lang, "/admin/marketing-automation"), icon: I.marketing },
      { key: "campaigns",             label: isEl ? "📣 CRM Καμπάνιες" : "📣 CRM Campaigns", href: withLangPrefix(lang, "/admin/campaigns"), icon: I.marketing },
      { key: "inbox",                 label: isEl ? "📬 Εισερχόμενα" : "📬 Inbox", href: withLangPrefix(lang, "/admin/inbox"), icon: I.chat },
      { key: "ai-calls",               label: isEl ? "🤖 Συνομιλίες AI" : "🤖 AI Conversations", href: withLangPrefix(lang, "/admin/ai-calls"), icon: I.chat },
      { key: "social-links",          label: isEl ? "🔗 Social Links" : "🔗 Social Links", href: withLangPrefix(lang, "/admin/social-links"), icon: I.marketing },
      { key: "social-cards",          label: isEl ? "🪪 Social Cards" : "🪪 Social Cards", href: withLangPrefix(lang, "/admin/social-cards"), icon: I.users },
      { key: "loyalty-cards",         label: isEl ? "💳 Κάρτες Πιστότητας" : "💳 Loyalty Cards", href: withLangPrefix(lang, "/admin/loyalty-cards"), icon: I.loyalty },
      { key: "quests",              label: isEl ? "Αποψινές Αποστολές" : "Tonight's Quests", href: withLangPrefix(lang, "/admin/quests"),            icon: I.quests },
      { key: "scratch",             label: isEl ? "Scratch Cards" : "Scratch Cards",       href: withLangPrefix(lang, "/admin/scratch"),             icon: I.scratch },
      { key: "wheel",               label: isEl ? "Ρόδα Τύχης" : "Wheel of Luck",           href: withLangPrefix(lang, "/admin/wheel"),               icon: I.wheel },
      { key: "coasters",            label: isEl ? "Σουβέρ (εκτυπώσιμα)" : "Coasters (printable)", href: withLangPrefix(lang, "/admin/coasters"),       icon: I.coasters },
      { key: "staff-enrollment",    label: isEl ? "Εγγραφές από Staff" : "Staff Enrollments",    href: withLangPrefix(lang, "/admin/staff-enrollment"), icon: I.users },
    ]},
    { title: isEl ? "Περιεχόμενο" : "Content", items: [
      { key: "editMenu", label: t.admin.nav.editMenu,         href: withLangPrefix(lang, "/admin/menu"),    icon: I.editMenu },
      { key: "loyalty",  label: t.admin.nav.loyalty,          href: withLangPrefix(lang, "/admin/loyalty"), icon: I.loyalty },
      { key: "tasks",    label: isEl ? "Tasks (πελάτη)" : "Tasks (customer)", href: withLangPrefix(lang, "/admin/tasks"), icon: I.loyalty },
      { key: "games",    label: isEl ? "🎮 Παιχνίδια ON/OFF" : "🎮 Games ON/OFF", href: withLangPrefix(lang, "/admin/games"), icon: I.scratch },
      { key: "careers",  label: isEl ? "Καριέρα" : "Careers", href: withLangPrefix(lang, "/admin/careers"), icon: I.careers },
    ]},
    { title: isEl ? "Staff" : "Staff", items: [
      { key: "staff-orders",    label: t.user?.activeOrders ?? (isEl ? "Ενεργές Παραγγελίες" : "Active Orders"), href: withLangPrefix(lang, "/staff"),       icon: I.activeOrders },
      { key: "staff-new-order", label: t.user?.newOrder     ?? (isEl ? "Νέα Παραγγελία" : "New Order"),        href: withLangPrefix(lang, "/staff/order"), icon: I.newOrder },
      { key: "staff-chat",      label: isEl ? "Ομάδα (Chat)" : "Team Chat",                                    href: withLangPrefix(lang, "/staff/chat"),  icon: I.chat },
      { key: "staff-quest-review", label: isEl ? "🎯 Quest εγκρίσεις" : "🎯 Quest approvals",                  href: withLangPrefix(lang, "/staff/quest-review"), icon: I.quests },
    ]},
    { title: isEl ? "Σύστημα" : "System", items: [
      { key: "users",   label: t.admin.nav.users,                href: withLangPrefix(lang, "/admin/users"),   icon: I.users },
      { key: "qrcodes", label: isEl ? "QR Codes" : "QR Codes",   href: withLangPrefix(lang, "/admin/qrcodes"), icon: I.qrcodes },
      { key: "table-settings", label: isEl ? "Ρυθμίσεις Τραπεζιού" : "Table Page Settings", href: withLangPrefix(lang, "/admin/table-settings"), icon: I.wheel },
      { key: "help",    label: isEl ? "Οδηγός" : "Help & Guide", href: withLangPrefix(lang, "/admin/help"),    icon: I.help },
    ]},
  ];

  if (isSuper) {
    groups.push({
      title: "🔐 Super Admin",
      items: [
        { key: "business",       label: "💼 Business Playbook",     href: withLangPrefix(lang, "/admin/business"),       icon: I.analytics },
        { key: "saas-playbook",  label: "🚀 SaaS Playbook",          href: withLangPrefix(lang, "/admin/saas-playbook"),  icon: I.analytics },
        { key: "venues",         label: "🏢 My Venues",              href: withLangPrefix(lang, "/admin/venues"),         icon: I.analytics },
        { key: "onboarding",     label: "🏁 Venue Onboarding",       href: withLangPrefix(lang, "/admin/onboarding"),     icon: I.analytics },
        { key: "sales-metrics",  label: "📈 Pitch Metrics (SaaS)",   href: withLangPrefix(lang, "/admin/sales-metrics"),  icon: I.analytics },
        { key: "cost-report",    label: "💶 Cost Report (EU agency)",href: withLangPrefix(lang, "/admin/cost-report"),    icon: I.analytics },
        { key: "financial-model", label: "📊 Financial Model & Break-Even", href: withLangPrefix(lang, "/admin/financial-model"), icon: I.analytics },
        { key: "pistotita-os",   label: "🚀 PistotitaOS — Sales",      href: withLangPrefix(lang, "/admin/pistotita-os"),   icon: I.marketing },
        { key: "pistotita-os-settings", label: "🎛️ PistotitaOS page visibility", href: withLangPrefix(lang, "/admin/pistotita-os-settings"), icon: I.marketing },
        { key: "pricing-justification", label: "💼 Pricing Justification (leave-behind)", href: withLangPrefix(lang, "/admin/pricing-justification"), icon: I.analytics },
        { key: "objections",     label: "🛡️ Objection Handling",     href: withLangPrefix(lang, "/admin/objections"),     icon: I.analytics },
        { key: "service-agreement", label: "⚖️ Service Agreement (template)", href: withLangPrefix(lang, "/admin/service-agreement"), icon: I.help },
        { key: "dpa",            label: "🛡️ GDPR DPA (template)",      href: withLangPrefix(lang, "/admin/dpa"),            icon: I.help },
        { key: "external-apis",  label: "🔌 External APIs — Cost & Monetize", href: withLangPrefix(lang, "/admin/external-apis"), icon: I.analytics },
      ],
    });
  }

  return groups;
}
