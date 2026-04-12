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
    if (body.birthday === null || body.birthday === "") {
      update.birthday = null;
    } else {
      const bd = String(body.birthday);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(bd)) {
        return new Response(JSON.stringify({ error: "bad_birthday" }), { status: 400 });
      }
      update.birthday = bd;
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
