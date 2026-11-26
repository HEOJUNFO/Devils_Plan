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

/** `n` as English counts places: 1st, 2nd, 3rd, 4th, 11th, 21st. */
export function englishOrdinal(n: number): string {
  const tens = n % 100;
  const ones = n % 10;
  const ending = tens >= 11 && tens <= 13 ? "th" : ones === 1 ? "st" : ones === 2 ? "nd" : ones === 3 ? "rd" : "th";
  return `${n}${ending}`;
}

/**
 * A length of time as a rules sheet says it in Korean: seconds under a
 * minute ("30초"), whole minutes where they are ("5분"), both otherwise
 * ("2분 30초").
 */
export function koTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  if (minutes === 0) return `${rest}초`;
  return rest === 0 ? `${minutes}분` : `${minutes}분 ${rest}초`;
}

/** The same length in English: "30 s", "5 min", "2.5 min" for a half minute over, "2 min 10 s" otherwise. */
export function enTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  if (minutes === 0) return `${rest} s`;
  if (rest === 30) return `${minutes}.5 min`;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
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
