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
 * with the connection, and the page says it again on the next (`sayAgain`).
 * Once the host has changed the game the question is answered, and
 * everyone's word is taken back.
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

/**
 * The word a page remembers for its player after the room has spoken,
 * where the room is the same and its game has not changed. `kept` is what
 * the page remembered, `counted` what the room counts for the player now
 * (`null` for none). With a press on its way (`pending`) the page keeps
 * what was pressed. Else what the room counts is the word (it may have been
 * said in another tab). Where the room counts none: on a connection the
 * room has not been told on yet (`lost`) the page still remembers it, to
 * say it again; on one where it was told, the word was taken back
 * elsewhere, and the page forgets it.
 */
export function keptAfter(kept: GameId | null, counted: GameId | null, lost: boolean, pending: boolean): GameId | null {
  if (pending) return kept;
  if (counted !== null) return counted;
  return lost ? kept : null;
}

/**
 * Whether a page says its player's word to the room again: there is one,
 * the connection now open has not been told it (`lost`: the room keeps a
 * word with the connections that said it, and a new connection has said
 * nothing), the player is not the host (whose word the room does not
 * take), and no press is on its way. Also where the room still counts the
 * word from an older connection of the player: that one will go, and the
 * word with it.
 */
export function sayAgain(kept: GameId | null, lost: boolean, host: boolean, pending: boolean): boolean {
  return kept !== null && lost && !host && !pending;
}
