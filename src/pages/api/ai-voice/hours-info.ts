import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";
import { site } from "../../../data/site";
import { isVapiAuthed, vapiToolResponse } from "../../../lib/vapi-auth";

export const prerender = false;

// Vapi function-call tool: returns hours, address, upcoming events, and a
// short directions string. The assistant calls this for any "when are you
// open", "where are you", "what's tonight" type question.

export const POST: APIRoute = async ({ request, locals }) => {
  if (!isVapiAuthed(request, locals)) {
    return new Response(JSON.stringify({ error: "unauthorised" }), { status: 401 });
  }

  // Today + next 7 days of events (if the events table exists)
  const todayIso = new Date().toISOString().slice(0, 10);
  const weekOutIso = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10);

  let upcoming: Array<{ date: string; title: string; starts_at?: string | null }> = [];
  try {
    const { data: evs } = await supabaseAdmin
      .from("events")
      .select("date, title_en, title_el, starts_at, is_visible")
      .gte("date", todayIso)
      .lte("date", weekOutIso)
      .eq("is_visible", true)
      .order("date", { ascending: true })
      .limit(5);
    upcoming = (evs ?? []).map((e: any) => ({
      date: e.date,
      title: e.title_en || e.title_el || "Event",
      starts_at: e.starts_at ?? null,
    }));
  } catch {
    // events table may not exist in some deployments — non-fatal
  }

  const hoursText = `${site.hours.text_en} (${site.hours.opens}–${site.hours.closes})`;
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  return vapiToolResponse({
    ok: true,
    name: site.name,
    address: site.addressFull_en,
    phone: site.phoneE164,
    hours: hoursText,
    season_note: (site as any).season?.isOpenNow === false ? (site as any).season.opensFromText_en : null,
    today,
    upcoming_events: upcoming,
    directions_hint: "We're on the main square in Skala, Kefalonia — walkable from the beach and the main road. Parking is available on the street.",
    maps_url: site.mapsShareUrl,
  });
};

export const GET: APIRoute = async () =>
  new Response(JSON.stringify({ ok: true, endpoint: "ai-voice/hours-info" }), {
    headers: { "Content-Type": "application/json" },
  });
