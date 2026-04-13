import { supabaseAdmin } from "./supabase";

export type TablePageSettings = {
  menu_tile_enabled: boolean;
  wheel_tile_enabled: boolean;
  card_tile_enabled: boolean;
  call_order_enabled: boolean;
  call_pay_enabled: boolean;
  chatbot_enabled: boolean;
};

const DEFAULTS: TablePageSettings = {
  menu_tile_enabled: true,
  wheel_tile_enabled: true,
  card_tile_enabled: true,
  call_order_enabled: true,
  call_pay_enabled: true,
  chatbot_enabled: true,
};

export async function getTablePageSettings(): Promise<TablePageSettings> {
  const { data } = await supabaseAdmin
    .from("table_page_settings")
    .select("menu_tile_enabled, wheel_tile_enabled, card_tile_enabled, call_order_enabled, call_pay_enabled, chatbot_enabled")
    .eq("id", 1)
    .maybeSingle();
  if (!data) return DEFAULTS;
  return { ...DEFAULTS, ...data } as TablePageSettings;
}
