/**
 * The words that are covered over where strangers read them: in a nickname,
 * in the name of a room, and in what is said in a room that is on the list.
 *
 * A word on the list is shown as that many asterisks; the rest of the line
 * stands. A room that is not on the list is one its players were asked into,
 * and what they say to each other there is passed on as it was said
 * (`src/server/room.ts`). The list is short on purpose: it is of words that
 * are hardly said for anything else, and a word that is also part of ordinary
 * speech is left off it rather than have ordinary speech covered. Whoever
 * means to get a word past it will; it is there for the player who did not
 * come to read one. Pure functions over plain data.
 */

/** The words covered. Loaded from `mask-config.json`. */
export interface MaskConfig {
  /** Covered wherever they are in a line, inside a longer word too. */
  anywhere: readonly string[];
  /** Covered only as a word of their own: with a letter or a digit on neither side. */
  whole: readonly string[];
  /** Words that have one of `anywhere` in them and mean nothing by it: left as they are. */
  spared: readonly string[];
}

/** `text` as it goes into a regular expression to stand for itself. */
function literal(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/** Longest first: of two words that begin at the same place, the longer is the one found. */
function alternatives(words: readonly string[]): string {
  return [...words].sort((a, b) => b.length - a.length).map(literal).join("|");
}

const built = new WeakMap<MaskConfig, RegExp | null>();

/** What finds the words of `config` in a line: a spared word (the first group) or a covered one. `null` with nothing to cover. */
function finder(config: MaskConfig): RegExp | null {
  const kept = built.get(config);
  if (kept !== undefined) return kept;
  const covered: string[] = [];
  if (config.anywhere.length > 0) covered.push(alternatives(config.anywhere));
  if (config.whole.length > 0) covered.push(`(?<![\\p{L}\\p{N}])(?:${alternatives(config.whole)})(?![\\p{L}\\p{N}])`);
  let made: RegExp | null = null;
  if (covered.length > 0) {
    // a spared word is found before the covered word inside it, and so is stepped over whole
    const spared = config.spared.length > 0 ? `(${alternatives(config.spared)})|` : "";
    made = new RegExp(`${spared}(?:${covered.join("|")})`, "giu");
  }
  built.set(config, made);
  return made;
}

/**
 * `text` with each word on the list covered by as many asterisks as it has
 * characters, whatever case it was written in. A line with none of them comes
 * back as it was.
 */
export function maskLine(text: string, config: MaskConfig): string {
  const find = finder(config);
  if (find === null) return text;
  return text.replace(find, (found: string, spared: unknown) => (typeof spared === "string" ? found : "*".repeat(Array.from(found).length)));
}
