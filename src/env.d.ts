/// <reference types="astro/client" />

declare module "qrcode";

declare namespace App {
  interface Locals {
    user: import("@supabase/supabase-js").User | null;
    session: import("@supabase/supabase-js").Session | null;
    role: "customer" | "employee" | "admin" | "super_admin" | null;
    lang: "en" | "el";
    handle?: string | null;
  }
}

interface ImportMetaEnv {
  readonly PUBLIC_SUPABASE_URL: string;
  readonly PUBLIC_SUPABASE_ANON_KEY: string;
  readonly SUPABASE_SERVICE_ROLE_KEY: string;
  readonly TELEGRAM_BOT_TOKEN: string;
  readonly TELEGRAM_BARMAN_CHAT_ID: string;
  readonly TELEGRAM_WAITER_CHAT_ID: string;
  readonly TELEGRAM_BOOKING_CHAT_ID: string;
  readonly RESEND_API_KEY: string;
  readonly RESEND_FROM: string;
  readonly VAPID_PUBLIC_KEY: string;
  readonly VAPID_PRIVATE_KEY: string;
  readonly VAPID_SUBJECT: string;
  readonly TABLE_SECRET: string;
  readonly ANTHROPIC_API_KEY: string;
  readonly VONAGE_API_KEY: string;
  readonly VONAGE_SIGNATURE_SECRET: string;
  readonly VONAGE_BRAND_NAME: string;
  readonly VONAGE_MESSAGES_API_KEY: string;
  readonly VONAGE_MESSAGES_API_SECRET: string;
  readonly VONAGE_MESSAGES_BASE: string;
  readonly VONAGE_WA_FROM: string;
  readonly VONAGE_SMS_FROM: string;
  readonly MARKETING_CRON_TOKEN: string;
  readonly ADMIN_DIGEST_TO: string;
}
