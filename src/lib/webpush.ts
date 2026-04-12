// Minimal Web Push implementation for Cloudflare Workers / Web Crypto.
// Implements VAPID (RFC 8292) + aes128gcm payload (RFC 8291).

export type PushSubscription = {
  endpoint: string;
  p256dh: string; // base64url
  auth: string;   // base64url
};

export type VapidKeys = {
  publicKey: string;  // base64url
  privateKey: string; // base64url
  subject: string;    // mailto:... or https://...
};

// ───────────────────── base64url helpers ─────────────────────
const b64urlEncode = (buf: ArrayBuffer | Uint8Array): string => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const b64urlDecode = (s: string): Uint8Array => {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const concat = (...parts: Uint8Array[]): Uint8Array => {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
};

// ───────────────────── HKDF ─────────────────────
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", salt, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const prkBuf = await crypto.subtle.sign("HMAC", key, ikm);
  const prk = await crypto.subtle.importKey("raw", prkBuf, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const buf = await crypto.subtle.sign("HMAC", prk, concat(info, new Uint8Array([1])));
  return new Uint8Array(buf).slice(0, length);
}

// ───────────────────── VAPID JWT (ES256) ─────────────────────
async function importVapidPrivateKey(privateKeyB64u: string, publicKeyB64u: string): Promise<CryptoKey> {
  // Build a JWK from the raw d (private scalar) and x/y from the public key.
  const publicBytes = b64urlDecode(publicKeyB64u);
  if (publicBytes.length !== 65 || publicBytes[0] !== 0x04) throw new Error("VAPID public key must be 65-byte uncompressed P-256");
  const x = b64urlEncode(publicBytes.slice(1, 33));
  const y = b64urlEncode(publicBytes.slice(33, 65));
  const jwk: JsonWebKey = { kty: "EC", crv: "P-256", d: privateKeyB64u, x, y, ext: true };
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}

async function buildVapidHeaders(endpoint: string, keys: VapidKeys): Promise<Record<string, string>> {
  const url = new URL(endpoint);
  const aud = `${url.protocol}//${url.host}`;
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 11; // <12h
  const header = { typ: "JWT", alg: "ES256" };
  const payload = { aud, exp, sub: keys.subject };
  const enc = (o: unknown) => b64urlEncode(new TextEncoder().encode(JSON.stringify(o)));
  const signingInput = `${enc(header)}.${enc(payload)}`;
  const privKey = await importVapidPrivateKey(keys.privateKey, keys.publicKey);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privKey, new TextEncoder().encode(signingInput));
  const jwt = `${signingInput}.${b64urlEncode(sig)}`;
  return {
    Authorization: `vapid t=${jwt}, k=${keys.publicKey}`,
  };
}

// ───────────────────── Payload encryption (aes128gcm) ─────────────────────
async function encryptPayload(
  payload: Uint8Array,
  subscription: PushSubscription,
): Promise<{ body: Uint8Array }> {
  // Generate ephemeral ECDH keypair
  const localKP = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const localPublicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", localKP.publicKey));

  // Import client public key
  const clientPubBytes = b64urlDecode(subscription.p256dh);
  const clientPubKey = await crypto.subtle.importKey(
    "raw",
    clientPubBytes,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );

  // ECDH shared secret
  const sharedBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: clientPubKey },
    localKP.privateKey,
    256,
  );
  const sharedSecret = new Uint8Array(sharedBits);

  const authSecret = b64urlDecode(subscription.auth);
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // PRK_key (RFC 8291 §3.3)
  const keyInfo = concat(
    new TextEncoder().encode("WebPush: info\0"),
    clientPubBytes,
    localPublicRaw,
  );
  const ikm = await hkdf(authSecret, sharedSecret, keyInfo, 32);

  // Derive CEK and nonce
  const cek = await hkdf(salt, ikm, new TextEncoder().encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, new TextEncoder().encode("Content-Encoding: nonce\0"), 12);

  // Plaintext = payload || 0x02 (last record delimiter)
  const plaintext = concat(payload, new Uint8Array([0x02]));
  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, plaintext));

  // Build aes128gcm header: salt(16) || rs(4, big-endian) || idlen(1) || keyid(idlen)
  const rs = 4096;
  const rsBytes = new Uint8Array(4);
  new DataView(rsBytes.buffer).setUint32(0, rs, false);
  const header = concat(salt, rsBytes, new Uint8Array([localPublicRaw.length]), localPublicRaw);

  return { body: concat(header, ct) };
}

// ───────────────────── Public API ─────────────────────
export async function sendWebPush(
  subscription: PushSubscription,
  payload: string | object,
  keys: VapidKeys,
  opts: { ttl?: number; urgency?: "very-low" | "low" | "normal" | "high"; topic?: string } = {},
): Promise<Response> {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  const { body: encrypted } = await encryptPayload(new TextEncoder().encode(body), subscription);
  const vapid = await buildVapidHeaders(subscription.endpoint, keys);

  const headers: Record<string, string> = {
    ...vapid,
    "Content-Encoding": "aes128gcm",
    "Content-Type": "application/octet-stream",
    "TTL": String(opts.ttl ?? 60),
  };
  if (opts.urgency) headers["Urgency"] = opts.urgency;
  if (opts.topic) headers["Topic"] = opts.topic;

  return fetch(subscription.endpoint, {
    method: "POST",
    headers,
    body: encrypted,
  });
}
