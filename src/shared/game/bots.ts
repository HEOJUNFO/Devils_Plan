/**
 * A basic bot for Empty Chamber.
 *
 * It exists for tests and for filling seats while developing. Players are
 * only ever offered games against other people, so this is not a feature and
 * is kept simple on purpose: it makes moves the rules accept, looks at the
 * chamber facing it, turns a round it knows of away, and otherwise waits.
 *
 * A bot decides from the view of its own seat and nothing else, so it knows
 * exactly what a person in that seat could know.
 */
import { randomInt, randomSource } from "./rng";
import { applyAction, viewFor } from "./rules";
import type { Action, ApplyResult, GameState, RulesConfig, SeatView } from "./rules";

/** Tunable bot values. Loaded from `bot-config.json`. */
export interface BotConfig {
  /** Chance the bot looks at its own chamber privately rather than publicly. */
  privateLookChance: number;
  /** Chance a bot with nothing to do looks at a pair instead of depositing a credit. */
  idleLookChance: number;
}

function mod(value: number, n: number): number {
  return ((value % n) + n) % n;
}

/** Which two chambers to swap: a round it faces goes to a neighbour, otherwise a pair away from it. */
function chooseSwap(view: SeatView, seat: number, random: () => number): number {
  const n = view.seats.length;
  const mine = mod(seat - view.muzzle, n);
  if (view.chambers[mine] === 1) {
    // the pair (mine, mine + 1) hands it to the next seat; (mine - 1, mine) to the one before
    return view.chambers[mod(mine + 1, n)] !== 1 ? mine : mod(mine - 1, n);
  }
  const away: number[] = [];
  for (let a = 0; a < n; a++) {
    if (a !== mine && mod(a + 1, n) !== mine) away.push(a);
  }
  return away.length > 0 ? away[randomInt(random, away.length)] : mod(mine + 1, n);
}

function chooseMove(
  view: SeatView,
  seat: number,
  credits: number,
  config: RulesConfig,
  bot: BotConfig,
  random: () => number,
): Action {
  const n = view.seats.length;
  const mine = mod(seat - view.muzzle, n);
  const wait: Action = { type: "tamper", amount: 1 };
  const known = view.chambers[mine];
  if (known === 1) {
    // a turn of one brings me the chamber before mine, a turn of two the one before that
    if (credits >= config.costRotate1 && view.chambers[mod(mine - 1, n)] !== 1) return { type: "rotate", steps: 1 };
    if (credits >= config.costRotate2 && view.chambers[mod(mine - 2, n)] !== 1) return { type: "rotate", steps: 2 };
    return wait;
  }
  if (known === null) {
    const pair = mod(mine - 1, n);
    if (credits >= config.costPrivate && random() < bot.privateLookChance) return { type: "private", pair };
    return credits >= config.costPublic ? { type: "public", pair } : wait;
  }
  if (credits >= config.costPublic && random() < bot.idleLookChance) return { type: "public", pair: randomInt(random, n) };
  return wait;
}

/**
 * The move a bot makes from `view`, the view of its own seat. Returns `null`
 * when it is not that seat's move (or the view is a spectator's). The move is
 * always one {@link applyAction} accepts for that seat.
 */
export function chooseAction(
  view: SeatView,
  config: RulesConfig,
  bot: BotConfig,
  random: () => number,
): Action | null {
  const seat = view.seat;
  if (seat === null || view.phase === "ended") return null;
  if (view.phase === "swap") {
    return view.swapSeat === seat ? { type: "swap", pair: chooseSwap(view, seat, random) } : null;
  }
  if (view.current !== seat || view.credits === null || view.credits <= 0) return null;
  return chooseMove(view, seat, view.credits, config, bot, random);
}

/**
 * Plays the bot's move for the seat now to move: builds that seat's view,
 * chooses with the game's own random generator, applies the move, and keeps
 * the generator's place in the new state. Refuses with `not-your-turn` when
 * the seat to move is not a bot.
 */
export function botTurn(state: GameState, config: RulesConfig, bot: BotConfig): ApplyResult {
  if (state.phase === "ended") return { ok: false, reason: "game-over" };
  const seat = state.phase === "swap" && state.swapSeat !== null ? state.swapSeat : state.current;
  if (!state.seats[seat].bot) return { ok: false, reason: "not-your-turn" };
  const random = randomSource(state.rng);
  const action = chooseAction(viewFor(state, seat, config), config, bot, random.next);
  if (action === null) return { ok: false, reason: "not-your-turn" };
  return applyAction({ ...state, rng: random.state }, seat, action, config);
}
