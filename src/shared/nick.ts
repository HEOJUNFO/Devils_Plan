/**
 * A name to go by, offered to someone who has none yet.
 *
 * Whoever opens the page for the first time, by a link to a room most of
 * all, finds the box for a nickname already holding one: two words, a
 * manner and an animal, in the language the page is read in. They go in
 * with one press, or type their own over it. It is nobody's name: not a
 * player's of the show, and the same two words may be offered to two people.
 * Pure functions over plain data.
 */
import type { Lang } from "./lang";
import { cutTo } from "./text";

/** The words a name is made of, by language. Loaded from `nick-config.json`. */
export type NickWords = Record<Lang, { first: readonly string[]; second: readonly string[] }>;

/**
 * A name of two words in `lang`, one from each list, as `random` picks them
 * (a number from 0 up to, not including, 1). No longer than `maxLength`
 * characters: the lists are of words short enough, and a name that would be
 * longer is cut.
 */
export function suggestNick(lang: Lang, words: NickWords, random: () => number, maxLength: number): string {
  const pick = (list: readonly string[]): string => list[Math.min(list.length - 1, Math.floor(random() * list.length))] ?? "";
  const { first, second } = words[lang];
  return cutTo(`${pick(first)} ${pick(second)}`.trim(), maxLength);
}
