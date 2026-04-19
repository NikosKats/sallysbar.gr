import type { APIRoute } from "astro";
import { site } from "../data/site";

export const prerender = false;

// Short redirect to the Sally's Bar Google Maps directions URL. The raw URL is
// ~500 chars — including it directly in SMS would cost 4+ segments per message.
// This keeps the outbound SMS at ~1 segment and lets us swap the target in one
// place if the listing URL ever changes.
export const GET: APIRoute = () =>
  new Response(null, {
    status: 302,
    headers: {
      "Location": site.mapsShareUrl,
      "Cache-Control": "public, max-age=3600",
    },
  });
