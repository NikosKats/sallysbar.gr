import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";
import { getScratchSettings, issueScratchCard, expiresAt } from "../../../lib/scratch";

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

// Idempotent: the unique partial index on (user_id, date) where trigger='daily-drop'
// guarantees each member gets at most one card per day from this endpoint.
// Callable from the admin UI (admin role) OR from any scheduler using the x-cron-secret header.
export const POST: APIRoute = async ({ request, locals }) => {
  const cronSecret = request.headers.get("x-cron-secret");
  const expected = import.meta.env.CRON_SECRET || "";
  const isCron = expected && cronSecret === expected;
  if (locals.role !== "admin" && !isCron) return json({ error: "forbidden" }, 403);

  const s = await getScratchSettings();
  if (!s.daily_drop_enabled) return json({ ok: true, issued: 0, reason: "disabled" });

  const { data: members } = await supabaseAdmin
    .from("profiles").select("id").not("card_issued_at", "is", null);
  if (!members || members.length === 0) return json({ ok: true, issued: 0 });

  let issued = 0;
  const exp = expiresAt(s.default_expires_hours ?? 24);
  for (const m of members as any[]) {
    issued += await issueScratchCard(m.id, "daily-drop", { expires_at: exp });
  }
  return json({ ok: true, issued, members: members.length });
};
