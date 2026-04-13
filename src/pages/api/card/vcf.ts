import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase";

// Generate a vCard 3.0 download so anyone scanning or tapping the card
// can save the person straight into their phone's contacts.
export const GET: APIRoute = async ({ url }) => {
  const id = url.searchParams.get("id");
  if (!id) return new Response("missing id", { status: 400 });

  const { data: p } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, phone, socials, handle, card_public, city, country")
    .eq("id", id)
    .maybeSingle();

  if (!p || p.card_public === false) return new Response("not found", { status: 404 });

  const name = p.full_name ?? "Member";
  const socials = (p.socials ?? {}) as Record<string, string>;
  const cardUrl = `${url.origin}/u/${p.handle ?? p.id.slice(0, 8)}`;

  const lines: string[] = ["BEGIN:VCARD", "VERSION:3.0", `FN:${escVcf(name)}`];
  if (p.phone)   lines.push(`TEL;TYPE=CELL:${escVcf(p.phone)}`);
  if (p.city || p.country) lines.push(`ADR;TYPE=HOME:;;;${escVcf(p.city ?? "")};;;${escVcf(p.country ?? "")}`);
  if (socials.website)  lines.push(`URL:${escVcf(socials.website)}`);
  if (socials.instagram) lines.push(`X-SOCIALPROFILE;TYPE=instagram:${escVcf(socials.instagram)}`);
  if (socials.facebook)  lines.push(`X-SOCIALPROFILE;TYPE=facebook:${escVcf(socials.facebook)}`);
  if (socials.linkedin)  lines.push(`X-SOCIALPROFILE;TYPE=linkedin:${escVcf(socials.linkedin)}`);
  if (socials.x)         lines.push(`X-SOCIALPROFILE;TYPE=twitter:${escVcf(socials.x)}`);
  if (socials.tiktok)    lines.push(`X-SOCIALPROFILE;TYPE=tiktok:${escVcf(socials.tiktok)}`);
  if (socials.youtube)   lines.push(`X-SOCIALPROFILE;TYPE=youtube:${escVcf(socials.youtube)}`);
  lines.push(`NOTE:${escVcf("Powered by Sally's Bar · " + cardUrl)}`);
  lines.push(`URL;TYPE=Sally's Bar card:${escVcf(cardUrl)}`);
  lines.push("END:VCARD");

  const body = lines.join("\r\n");
  const filename = (p.handle ?? name.toLowerCase().replace(/[^a-z0-9]+/g, "-")).slice(0, 40) || "card";
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}.vcf"`,
      "Cache-Control": "no-store",
    },
  });
};

function escVcf(s: string) {
  return String(s).replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}
