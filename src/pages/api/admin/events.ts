import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

function adminOnly(locals: App.Locals) {
  return !["admin","super_admin"].includes(locals.role ?? "")
    ? new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 })
    : null;
}

// GET — list all events with RSVP counts
export const GET: APIRoute = async ({ locals }) => {
  const deny = adminOnly(locals);
  if (deny) return deny;

  const { data, error } = await supabaseAdmin
    .from("events")
    .select("id, title, title_el, event_date, event_time, capacity, price, is_published, created_at, event_rsvps(count)")
    .order("event_date", { ascending: false });

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify(data), { status: 200 });
};

// POST — create event
export const POST: APIRoute = async ({ request, locals }) => {
  const deny = adminOnly(locals);
  if (deny) return deny;

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  const { title, title_el, description, description_el, event_date, event_time, capacity, price, is_published } = body as Record<string, unknown>;

  if (!title || !event_date) {
    return new Response(JSON.stringify({ error: "title and event_date are required" }), { status: 400 });
  }

  const { data, error } = await supabaseAdmin.from("events").insert({
    title,
    title_el: title_el || null,
    description: description || null,
    description_el: description_el || null,
    event_date,
    event_time: event_time || null,
    capacity: capacity ? Number(capacity) : null,
    price: price !== undefined && price !== "" ? Number(price) : null,
    is_published: is_published !== false,
  }).select("id").single();

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify({ ok: true, id: data.id }), { status: 201 });
};

// PATCH — update event
export const PATCH: APIRoute = async ({ request, locals }) => {
  const deny = adminOnly(locals);
  if (deny) return deny;

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  const { id, ...fields } = body as Record<string, unknown>;
  if (!id) return new Response(JSON.stringify({ error: "Missing id" }), { status: 400 });

  const update: Record<string, unknown> = {};
  if ("title" in fields)          update.title          = fields.title;
  if ("title_el" in fields)       update.title_el       = fields.title_el || null;
  if ("description" in fields)    update.description    = fields.description || null;
  if ("description_el" in fields) update.description_el = fields.description_el || null;
  if ("event_date" in fields)     update.event_date     = fields.event_date;
  if ("event_time" in fields)     update.event_time     = fields.event_time || null;
  if ("capacity" in fields)       update.capacity       = fields.capacity ? Number(fields.capacity) : null;
  if ("price" in fields)          update.price          = fields.price !== "" ? Number(fields.price) : null;
  if ("is_published" in fields)   update.is_published   = fields.is_published;

  const { error } = await supabaseAdmin.from("events").update(update).eq("id", id);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};

// DELETE — delete event (also cascades RSVPs)
export const DELETE: APIRoute = async ({ request, locals }) => {
  const deny = adminOnly(locals);
  if (deny) return deny;

  const { id } = await request.json();
  if (!id) return new Response(JSON.stringify({ error: "Missing id" }), { status: 400 });

  const { error } = await supabaseAdmin.from("events").delete().eq("id", id);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
