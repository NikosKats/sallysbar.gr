import type { APIRoute } from "astro";
import { getScratchSettings, issueScratchCard, expiresAt } from "../../../lib/scratch";

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

// Called from /register after successful signup. Idempotent via unique index
// on scratch_cards (user_id) where trigger='signup' — at most one per user, ever.
export const POST: APIRoute = async ({ locals }) => {
  if (!locals.user) return json({ error: "auth_required" }, 401);

  const s = await getScratchSettings();
  if (!s.auto_on_signup) return json({ ok: true, issued: 0, reason: "disabled" });

  const n = await issueScratchCard(locals.user.id, "signup", {
    expires_at: expiresAt(s.default_expires_hours),
  });
  return json({ ok: true, issued: n });
};
