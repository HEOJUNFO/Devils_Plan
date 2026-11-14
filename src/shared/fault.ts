/**
 * Something that went wrong in a player's page, told to whoever makes the
 * game: what a fault is, what of it is kept, and how it is read back.
 *
 * A page whose script throws shows its player a screen that has stopped, and
 * nobody else hears of it. The page notes what was thrown (`faultOf`) and
 * sends it through the list of rooms the next time the lobby is connected
 * (`DirectoryRequest`); the directory keeps it among the words about the game
 * (`feedback.ts`) and whoever makes the game reads it there with the key.
 * The same fault from many pages is one line with a count.
 *
 * What goes: the sentence the browser gave for the error, the script files
 * and positions it was thrown from (file names only: no address, so no room
 * code), which screen was up, and a coarse name for the browser. Nothing of
 * the player: no nickname, no token, no address, nothing typed. Pure
 * functions over plain data.
 */
import { isGameId } from "./games";
import type { MessageLimit } from "./lobby";
import { cleanLine, cutTo } from "./text";

/** Tunable values. Loaded from `directory-config.json` (`faults`). */
export interface FaultConfig {
  /** Longest sentence of an error, in characters. Longer ones are cut. */
  messageLength: number;
  /** How many positions of where it was thrown from go with it, the nearest first. */
  frames: number;
  /**
   * How many one page notes and one browser keeps waiting to be sent: a page
   * that throws on every frame says so once, and the few first are what
   * matter of a page that has gone wrong.
   */
  each: number;
  /** How many one address may send within one window. */
  senderLimit: MessageLimit;
  /** How many are taken in a day, from everyone together, a fault already known counted with the rest: each is a row written. */
  dayLimit: number;
  /** How many different faults are kept, the latest: the oldest make way. They are kept among the words about the game and never push those out. */
  keep: number;
  /** A sentence with any of these in it is not a fault of the game: what browsers say of scripts that are not the page's own, and noise. */
  ignore: readonly string[];
}

/** Which browser a page is in, as coarsely as tells where a fault happens. */
export const BROWSERS = ["ios", "samsung", "android", "edge", "chrome", "firefox", "safari", "other"] as const;
export type Browser = (typeof BROWSERS)[number];

/** A fault as a page sends it. */
export interface Fault {
  /** The sentence the browser gave for the error. */
  message: string;
  /** Where it was thrown from, the nearest first: each `file:line:column`, the file by its name alone. May be none. */
  frames: string[];
  /** The screen that was up: `lobby`, `room` (a room with no game on) or the id of the game being played. */
  where: string;
  browser: Browser;
}

/** What the browser hands a page of an error: an `ErrorEvent`'s fields, or the reason a promise was rejected with. */
export interface RawFault {
  message: string;
  /** The address of the script, where the browser says. */
  source?: string;
  line?: number;
  column?: number;
  /** The error's own account of where it came from, as the browser writes it. */
  stack?: string;
}

/** A frame as it is kept: a file's name, a line and a column. */
const FRAME = /^[\w.<>-]{1,60}:\d{1,7}:\d{1,7}$/u;
/** An address with a line and a column after it, at the end of a line of a stack, as the browsers write one. */
const POSITION = /((?:https?|file|blob|[a-z-]+-extension|webkit-masked-url):[^\s()]+?|[^\s()@]+):(\d+):(\d+)\)?$/u;
/** A script that is not the page's own: one a browser's extension put there. */
const FOREIGN = /(?:-extension|webkit-masked-url):\/\//u;

/**
 * The name of the file at `address`, with nothing of where it is or what was
 * asked of it: the address of a page can hold a room's code, and no part of
 * one is kept. `page` for an address that names no file.
 */
function fileOf(address: string): string {
  const bare = address.split(/[?#]/u)[0];
  const name = bare.slice(bare.lastIndexOf("/") + 1).replace(/[^\w.<>-]/gu, "");
  return name === "" ? "page" : name.slice(0, 60);
}

/** `address`, `line` and `column` as one frame; `null` where they do not make one. */
function frameOf(address: string, line: number, column: number): string | null {
  if (!Number.isInteger(line) || !Number.isInteger(column) || line < 0 || column < 0) return null;
  const frame = `${fileOf(address)}:${line}:${column}`;
  return FRAME.test(frame) ? frame : null;
}

/** The frames in a stack as a browser writes it, the nearest first, each once. Lines that name no position are passed over. */
function framesIn(stack: string): string[] {
  const frames: string[] = [];
  for (const line of stack.split("\n")) {
    const found = POSITION.exec(line.trim());
    if (found === null) continue;
    const frame = frameOf(found[1], Number(found[2]), Number(found[3]));
    if (frame !== null && !frames.includes(frame)) frames.push(frame);
  }
  return frames;
}

/**
 * The fault a page notes of what its browser handed it, or `null` for what
 * is not a fault of the game: an error with no sentence, one a browser's
 * extension threw, or one of the sentences set to be passed over.
 */
export function faultOf(raw: RawFault, where: string, browser: Browser, config: FaultConfig): Fault | null {
  const message = cutTo(cleanLine(raw.message), config.messageLength);
  if (message === "" || config.ignore.some((noise) => message.includes(noise))) return null;
  const stack = raw.stack ?? "";
  if (FOREIGN.test(raw.source ?? "") || FOREIGN.test(stack)) return null;
  const first = raw.source === undefined || raw.source === "" ? null : frameOf(raw.source, raw.line ?? 0, raw.column ?? 0);
  const frames = framesIn(stack);
  // where the browser says the error was thrown comes first, unless the stack begins there already
  const all = first === null || frames[0] === first ? frames : [first, ...frames.filter((frame) => frame !== first)];
  return { message, frames: all.slice(0, config.frames), where, browser };
}

/**
 * Which browser a page is in, from what the browser says of itself. Every
 * browser on an iPhone or iPad is the system's own underneath, so they are
 * one; Samsung's is told from the other browsers on Android because it is
 * the one phones there come with.
 */
export function browserOf(agent: string): Browser {
  if (/iPhone|iPad|iPod/u.test(agent)) return "ios";
  if (/SamsungBrowser/u.test(agent)) return "samsung";
  if (/Android/u.test(agent)) return "android";
  if (/Edg\//u.test(agent)) return "edge";
  if (/Firefox\//u.test(agent)) return "firefox";
  if (/Chrome\//u.test(agent)) return "chrome";
  if (/Safari\//u.test(agent)) return "safari";
  return "other";
}

/** Whether `where` is a screen a fault can be from. */
function isWhere(where: unknown): where is string {
  return where === "lobby" || where === "room" || isGameId(where);
}

/**
 * Reads a fault as a page sent it, cleaned as a line shown to its reader
 * is. `null` for anything else: a sentence that is empty or longer than a
 * page sends, more frames than one sends, a frame that is not a file's name
 * and a position, a screen or a browser there is none of.
 */
export function parseFault(raw: unknown, config: FaultConfig): Fault | null {
  if (typeof raw !== "object" || raw === null) return null;
  const data = raw as { message?: unknown; frames?: unknown; where?: unknown; browser?: unknown };
  if (typeof data.message !== "string" || Array.from(data.message).length > config.messageLength) return null;
  const message = cleanLine(data.message);
  if (message === "") return null;
  if (!Array.isArray(data.frames) || data.frames.length > config.frames) return null;
  const frames: string[] = [];
  for (const frame of data.frames as unknown[]) {
    if (typeof frame !== "string" || !FRAME.test(frame)) return null;
    frames.push(frame);
  }
  if (!isWhere(data.where)) return null;
  if (!BROWSERS.includes(data.browser as Browser)) return null;
  return { message, frames, where: data.where, browser: data.browser as Browser };
}

/** A fault as it is read: its sentence, and under it where it was thrown from, a frame to a line. */
export function faultText(fault: Fault): string {
  return [fault.message, ...fault.frames].join("\n");
}

/** Whether two faults are one: the same sentence thrown from the same place. Which screen and which browser are not what makes a fault another. */
export function sameFault(a: Fault, b: Fault): boolean {
  return faultText(a) === faultText(b);
}

/** A fault a browser keeps waiting to be sent, with the build of the page it happened in: the page that sends it may be a later one. */
export interface WaitingFault {
  fault: Fault;
  build: string;
}

/**
 * The faults a browser keeps waiting to be sent, with `fault` of the build
 * `build` among them: as they were where it is one of them already, or where
 * as many wait as a page sends.
 */
export function waitingWith(waiting: readonly WaitingFault[], fault: Fault, build: string, config: FaultConfig): WaitingFault[] {
  if (waiting.length >= config.each || waiting.some((other) => other.build === build && sameFault(other.fault, fault))) return [...waiting];
  return [...waiting, { fault, build }];
}

/** The faults kept waiting, as a browser wrote them down. None for what cannot be read; what is not a fault is left out, and so is what is past how many wait. */
export function parseWaiting(raw: string | null, config: FaultConfig): WaitingFault[] {
  if (raw === null) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const waiting: WaitingFault[] = [];
  for (const each of data as unknown[]) {
    if (typeof each !== "object" || each === null) continue;
    const { fault: kept, build } = each as { fault?: unknown; build?: unknown };
    const fault = parseFault(kept, config);
    if (fault !== null && typeof build === "string" && waiting.length < config.each) waiting.push({ fault, build });
  }
  return waiting;
}

/** What is kept beside a fault's text: the screen and browser of the page that last sent it, and how many times it has been sent. */
export interface FaultNote {
  where: string;
  browser: string;
  n: number;
}

/** Reads a fault's note as the directory wrote it down; `null` for anything else. */
export function parseFaultNote(kept: string): FaultNote | null {
  try {
    const data: unknown = JSON.parse(kept);
    if (typeof data !== "object" || data === null) return null;
    const { where, browser, n } = data as { where?: unknown; browser?: unknown; n?: unknown };
    if (typeof where !== "string" || typeof browser !== "string" || typeof n !== "number" || !Number.isInteger(n) || n < 1) return null;
    return { where, browser, n };
  } catch {
    return null;
  }
}
