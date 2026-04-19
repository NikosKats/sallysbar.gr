import { supabaseAdmin } from "./supabase";

export type WelcomeSettings = {
  require_email_otp: boolean;
  require_phone_otp: boolean;
  gift_label: string;
};

// Defaults match the strictest / most generic behavior — used when the table
// is missing or the row hasn't been created yet.
export const DEFAULT_WELCOME_SETTINGS: WelcomeSettings = {
  require_email_otp: true,
  require_phone_otp: true,
  gift_label: "free welcome drink",
};

export async function getWelcomeSettings(): Promise<WelcomeSettings> {
  try {
    const { data } = await supabaseAdmin
      .from("welcome_settings")
      .select("require_email_otp, require_phone_otp, gift_label")
      .eq("id", 1)
      .maybeSingle();
    if (!data) return DEFAULT_WELCOME_SETTINGS;
    const label = (typeof data.gift_label === "string" && data.gift_label.trim())
      ? data.gift_label.trim()
      : DEFAULT_WELCOME_SETTINGS.gift_label;
    return {
      require_email_otp: !!data.require_email_otp,
      require_phone_otp: !!data.require_phone_otp,
      gift_label: label,
    };
  } catch {
    return DEFAULT_WELCOME_SETTINGS;
  }
}
