/**
 * A word about the game, from a player to whoever makes it: what it may be,
 * and how it is kept.
 *
 * It is written in the lobby and goes through the list of rooms, which the
 * lobby is connected to (`DirectoryRequest`); the directory keeps it, and
 * whoever makes the game reads it there with a key (`src/server/inbox.ts`).
 * Nothing of the player is kept with it: no nickname, no token, no address.
 * Whoever wants an answer says in the text where to reach them. Pure
 * functions over plain data.
 */
import type { MessageLimit } from "./lobby";
import type { Lang } from "./lang";
import { cleanLine, cutTo } from "./text";

/** Tunable values. Loaded from `directory-config.json` (`feedback`). */
export interface FeedbackConfig {
  /** Longest text, in characters. Longer ones are cut. */
  maxLength: number;
  /** How many one viewer of the list may send within one window. */
  viewerLimit: MessageLimit;
  /**
   * How many are kept in a day, from everyone together: a script that wrote
   * without end would otherwise push everything a player wrote out of what
   * is kept.
   */
  dayLimit: number;
  /** How many are kept in all, the latest of them: the oldest make way. */
  keep: number;
  /**
   * How many wrong keys the inbox is tried with within one window, from
   * everyone together, before it opens for no key at all until the window
   * has passed: a key is its reader's own text, and may be one that could
   * be guessed in a million tries.
   */
  readLimit: MessageLimit;
}

/**
 * Cleans what was written: each line as a line shown to others is cleaned
 * (`cleanLine`), lines with nothing in them dropped, the whole cut to the
 * configured length. `null` when nothing is left.
 */
export function normalizeFeedback(raw: string, config: FeedbackConfig): string | null {
  const lines = raw
    .split(/\r?\n/u)
    .map((line) => cleanLine(line))
    .filter((line) => line !== "");
  const text = cutTo(lines.join("\n"), config.maxLength);
  return text.length > 0 ? text : null;
}

/** A word about the game as the directory keeps it, and as its reader is shown it. Nothing of its writer is in it. */
export interface StoredWord {
  /** Which of the words kept this is: what its reader names it by to have it thrown away. */
  id: number;
  /** When it was written, in milliseconds since the epoch. */
  at: number;
  text: string;
  /** The language its writer's page was read in, and the build that page was. */
  lang: Lang;
  build: string;
}
