import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

const ALLOWED = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "application/rtf",
]);

export const POST: APIRoute = async ({ request }) => {
  let fd: FormData;
  try { fd = await request.formData(); } catch { return json({ error: "bad_form" }, 400); }

  const file = fd.get("file") as File | null;
  if (!file || file.size === 0) return json({ error: "no_file" }, 400);
  if (!ALLOWED.has(file.type)) return json({ error: "bad_type", message: "PDF, DOC, DOCX, TXT, RTF only" }, 400);
  if (file.size > 8 * 1024 * 1024) return json({ error: "too_large", message: "Max 8MB" }, 400);

  const ext = (file.name.split(".").pop() ?? "pdf").toLowerCase().replace(/[^a-z0-9]/g, "") || "pdf";
  const safeBase = file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 40) || "cv";
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeBase}.${ext}`;

  const buffer = await file.arrayBuffer();
  const { error } = await supabaseAdmin.storage
    .from("careers")
    .upload(filename, buffer, { contentType: file.type, upsert: false });

  if (error) return json({ error: error.message }, 500);

  const { data: { publicUrl } } = supabaseAdmin.storage.from("careers").getPublicUrl(filename);
  return json({ ok: true, url: publicUrl, filename: file.name });
};
