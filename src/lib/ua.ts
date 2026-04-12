export function parseUA(ua: string): { device: string; browser: string; os: string } {
  const s = ua || "";
  const device = /iPad/i.test(s) ? "tablet"
    : /Tablet|Kindle|Silk/i.test(s) ? "tablet"
    : /Mobile|Android|iPhone|iPod|BlackBerry|Opera Mini|IEMobile/i.test(s) ? "mobile"
    : /Bot|crawler|spider|slurp|bingpreview|facebookexternalhit/i.test(s) ? "bot"
    : "desktop";

  const os =
    /Windows NT 10/i.test(s) ? "Windows 10/11" :
    /Windows NT/i.test(s)    ? "Windows" :
    /Mac OS X/i.test(s)      ? "macOS" :
    /Android/i.test(s)       ? "Android" :
    /iPhone|iPad|iPod/i.test(s) ? "iOS" :
    /CrOS/i.test(s)          ? "ChromeOS" :
    /Linux/i.test(s)         ? "Linux" : "Other";

  // Order matters: EdgA/Edge before Chrome; Chrome before Safari; etc.
  const browser =
    /EdgA?\//i.test(s)              ? "Edge" :
    /OPR\/|Opera\//i.test(s)        ? "Opera" :
    /SamsungBrowser\//i.test(s)     ? "Samsung" :
    /FxiOS\/|Firefox\//i.test(s)    ? "Firefox" :
    /CriOS\/|Chrome\//i.test(s)     ? "Chrome" :
    /Safari\//i.test(s)             ? "Safari" :
    "Other";

  return { device, browser, os };
}

// Lightweight stable hash (not cryptographic) for IP deduplication without storing raw IP.
export async function hashIp(ip: string, salt: string = "sallysbar"): Promise<string> {
  const data = new TextEncoder().encode(ip + ":" + salt);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).slice(0, 8).map(b => b.toString(16).padStart(2, "0")).join("");
}
