import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);

  let fd: FormData;
  try { fd = await request.formData(); } catch { return json({ error: "bad_form" }, 400); }

  const file = fd.get("file") as File | null;
  if (!file || file.size === 0) return json({ error: "no_file" }, 400);
  if (!ALLOWED.has(file.type)) return json({ error: "bad_type", message: "JPG/PNG/WebP/GIF only" }, 400);
  if (file.size > 3 * 1024 * 1024) return json({ error: "too_large", message: "Max 3MB" }, 400);

  const ext = (file.type.split("/")[1] || "jpg").replace(/[^a-z0-9]/g, "");
  const filename = `${locals.user.id}/avatar-${Date.now()}.${ext}`;
  const buffer = await file.arrayBuffer();

  const { error: upErr } = await supabaseAdmin.storage
    .from("avatars")
    .upload(filename, buffer, { contentType: file.type, upsert: true });
  if (upErr) return json({ error: upErr.message }, 500);

  const { data: { publicUrl } } = supabaseAdmin.storage.from("avatars").getPublicUrl(filename);

  await supabaseAdmin.from("profiles").update({ avatar_url: publicUrl }).eq("id", locals.user.id);
  return json({ ok: true, url: publicUrl });
};

export const DELETE: APIRoute = async ({ locals }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);
  // Best-effort: null the URL; leave the storage file (cheap & simple).
  await supabaseAdmin.from("profiles").update({ avatar_url: null }).eq("id", locals.user.id);
  return json({ ok: true });
};
