/**
 * Generate per-table QR code URLs with HMAC tokens.
 * Usage: TABLE_SECRET=your-secret node scripts/gen-table-tokens.mjs [tableCount]
 *
 * Example: TABLE_SECRET=mysecret node scripts/gen-table-tokens.mjs 10
 */

const secret = process.env.TABLE_SECRET;
if (!secret) {
  console.error("ERROR: TABLE_SECRET env var is required.");
  console.error("Usage: TABLE_SECRET=your-secret node scripts/gen-table-tokens.mjs [tableCount]");
  process.exit(1);
}

const tableCount = Number(process.argv[2] ?? 10);
const baseUrl    = process.argv[3] ?? "https://sallysbar.gr/table";

async function makeToken(table) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(String(table)));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

console.log(`\nGenerating tokens for ${tableCount} tables...\n`);
console.log("Table  URL");
console.log("-----  " + "-".repeat(60));

for (let t = 1; t <= tableCount; t++) {
  const tok = await makeToken(t);
  console.log(`  ${String(t).padStart(2)}   ${baseUrl}/${t}?token=${tok}`);
}

console.log("\nPrint each URL as a QR code and place it on the matching table.");
console.log("Add TABLE_SECRET to your .env and Cloudflare environment variables.\n");
