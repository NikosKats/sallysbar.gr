import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../../lib/supabase";

export const POST: APIRoute = async ({ request, locals }) => {
  if (!["admin","super_admin"].includes(locals.role ?? "")) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid form data" }), { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    return new Response(JSON.stringify({ error: "No file provided" }), { status: 400 });
  }

  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!allowedTypes.includes(file.type)) {
    return new Response(JSON.stringify({ error: "Only JPG, PNG, WebP, GIF allowed" }), { status: 400 });
  }

  if (file.size > 5 * 1024 * 1024) {
    return new Response(JSON.stringify({ error: "File too large (max 5MB)" }), { status: 400 });
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const buffer = await file.arrayBuffer();

  const { error } = await supabaseAdmin.storage
    .from("events")
    .upload(filename, buffer, { contentType: file.type, upsert: false });

  if (error) {
    console.error("[events/upload]", error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const { data: { publicUrl } } = supabaseAdmin.storage
    .from("events")
    .getPublicUrl(filename);

  return new Response(JSON.stringify({ url: publicUrl }), { status: 200 });
};
