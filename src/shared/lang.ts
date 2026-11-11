/**
 * The languages the game can be read in (CLAUDE.md, Project Rules), and which
 * of them a page shows. Pure, so the choosing is unit-tested directly.
 *
 * The language is the page's own: the room sends reasons and events, never
 * sentences, so players of one room each read it in theirs.
 */

/** Every language there are words for, the first being the one the game was written in. */
export const LANGS = ["ko", "en"] as const;

/** A language's code, as a browser gives it without its region. */
export type Lang = (typeof LANGS)[number];

/** What a page shows to a reader whose browser asks for none of the languages: more of them read English than Korean. */
export const FALLBACK_LANG: Lang = "en";

/** Whether `value` is the code of a language there are words for. */
export function isLang(value: unknown): value is Lang {
  return typeof value === "string" && (LANGS as readonly string[]).includes(value);
}

/**
 * The language a page shows: the one its address asks for (`?lang=`), else
 * the one the reader last chose there, else the first the browser prefers
 * that there are words for ("ko-KR" is Korean), else `FALLBACK_LANG`. Anything
 * that names no language here is passed over.
 */
export function chooseLang(asked: string | null, stored: string | null, preferred: readonly string[]): Lang {
  if (isLang(asked)) return asked;
  if (isLang(stored)) return stored;
  for (const tag of preferred) {
    const code = tag.toLowerCase().split("-")[0];
    if (isLang(code)) return code;
  }
  return FALLBACK_LANG;
}
