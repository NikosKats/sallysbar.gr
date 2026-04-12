import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";
import { awardReferralPoints } from "../../../lib/loyalty";

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: "auth_required" }), { status: 401 });

  let body: any;
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 }); }

  const referrerId = String(body.referrer_id ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(referrerId)) return new Response(JSON.stringify({ error: "invalid_referrer" }), { status: 400 });
  if (referrerId === locals.user.id) return new Response(JSON.stringify({ error: "self_ref" }), { status: 400 });

  // Prevent double-claim: only set referred_by if currently null
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("referred_by")
    .eq("id", locals.user.id)
    .maybeSingle();
  if (profile?.referred_by) return new Response(JSON.stringify({ error: "already_claimed" }), { status: 409 });

  // Verify referrer exists
  const { data: ref } = await supabaseAdmin.from("profiles").select("id").eq("id", referrerId).maybeSingle();
  if (!ref) return new Response(JSON.stringify({ error: "referrer_not_found" }), { status: 404 });

  await supabaseAdmin.from("profiles").update({ referred_by: referrerId }).eq("id", locals.user.id);
  const points = await awardReferralPoints(referrerId, locals.user.id);

  return new Response(JSON.stringify({ ok: true, points }));
};
