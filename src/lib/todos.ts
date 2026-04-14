import { supabaseAdmin } from "./supabase";

export type TodoCategory = "onboarding" | "social" | "achievement";
export type TodoType     = "auto" | "honor";

export type TodoDef = {
  key: string;
  category: TodoCategory;
  type: TodoType;
  points: number;
  title_en: string;
  title_el: string;
  desc_en: string;
  desc_el: string;
  emoji: string;
  link?: string; // for honor tasks that deep-link
};

export const TODOS: TodoDef[] = [
  // ── A. Onboarding (auto-verified) ──
  { key: "signup",              category: "onboarding", type: "auto", points: 50,  emoji: "✅",
    title_en: "Sign up",                          title_el: "Εγγραφή",
    desc_en: "Welcome to Sally's.",               desc_el: "Καλωσήρθες στο Sally's." },
  { key: "verify_phone",        category: "onboarding", type: "auto", points: 50,  emoji: "📱",
    title_en: "Verify your phone",                title_el: "Επαλήθευση τηλεφώνου",
    desc_en: "Confirm your number via SMS.",      desc_el: "Επιβεβαίωση μέσω SMS." },
  { key: "activate_card",       category: "onboarding", type: "auto", points: 100, emoji: "🎁",
    title_en: "Activate loyalty card",            title_el: "Ενεργοποίηση κάρτας",
    desc_en: "Full profile unlocks your card.",   desc_el: "Ολοκλήρωσε το προφίλ σου." },
  { key: "add_birthday",        category: "onboarding", type: "auto", points: 25,  emoji: "🎂",
    title_en: "Add your birthday",                title_el: "Πρόσθεσε γενέθλια",
    desc_en: "Unlocks the birthday-month multiplier.", desc_el: "Ξεκλειδώνει τον μπόνους πολλαπλασιαστή." },
  { key: "marketing_consent",   category: "onboarding", type: "auto", points: 25,  emoji: "📬",
    title_en: "Opt in to offers",                 title_el: "Δέξου προσφορές",
    desc_en: "Hear about drops & events first.",  desc_el: "Μάθε πρώτος για προσφορές & events." },
  { key: "install_app",         category: "onboarding", type: "auto", points: 30,  emoji: "📲",
    title_en: "Install the app",                  title_el: "Εγκατάσταση app",
    desc_en: "Add Sally's to your home screen.",  desc_el: "Πρόσθεσε το Sally's στην αρχική σου." },
  { key: "enable_notifications",category: "onboarding", type: "auto", points: 50,  emoji: "🔔",
    title_en: "Enable push notifications",        title_el: "Ειδοποιήσεις push",
    desc_en: "Get quest alerts and secret drops.", desc_el: "Αποστολές & secret drops." },
  { key: "first_booking",       category: "onboarding", type: "auto", points: 50,  emoji: "📅",
    title_en: "Book your first table",            title_el: "Πρώτη κράτηση",
    desc_en: "Lock in a spot — earns points.",    desc_el: "Κλείσε τραπέζι — πάρε πόντους." },
  { key: "first_rsvp",          category: "onboarding", type: "auto", points: 25,  emoji: "🎵",
    title_en: "RSVP to an event",                 title_el: "Κάνε RSVP σε event",
    desc_en: "Save your place at a live night.",  desc_el: "Κρατήσου σε ζωντανή βραδιά." },
  { key: "first_order",         category: "onboarding", type: "auto", points: 50,  emoji: "🍸",
    title_en: "Your first order",                 title_el: "Πρώτη παραγγελία",
    desc_en: "Every €1 earns loyalty points.",    desc_el: "Κάθε €1 = πόντοι." },
  { key: "first_referral",      category: "onboarding", type: "auto", points: 50,  emoji: "🤝",
    title_en: "Refer a friend",                   title_el: "Σύσταση φίλου",
    desc_en: "Share your link once.",             desc_el: "Στείλε το link σου μία φορά." },
  { key: "three_referrals",     category: "onboarding", type: "auto", points: 150, emoji: "🤝",
    title_en: "Refer 3 friends",                  title_el: "3 συστάσεις",
    desc_en: "Triple up the invites.",            desc_el: "Κάντο 3." },
  { key: "ten_referrals",       category: "onboarding", type: "auto", points: 500, emoji: "🤝",
    title_en: "Refer 10 friends",                 title_el: "10 συστάσεις",
    desc_en: "The ultimate recruiter.",           desc_el: "Ο απόλυτος recruiter." },
  { key: "first_redeem",        category: "onboarding", type: "auto", points: 50,  emoji: "🎟",
    title_en: "Redeem your first reward",         title_el: "Πρώτη εξαργύρωση",
    desc_en: "Spend points on a perk.",           desc_el: "Ξόδεψε πόντους για δώρο." },
  { key: "spent_100",           category: "achievement", type: "auto", points: 100, emoji: "💶",
    title_en: "€100 lifetime spend",              title_el: "€100 συνολικά",
    desc_en: "A dedicated regular.",              desc_el: "Τακτικός!" },
  { key: "five_visits",         category: "achievement", type: "auto", points: 150, emoji: "🔥",
    title_en: "5 visits",                         title_el: "5 επισκέψεις",
    desc_en: "Five separate days at the bar.",    desc_el: "Πέντε διαφορετικές μέρες." },
  { key: "five_streak_14d",     category: "achievement", type: "auto", points: 200, emoji: "⚡",
    title_en: "5-night streak in 2 weeks",        title_el: "5 νύχτες σε 2 εβδομάδες",
    desc_en: "Five visits within 14 days.",       desc_el: "Πέντε επισκέψεις σε 14 μέρες." },
  { key: "three_events",        category: "achievement", type: "auto", points: 200, emoji: "🎶",
    title_en: "Attend 3 events",                  title_el: "3 events",
    desc_en: "RSVP'd and attended 3.",            desc_el: "Τρία events!" },
  { key: "one_year_member",     category: "achievement", type: "auto", points: 250, emoji: "🏅",
    title_en: "1-year anniversary",               title_el: "Ένας χρόνος μέλος",
    desc_en: "You've been with us a whole year.", desc_el: "Ένας χρόνος μαζί μας." },

  // ── B. Social / honor-system ──
  { key: "google_review",       category: "social", type: "honor", points: 100, emoji: "⭐",
    title_en: "Leave a Google review",            title_el: "Κριτική στο Google",
    desc_en: "5-star review takes 20 seconds.",   desc_el: "5-star κριτική.",
    link: "https://www.google.com/maps/place/Sally's+Bar/@38.0748829,18.5557617,8z/data=!4m8!3m7!1s0x13675f4867a5e573:0x842020188aa33527!8m2!3d38.0748829!4d20.7969726!9m1!1b1!16s%2Fg%2F11cnb3kb_m" },
  { key: "tripadvisor_review",  category: "social", type: "honor", points: 75,  emoji: "🦉",
    title_en: "Leave a TripAdvisor review",       title_el: "Κριτική στο TripAdvisor",
    desc_en: "Travellers read them first.",       desc_el: "Ταξιδιώτες τις διαβάζουν πρώτα.",
    link: "https://www.tripadvisor.com/Attraction_Review-Sally-s-Bar-Skala-Kefalonia" },
  { key: "follow_instagram",    category: "social", type: "honor", points: 25,  emoji: "📸",
    title_en: "Follow on Instagram",              title_el: "Ακολούθησε στο Instagram",
    desc_en: "One tap, one follow.",              desc_el: "Ένα tap.",
    link: "https://www.instagram.com/sallys_bar/" },
  { key: "follow_facebook",     category: "social", type: "honor", points: 15,  emoji: "👍",
    title_en: "Follow on Facebook",               title_el: "Ακολούθησε στο Facebook",
    desc_en: "Get event updates in feed.",        desc_el: "Ενημερώσεις για events.",
    link: "https://www.facebook.com/sallysbar/" },
  { key: "share_facebook",      category: "social", type: "honor", points: 20,  emoji: "📣",
    title_en: "Share us on Facebook",             title_el: "Μοιράσου στο Facebook",
    desc_en: "Post to your timeline.",            desc_el: "Ποστ στο τοίχο σου." },
  { key: "share_instagram",     category: "social", type: "honor", points: 25,  emoji: "📱",
    title_en: "Share on Instagram story (tag us)", title_el: "Story με tag",
    desc_en: "Tag @sallys_bar in your story.",    desc_el: "Κάνε tag @sallys_bar." },
  { key: "share_whatsapp",      category: "social", type: "honor", points: 10,  emoji: "💬",
    title_en: "Share on WhatsApp / Telegram",     title_el: "Κοινοποίησε στο WhatsApp/Telegram",
    desc_en: "Send us to a friend.",              desc_el: "Στείλε μας σε φίλο." },
  { key: "post_photo",          category: "social", type: "honor", points: 30,  emoji: "📷",
    title_en: "Post a photo from the bar",        title_el: "Φωτογραφία από το bar",
    desc_en: "Share the vibe online.",            desc_el: "Μοιράσου τη βραδιά." },
  { key: "google_review_photo", category: "social", type: "honor", points: 50,  emoji: "🌟",
    title_en: "Google review + photo",            title_el: "Κριτική Google + φωτό",
    desc_en: "Extra points for a photo review.",  desc_el: "Φωτό στην κριτική.",
    link: "https://www.google.com/maps/place/Sally's+Bar/@38.0748829,18.5557617,8z/data=!4m8!3m7!1s0x13675f4867a5e573:0x842020188aa33527!8m2!3d38.0748829!4d20.7969726!9m1!1b1!16s%2Fg%2F11cnb3kb_m" },
  { key: "newsletter",          category: "social", type: "honor", points: 20,  emoji: "📧",
    title_en: "Join the newsletter",              title_el: "Εγγραφή newsletter",
    desc_en: "Monthly cocktail guide + offers.",  desc_el: "Μηνιαίος οδηγός & προσφορές." },
];

export type TodoStatus = "locked" | "in_progress" | "available" | "completed";
export type TodoState = {
  key: string;
  status: TodoStatus;
  current?: number;
  target?: number;
  claimed_at?: string | null;
};

type Context = {
  userId: string;
  authUser: any | null;
  profile: any | null;
  orderCount: number;
  totalSpentCents: number;
  visitDays: string[];          // distinct ISO dates
  rsvpCount: number;
  pastRsvpCount: number;
  bookingCount: number;
  referredCount: number;
  pushSubCount: number;
  redeemedCount: number;
  alreadyCompleted: Map<string, any>;
};

async function loadContext(userId: string): Promise<Context> {
  const [authRes, profileRes, ordersRes, rsvpsRes, bookingsRes, referredRes, pushRes, redeemedRes, doneRes] =
    await Promise.all([
      supabaseAdmin.auth.admin.getUserById(userId),
      supabaseAdmin.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabaseAdmin.from("orders").select("total_cents, created_at").eq("customer_user_id", userId),
      supabaseAdmin.from("event_rsvps").select("status, events(event_date)").eq("user_id", userId),
      supabaseAdmin.from("reservations").select("id").eq("user_id", userId),
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).eq("referred_by", userId),
      supabaseAdmin.from("push_subscriptions").select("endpoint", { count: "exact", head: true }).eq("user_id", userId),
      supabaseAdmin.from("loyalty_redemptions").select("id").eq("user_id", userId).eq("status", "used"),
      supabaseAdmin.from("todo_completions").select("*").eq("user_id", userId),
    ]);

  const orders = ordersRes.data ?? [];
  const visitDays = Array.from(new Set(orders.map((o: any) => String(o.created_at).slice(0, 10)))).sort();
  const rsvps = rsvpsRes.data ?? [];
  const today = new Date().toISOString().slice(0, 10);

  const alreadyCompleted = new Map<string, any>();
  for (const row of doneRes.data ?? []) alreadyCompleted.set(row.todo_key, row);

  return {
    userId,
    authUser: authRes.data?.user ?? null,
    profile: profileRes.data ?? null,
    orderCount: orders.length,
    totalSpentCents: orders.reduce((s: number, o: any) => s + (o.total_cents ?? 0), 0),
    visitDays,
    rsvpCount: rsvps.length,
    pastRsvpCount: rsvps.filter((r: any) => (r.events?.event_date ?? "") < today && r.status === "confirmed").length,
    bookingCount: (bookingsRes.data ?? []).length,
    referredCount: referredRes.count ?? 0,
    pushSubCount: pushRes.count ?? 0,
    redeemedCount: (redeemedRes.data ?? []).length,
    alreadyCompleted,
  };
}

function streakWithin(days: string[], need: number, window: number): boolean {
  if (days.length < need) return false;
  // Sliding window: if ANY day d has (d, d+window-1) covering ≥ need distinct days, true.
  const ms = days.map(d => Date.parse(d + "T00:00:00"));
  for (let i = 0; i < ms.length; i++) {
    const end = ms[i] + window * 24 * 3600 * 1000;
    const count = ms.filter(m => m >= ms[i] && m < end).length;
    if (count >= need) return true;
  }
  return false;
}

function autoIsDone(key: string, c: Context): boolean {
  switch (key) {
    case "signup":              return !!c.authUser;
    case "verify_phone":        return !!c.authUser?.phone_confirmed_at;
    case "activate_card":       return !!c.profile?.card_issued_at;
    case "add_birthday":        return !!c.profile?.birthday;
    case "marketing_consent":   return !!c.profile?.marketing_consent;
    case "install_app":         return false; // verified client-side on claim
    case "enable_notifications":return c.pushSubCount > 0;
    case "first_booking":       return c.bookingCount >= 1;
    case "first_rsvp":          return c.rsvpCount >= 1;
    case "first_order":         return c.orderCount >= 1;
    case "first_referral":      return c.referredCount >= 1;
    case "three_referrals":     return c.referredCount >= 3;
    case "ten_referrals":       return c.referredCount >= 10;
    case "first_redeem":        return c.redeemedCount >= 1;
    case "spent_100":           return c.totalSpentCents >= 10000;
    case "five_visits":         return c.visitDays.length >= 5;
    case "five_streak_14d":     return streakWithin(c.visitDays, 5, 14);
    case "three_events":        return c.pastRsvpCount >= 3;
    case "one_year_member":     return !!c.authUser?.created_at && (Date.now() - Date.parse(c.authUser.created_at)) >= 365 * 24 * 3600 * 1000;
    default: return false;
  }
}

// Cache disabled keys (1 minute TTL — admin toggles propagate fast enough).
let _disabledKeysCache: { keys: Set<string>; at: number } | null = null;
export async function getDisabledTodoKeys(): Promise<Set<string>> {
  if (_disabledKeysCache && Date.now() - _disabledKeysCache.at < 60_000) return _disabledKeysCache.keys;
  const { data } = await supabaseAdmin.from("task_settings").select("task_key, enabled").eq("enabled", false);
  const keys = new Set((data ?? []).map((r: any) => r.task_key as string));
  _disabledKeysCache = { keys, at: Date.now() };
  return keys;
}
export function clearDisabledTodoCache() { _disabledKeysCache = null; }

export async function getEnabledTodos(): Promise<TodoDef[]> {
  const off = await getDisabledTodoKeys();
  return TODOS.filter(t => !off.has(t.key));
}

export async function getTodoStates(userId: string): Promise<TodoState[]> {
  const [c, off] = await Promise.all([loadContext(userId), getDisabledTodoKeys()]);
  return TODOS.filter(t => !off.has(t.key)).map(t => {
    const completed = c.alreadyCompleted.get(t.key);
    if (completed && completed.status !== "revoked") {
      return { key: t.key, status: "completed", claimed_at: completed.claimed_at };
    }
    if (t.type === "honor") {
      return { key: t.key, status: "available" };
    }
    const done = autoIsDone(t.key, c);
    return { key: t.key, status: done ? "available" : "in_progress" };
  });
}

export async function attemptClaim(
  userId: string,
  key: string,
  opts: { clientSignal?: Record<string, unknown> } = {},
): Promise<{ ok: true; points: number } | { ok: false; error: string }> {
  const def = TODOS.find(t => t.key === key);
  if (!def) return { ok: false, error: "unknown_todo" };
  const off = await getDisabledTodoKeys();
  if (off.has(key)) return { ok: false, error: "task_disabled" };

  // Already claimed?
  const { data: existing } = await supabaseAdmin
    .from("todo_completions").select("id, status")
    .eq("user_id", userId).eq("todo_key", key).maybeSingle();
  if (existing && existing.status !== "revoked") return { ok: false, error: "already_claimed" };

  let status: string = "auto";
  if (def.type === "auto") {
    // Special case: install_app is verified client-side (display-mode)
    if (key === "install_app") {
      if (!opts.clientSignal?.installed) return { ok: false, error: "not_installed" };
    } else {
      const c = await loadContext(userId);
      if (!autoIsDone(key, c)) return { ok: false, error: "not_yet" };
    }
  } else {
    status = "honor_claimed";
  }

  // Upsert completion
  const payload = { user_id: userId, todo_key: key, points: def.points, status, claimed_at: new Date().toISOString() };
  const { error: upErr } = existing
    ? await supabaseAdmin.from("todo_completions").update(payload).eq("id", existing.id)
    : await supabaseAdmin.from("todo_completions").insert(payload);
  if (upErr) return { ok: false, error: upErr.message };

  // Award loyalty points
  const { error: lErr } = await supabaseAdmin.from("loyalty_events").insert({
    user_id: userId, points: def.points, reason: `todo:${key}`,
  });
  if (lErr && !lErr.message?.includes("duplicate")) {
    // Don't fail the request — revert todo_completions not needed, just log.
    console.error("[todos] loyalty_events insert failed:", lErr.message);
  }

  return { ok: true, points: def.points };
}
