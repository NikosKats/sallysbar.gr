import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";
import { pushToAdmins } from "../../../lib/adminPush";

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

// Pushes a daily summary of customers whose birthday is today so admin can
// prep a complimentary drink / touchpoint.
// Accepts admin session OR x-cron-secret header (for schedulers).
export const POST: APIRoute = async ({ request, locals }) => {
  const secret = request.headers.get("x-cron-secret");
  const expected = import.meta.env.CRON_SECRET || "";
  const isCron = expected && secret === expected;
  if (locals.role !== "admin" && !isCron) return json({ error: "forbidden" }, 403);

  // Greece TZ → today's MM-DD
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Athens" }));
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const todayMMDD = `${mm}-${dd}`;

  const { data: profiles } = await supabaseAdmin
    .from("profiles").select("id, full_name, birthday").not("birthday", "is", null);

  const matches = (profiles ?? []).filter((p: any) => {
    if (!p.birthday) return false;
    return String(p.birthday).slice(5, 10) === todayMMDD;
  });

  if (matches.length === 0) {
    return json({ ok: true, birthdays: 0, pushed: false });
  }

  const names = matches.map((p: any) => p.full_name || "a member").slice(0, 5).join(", ");
  const extra = matches.length > 5 ? ` +${matches.length - 5} more` : "";

  await pushToAdmins({
    title: `🎂 ${matches.length} birthday${matches.length > 1 ? "s" : ""} today`,
    body: names + extra,
    url: "/admin/users",
    tag: `bday-${todayMMDD}`,
  });

  return json({ ok: true, birthdays: matches.length, pushed: true });
};
