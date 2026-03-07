import { FullConfig } from "@playwright/test";
import path from "path";
import fs from "fs";

const SUPABASE_URL = "https://nbhzodginrdblczjccuk.supabase.co";
const PROJECT_REF = "nbhzodginrdblczjccuk";
const STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`;

// Mirror the chunker logic from @supabase/ssr to produce the correct cookie format
const MAX_CHUNK_SIZE = 3180;

function createCookieChunks(
  key: string,
  value: string
): Array<{ name: string; value: string }> {
  let encodedValue = encodeURIComponent(value);
  if (encodedValue.length <= MAX_CHUNK_SIZE) {
    return [{ name: key, value }];
  }
  const chunks: string[] = [];
  while (encodedValue.length > 0) {
    let encodedChunkHead = encodedValue.slice(0, MAX_CHUNK_SIZE);
    const lastEscapePos = encodedChunkHead.lastIndexOf("%");
    if (lastEscapePos > MAX_CHUNK_SIZE - 3) {
      encodedChunkHead = encodedChunkHead.slice(0, lastEscapePos);
    }
    let valueHead = "";
    while (encodedChunkHead.length > 0) {
      try {
        valueHead = decodeURIComponent(encodedChunkHead);
        break;
      } catch (e) {
        if (
          e instanceof URIError &&
          encodedChunkHead.at(-3) === "%" &&
          encodedChunkHead.length > 3
        ) {
          encodedChunkHead = encodedChunkHead.slice(0, encodedChunkHead.length - 3);
        } else {
          throw e;
        }
      }
    }
    chunks.push(valueHead);
    encodedValue = encodedValue.slice(encodedChunkHead.length);
  }
  return chunks.map((v, i) => ({ name: `${key}.${i}`, value: v }));
}

async function getSessionWithServiceRole(
  email: string,
  password: string,
  serviceRoleKey: string
): Promise<Record<string, unknown>> {
  // Using the service role key as the Authorization bearer causes GoTrue to
  // treat this as an admin request and skip the CAPTCHA check.
  const response = await fetch(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ email, password }),
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Supabase auth failed for ${email}: HTTP ${response.status} — ${body}`
    );
  }

  return response.json();
}

function buildStorageState(
  session: Record<string, unknown>,
  domain: string,
  secure: boolean
) {
  const sessionStr = JSON.stringify(session);
  const chunks = createCookieChunks(STORAGE_KEY, sessionStr);
  const expiresAt =
    typeof session.expires_at === "number"
      ? session.expires_at
      : Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7;

  const cookies = chunks.map(({ name, value }) => ({
    name,
    value,
    domain,
    path: "/",
    expires: expiresAt,
    httpOnly: true,
    secure,
    sameSite: "Lax" as const,
  }));

  return { cookies, origins: [] };
}

async function globalSetup(_config: FullConfig) {
  const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:4321";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const adminEmail = process.env.E2E_ADMIN_EMAIL ?? "";
  const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? "";
  const staffEmail = process.env.E2E_STAFF_EMAIL ?? "";
  const staffPassword = process.env.E2E_STAFF_PASSWORD ?? "";

  const authDir = path.resolve("tests/e2e/.auth");
  fs.mkdirSync(authDir, { recursive: true });

  const credsMissing = !serviceRoleKey || !adminEmail || !adminPassword || !staffEmail || !staffPassword;
  if (credsMissing) {
    const adminJson = path.join(authDir, "admin.json");
    const adminLogoutJson = path.join(authDir, "admin-logout.json");
    const staffJson = path.join(authDir, "staff.json");
    if (fs.existsSync(adminJson) && fs.existsSync(adminLogoutJson) && fs.existsSync(staffJson)) {
      console.log("\n[global-setup] E2E credentials not set — reusing cached session files.\n");
      return;
    }
    throw new Error(
      "Missing required env vars: SUPABASE_SERVICE_ROLE_KEY, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, E2E_STAFF_EMAIL, E2E_STAFF_PASSWORD"
    );
  }

  const url = new URL(baseUrl);
  const domain = url.hostname;
  const secure = url.protocol === "https:";

  console.log("\n[global-setup] Obtaining admin session via service role key…");
  const adminSession = await getSessionWithServiceRole(
    adminEmail,
    adminPassword,
    serviceRoleKey
  );
  fs.writeFileSync(
    path.join(authDir, "admin.json"),
    JSON.stringify(buildStorageState(adminSession, domain, secure), null, 2)
  );
  console.log(`  ✓ admin.json saved  (expires_at: ${adminSession.expires_at})`);

  // Dedicated session for auth.spec.ts admin access control tests.
  // Each page load rotates the refresh token via @supabase/ssr's setAll() callback,
  // which would invalidate admin.json if shared. This keeps them isolated.
  console.log("[global-setup] Obtaining admin-auth session via service role key…");
  const adminAuthSession = await getSessionWithServiceRole(
    adminEmail,
    adminPassword,
    serviceRoleKey
  );
  fs.writeFileSync(
    path.join(authDir, "admin-auth.json"),
    JSON.stringify(buildStorageState(adminAuthSession, domain, secure), null, 2)
  );
  console.log(`  ✓ admin-auth.json saved  (expires_at: ${adminAuthSession.expires_at})`);

  // Dedicated session for the logout test — this session will be signed out during tests
  // and must not be shared with admin.json (which is reused by admin-menu/admin-tips).
  console.log("[global-setup] Obtaining admin-logout session via service role key…");
  const adminLogoutSession = await getSessionWithServiceRole(
    adminEmail,
    adminPassword,
    serviceRoleKey
  );
  fs.writeFileSync(
    path.join(authDir, "admin-logout.json"),
    JSON.stringify(buildStorageState(adminLogoutSession, domain, secure), null, 2)
  );
  console.log(`  ✓ admin-logout.json saved  (expires_at: ${adminLogoutSession.expires_at})`);

  console.log("[global-setup] Obtaining staff session via service role key…");
  const staffSession = await getSessionWithServiceRole(
    staffEmail,
    staffPassword,
    serviceRoleKey
  );
  fs.writeFileSync(
    path.join(authDir, "staff.json"),
    JSON.stringify(buildStorageState(staffSession, domain, secure), null, 2)
  );
  console.log(`  ✓ staff.json saved  (expires_at: ${staffSession.expires_at})`);

  console.log("[global-setup] Done.\n");
}

export default globalSetup;
