import type { APIRoute } from "astro";

export const GET: APIRoute = async () => {
  return new Response(
    JSON.stringify({ publicKey: import.meta.env.VAPID_PUBLIC_KEY ?? "" }),
    { headers: { "Content-Type": "application/json" } },
  );
};
