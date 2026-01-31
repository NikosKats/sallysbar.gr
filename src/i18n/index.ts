import en from "./en";
import el from "./el";

export type Lang = "en" | "el";
export const dict = { en, el };

export function getLangFromPath(pathname: string): Lang {
  return pathname.startsWith("/el") ? "el" : "en";
}

export function withLangPrefix(lang: Lang, path: string) {
  if (lang === "el") return `/el${path === "/" ? "" : path}`;
  return path; // English default
}