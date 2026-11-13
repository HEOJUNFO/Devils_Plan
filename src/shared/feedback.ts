/**
 * A word about the game, from a player to whoever makes it: what it may be,
 * and how it is kept.
 *
 * It is written in the lobby and goes through the list of rooms, which the
 * lobby is connected to (`DirectoryRequest`); the directory keeps it, and
 * whoever makes the game reads it there with a key (`src/server/inbox.ts`).
 * Nothing of the player is kept with it: no nickname, no token, no address.
 * Whoever wants an answer says in the text where to reach them.
 *
 * Kept with those words, and read in the same place: a player pointed out by
 * another in a room (a `Flag`), with the nickname they went by there and the
 * lines the one who pointed says they said. Nothing of the one who pointed is
 * kept, and a nickname is whatever was typed on the way in: it is no one's
 * account, and nothing is done to anyone by it. It tells whoever runs the
 * site what is being said in the rooms. Pure functions over plain data.
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
  /** The language its writer's page was read in, and the build that page was. Of a flag, neither is known: the reader's own language, and no build. */
  lang: Lang;
  build: string;
  /** There when this is a player pointed out in a room, with `text` the lines said to be theirs: the nickname they went by and the game the room was for. */
  flag?: { nick: string; game: string };
}

/** Tunable values of pointing a player out. Loaded from `chat-config.json` (`flag`). */
export interface FlagConfig {
  /** How many lines go with a flag, the latest of what the player said: more are left out. */
  lines: number;
  /** How many flags one player may send from one room. */
  each: number;
  /** How many are kept in a day, from every room together. */
  dayLimit: number;
}

/** A player pointed out to whoever runs the site, as the room they were in tells the directory. */
export interface Flag {
  /** The nickname they went by in the room. */
  nick: string;
  /** The game the room was for, by its id. */
  game: string;
  /** What the one who pointed says they said, oldest first. May be none: a nickname alone can be what is pointed at. */
  lines: string[];
}

/**
 * Reads a flag as a room sent it. `null` for anything else, and for one
 * with more lines, a longer line or a longer name than a room sends.
 */
export function parseFlag(raw: unknown, limits: { lines: number; lineLength: number; nickLength: number }): Flag | null {
  if (typeof raw !== "object" || raw === null) return null;
  const data = raw as { nick?: unknown; game?: unknown; lines?: unknown };
  if (typeof data.nick !== "string" || data.nick === "" || Array.from(data.nick).length > limits.nickLength) return null;
  if (typeof data.game !== "string" || data.game === "" || data.game.length > 40) return null;
  if (!Array.isArray(data.lines) || data.lines.length > limits.lines) return null;
  const lines: string[] = [];
  for (const line of data.lines) {
    if (typeof line !== "string" || line === "" || Array.from(line).length > limits.lineLength) return null;
    lines.push(line);
  }
  return { nick: data.nick, game: data.game, lines };
}
