/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    user: import("@supabase/supabase-js").User | null;
    session: import("@supabase/supabase-js").Session | null;
    role: "customer" | "employee" | "admin" | null;
    lang: "en" | "el";
  }
}

interface ImportMetaEnv {
  readonly PUBLIC_SUPABASE_URL: string;
  readonly PUBLIC_SUPABASE_ANON_KEY: string;
  readonly SUPABASE_SERVICE_ROLE_KEY: string;
  readonly TELEGRAM_BOT_TOKEN: string;
  readonly TELEGRAM_BARMAN_CHAT_ID: string;
  readonly TELEGRAM_WAITER_CHAT_ID: string;
  readonly TABLE_SECRET: string;
  readonly ANTHROPIC_API_KEY: string;
}
