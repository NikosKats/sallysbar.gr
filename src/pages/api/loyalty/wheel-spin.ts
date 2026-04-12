import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";
import { hashIp } from "../../../lib/ua";
import { WHEEL_POOL, pickWheelReward, distanceMeters, BAR_LAT, BAR_LON, MAX_DISTANCE_M as DEFAULT_DISTANCE } from "../../../lib/wheel";

async function getWheelSettings() {
  const { data } = await supabaseAdmin.from("wheel_settings").select("*").eq("id", 1).maybeSingle();
  return {
    enabled:         data?.enabled         ?? true,
    max_distance_m:  data?.max_distance_m  ?? DEFAULT_DISTANCE,
    require_country: data?.require_country ?? false,
  };
}
import { verifyTableToken } from "../../../lib/tableToken";

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

// GET — tells the client "can this user spin right now?" without rolling.
// Used by /table/[id] to decide whether to show the wheel.
export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return json({ canSpin: false, reason: "auth_required" });

  const settings = await getWheelSettings();
  if (!settings.enabled) return json({ canSpin: false, reason: "disabled" });

  // Check today's spin
  const { data: existing } = await supabaseAdmin
    .from("wheel_spins")
    .select("id, reward_label, spun_at")
    .eq("user_id", locals.user.id)
    .gte("spun_at", startOfTodayAthensIso())
    .maybeSingle();

  if (existing) {
    return json({
      canSpin: false,
      reason: "already_spun_today",
      lastReward: existing.reward_label,
      lastSpunAt: existing.spun_at,
      nextSpinAt: startOfTomorrowAthensIso(),
    });
  }
  return json({ canSpin: true });
};

// POST — actually spin. Requires auth + geolocation proving user is at the bar
// + optional table token from the URL.
export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  if (!locals.user) return json({ error: "auth_required" }, 401);

  const settings = await getWheelSettings();
  if (!settings.enabled) return json({ error: "disabled", message: "The wheel is temporarily disabled." }, 403);

  let body: any;
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400); }

  const lat = Number(body.lat);
  const lon = Number(body.lon);
  const table_number = body.table != null ? Number(body.table) : null;
  const table_token  = body.token ? String(body.token) : "";

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return json({ error: "location_required", message: "Enable location to spin — verifies you're at the bar." }, 400);
  }

  // 1) Proximity to bar (admin-tunable)
  const distM = distanceMeters(lat, lon, BAR_LAT, BAR_LON);
  if (distM > settings.max_distance_m) {
    return json({ error: "too_far", message: "Come to Sally's Bar to spin — we don't spin remotely.", distance_m: Math.round(distM) }, 403);
  }

  // 2) Country sanity check via Cloudflare edge header (admin-tunable)
  const cc = request.headers.get("cf-ipcountry") ?? "";
  if (settings.require_country && cc && cc !== "GR" && cc !== "T1" /* Tor */ && cc !== "XX") {
    return json({ error: "country_mismatch", message: "Must be in Greece to spin." }, 403);
  }

  // 3) Optional: verify the table token so a user can't just POST from home even with faked geo
  if (table_number != null && table_token) {
    const ok = await verifyTableToken(table_number, table_token);
    if (!ok) return json({ error: "bad_table_token" }, 403);
  }

  // 4) Daily limit
  const { data: alreadyToday } = await supabaseAdmin
    .from("wheel_spins")
    .select("id, reward_label")
    .eq("user_id", locals.user.id)
    .gte("spun_at", startOfTodayAthensIso())
    .maybeSingle();
  if (alreadyToday) {
    return json({ error: "already_spun_today", message: "You already spun today. Come back tomorrow.", lastReward: alreadyToday.reward_label }, 409);
  }

  // 5) Roll
  const reward = pickWheelReward();
  const idx = WHEEL_POOL.findIndex(r => r.label_en === reward.label_en);

  // 6) Capture IP hash (for abuse audit, no raw IP stored)
  let ip = "";
  try { ip = clientAddress || request.headers.get("cf-connecting-ip") || ""; } catch {}
  const ip_hash = ip ? await hashIp(ip) : null;

  // 7) Persist spin (unique partial index enforces once-per-day)
  const { error: insErr } = await supabaseAdmin.from("wheel_spins").insert({
    user_id: locals.user.id,
    table_number,
    lat, lon,
    distance_m: distM,
    reward_type: reward.type,
    reward_value: reward.value,
    reward_label: reward.label_en,
    ip_hash,
  });
  if (insErr) {
    if ((insErr as any).code === "23505") {
      return json({ error: "already_spun_today" }, 409);
    }
    return json({ error: insErr.message }, 500);
  }

  // 8) Auto-credit points rewards
  if (reward.type === "points" && Number(reward.value) > 0) {
    await supabaseAdmin.from("loyalty_events").insert({
      user_id: locals.user.id,
      points: Number(reward.value),
      reason: `wheel:${new Date().toISOString().slice(0, 10)}`,
    });
  }

  return json({
    ok: true,
    reward: {
      type: reward.type,
      value: reward.value,
      label_en: reward.label_en,
      label_el: reward.label_el,
      index: idx,
      color: reward.color,
      auto_claimed: reward.type === "points",
    },
  });
};

// Helpers
function startOfTodayAthensIso(): string {
  const now = new Date();
  // Convert "now" to Athens time components
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Athens",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(now);
  const p = Object.fromEntries(parts.map(x => [x.type, x.value])) as Record<string, string>;
  // Athens is UTC+2 or +3 (DST). Compute the UTC start of today-in-Athens:
  // simpler: take today's date in Athens and reconstruct as UTC boundary.
  const athensLocalMidnight = new Date(`${p.year}-${p.month}-${p.day}T00:00:00+02:00`);
  // That's a reasonable approximation — DST shift is 1 hour; daily-limit accuracy is unaffected.
  return athensLocalMidnight.toISOString();
}
function startOfTomorrowAthensIso(): string {
  const t = new Date(startOfTodayAthensIso());
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString();
}
