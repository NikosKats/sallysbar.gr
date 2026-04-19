import type { APIRoute } from "astro";

export const prerender = false;

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

// Tiny helpers that work without a DOM parser (Cloudflare Workers have no
// DOMParser). We use targeted regex — good enough for meta tags and JSON-LD.
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g,  "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g,  "'")
    .replace(/&lt;/g,   "<")
    .replace(/&gt;/g,   ">")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ");
}
function getMeta(html: string, property: string): string | null {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]*content=["']([^"']+)["']`, "i");
  const m = html.match(re);
  if (m) return decodeEntities(m[1]).trim();
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${property}["']`, "i");
  const m2 = html.match(re2);
  return m2 ? decodeEntities(m2[1]).trim() : null;
}
function getTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? decodeEntities(m[1]).trim() : null;
}
function getJsonLd(html: string): any[] {
  const out: any[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const parsed = JSON.parse(m[1].trim());
      if (Array.isArray(parsed)) out.push(...parsed);
      else if (parsed["@graph"]) out.push(...parsed["@graph"]);
      else out.push(parsed);
    } catch { /* ignore malformed block */ }
  }
  return out;
}
function pickLocalBusiness(nodes: any[]): any | null {
  const businessTypes = [
    "LocalBusiness","Restaurant","BarOrPub","Hotel","LodgingBusiness",
    "Bed&Breakfast","BedAndBreakfast","Apartment","CollectionPage","Organization",
  ];
  for (const n of nodes) {
    const t = Array.isArray(n?.["@type"]) ? n["@type"] : [n?.["@type"]];
    if (t.some((x: string) => businessTypes.includes(x))) return n;
  }
  return null;
}

// Build a slug from a name — lowercase, dashes, 3-32 chars. Fallback "partner".
function slugFromName(s: string): string {
  const base = s.toLowerCase()
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  if (base.length >= 3) return base;
  return "partner-" + Math.random().toString(36).slice(2, 6);
}

export const POST: APIRoute = async ({ request, locals }) => {
  if (!["admin", "super_admin"].includes(locals.role ?? "")) {
    return json({ error: "forbidden" }, 403);
  }

  let body: any;
  try { body = await request.json(); } catch { return json({ error: "bad_json" }, 400); }

  const inputUrl = String(body?.url ?? "").trim();
  if (!/^https?:\/\//i.test(inputUrl)) return json({ error: "bad_url", message: "URL must start with http(s)://" }, 400);

  // Fetch with a browser-like UA; follow redirects (the default) so Google's
  // goo.gl short links resolve. Cap to 5s and 1MB to avoid abuse.
  let finalUrl = inputUrl;
  let html = "";
  try {
    const res = await fetch(inputUrl, {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en,el;q=0.8",
      },
      signal: AbortSignal.timeout?.(10000) ?? undefined as any,
    });
    finalUrl = res.url || inputUrl;
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("text/html") && !ct.includes("application/xhtml")) {
      return json({ error: "not_html", message: `Content type is ${ct || "unknown"}. Provide a web page URL.` }, 422);
    }
    const buf = await res.arrayBuffer();
    // Cap to 1MB of HTML
    html = new TextDecoder("utf-8", { fatal: false }).decode(buf.slice(0, 1_000_000));
  } catch (e: any) {
    return json({ error: "fetch_failed", message: e?.message || "Could not fetch URL" }, 502);
  }

  // Extract
  const ogTitle   = getMeta(html, "og:title");
  const ogDesc    = getMeta(html, "og:description") ?? getMeta(html, "description");
  const ogImage   = getMeta(html, "og:image");
  const ogLocale  = getMeta(html, "og:locale");
  const siteName  = getMeta(html, "og:site_name");
  const rawTitle  = getTitle(html);
  const jsonLd    = getJsonLd(html);
  const biz       = pickLocalBusiness(jsonLd);

  const name = (biz?.name ?? ogTitle ?? rawTitle ?? "").trim();
  const description = (biz?.description ?? ogDesc ?? "").trim();
  const image = (
    (Array.isArray(biz?.image) ? biz.image[0] : biz?.image) ??
    ogImage ?? ""
  );
  const city = (
    biz?.address?.addressLocality ??
    biz?.location?.address?.addressLocality ??
    ""
  );
  const telephone = (biz?.telephone ?? "").toString().replace(/[^\d+]/g, "");

  // Work out sensible "website" vs "Google business" attribution
  const isGoogle = /(^|\.)google\.com\//.test(finalUrl) || /maps\.app\.goo\.gl/.test(finalUrl);
  const isBooking = /(^|\.)booking\.com\//.test(finalUrl);

  const suggested = {
    slug: slugFromName(name || siteName || "partner"),
    name: name || siteName || "",
    short_description: description.slice(0, 280),
    city,
    logo_url: (typeof image === "string" ? image : "") || "",
    // Only set website_url if it looks like an actual site (not google/booking)
    website_url: !isGoogle && !isBooking ? finalUrl : "",
    google_business_url: isGoogle ? finalUrl : "",
    telephone: telephone || "",
    final_url: finalUrl,
    source_type: isGoogle ? "google" : isBooking ? "booking" : "website",
  };

  return json({ ok: true, suggested });
};
