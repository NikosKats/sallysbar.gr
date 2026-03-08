import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

// POST — award (positive) or deduct (negative) loyalty points
export const POST: APIRoute = async ({ request, locals }) => {
  if (locals.role !== "admin") {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  const { user_id, points, reason } = body as Record<string, unknown>;

  if (!user_id || typeof points !== "number" || !reason) {
    return new Response(JSON.stringify({ error: "user_id, points (number), and reason are required" }), { status: 400 });
  }

  const { error } = await supabaseAdmin.from("loyalty_events").insert({
    user_id,
    points,
    reason,
  });

  if (error) {
    console.error("[admin/loyalty] insert error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }));
};
