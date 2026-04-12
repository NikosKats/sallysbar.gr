import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return new Response(JSON.stringify({ error: "auth_required" }), { status: 401 });

  let body: any;
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 }); }

  const update: Record<string, unknown> = {};

  if (typeof body.full_name === "string") {
    const name = body.full_name.trim();
    if (name.length > 120) return new Response(JSON.stringify({ error: "name_too_long" }), { status: 400 });
    update.full_name = name || null;
  }

  if (body.birthday !== undefined) {
    const { data: current } = await supabaseAdmin
      .from("profiles")
      .select("birthday, birthday_updated_at")
      .eq("id", locals.user.id)
      .single();

    let next: string | null;
    if (body.birthday === null || body.birthday === "") {
      next = null;
    } else {
      const bd = String(body.birthday);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(bd)) {
        return new Response(JSON.stringify({ error: "bad_birthday" }), { status: 400 });
      }
      next = bd;
    }

    const changed = (current?.birthday ?? null) !== next;
    if (changed) {
      if (current?.birthday_updated_at) {
        const ageMs = Date.now() - new Date(current.birthday_updated_at).getTime();
        const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
        if (ageMs < THIRTY_DAYS) {
          const nextAt = new Date(new Date(current.birthday_updated_at).getTime() + THIRTY_DAYS).toISOString();
          return new Response(JSON.stringify({ error: "birthday_locked", next_change_at: nextAt }), { status: 429 });
        }
      }
      update.birthday = next;
      update.birthday_updated_at = new Date().toISOString();
    }
  }

  if (Object.keys(update).length === 0) {
    return new Response(JSON.stringify({ error: "nothing_to_update" }), { status: 400 });
  }

  const { error } = await supabaseAdmin.from("profiles").update(update).eq("id", locals.user.id);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  // Also reflect full_name in auth user_metadata for consistency
  if (typeof update.full_name === "string" || update.full_name === null) {
    try {
      await supabaseAdmin.auth.admin.updateUserById(locals.user.id, {
        user_metadata: { full_name: update.full_name },
      });
    } catch {}
  }

  return new Response(JSON.stringify({ ok: true }));
};
