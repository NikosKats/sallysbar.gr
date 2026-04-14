import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";
import { clearGameFlagsCache } from "../../../lib/gameFlags";

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

const TABLES: Record<string, string> = {
  wheel:   "wheel_settings",
  scratch: "scratch_settings",
  quests:  "quest_settings",
};

export const POST: APIRoute = async ({ locals, request }) => {
  if (!["admin", "super_admin"].includes(locals.role ?? "")) return json({ error: "forbidden" }, 403);
  let body: any;
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400); }

  const game = String(body?.game ?? "");
  const table = TABLES[game];
  if (!table) return json({ error: "bad_game" }, 400);

  const enabled = !!body?.enabled;
  // UPDATE instead of upsert — the row id=1 is seeded by every *_settings migration.
  // Only touches `enabled` + `updated_at` so we don't stomp other fields.
  const { error } = await supabaseAdmin
    .from(table)
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) {
    const msg = error.message || "update_failed";
    const hint = /column .* (does not exist|of relation)/i.test(msg) || /'enabled'/i.test(msg)
      ? `Missing column. Run scripts/add-game-enabled-flags.sql in Supabase (alter table ${table} add column if not exists enabled boolean not null default true;)`
      : msg;
    return json({ error: hint, raw: msg, table }, 500);
  }

  clearGameFlagsCache();
  return json({ ok: true, game, enabled });
};
