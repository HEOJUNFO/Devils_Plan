/**
 * Russian Roulette: a seat's own move, worked out from what that seat is
 * shown, before the room has answered it.
 *
 * A page draws its player's move at the press and the room's answer follows.
 * Only what the seat's own view settles is drawn ahead; the rest waits:
 *
 * - A turn of the muzzle, the swap a seat has earned, and the pass of a seat
 *   with no credits are settled in full by the view, and are drawn whole.
 * - A look costs what it costs, and what is in the chambers is the room's to
 *   say. Credits put towards the swap leave the seat, and whether they took
 *   the table to the mark nobody at it can tell. Of these only the credits
 *   are drawn.
 * - A move that takes the seat's last credit may end the game, and how many
 *   seats are out is known to the room alone: no such move is drawn whole.
 *
 * Pure functions over plain JSON, like the rules they follow (`rules.ts`).
 */
import type { Action, KnowledgeSource, RulesConfig, SeatEvent, SeatPublic, SeatView } from "./rules";

/** A seat's view with its own move on it. */
export interface Foreseen {
  /** The view as it will be, as far as the seat can tell. */
  view: SeatView;
  /**
   * Whether the whole move is on it, its event last in the history and the
   * turn passed on; or only the credits it costs, the turn still the seat's.
   */
  whole: boolean;
}

/** The view with the turn passed to the next seat, as `advance` of the rules does it. */
function passedOn(view: SeatView): Pick<SeatView, "round" | "turn" | "current"> {
  const n = view.seats.length;
  let round = view.round;
  let turn = view.turn + 1;
  if (turn >= n) {
    turn = 0;
    round++;
  }
  return { round, turn, current: (round + turn) % n };
}

/** The seats, with the table's count of `seat`'s credits taken down: by `fewest` at the low end, by `most` at the high. */
function counted(view: SeatView, seat: number, fewest: number, most: number): SeatPublic[] {
  return view.seats.map((info, i) =>
    i === seat
      ? { ...info, minCredits: Math.max(0, info.minCredits - fewest), maxCredits: Math.max(0, info.maxCredits - most) }
      : info,
  );
}

/**
 * `view` as it will be once the room has taken `action` from the seat the
 * view is of, as far as that seat can tell: see {@link Foreseen}. Returns
 * `null` when nothing of the move can be drawn ahead: it is not that seat's
 * move to make, or the room would refuse it, or it is a swap by a seat with
 * no credits left, which costs nothing and may end the game.
 */
export function foresee(view: SeatView, action: Action, config: RulesConfig): Foreseen | null {
  const me = view.seat;
  if (me === null || view.credits === null || view.phase === "ended" || view.current !== me) return null;
  const n = view.seats.length;

  if (view.phase === "swap") {
    if (action.type !== "swap" || action.pair < 0 || action.pair >= n) return null;
    if (view.credits <= 0) return null;
    const a = action.pair;
    const b = (a + 1) % n;
    // What the seat had seen of the two goes with them, and is now the seat's alone to know.
    const chambers = [...view.chambers];
    const source = [...view.source];
    const doubt = [...view.doubt];
    [chambers[a], chambers[b]] = [chambers[b], chambers[a]];
    [doubt[a], doubt[b]] = [doubt[b], doubt[a]];
    const alone = (how: KnowledgeSource): KnowledgeSource => (how === "public" ? "private" : how);
    [source[a], source[b]] = [alone(source[b]), alone(source[a])];
    const event: SeatEvent = { type: "swap", seat: me, pair: a, out: false, ended: false };
    // the table is told of one more hidden action of the seat, and counts its credits by that
    const dearest = Math.max(config.costPrivate, config.tamperMaxPerTurn);
    return {
      whole: true,
      view: {
        ...view,
        ...passedOn(view),
        phase: "turn",
        chambers,
        source,
        doubt,
        seats: counted(view, me, dearest, 1),
        history: [...view.history, event],
      },
    };
  }

  if (action.type === "swap") return null;
  if (action.type === "pass") {
    // only a seat with nothing left passes; it was out before, so the game goes on
    if (view.credits > 0) return null;
    const event: SeatEvent = { type: "pass", seat: me, out: false, ended: false };
    return { whole: true, view: { ...view, ...passedOn(view), history: [...view.history, event] } };
  }
  if (view.credits <= 0) return null;

  let cost: number;
  if (action.type === "rotate") {
    cost = action.steps === 2 ? config.costRotate2 : config.costRotate1;
  } else if (action.type === "tamper") {
    if (action.amount < 1 || action.amount > config.tamperMaxPerTurn) return null;
    cost = action.amount;
  } else {
    if (action.pair < 0 || action.pair >= n) return null;
    cost = action.type === "public" ? config.costPublic : config.costPrivate;
  }
  const credits = view.credits - cost;
  if (credits < 0) return null;

  if (action.type === "rotate" && credits > 0) {
    const event: SeatEvent = { type: "rotate", seat: me, steps: action.steps, out: false, ended: false };
    return {
      whole: true,
      view: {
        ...view,
        ...passedOn(view),
        credits,
        // the cylinder turns with the muzzle: every chamber keeps its letter
        muzzle: (view.muzzle + action.steps) % n,
        // credits the whole table saw spent
        seats: counted(view, me, cost, cost),
        history: [...view.history, event],
      },
    };
  }
  return { whole: false, view: { ...view, credits } };
}
