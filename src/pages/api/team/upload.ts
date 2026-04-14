import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

export const POST: APIRoute = async ({ locals, request }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);
  const { data: me } = await supabaseAdmin
    .from("profiles").select("role").eq("id", locals.user.id).maybeSingle();
  if (!me || !["employee", "admin", "super_admin"].includes(me.role)) return json({ error: "Forbidden" }, 403);

  let fd: FormData;
  try { fd = await request.formData(); } catch { return json({ error: "bad_form" }, 400); }
  const file = fd.get("file") as File | null;
  if (!file || file.size === 0) return json({ error: "no_file" }, 400);
  if (!ALLOWED.has(file.type)) return json({ error: "bad_type", message: "JPG/PNG/WebP/GIF only" }, 400);
  if (file.size > 5 * 1024 * 1024) return json({ error: "too_large", message: "Max 5MB" }, 400);

  const ext = (file.type.split("/")[1] || "jpg").replace(/[^a-z0-9]/g, "");
  const filename = `${locals.user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const buffer = await file.arrayBuffer();

  const { error: upErr } = await supabaseAdmin.storage
    .from("chat").upload(filename, buffer, { contentType: file.type, upsert: false });
  if (upErr) return json({ error: upErr.message }, 500);

  const { data: { publicUrl } } = supabaseAdmin.storage.from("chat").getPublicUrl(filename);
  return json({ ok: true, url: publicUrl });
};
