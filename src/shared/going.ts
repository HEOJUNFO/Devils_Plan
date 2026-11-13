import type { Meet } from "./meet";

/**
 * "I'll come": a word given in the lobby for the next meeting (`meet.ts`).
 * The lobby says when people are asked to gather, and someone who reads it
 * hours before finds nobody there and no sign that anyone will be. With
 * this, the meeting's line says how many have said they will come, and
 * whoever said so has an hour to come back at.
 *
 * It is a word and nothing more: nothing is made at that hour and nobody is
 * held to it. The directory keeps one row for each (`src/server/directory.ts`)
 * until the meeting is over, and says how many there are, never who. Unlike
 * a hand (`want.ts`) it outlasts the connection: that is its use.
 *
 * Who gave it is a number the browser makes up and keeps (`newWho`), so that
 * the same browser can take its word back. It names nobody and is thrown
 * away with the row. So that one page cannot say it is a crowd, an address
 * is counted for no more than `perAddress` of them.
 */

/** Tunable values of the words given. Part of `directory-config.json`. */
export interface GoingConfig {
  /** The most words for one meeting taken from one network address: a household, not a script. */
  perAddress: number;
  /** The most that is told: past it, "or more". */
  most: number;
}

/** How many have said they will come to the meeting that starts at `meet` (ms since the epoch), as it is told: the number, and whether there are more than it says. */
export interface Coming {
  meet: number;
  count: number;
  more: boolean;
}

/** How many hexadecimal digits the number a browser is known by has. */
const WHO_DIGITS = 32;
const WHO_PATTERN = new RegExp(`^[0-9a-f]{${WHO_DIGITS}}$`);

/** Whether `raw` is a number a browser is known by, as `newWho` makes them. */
export function isWho(raw: unknown): raw is string {
  return typeof raw === "string" && WHO_PATTERN.test(raw);
}

/** A new number for a browser to be known by, from `fill`, which fills the bytes it is given with random ones (`crypto.getRandomValues`). */
export function newWho(fill: (bytes: Uint8Array) => Uint8Array): string {
  return [...fill(new Uint8Array(WHO_DIGITS / 2))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Whether a word for the meeting that starts at `meet` is taken, `near`
 * being the meeting that is on or next (`meetNear`). Only that one can be
 * answered: a word for a meeting that is over, or for one after the next,
 * is not read. A word can be given or taken back while the meeting is on
 * as well: it is then "I am here for it".
 */
export function mayAnswer(near: Meet | null, meet: number): boolean {
  return near !== null && near.start === meet;
}

/** Whether one more word is taken from an address that has given `given` for the meeting already. */
export function mayGiveAnother(given: number, config: GoingConfig): boolean {
  return given < config.perAddress;
}

/** What is told of `rows` words given for the meeting that starts at `meet`. */
export function comingOf(meet: number, rows: number, config: GoingConfig): Coming {
  return { meet, count: Math.max(0, Math.min(rows, config.most)), more: rows > config.most };
}

/**
 * What the meeting's line says of who is coming, for the page: `null` where
 * it says nothing (no meeting, or nobody has said so). `told` is what the
 * directory last said, which may be of an earlier meeting and is then not
 * read; `mine` is the start of the meeting this browser gave its word for,
 * or `null`. The reader's own word is counted even where the directory has
 * not said so yet.
 */
export function comingTo(near: Meet | null, told: Coming | null, mine: number | null): { count: number; more: boolean; mine: boolean } | null {
  if (near === null) return null;
  const own = mine === near.start;
  const heard = told !== null && told.meet === near.start ? told : null;
  const count = Math.max(own ? 1 : 0, heard?.count ?? 0);
  return count === 0 ? null : { count, more: heard?.more ?? false, mine: own };
}
