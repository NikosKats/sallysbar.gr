import { supabaseAdmin } from "./supabase";

export type GameFlags = { wheel: boolean; scratch: boolean; quests: boolean };

const DEFAULTS: GameFlags = { wheel: true, scratch: true, quests: true };

let cache: { v: GameFlags; at: number } | null = null;
const TTL = 60_000;

export async function getGameFlags(): Promise<GameFlags> {
  if (cache && Date.now() - cache.at < TTL) return cache.v;
  const [w, s, q] = await Promise.all([
    supabaseAdmin.from("wheel_settings").select("enabled").eq("id", 1).maybeSingle(),
    supabaseAdmin.from("scratch_settings").select("enabled").eq("id", 1).maybeSingle(),
    supabaseAdmin.from("quest_settings").select("enabled").eq("id", 1).maybeSingle(),
  ]);
  const v: GameFlags = {
    wheel:   w.data?.enabled !== false,
    scratch: s.data?.enabled !== false,
    quests:  q.data?.enabled !== false,
  };
  cache = { v, at: Date.now() };
  return v;
}

export function clearGameFlagsCache() { cache = null; }
