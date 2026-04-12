import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";
import { getScratchSettings, issueScratchCard, expiresAt } from "../../../lib/scratch";

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

// Issues a scratch card to every member whose birthday is today (month+day match).
// Idempotent via unique partial index where trigger='birthday'.
export const POST: APIRoute = async ({ request, locals }) => {
  const cronSecret = request.headers.get("x-cron-secret");
  const expected = import.meta.env.CRON_SECRET || "";
  const isCron = expected && cronSecret === expected;
  if (locals.role !== "admin" && !isCron) return json({ error: "forbidden" }, 403);

  const s = await getScratchSettings();
  if (!s.birthday_enabled) return json({ ok: true, issued: 0, reason: "disabled" });

  // Greece timezone — match month-day of birthday to today's date.
  const nowEl = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Athens" }));
  const mm = String(nowEl.getMonth() + 1).padStart(2, "0");
  const dd = String(nowEl.getDate()).padStart(2, "0");
  const todayMMDD = `${mm}-${dd}`;

  const { data: profiles } = await supabaseAdmin
    .from("profiles").select("id, birthday").not("birthday", "is", null);

  const matches = (profiles ?? []).filter((p: any) => {
    if (!p.birthday) return false;
    const b = String(p.birthday).slice(5, 10); // YYYY-MM-DD → MM-DD
    return b === todayMMDD;
  });

  let issued = 0;
  const exp = expiresAt(s.default_expires_hours ?? 168); // default 7-day expiry for birthday cards
  for (const m of matches) {
    issued += await issueScratchCard(m.id, "birthday", { expires_at: exp });
  }

  // Admin digest push — one notification with the full list
  if (matches.length > 0) {
    try {
      const { pushToAdmins } = await import("../../../lib/adminPush");
      const { data: fullProfiles } = await supabaseAdmin
        .from("profiles").select("id, full_name").in("id", matches.map(m => m.id));
      const names = (fullProfiles ?? []).map(p => p.full_name || "a member").slice(0, 5).join(", ");
      const extra = (fullProfiles ?? []).length > 5 ? ` +${(fullProfiles ?? []).length - 5} more` : "";
      await pushToAdmins({
        title: `🎂 ${matches.length} birthday${matches.length > 1 ? "s" : ""} today`,
        body: names + extra,
        url: "/admin/users",
        tag: `bday-${todayMMDD}`,
      });
    } catch {}
  }

  return json({ ok: true, issued, birthdays: matches.length });
};
