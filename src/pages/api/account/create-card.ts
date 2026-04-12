import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

const GENDERS = new Set(["female", "male", "non_binary", "prefer_not_to_say"]);

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: "auth_required" }), { status: 401 });

  let body: any;
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 }); }

  const full_name = String(body.full_name ?? "").trim();
  const phone     = String(body.phone ?? "").trim();
  const birthday  = String(body.birthday ?? "").trim();
  const country   = String(body.country ?? "").trim();
  const gender    = String(body.gender ?? "").trim();
  const address   = String(body.address ?? "").trim();
  const city      = String(body.city ?? "").trim();
  const postal_code = String(body.postal_code ?? "").trim();
  const marketing_consent = Boolean(body.marketing_consent);

  if (full_name.length < 2 || full_name.length > 120) return json({ error: "bad_name" }, 400);
  if (!/^\+?[\d\s\-()]{6,20}$/.test(phone))           return json({ error: "bad_phone" }, 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday))          return json({ error: "bad_birthday" }, 400);
  if (country.length < 2 || country.length > 60)      return json({ error: "bad_country" }, 400);
  if (!GENDERS.has(gender))                            return json({ error: "bad_gender" }, 400);
  if (address.length < 2 || address.length > 200)     return json({ error: "bad_address" }, 400);
  if (city.length < 2 || city.length > 80)            return json({ error: "bad_city" }, 400);
  if (postal_code.length < 2 || postal_code.length > 20) return json({ error: "bad_postal_code" }, 400);

  const { data: existing } = await supabaseAdmin
    .from("profiles")
    .select("card_issued_at")
    .eq("id", locals.user.id)
    .single();

  if (existing?.card_issued_at) return json({ error: "card_already_issued" }, 409);

  const now = new Date().toISOString();
  const { error } = await supabaseAdmin.from("profiles").update({
    full_name, phone, birthday, country, gender, address, city, postal_code,
    marketing_consent,
    birthday_updated_at: now,
    card_issued_at: now,
  }).eq("id", locals.user.id);

  if (error) return json({ error: error.message }, 500);

  try {
    await supabaseAdmin.auth.admin.updateUserById(locals.user.id, {
      user_metadata: { full_name },
    });
  } catch {}

  return json({ ok: true });
};

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
