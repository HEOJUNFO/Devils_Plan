/**
 * A word about the game, from a player to whoever makes it: what it may be,
 * and the letter it is sent as.
 *
 * It is written in the lobby and goes through the list of rooms, which the
 * lobby is connected to (`DirectoryRequest`); the directory sends it on as a
 * letter (`src/server/mail.ts`). Nothing of the player goes with it: no
 * nickname, no token, no address. Whoever wants an answer says in the text
 * where to reach them. Pure functions over plain data.
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
   * How many are sent on in a day, from everyone together. Each is a letter,
   * and the service that carries them carries so many a day for nothing; a
   * script that wrote without end would otherwise fill the reader's box.
   */
  dayLimit: number;
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

/** A letter: what it is headed and what it says. */
export interface Letter {
  subject: string;
  text: string;
}

/**
 * The letter `text` is sent on as: the text first, then what its reader needs
 * to make sense of it, which is the language the page was read in and the
 * build it was. In English, whichever language the text is in: it is read by
 * the one who makes the game.
 */
export function feedbackLetter(text: string, from: { lang: Lang; build: string }): Letter {
  const first = Array.from(text.split("\n")[0] ?? "");
  const head = first.length > 40 ? `${first.slice(0, 40).join("")}…` : first.join("");
  return {
    subject: `[Brain Survival] ${head}`,
    text: `${text}\n\n--\nlanguage: ${from.lang}\nbuild: ${from.build}`,
  };
}
