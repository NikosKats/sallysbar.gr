// Daily Wheel of Luck — shared config.
// Every spin is guaranteed to win something (no empty-handed experiences),
// but the expected value per spin is tuned cheap on average.

export const WHEEL_POOL = [
  { type: "points",    value: 10,  label_en: "+10 pts",          label_el: "+10 πόντοι",           weight: 35, color: "#64748b" },
  { type: "points",    value: 25,  label_en: "+25 pts",          label_el: "+25 πόντοι",           weight: 25, color: "#0ea5e9" },
  { type: "points",    value: 50,  label_en: "+50 pts",          label_el: "+50 πόντοι",           weight: 15, color: "#10b981" },
  { type: "free_shot", value: 1,   label_en: "Free shot 🥃",     label_el: "Δωρεάν σφηνάκι 🥃",    weight: 10, color: "#f59e0b" },
  { type: "points",    value: 100, label_en: "+100 pts",         label_el: "+100 πόντοι",          weight: 7,  color: "#a855f7" },
  { type: "discount",  value: 10,  label_en: "10% off tonight",  label_el: "10% έκπτωση απόψε",    weight: 5,  color: "#ec4899" },
  { type: "free_drink",value: 1,   label_en: "Free cocktail 🍸", label_el: "Δωρεάν cocktail 🍸",   weight: 2,  color: "#ef4444" },
  { type: "custom",    value: 0,   label_en: "🎉 Jackpot: house round", label_el: "🎉 Jackpot: κέρασμα", weight: 1,  color: "#fbbf24" },
] as const;

export function pickWheelReward() {
  const total = WHEEL_POOL.reduce((s, r) => s + r.weight, 0);
  let roll = Math.random() * total;
  for (const r of WHEEL_POOL) {
    if ((roll -= r.weight) <= 0) return r;
  }
  return WHEEL_POOL[0];
}

// Bar coordinates (Sally's Bar, Skala, Kefalonia)
export const BAR_LAT = 38.0748829;
export const BAR_LON = 20.7969726;
export const MAX_DISTANCE_M = 250; // accept spins within 250m of the front door

// Haversine distance in meters
export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
