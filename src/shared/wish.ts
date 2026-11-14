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

/** What a page has of its player's word when the room speaks. */
export interface WishPage {
  /** The word it remembers; `null` for none. */
  readonly kept: GameId | null;
  /** Whether the connection now open has yet to be told it. */
  readonly lost: boolean;
  /** Whether a press is on its way to the room. */
  readonly pending: boolean;
  /**
   * What the page had on show: `"nothing"` (a page just opened), `"this"`
   * (the same room, for the same game), or `"other"` (another room, or the
   * room's game has changed, which answers the question).
   */
  readonly had: "nothing" | "this" | "other";
}

/** What the room says that bears on a player's word. */
export interface WishRoom {
  /** The word it counts for the player; `null` for none. */
  readonly counted: GameId | null;
  /** Whether the player is the host as the room now stands. */
  readonly host: boolean;
  /** Whether a game has a place for everyone in the room. */
  readonly holds: (game: GameId) => boolean;
}

/**
 * What a page does about its player's word when the room has spoken: the
 * word it remembers from now (`kept`), whether it says it to the room
 * (`say`), and whether the connection has still to be told (`lost`).
 *
 * A page just opened takes up what the room counts for its player (asked in
 * another tab of theirs) and says it on its own connection, so that the
 * word does not go with the other tab. A word for a game that has no place
 * for someone who has come in since is forgotten rather than said and
 * refused. A player who is the host is not asked for a word and the room
 * counts none for them, but a player may be the host only until the host
 * is back (the others went, or this page came back before them): the page
 * keeps the word meanwhile, and a connection that has still to be told is
 * told then.
 */
export function wishHeard(page: WishPage, room: WishRoom): { kept: GameId | null; say: boolean; lost: boolean } {
  // (of a host's word the room says nothing: a page whose player is the host keeps what it remembered)
  const same = room.host ? page.kept : keptAfter(page.kept, room.counted, page.lost, page.pending);
  let kept = page.had === "other" ? null : page.had === "nothing" ? room.counted : same;
  if (kept !== null && page.lost && !room.holds(kept)) kept = null;
  return { kept, say: sayAgain(kept, page.lost, room.host, page.pending), lost: page.lost && room.host && kept !== null };
}
