import {
  applyAction,
  createGame,
  type Action,
  type ApplyResult,
  type BotConfig,
  type GameState,
  type Occupant,
  type Round,
  type RulesConfig,
  type Sight,
  type TableSizes,
} from "../../../src/shared/game";
import botJson from "../../../src/shared/game/bot-config.json";
import rulesJson from "../../../src/shared/game/rules-config.json";
import sizesJson from "../../../src/shared/game/table-sizes.json";

/** The rules as shipped. */
export const RULES: RulesConfig = rulesJson;

/** The bot values as shipped. */
export const BOTS: BotConfig = botJson;

/** The table sizes as shipped. */
export const SIZES: TableSizes = sizesJson;

/** The seed the fixtures deal from. */
export const SEED = 28;

/** The shipped rules with some values changed. */
export function rules(overrides: Partial<RulesConfig> = {}): RulesConfig {
  return { ...RULES, ...overrides };
}

/** Occupants 0..count-1; the ids in `botIds` are bots. */
export function occupants(count: number, botIds: number[] = []): Occupant[] {
  return Array.from({ length: count }, (_, id) => ({ id, bot: botIds.includes(id) }));
}

/** A fresh game dealt from `seed`. */
export function freshGame(config: RulesConfig = RULES, seed: number = SEED, botIds: number[] = []): GameState {
  const result = createGame({ occupants: occupants(config.seats, botIds), seed }, config);
  if (!result.ok) throw new Error(`fixture game refused: ${result.reason}`);
  return result.state;
}

/** A fresh game with live rounds in exactly the chambers named. */
export function gameWithRounds(live: number[], config: RulesConfig = RULES): GameState {
  const state = freshGame(config);
  const chambers: Round[] = state.chambers.map((_, j) => (live.includes(j) ? 1 : 0));
  return { ...state, chambers };
}

/** The state after a move that must be accepted. */
export function accepted(result: ApplyResult): GameState {
  if (!result.ok) throw new Error(`fixture move refused: ${result.reason}`);
  return result.state;
}

/** Plays `[seat, move]` pairs in order; each must be accepted. */
export function play(state: GameState, moves: [number, Action][], config: RulesConfig = RULES): GameState {
  let current = state;
  for (const [seat, move] of moves) current = accepted(applyAction(current, seat, move, config));
  return current;
}

/** The same game with one seat's credits set. */
export function withCredits(state: GameState, seat: number, credits: number): GameState {
  return { ...state, seats: state.seats.map((p, i) => (i === seat ? { ...p, credits } : p)) };
}

/** The same game with this many credits gathered towards the swap, by whoever put them in. */
export function withPot(state: GameState, pot: number): GameState {
  return { ...state, pot };
}

/** The same game with these chambers shown to the whole table as they are, just now. */
export function withPublic(state: GameState, chambers: number[]): GameState {
  const sight = (j: number, after: number): Sight => ({ round: state.chambers[j], alone: false, after });
  return {
    ...state,
    shown: state.shown.map((known, j) => (chambers.includes(j) ? sight(j, state.hiddenActs) : known)),
    seen: state.seen.map((row, seat) =>
      row.map((known, j) => (chambers.includes(j) ? sight(j, state.hiddenActs - state.seats[seat].hiddenActs) : known)),
    ),
  };
}

/** The same game with these chambers seen by one seat alone, as they are, just now. */
export function withPrivate(state: GameState, seat: number, chambers: number[]): GameState {
  const after = state.hiddenActs - state.seats[seat].hiddenActs;
  return {
    ...state,
    seen: state.seen.map((row, i) =>
      i === seat ? row.map((known, j) => (chambers.includes(j) ? { round: state.chambers[j], alone: true, after } : known)) : row,
    ),
  };
}

/** The same game with these seats out of credits. */
export function withOut(state: GameState, seats: number[]): GameState {
  return {
    ...state,
    seats: state.seats.map((p, i) => (seats.includes(i) ? { ...p, credits: 0, out: true } : p)),
    outCount: seats.length,
  };
}

/** Freezes a value all the way down, so any write to it throws. */
export function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value)) deepFreeze(inner);
  }
  return value;
}

/** A copy made the way a room stores a game: through JSON. */
export function throughJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
