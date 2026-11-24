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
import type { BingoView } from "./games/auction-bingo/rules";
import type { RectView } from "./games/count-rectangles/rules";
import type { GrassView } from "./games/lay-the-grass/rules";
import type { EqView } from "./games/equation-traffic-light/rules";
import type { GemView } from "./games/gem-black-market/rules";
import type { GradView } from "./games/gradation/rules";
import type { PiggyView } from "./games/piggy-bank/rules";
import type { UnderView } from "./games/under-thirteen/rules";
import type { WallView } from "./games/wall-go-2/rules";

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
 * 네모 세기: the third either-or choice is up, it is this player's to make
 * (a losing team's is its leader's alone) and they have not made theirs.
 * Past the time the room chooses for them. The rest of the game is
 * a race to the buzzer, which waits on no one; whoever pressed it is looking.
 */
export function rectWaits(view: Pick<RectView, "you" | "choosing">): boolean {
  return view.you !== null && view.choosing !== null && view.choosing.yours && view.choosing.mine === null;
}

/**
 * 돼지 저금통: it is this player's turn to put coins in and pass a bank, they
 * are asked how many coins the bank they were passed holds, or they are
 * naming every bank in a challenge. Past the time the room puts in for them,
 * their answer is none, or the challenge fails. A suspicion is a race to
 * the buzzer, which waits on no one.
 */
export function piggyWaits(view: Pick<PiggyView, "you" | "phase" | "turn" | "question" | "challenge">): boolean {
  if (view.you === null) return false;
  if (view.phase === "put") return view.turn === view.you;
  if (view.phase === "answer") return view.question?.player === view.you;
  return view.phase === "challenge" && view.challenge?.player === view.you;
}

/**
 * 보석 암시장: this player has a bid to make for who is first, or it is their
 * turn to exchange their card. Past the time they bid nothing, or the room
 * exchanges for them. Looking at a card or at a round's count waits on no
 * one: the game goes on when the time is up.
 */
export function gemWaits(view: Pick<GemView, "you" | "phase" | "turn" | "auction">): boolean {
  if (view.you === null) return false;
  if (view.phase === "auction") return view.auction !== null && view.auction.bidders.includes(view.you) && view.auction.mine === null;
  return view.phase === "exchange" && view.turn === view.you;
}

/**
 * 경매 빙고: a ticket is to be put in a box and this player's is not, or a
 * bid is to be made and theirs is not. Past the time the room chooses a
 * shape, or bids the smallest coin, for them. Someone with no coin and no
 * piece left is out of the rounds, and is waited on for nothing.
 */
export function bingoWaits(view: Pick<BingoView, "you" | "phase" | "out" | "choice" | "bid">): boolean {
  if (view.you === null || view.out.includes(view.you)) return false;
  if (view.phase === "choose") return view.choice === null;
  return view.phase === "bid" && view.bid === null;
}

/**
 * 벽바둑Ⅱ: the turn is this player's, to place a counter, to move one, or to
 * place a wall. Past the room's time for a turn the room places the counter
 * or the wall for them.
 */
export function wallWaits(view: Pick<WallView, "you" | "turn">): boolean {
  return view.you !== null && view.turn === view.you;
}

/**
 * 그라데이션: this player is one of the match's two, and their cubes are not
 * distributed yet, or the cup waited for is theirs. Past the time the room
 * distributes cubes, or submits a cup, for them. Whoever waits for the
 * match's winner is waited on for nothing.
 */
export function gradWaits(view: Pick<GradView, "you" | "phase" | "duel" | "ready" | "turn">): boolean {
  if (view.you === null) return false;
  if (view.phase === "arrange") return view.duel.includes(view.you) && !view.ready.includes(view.you);
  return view.phase === "submit" && view.turn === view.you;
}

/**
 * 수식 신호등: this player is one of the two, and has not yet created an
 * equation, or not yet answered in the turn being played. Past the time the
 * room sets an equation for them, or shows the turn's clues without their
 * answer.
 */
export function eqWaits(view: Pick<EqView, "you" | "phase" | "ready">): boolean {
  if (view.you === null) return false;
  return (view.phase === "create" || view.phase === "guess") && !view.ready.includes(view.you);
}
