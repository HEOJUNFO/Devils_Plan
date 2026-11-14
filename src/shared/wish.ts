/**
 * Which game next. A player who is not the host says, in the waiting room,
 * which other game they would like the room to play: one game, or none. The
 * room says to everyone how many have asked for each game, and to nobody
 * who; the host, who alone changes the room's game, reads the numbers where
 * the change is made and decides. Nothing is decided by the count.
 *
 * It stands beside "one more" (`again.ts`), which asks for the same game
 * again: this asks for another. The room keeps it with the connection that
 * said it and nowhere else (`src/server/room.ts`), as it keeps who has the
 * rules open (`reading.ts`): nothing is written to storage, and it is gone
 * with the connection. Once the host has changed the game the question is
 * answered, and everyone's word is taken back.
 *
 * Pure functions over plain data.
 */

import type { GameId } from "./games";

/** How many have asked for each game; a game nobody asked for is not there. */
export type Wishes = Partial<Record<GameId, number>>;

/**
 * How many have asked for each game, out of what each seat's connection
 * said (`wished`, by slot): of those connected, not the host (who changes
 * the game and has nobody to ask), and not for the game the room is for
 * already.
 */
export function wishesOf(wished: ReadonlyMap<number, GameId>, connected: ReadonlySet<number>, host: number | null, game: GameId): Wishes {
  const wishes: Wishes = {};
  for (const [slot, asked] of wished) {
    if (slot === host || asked === game || !connected.has(slot)) continue;
    wishes[asked] = (wishes[asked] ?? 0) + 1;
  }
  return wishes;
}

/** How many have asked for another game at all. */
export function wishCount(wishes: Wishes | undefined): number {
  let count = 0;
  for (const each of Object.values(wishes ?? {})) count += each ?? 0;
  return count;
}

/**
 * What a press on `game` asks for, by a player whose word so far is `mine`
 * (`null` for none): that game, or nothing if it was theirs already.
 */
export function wishAfter(mine: GameId | null, game: GameId): GameId | null {
  return mine === game ? null : game;
}

/**
 * The counts as a page shows them ahead of the room's answer: `wishes` as
 * the room last said them, with the reader's own word moved from `was`
 * (what the room counted for them, `null` for none) to `now` (what they
 * have pressed since).
 */
export function wishesWith(wishes: Wishes | undefined, was: GameId | null, now: GameId | null): Wishes {
  const next: Wishes = { ...wishes };
  if (was === now) return next;
  if (was !== null) {
    const left = (next[was] ?? 0) - 1;
    if (left > 0) next[was] = left;
    else delete next[was];
  }
  if (now !== null) next[now] = (next[now] ?? 0) + 1;
  return next;
}

/** How a page stands towards the room, as far as saying its player's word again goes. */
export interface WishStanding {
  /** The game the player asked for and has not taken back, as the page remembers it; `null` for none. */
  kept: GameId | null;
  /** The game the room counts for them now; `null` for none. */
  counted: GameId | null;
  /** Whether the page has said it again on the connection now open. */
  said: boolean;
  /** Whether a game is being played: the room takes no word then. */
  playing: boolean;
  /** Whether the player is the host, whose word the room does not take. */
  host: boolean;
  /** Whether a press of theirs is on its way to the room and not answered. */
  pending: boolean;
}

/**
 * Whether a page says its player's word to the room again: the room does
 * not count what the page remembers (the connection that said it is gone,
 * with all the room kept of it), the room would take it now, and the page
 * has not said it on this connection already. Once a connection, so that a
 * word the room will not take is not said over and over.
 */
export function sayAgain(standing: WishStanding): boolean {
  if (standing.kept === null || standing.kept === standing.counted) return false;
  return !standing.said && !standing.playing && !standing.host && !standing.pending;
}
