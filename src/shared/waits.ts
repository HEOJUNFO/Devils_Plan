/**
 * Whether a game waits on the player who is looking at it: a move that is
 * theirs to make, with a clock on it, after which the room makes it for them.
 * The page calls a player back to a tab behind others when this comes to be
 * so (`calling.ts`, the call for a turn), and a phone held in the hand is
 * made to buzz.
 *
 * Read off a player's own view of the game, as the room last sent it. One
 * function for each game that has such a moment and is not played at a
 * table of 러시안 룰렛, whose screen has its own (`src/client/game/table.ts`).
 * 큐브 세기, 기억 포커 and 미스터리 거래소 are played by everyone at once from
 * beginning to end and have none.
 */
import type { RectView } from "./games/count-rectangles/rules";
import type { GrassView } from "./games/lay-the-grass/rules";
import type { UnderView } from "./games/under-thirteen/rules";

/**
 * 잔디 깔기: the turn is this player's (to pick a tile, to mark manholes or
 * trees, to lay the tile), or an either-or choice is up that they have not
 * made. Past the time the room moves or chooses for them.
 */
export function grassWaits(view: Pick<GrassView, "you" | "phase" | "turn" | "choosing">): boolean {
  if (view.you === null || view.phase === "ended") return false;
  if (view.phase === "choose") return view.choosing !== null && view.choosing.mine === null;
  return view.turn === view.you;
}

/**
 * 무거운 13: the rock to be placed is this player's and they are asked about
 * it (to place or pass, or which stand); or a card and a chip are to be put
 * in and theirs are not. Past the time the room places the rock, or puts a
 * card and a chip in for them. A rock nobody is asked about is the room's to
 * place, and waits on no one.
 */
export function underWaits(view: Pick<UnderView, "you" | "phase" | "turn" | "asked" | "submitted">): boolean {
  if (view.you === null || view.phase === "ended") return false;
  if (view.phase === "submit") return !view.submitted.includes(view.you);
  return view.turn === view.you && view.asked !== null && view.asked !== "nothing";
}

/**
 * 네모 세기: the third either-or choice is up and this player has not made
 * theirs. Past the time the room chooses for them. The rest of the game is
 * a race to the buzzer, which waits on no one; whoever pressed it is looking.
 */
export function rectWaits(view: Pick<RectView, "you" | "choosing">): boolean {
  return view.you !== null && view.choosing !== null && view.choosing.card !== null && view.choosing.mine === null;
}
