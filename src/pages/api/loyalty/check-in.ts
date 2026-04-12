import type { APIRoute } from "astro";
import { getScratchSettings, issueScratchCard, expiresAt } from "../../../lib/scratch";

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

// Fires once per day per user (enforced by unique partial index on scratch_cards.trigger='checkin').
// Called client-side from /table/[id] when a logged-in user lands on a table QR.
export const POST: APIRoute = async ({ locals }) => {
  if (!locals.user) return json({ ok: true, issued: 0, reason: "no_user" });

  const s = await getScratchSettings();
  if (!s.auto_on_checkin) return json({ ok: true, issued: 0, reason: "disabled" });

  const n = await issueScratchCard(locals.user.id, "checkin", {
    expires_at: expiresAt(s.default_expires_hours),
  });
  return json({ ok: true, issued: n });
};
