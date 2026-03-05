export async function verifyTableToken(table: number, token: string): Promise<boolean> {
  const secret = import.meta.env.TABLE_SECRET;
  if (!secret) return true; // not configured yet — allow
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(String(table)));
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
  return token === expected;
}
