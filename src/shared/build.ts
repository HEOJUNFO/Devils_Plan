/**
 * Which build this code is from, and when a page is from an older one than
 * the server it talks to.
 *
 * A deploy ends every connection and tells nobody, and a page that was open
 * connects again by itself, to rooms run by code newer than its own. The room
 * and the list of rooms say which build they are (`ServerMessage`,
 * `DirectoryMessage`), and a page that hears another than its own loads
 * itself again when nothing would be lost by it (`src/client/main.ts`).
 *
 * A game on the screen is one of the things that would be lost, so a page
 * may play on behind its room. Two moments end that (`heldBack`): the start
 * of the next game, which the older page may not know how to draw, and a
 * game that has gone wrong on it.
 */

/** Put in by the build: the commit it was made from (`vite.config.ts`). Not there in a test. */
declare const __BUILD__: string | undefined;

/** The build this code is from: the first letters of its commit, or `dev` while developing and in a test. */
export const BUILD: string = typeof __BUILD__ === "string" && __BUILD__ !== "" ? __BUILD__ : "dev";

/**
 * Whether a page of build `mine` should load itself again, having heard that
 * the server is of build `servers`.
 *
 * Not when the server says nothing of its build (one from before builds were
 * said). And not when the page was last loaded again from this very build
 * (`reloadedFrom`): loading again brought the same page, and doing it once
 * more would bring it again, without end.
 */
export function outOfDate(mine: string, servers: unknown, reloadedFrom: string | null): boolean {
  if (typeof servers !== "string" || servers === "") return false;
  return servers !== mine && reloadedFrom !== mine;
}

/**
 * When a page behind the server's build asks to load itself again: with
 * nothing having happened (`idle`), as a game begins (`start`), or as
 * something on it has gone wrong (`fault`).
 */
export type LoadWhy = "idle" | "start" | "fault";

/** What is on a page that loading it again would take from the player. */
export interface OnPage {
  /** A game's screen: the game, or its results. */
  game: boolean;
  /** The voice chat is on. */
  voice: boolean;
  /** A room is being made or entered. */
  onTheWay: boolean;
  /** A game was asked for and has not come yet. */
  startAsked: boolean;
  /** Words typed and not sent. */
  typed: boolean;
  /** A sheet that would not come back is being read. */
  reading: boolean;
}

/**
 * Whether a page behind the server's build stays as it is for now, for what
 * loading it again would take from the player.
 *
 * With nothing having happened, anything of `on` holds it back. As a game
 * begins, the results of the one before and the start that was asked for are
 * over, and hold it back no longer: a room that plays game after game from
 * the results never shows its waiting room, and its pages would stay behind
 * for as long as it plays. A game that has gone wrong on the page holds
 * nothing back: the room has the game, and the newer page can draw it.
 */
export function heldBack(why: LoadWhy, on: OnPage): boolean {
  if (why === "fault" && on.game) return false;
  const rest = on.voice || on.onTheWay || on.typed || on.reading;
  return why === "start" ? rest : rest || on.game || on.startAsked;
}
