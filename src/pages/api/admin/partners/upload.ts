import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../../lib/supabase";

export const prerender = false;

// Admin-only: upload a partner logo/photo. Stored in the "partners" bucket
// (create it once in Supabase → Storage → New bucket → name "partners",
// public = ON). Returns { url } which the admin form pastes into logo_url.
export const POST: APIRoute = async ({ request, locals }) => {
  if (!["admin","super_admin"].includes(locals.role ?? "")) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  let formData: FormData;
  try { formData = await request.formData(); }
  catch { return new Response(JSON.stringify({ error: "Invalid form data" }), { status: 400 }); }

  const file = formData.get("file") as File | null;
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "") || "misc";

  if (!file || file.size === 0) {
    return new Response(JSON.stringify({ error: "No file provided" }), { status: 400 });
  }
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!allowed.includes(file.type)) {
    return new Response(JSON.stringify({ error: "Only JPG, PNG, WebP, GIF allowed" }), { status: 400 });
  }
  if (file.size > 5 * 1024 * 1024) {
    return new Response(JSON.stringify({ error: "File too large (max 5MB)" }), { status: 400 });
  }

  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const filename = `${slug}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const buffer = await file.arrayBuffer();

  const { error } = await supabaseAdmin.storage
    .from("partners")
    .upload(filename, buffer, { contentType: file.type, upsert: false });

  if (error) {
    console.error("[admin/partners/upload]", error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const { data: { publicUrl } } = supabaseAdmin.storage
    .from("partners")
    .getPublicUrl(filename);

  return new Response(JSON.stringify({ url: publicUrl }), { status: 200 });
};
