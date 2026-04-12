import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";
import { sendEmail, escapeHtml } from "../../../lib/email";

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

export const POST: APIRoute = async ({ request }) => {
  let body: any;
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400); }

  const full_name = String(body.full_name ?? "").trim();
  const email     = String(body.email ?? "").trim();
  const phone     = body.phone ? String(body.phone).trim() : null;
  const message   = body.message ? String(body.message).trim() : null;
  const cv_url    = body.cv_url ? String(body.cv_url).trim() : null;
  const cv_filename = body.cv_filename ? String(body.cv_filename).trim() : null;
  const job_id    = body.job_id ? String(body.job_id) : null;

  if (full_name.length < 2 || full_name.length > 120) return json({ error: "bad_name" }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))      return json({ error: "bad_email" }, 400);
  if (phone && !/^\+?[\d\s\-()]{6,30}$/.test(phone))  return json({ error: "bad_phone" }, 400);
  if (message && message.length > 5000)                return json({ error: "message_too_long" }, 400);

  const { error } = await supabaseAdmin.from("job_applications").insert({
    job_id, full_name, email, phone, message, cv_url, cv_filename,
  });
  if (error) return json({ error: error.message }, 500);

  // Notify admin
  try {
    const { data: settings } = await supabaseAdmin
      .from("careers_settings")
      .select("notify_email, notify_enabled")
      .eq("id", 1)
      .single();

    if (settings?.notify_enabled && settings?.notify_email) {
      let jobTitle = "(no job)";
      if (job_id) {
        const { data: job } = await supabaseAdmin
          .from("job_listings")
          .select("title_en")
          .eq("id", job_id)
          .single();
        if (job?.title_en) jobTitle = job.title_en;
      }

      const html = `
        <h2>New job application — ${escapeHtml(jobTitle)}</h2>
        <p><strong>Name:</strong> ${escapeHtml(full_name)}<br/>
        <strong>Email:</strong> <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a><br/>
        ${phone ? `<strong>Phone:</strong> ${escapeHtml(phone)}<br/>` : ""}
        ${cv_url ? `<strong>CV:</strong> <a href="${escapeHtml(cv_url)}">${escapeHtml(cv_filename ?? "download")}</a><br/>` : ""}
        </p>
        ${message ? `<h3>Bio / Message</h3><p style="white-space:pre-wrap">${escapeHtml(message)}</p>` : ""}
        <hr/>
        <p style="font-size:12px;color:#888">Sent from sallysbar.gr · <a href="https://sallysbar.gr/admin/careers">Review in admin</a></p>
      `;
      await sendEmail({
        to: settings.notify_email,
        subject: `New application: ${jobTitle} — ${full_name}`,
        html,
      });
    }
  } catch (e) {
    console.error("[careers/apply] notify error", e);
  }

  return json({ ok: true });
};
