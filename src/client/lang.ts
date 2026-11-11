/**
 * The language this page is read in, and the words of it.
 *
 * The language is settled once, as the page loads, and every screen takes its
 * words then (`words`). Changing it loads the page again: a page in a room
 * comes back to that room, as after any reload.
 *
 * Every sentence a player reads is written in each language, side by side, in
 * a `words.ts` beside the screen that shows it. The type check holds them to
 * the same shape: a sentence missing in one language does not compile.
 */
import { LANGS, chooseLang, type Lang } from "../shared/lang";
import { storageKey } from "./storage";

const STORED = storageKey("lang");

/** The language this page is read in. */
export const lang: Lang = chooseLang(
  new URLSearchParams(location.search).get("lang"),
  localStorage.getItem(STORED),
  navigator.languages ?? [navigator.language],
);

// what a screen reader pronounces the page as, and what the style sheet fits its buttons to
document.documentElement.lang = lang;

/** Of the same words written in every language, the ones in this page's. */
export function words<T>(written: Record<Lang, T>): T {
  return written[lang];
}

/** The languages the page could be read in instead, each with its own name for itself. */
export const OTHER_LANGS: readonly { lang: Lang; name: string }[] = LANGS.filter((other) => other !== lang).map((other) => ({
  lang: other,
  name: { ko: "한국어", en: "English" }[other],
}));

/** Keeps `next` as the reader's language and loads the page again in it. */
export function switchLang(next: Lang): void {
  localStorage.setItem(STORED, next);
  // an address that asks for a language would win over the one just chosen
  const address = new URL(location.href);
  address.searchParams.delete("lang");
  if (address.href === location.href) location.reload();
  else location.replace(address.href);
}
