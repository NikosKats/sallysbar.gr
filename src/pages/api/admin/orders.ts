import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

export const DELETE: APIRoute = async ({ locals }) => {
  if (!["admin","super_admin"].includes(locals.role ?? "")) {
    return json({ error: "Forbidden" }, 403);
  }

  const { error } = await supabaseAdmin.from("orders").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  if (error) {
    console.error("Failed to delete orders:", error);
    return json({ error: error.message }, 500);
  }

  return json({ ok: true });
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
