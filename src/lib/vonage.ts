// Vonage Verify v1 (signed requests with MD5).
// Signature spec: https://developer.vonage.com/en/getting-started/concepts/signing-messages
// 1. Build query-string pairs like "&key=value" sorted alphabetically by key.
// 2. Append the signature_secret (no separator).
// 3. MD5 hex-digest of that whole string → add as `sig` param.

// Portable MD5 (Cloudflare Workers don't have Node crypto by default).
// Source: adapted from RFC 1321 (public domain).
function md5(str: string): string {
  function toHex(num: number): string {
    let s = "", j;
    for (j = 0; j <= 3; j++) s += ((num >> (j * 8 + 4)) & 0x0f).toString(16) + ((num >> (j * 8)) & 0x0f).toString(16);
    return s;
  }
  function add(x: number, y: number): number { const l = (x & 0xffff) + (y & 0xffff); const m = (x >> 16) + (y >> 16) + (l >> 16); return (m << 16) | (l & 0xffff); }
  function rol(n: number, c: number): number { return (n << c) | (n >>> (32 - c)); }
  function cmn(q: number, a: number, b: number, x: number, s: number, t: number) { return add(rol(add(add(a, q), add(x, t)), s), b); }
  function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return cmn((b & c) | ((~b) & d), a, b, x, s, t); }
  function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return cmn((b & d) | (c & (~d)), a, b, x, s, t); }
  function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return cmn(b ^ c ^ d, a, b, x, s, t); }
  function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) { return cmn(c ^ (b | (~d)), a, b, x, s, t); }

  // Convert string to UTF-8 bytes then to 32-bit words
  const bytes = new TextEncoder().encode(str);
  const n = bytes.length;
  const nblk = ((n + 8) >> 6) + 1;
  const blks = new Array<number>(nblk * 16).fill(0);
  for (let i = 0; i < n; i++) blks[i >> 2] |= bytes[i] << ((i % 4) * 8);
  blks[n >> 2] |= 0x80 << ((n % 4) * 8);
  blks[nblk * 16 - 2] = n * 8;

  let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
  for (let i = 0; i < blks.length; i += 16) {
    const oa = a, ob = b, oc = c, od = d;
    a = ff(a, b, c, d, blks[i + 0],  7, -680876936); d = ff(d, a, b, c, blks[i + 1], 12, -389564586);
    c = ff(c, d, a, b, blks[i + 2], 17,  606105819); b = ff(b, c, d, a, blks[i + 3], 22, -1044525330);
    a = ff(a, b, c, d, blks[i + 4],  7, -176418897); d = ff(d, a, b, c, blks[i + 5], 12,  1200080426);
    c = ff(c, d, a, b, blks[i + 6], 17, -1473231341); b = ff(b, c, d, a, blks[i + 7], 22, -45705983);
    a = ff(a, b, c, d, blks[i + 8],  7,  1770035416); d = ff(d, a, b, c, blks[i + 9], 12, -1958414417);
    c = ff(c, d, a, b, blks[i + 10], 17, -42063); b = ff(b, c, d, a, blks[i + 11], 22, -1990404162);
    a = ff(a, b, c, d, blks[i + 12],  7, 1804603682); d = ff(d, a, b, c, blks[i + 13], 12, -40341101);
    c = ff(c, d, a, b, blks[i + 14], 17, -1502002290); b = ff(b, c, d, a, blks[i + 15], 22, 1236535329);

    a = gg(a, b, c, d, blks[i + 1],  5, -165796510); d = gg(d, a, b, c, blks[i + 6],  9, -1069501632);
    c = gg(c, d, a, b, blks[i + 11], 14,  643717713); b = gg(b, c, d, a, blks[i + 0], 20, -373897302);
    a = gg(a, b, c, d, blks[i + 5],  5, -701558691); d = gg(d, a, b, c, blks[i + 10],  9,  38016083);
    c = gg(c, d, a, b, blks[i + 15], 14, -660478335); b = gg(b, c, d, a, blks[i + 4], 20, -405537848);
    a = gg(a, b, c, d, blks[i + 9],  5,  568446438); d = gg(d, a, b, c, blks[i + 14],  9, -1019803690);
    c = gg(c, d, a, b, blks[i + 3], 14, -187363961); b = gg(b, c, d, a, blks[i + 8], 20,  1163531501);
    a = gg(a, b, c, d, blks[i + 13],  5, -1444681467); d = gg(d, a, b, c, blks[i + 2],  9, -51403784);
    c = gg(c, d, a, b, blks[i + 7], 14,  1735328473); b = gg(b, c, d, a, blks[i + 12], 20, -1926607734);

    a = hh(a, b, c, d, blks[i + 5],  4, -378558); d = hh(d, a, b, c, blks[i + 8], 11, -2022574463);
    c = hh(c, d, a, b, blks[i + 11], 16,  1839030562); b = hh(b, c, d, a, blks[i + 14], 23, -35309556);
    a = hh(a, b, c, d, blks[i + 1],  4, -1530992060); d = hh(d, a, b, c, blks[i + 4], 11,  1272893353);
    c = hh(c, d, a, b, blks[i + 7], 16, -155497632); b = hh(b, c, d, a, blks[i + 10], 23, -1094730640);
    a = hh(a, b, c, d, blks[i + 13],  4,  681279174); d = hh(d, a, b, c, blks[i + 0], 11, -358537222);
    c = hh(c, d, a, b, blks[i + 3], 16, -722521979); b = hh(b, c, d, a, blks[i + 6], 23,  76029189);
    a = hh(a, b, c, d, blks[i + 9],  4, -640364487); d = hh(d, a, b, c, blks[i + 12], 11, -421815835);
    c = hh(c, d, a, b, blks[i + 15], 16,  530742520); b = hh(b, c, d, a, blks[i + 2], 23, -995338651);

    a = ii(a, b, c, d, blks[i + 0],  6, -198630844); d = ii(d, a, b, c, blks[i + 7], 10,  1126891415);
    c = ii(c, d, a, b, blks[i + 14], 15, -1416354905); b = ii(b, c, d, a, blks[i + 5], 21, -57434055);
    a = ii(a, b, c, d, blks[i + 12],  6,  1700485571); d = ii(d, a, b, c, blks[i + 3], 10, -1894986606);
    c = ii(c, d, a, b, blks[i + 10], 15, -1051523); b = ii(b, c, d, a, blks[i + 1], 21, -2054922799);
    a = ii(a, b, c, d, blks[i + 8],  6,  1873313359); d = ii(d, a, b, c, blks[i + 15], 10, -30611744);
    c = ii(c, d, a, b, blks[i + 6], 15, -1560198380); b = ii(b, c, d, a, blks[i + 13], 21,  1309151649);
    a = ii(a, b, c, d, blks[i + 4],  6, -145523070); d = ii(d, a, b, c, blks[i + 11], 10, -1120210379);
    c = ii(c, d, a, b, blks[i + 2], 15,  718787259); b = ii(b, c, d, a, blks[i + 9], 21, -343485551);

    a = add(a, oa); b = add(b, ob); c = add(c, oc); d = add(d, od);
  }
  return toHex(a) + toHex(b) + toHex(c) + toHex(d);
}

// Vonage param value sanitiser per spec: replace & and = inside values.
function cleanValue(v: string): string {
  return String(v).replace(/[&=]/g, "_");
}

export function signParams(params: Record<string, string | number>, signatureSecret: string): Record<string, string> {
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    clean[k] = cleanValue(String(v));
  }
  const sorted = Object.keys(clean).sort();
  let signString = "";
  for (const k of sorted) signString += `&${k}=${clean[k]}`;
  const sig = md5(signString + signatureSecret);
  return { ...clean, sig };
}

type VerifyRequestResult =
  | { ok: true; request_id: string }
  | { ok: false; error: string; status?: string };

export async function verifyStart(number: string, opts: { brand?: string; code_length?: number } = {}): Promise<VerifyRequestResult> {
  const apiKey = import.meta.env.VONAGE_API_KEY;
  const sigSecret = import.meta.env.VONAGE_SIGNATURE_SECRET;
  if (!apiKey || !sigSecret) return { ok: false, error: "vonage_not_configured" };

  const brand = opts.brand ?? import.meta.env.VONAGE_BRAND_NAME ?? "Sally's Bar";
  const code_length = opts.code_length ?? 6;

  const params = signParams({ api_key: apiKey, number, brand, code_length, timestamp: String(Math.floor(Date.now() / 1000)) }, sigSecret);
  const body = new URLSearchParams(params).toString();
  try {
    const r = await fetch("https://api.nexmo.com/verify/json", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const j: any = await r.json();
    console.log("[vonage] verifyStart →", { http: r.status, status: j?.status, error_text: j?.error_text, request_id: j?.request_id, number });
    if (j.status === "0" && j.request_id) return { ok: true, request_id: j.request_id };
    return { ok: false, error: j.error_text || j.error || "verify_failed", status: j.status };
  } catch (e: any) {
    console.error("[vonage] verifyStart network:", e?.message);
    return { ok: false, error: e?.message ?? "network" };
  }
}

type VerifyCheckResult =
  | { ok: true }
  | { ok: false; error: string; status?: string };

export async function verifyCheck(request_id: string, code: string): Promise<VerifyCheckResult> {
  const apiKey = import.meta.env.VONAGE_API_KEY;
  const sigSecret = import.meta.env.VONAGE_SIGNATURE_SECRET;
  if (!apiKey || !sigSecret) return { ok: false, error: "vonage_not_configured" };

  const params = signParams({ api_key: apiKey, request_id, code, timestamp: String(Math.floor(Date.now() / 1000)) }, sigSecret);
  const body = new URLSearchParams(params).toString();
  try {
    const r = await fetch("https://api.nexmo.com/verify/check/json", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const j: any = await r.json();
    if (j.status === "0") return { ok: true };
    return { ok: false, error: j.error_text || j.error || "verify_failed", status: j.status };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "network" };
  }
}
