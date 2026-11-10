/**
 * Empty Chamber's game module: the rules, the per-seat view and the bots.
 *
 * Everything exported here is a pure function over plain JSON. A room hosts a
 * game by keeping a {@link GameState}, calling {@link applyAction} with what
 * players send, and sending each player {@link viewFor} of their own seat.
 */
export {
  applyAction,
  applyTimeout,
  chamberFacing,
  createGame,
  eventFor,
  isValidConfig,
  legalMoves,
  parseAction,
  rulesForPlayers,
  seatFacing,
  turnAllowance,
  viewFor,
  volley,
} from "./rules";
export type {
  Action,
  ApplyResult,
  CreateResult,
  GameEvent,
  GameState,
  Known,
  KnowledgeSource,
  LegalMoves,
  Occupant,
  Phase,
  Refusal,
  Round,
  RulesConfig,
  SeatEvent,
  SeatPublic,
  SeatState,
  SeatView,
  Shot,
  TableSizes,
  VolleyResult,
} from "./rules";
export { botTurn, chooseAction } from "./bots";
export type { BotConfig } from "./bots";
export { nextRandom, randomInt, randomSource, seedFrom } from "./rng";
export type { RandomSource, RandomStep } from "./rng";
