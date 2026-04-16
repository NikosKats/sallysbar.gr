import type { APIRoute } from "astro";
import { runAllCronTriggers, setEngineRuntimeEnv } from "../../../lib/marketing-engine";

export const prerender = false;

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

export const GET: APIRoute = async ({ url, locals }) => {
  const cfEnv = (locals as any).runtime?.env ?? {};
  setEngineRuntimeEnv(cfEnv);
  const token = url.searchParams.get("token") ?? "";
  const expected = cfEnv.MARKETING_CRON_TOKEN ?? import.meta.env.MARKETING_CRON_TOKEN;
  if (!expected || token !== expected) return json({ error: "unauthorized" }, 401);

  try {
    const results = await runAllCronTriggers();
    return json({ ok: true, results });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message ?? e) }, 500);
  }
};

export const POST = GET;
