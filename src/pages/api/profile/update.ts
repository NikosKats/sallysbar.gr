import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

const SOCIAL_KEYS = ["instagram", "facebook", "tiktok", "x", "linkedin", "youtube", "website"] as const;
type SocialKey = typeof SOCIAL_KEYS[number];

function cleanString(v: any, max = 200): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  return s.slice(0, max);
}

export const POST: APIRoute = async ({ locals, request }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);

  let body: any;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const update: Record<string, any> = {};

  if ("full_name" in body)          update.full_name         = cleanString(body.full_name, 120);
  if ("phone" in body)              update.phone             = cleanString(body.phone, 40);
  if ("gender" in body)             update.gender            = cleanString(body.gender, 20);
  if ("country" in body)            update.country           = cleanString(body.country, 60);
  if ("city" in body)               update.city              = cleanString(body.city, 80);
  if ("address" in body)            update.address           = cleanString(body.address, 200);
  if ("postal_code" in body)        update.postal_code       = cleanString(body.postal_code, 20);
  if ("bio" in body)                update.bio               = cleanString(body.bio, 500);
  if ("avatar_url" in body)         update.avatar_url        = cleanString(body.avatar_url, 500);
  if ("marketing_consent" in body)  update.marketing_consent = !!body.marketing_consent;
  if ("card_public" in body)        update.card_public       = !!body.card_public;

  if ("card_visibility" in body && body.card_visibility && typeof body.card_visibility === "object") {
    const v = body.card_visibility;
    const s = v.socials && typeof v.socials === "object" ? v.socials : {};
    update.card_visibility = {
      avatar:     v.avatar !== false,
      bio:        v.bio !== false,
      location:   v.location !== false,
      phone:      !!v.phone,
      role_badge: v.role_badge !== false,
      socials: {
        instagram: s.instagram !== false,
        facebook:  s.facebook  !== false,
        tiktok:    s.tiktok    !== false,
        x:         s.x         !== false,
        linkedin:  s.linkedin  !== false,
        youtube:   s.youtube   !== false,
        website:   s.website   !== false,
      },
    };
  }

  if ("handle" in body) {
    const raw = typeof body.handle === "string" ? body.handle.trim().toLowerCase() : "";
    if (!raw) { update.handle = null; }
    else if (!/^[a-z0-9_.\-]{3,30}$/.test(raw)) return json({ error: "Handle must be 3-30 chars: a-z, 0-9, . _ -" }, 400);
    else {
      const { data: taken } = await supabaseAdmin.from("profiles").select("id").eq("handle", raw).neq("id", locals.user.id).maybeSingle();
      if (taken) return json({ error: "Handle already taken" }, 409);
      update.handle = raw;
    }
  }

  if ("birthday" in body) {
    const b = cleanString(body.birthday, 10);
    if (b && /^\d{4}-\d{2}-\d{2}$/.test(b)) update.birthday = b;
    else if (b === null) update.birthday = null;
  }

  if ("socials" in body && body.socials && typeof body.socials === "object") {
    const out: Record<string, string> = {};
    for (const k of SOCIAL_KEYS) {
      const v = cleanString(body.socials[k as SocialKey], 300);
      if (v) out[k] = v;
    }
    update.socials = out;
  }

  if (Object.keys(update).length === 0) return json({ error: "Nothing to update" }, 400);

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update(update)
    .eq("id", locals.user.id)
    .select("*")
    .single();

  if (error) {
    console.error("profile update error", error);
    return json({ error: "Update failed" }, 500);
  }
  return json({ ok: true, profile: data });
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
