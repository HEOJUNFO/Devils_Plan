/**
 * Russian Roulette's game module: the rules, the per-seat view and the bots.
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
  turnNumber,
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
  Sight,
  TableSizes,
  VolleyResult,
} from "./rules";
export { foresee } from "./ahead";
export type { Foreseen } from "./ahead";
export { botTurn, chooseAction } from "./bots";
export type { BotConfig } from "./bots";
export { chanceOf, nextRandom, randomInt, randomSource, seedFrom } from "./rng";
export type { RandomSource, RandomStep } from "./rng";
