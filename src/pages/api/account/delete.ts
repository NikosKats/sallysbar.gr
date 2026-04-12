import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

export const POST: APIRoute = async ({ request, locals, cookies }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: "auth_required" }), { status: 401 });

  let body: any = {};
  try { body = await request.json(); } catch {}

  // Require the user to re-type their email as a confirm safety check.
  const confirmEmail = String(body.confirm_email ?? "").trim().toLowerCase();
  if (!confirmEmail || confirmEmail !== (locals.user.email ?? "").toLowerCase()) {
    return new Response(JSON.stringify({ error: "confirm_mismatch" }), { status: 400 });
  }

  const userId = locals.user.id;

  // Cancel future reservations so the channel gets notified (fire-and-forget best effort)
  await supabaseAdmin.from("reservations").update({ status: "cancelled" }).eq("user_id", userId).gte("date", new Date().toISOString().slice(0, 10));

  // auth.users cascade: profiles, loyalty_events, loyalty_redemptions, reservations, event_rsvps all ref auth.users(id) ON DELETE CASCADE
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  // Clear the session cookies
  ["sb-access-token", "sb-refresh-token"].forEach(n => cookies.delete(n, { path: "/" }));

  return new Response(JSON.stringify({ ok: true }));
};
