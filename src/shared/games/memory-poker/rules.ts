/**
 * The rules of 기억 포커 (Memory Poker): a board of cards is shown, turned
 * over, and each player picks two of them from memory to make the best hand
 * of five with the shared cards. Pure functions over plain data: nothing
 * here reads the clock or stores anything.
 *
 * Design: design/games/memory-poker.md. The document lists what happened
 * round by round (a board of sixteen cards in cells A to P, three shared
 * cards, the two cells each of two players chose, the hand each made) and
 * has no rule text; the rules are the show's own, as its dealer gives them:
 * sixteen cards of fifty-two shown for twenty seconds, the three shared
 * cards after that, sixty seconds for both players to mark two cells, the
 * higher hand of five wins, hands ranked as in poker with the remaining
 * cards deciding between equal ones and suits not compared.
 *
 * What the show does not give a room is marked (gap). The show plays the
 * game one against one, as a run of matches for the two lowest of its main
 * match, and deals again when two hands are equal. A room has no such
 * ranking: here everyone plays every round, in pairs, for a set number of
 * rounds, and two equal hands are a tie.
 */
import { randomInt, randomSource, seedFrom } from "../../game/rng";
import { DECK_SIZE, HAND_SIZE, compareHands, fullDeck, handOf, type Card, type Hand } from "./cards";

/** The numbers of the game. Loaded from `config.json`. */
export interface PokerConfig {
  /** (gap) How many rounds a game is. The show has no set number: its matches go on while a challenger keeps winning. */
  rounds: number;
  /** The board: `rows` rows of `cols` cards (document: four by four). */
  rows: number;
  cols: number;
  /** How many cards are shared (document: three). */
  shared: number;
  /** How many cards each player chooses off the board (document: two). With the shared ones, a hand of five. */
  picks: number;
  /** Seconds the board lies face up to be learned (the show: twenty). */
  memoriseSeconds: number;
  /** Seconds players have to choose once it is turned over (the show: sixty). */
  chooseSeconds: number;
  /** (gap) Seconds a round's result is shown before the next round. */
  revealSeconds: number;
  /** Whether the shared cards lie open while the board is being learned. In the show they do not: they come once it is turned over. */
  sharedFromStart: boolean;
}

const isWhole = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);

/** Whether the numbers of `config` can make a game. */
export function isValidConfig(config: PokerConfig): boolean {
  const whole = [config.rounds, config.rows, config.cols, config.shared, config.picks, config.memoriseSeconds, config.chooseSeconds, config.revealSeconds].every(
    isWhole,
  );
  return (
    whole &&
    typeof config.sharedFromStart === "boolean" &&
    config.rounds >= 1 &&
    config.rows >= 1 &&
    config.cols >= 1 &&
    config.picks >= 1 &&
    config.shared >= 0 &&
    config.picks + config.shared === HAND_SIZE &&
    config.rows * config.cols >= config.picks &&
    config.rows * config.cols + config.shared <= DECK_SIZE &&
    config.memoriseSeconds >= 1 &&
    config.chooseSeconds >= 1 &&
    config.revealSeconds >= 0
  );
}

/**
 * Where a game stands: the board lies open to be learned, it is turned over
 * and players choose, the round is shown, or the game is over.
 */
export type PokerPhase = "memorise" | "choose" | "reveal" | "ended";

/** How a game ended: its rounds were played, too few were left to play it, or nobody was left to go on. */
export type PokerEnd = "rounds" | "left" | "abandoned";

/** What a player has chosen in the round being played. */
export interface Choice {
  player: number;
  /** The cells chosen so far: numbers of cells, row by row from the top left (the document's A is 0). */
  cells: number[];
  /** Whether the player has said the choice is final. */
  locked: boolean;
}

/** A player's part in a round, once it is shown. */
export interface Shown {
  player: number;
  cells: number[];
  /** (gap) How many of those cells the room chose for them, because they had not chosen in time. */
  forced: number;
  hand: Hand;
}

/** How the players set against each other in a round fared. */
export interface Outcome {
  /** Two players, or three where the number of players is odd. */
  players: number[];
  /** Those whose hand none of the others beat: one, or more when the best hands are equal. */
  best: number[];
  /** Who won: the one with the best hand, or `null` when the best hands are equal. */
  winner: number | null;
}

/** Something that happened, as everyone is told it. */
export type PokerEvent =
  | { type: "dealt"; round: number }
  | { type: "turned"; round: number }
  | { type: "locked"; round: number; player: number }
  | { type: "shown"; round: number; hands: Shown[]; outcomes: Outcome[] }
  | { type: "ended"; reason: PokerEnd };

/** What a player has to show for the rounds played. */
export interface Tally {
  player: number;
  wins: number;
  ties: number;
  losses: number;
}

/** One game, as the room stores it. Holds the board while it is turned over: send only {@link viewFor} of it. */
export interface PokerState {
  version: 1;
  /** The players, by the number each is known by. */
  players: number[];
  /** (gap) The order the pairings are worked out from: the players, shuffled at the start. */
  order: number[];
  phase: PokerPhase;
  /** The round being played, from 1. */
  round: number;
  /** The board's cards, row by row. */
  board: Card[];
  shared: Card[];
  /** (gap) Who is set against whom this round: see {@link groupsFor}. */
  groups: number[][];
  choices: Choice[];
  /** When the phase the game is in ends, in ms since the epoch. */
  until: number;
  /** The round as shown; `null` until it is. */
  shown: { hands: Shown[]; outcomes: Outcome[] } | null;
  tallies: Tally[];
  /** The state of the game's own random sequence. */
  rng: number;
  history: PokerEvent[];
}

/** What a player can ask: to choose cells (taking the place of those chosen before), or to make the choice final. */
export type PokerAction = { type: "pick"; cells: number[] } | { type: "lock" };

/** Why something asked was not done. */
export type PokerRefusal =
  /** The game is over. */
  | "game-over"
  /** The one asking is not a player of this game. */
  | "not-playing"
  /** What was sent is nothing the game knows, or names a cell the board does not have. */
  | "bad-action"
  /** The board is not turned over: there is nothing to choose yet, or the round is already shown. */
  | "not-choosing"
  /** The player's choice is final. */
  | "locked"
  /** The player has not chosen as many cells as a choice is. */
  | "not-chosen";

export type PokerResult = { ok: true; state: PokerState } | { ok: false; reason: PokerRefusal };

/** Why a game was not made. */
export type PokerStartRefusal = "bad-config" | "too-few" | "bad-players";

/** Where a player stands after the rounds played. */
export interface Standing extends Tally {
  /** 1 for the best; players with as many wins and losses share a place. */
  place: number;
}

/** What one player, or someone watching, is sent of a game. */
export interface PokerView {
  phase: PokerPhase;
  round: number;
  rounds: number;
  /** The number of the player this is for; `null` for someone watching. */
  you: number | null;
  /** The board's cards while it lies face up (being learned, or shown at a round's end); `null` while it is turned over. */
  board: Card[] | null;
  /** The shared cards; `null` while they are not out yet. */
  shared: Card[] | null;
  groups: number[][];
  /** The cells this player has chosen this round, and whether that is final; `null` for someone watching. */
  mine: { cells: number[]; locked: boolean } | null;
  /** Who has made their choice final this round. */
  locked: number[];
  shown: { hands: Shown[]; outcomes: Outcome[] } | null;
  standings: Standing[];
  history: PokerEvent[];
}

const copyShown = (shown: Shown): Shown => ({ ...shown, cells: [...shown.cells], hand: { kind: shown.hand.kind, ranks: [...shown.hand.ranks] } });
const copyOutcome = (outcome: Outcome): Outcome => ({ players: [...outcome.players], best: [...outcome.best], winner: outcome.winner });

function clone(state: PokerState): PokerState {
  return {
    ...state,
    board: [...state.board],
    shared: [...state.shared],
    groups: state.groups.map((group) => [...group]),
    choices: state.choices.map((choice) => ({ ...choice, cells: [...choice.cells] })),
    shown: state.shown === null ? null : { hands: state.shown.hands.map(copyShown), outcomes: state.shown.outcomes.map(copyOutcome) },
    tallies: state.tallies.map((tally) => ({ ...tally })),
    history: [...state.history],
  };
}

/** A stand-in for the opponent an odd player out would have had. */
const NOBODY = -1;

/**
 * (gap) Who is set against whom in `round` (from 1), for players in `order`.
 * Everyone plays every round. The players are paired off as a league pairs
 * its sides: one stays, the others move round a place each round, so that
 * nobody meets the same opponent again before having met them all. With an
 * odd number, the one left over joins a pair, and those three play each
 * other. Each group, and the list of them, is in the order of the players'
 * numbers.
 */
export function groupsFor(order: readonly number[], round: number): number[][] {
  if (order.length < 2) return order.length === 1 ? [[order[0]]] : [];
  const ring = order.length % 2 === 0 ? [...order] : [...order, NOBODY];
  const rest = ring.slice(1);
  const turns = (round - 1) % rest.length;
  const seats = [ring[0], ...rest.slice(turns), ...rest.slice(0, turns)];
  const pairs: number[][] = [];
  for (let i = 0; i < seats.length / 2; i++) pairs.push([seats[i], seats[seats.length - 1 - i]]);
  const alone = pairs.find((pair) => pair.includes(NOBODY));
  const groups = pairs.filter((pair) => pair !== alone);
  if (alone !== undefined) groups[0] = [...groups[0], ...alone.filter((player) => player !== NOBODY)];
  return groups.map((group) => [...group].sort((a, b) => a - b)).sort((a, b) => a[0] - b[0]);
}

/** Deals a round into `state` (which is changed): a fresh deck shuffled, the board and the shared cards off its top. */
function deal(state: PokerState, now: number, config: PokerConfig): void {
  const random = randomSource(state.rng);
  const deck = fullDeck();
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomInt(random.next, i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  const cells = config.rows * config.cols;
  state.rng = random.state;
  state.board = deck.slice(0, cells);
  state.shared = deck.slice(cells, cells + config.shared);
  state.groups = groupsFor(state.order, state.round);
  state.choices = state.players.map((player) => ({ player, cells: [], locked: false }));
  state.shown = null;
  state.phase = "memorise";
  state.until = now + config.memoriseSeconds * 1000;
  state.history.push({ type: "dealt", round: state.round });
}

/** Starts a game for `players`, its cards and pairings drawn from `seed`. */
export function createGame(
  start: { players: readonly number[]; seed: number; now: number },
  config: PokerConfig,
): { ok: true; state: PokerState } | { ok: false; reason: PokerStartRefusal } {
  if (!isValidConfig(config)) return { ok: false, reason: "bad-config" };
  if (!Array.isArray(start.players) || !start.players.every((player) => isWhole(player) && player >= 0)) return { ok: false, reason: "bad-players" };
  if (new Set(start.players).size !== start.players.length) return { ok: false, reason: "bad-players" };
  // a hand is played against someone: one player alone has no game
  if (start.players.length < 2) return { ok: false, reason: "too-few" };
  const players = [...start.players].sort((a, b) => a - b);
  const random = randomSource(seedFrom(start.seed));
  const order = [...players];
  for (let i = order.length - 1; i > 0; i--) {
    const j = randomInt(random.next, i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  const state: PokerState = {
    version: 1,
    players,
    order,
    phase: "memorise",
    round: 1,
    board: [],
    shared: [],
    groups: [],
    choices: [],
    until: start.now,
    shown: null,
    tallies: players.map((player) => ({ player, wins: 0, ties: 0, losses: 0 })),
    rng: random.state,
    history: [],
  };
  deal(state, start.now, config);
  return { ok: true, state };
}

/** Reads what a player asked as it came off the wire; `null` for anything else. */
export function parseAction(raw: unknown): PokerAction | null {
  if (typeof raw !== "object" || raw === null) return null;
  const data = raw as Record<string, unknown>;
  if (data.type === "lock") return { type: "lock" };
  if (data.type !== "pick" || !Array.isArray(data.cells)) return null;
  if (!data.cells.every((cell) => isWhole(cell) && cell >= 0)) return null;
  if (new Set(data.cells).size !== data.cells.length) return null;
  return { type: "pick", cells: [...(data.cells as number[])] };
}

/**
 * Something asked by `player`. To pick puts the cells named in place of
 * those picked before, and may be done again until the choice is made
 * final; a final choice stands. Nothing of it is told to anyone else but
 * that the choice is final. The state given is not changed.
 */
export function applyAction(state: PokerState, player: number, action: PokerAction, config: PokerConfig): PokerResult {
  if (state.phase === "ended") return { ok: false, reason: "game-over" };
  if (!state.players.includes(player)) return { ok: false, reason: "not-playing" };
  const move = parseAction(action);
  if (move === null) return { ok: false, reason: "bad-action" };
  if (state.phase !== "choose") return { ok: false, reason: "not-choosing" };
  const next = clone(state);
  const choice = next.choices.find((each) => each.player === player);
  if (choice === undefined) return { ok: false, reason: "not-playing" };
  if (choice.locked) return { ok: false, reason: "locked" };
  if (move.type === "pick") {
    if (move.cells.length > config.picks || move.cells.some((cell) => cell >= config.rows * config.cols)) return { ok: false, reason: "bad-action" };
    choice.cells = move.cells;
    return { ok: true, state: next };
  }
  if (choice.cells.length !== config.picks) return { ok: false, reason: "not-chosen" };
  choice.locked = true;
  next.history.push({ type: "locked", round: next.round, player });
  return { ok: true, state: next };
}

/** What sets the sequence that chooses for players apart from the one that deals. */
const CHOSEN_FOR_THEM = 0x51f15e3d;

/**
 * Shows the round: every player's cells and hand, and who won of those set
 * against each other. (gap) A player who has not chosen as many cells as a
 * choice is has the rest chosen for them, by chance, among the cells they
 * did not choose. That chance is a sequence of its own: what is chosen for
 * anyone never changes which cards are dealt next.
 */
function show(state: PokerState, now: number, config: PokerConfig): PokerState {
  const next = clone(state);
  const random = randomSource(seedFrom(next.rng ^ CHOSEN_FOR_THEM));
  const cells = config.rows * config.cols;
  const hands: Shown[] = next.players.map((player) => {
    const chosen = [...(next.choices.find((each) => each.player === player)?.cells ?? [])];
    const forced = config.picks - chosen.length;
    while (chosen.length < config.picks) {
      const free = Array.from({ length: cells }, (_, cell) => cell).filter((cell) => !chosen.includes(cell));
      chosen.push(free[randomInt(random.next, free.length)]);
    }
    return { player, cells: chosen, forced, hand: handOf([...chosen.map((cell) => next.board[cell]), ...next.shared]) };
  });
  const handFor = (player: number): Hand => hands.find((each) => each.player === player)!.hand;
  const outcomes: Outcome[] = next.groups.map((group) => {
    const top = group.reduce((best, player) => (compareHands(handFor(player), handFor(best)) > 0 ? player : best));
    const best = group.filter((player) => compareHands(handFor(player), handFor(top)) === 0);
    return { players: [...group], best, winner: best.length === 1 ? best[0] : null };
  });
  for (const outcome of outcomes) {
    for (const player of outcome.players) {
      const tally = next.tallies.find((each) => each.player === player);
      if (tally === undefined) continue;
      if (outcome.winner === player) tally.wins += 1;
      else if (outcome.best.includes(player)) tally.ties += 1;
      else tally.losses += 1;
    }
  }
  next.shown = { hands, outcomes };
  next.phase = "reveal";
  next.until = now + config.revealSeconds * 1000;
  next.history.push({ type: "shown", round: next.round, hands: hands.map(copyShown), outcomes: outcomes.map(copyOutcome) });
  return next;
}

/**
 * Shows the round at once if nobody is left to wait for: every player who
 * is `there` has made their choice final. Someone who has gone is not
 * waited for; their cells are chosen for them. Returns `state` itself when
 * someone is still choosing.
 */
export function showIfChosen(state: PokerState, there: (player: number) => boolean, now: number, config: PokerConfig): PokerState {
  if (state.phase !== "choose") return state;
  const waiting = state.choices.some((choice) => !choice.locked && there(choice.player));
  return waiting ? state : show(state, now, config);
}

/**
 * (gap) Ends the game if fewer than two of its players are `there`: a hand
 * is played against someone. Returns `state` itself otherwise.
 */
export function closeIfLeft(state: PokerState, there: (player: number) => boolean): PokerState {
  if (state.phase === "ended" || state.players.filter(there).length >= 2) return state;
  const next = clone(state);
  next.phase = "ended";
  next.history.push({ type: "ended", reason: "left" });
  return next;
}

/** The moment the game next needs the clock: when the phase it is in ends. `null` once it is over. */
export function deadline(state: PokerState): number | null {
  return state.phase === "ended" ? null : state.until;
}

/**
 * The phase's time may have run out. Then the board is turned over, or the
 * round is shown, or the next round is dealt, or after the last round the
 * game is over. One step at a time: the phase that follows gets its whole
 * time from `now`. Returns `state` itself when nothing is due.
 */
export function applyTimeout(state: PokerState, now: number, config: PokerConfig): PokerState {
  if (state.phase === "ended" || now < state.until) return state;
  if (state.phase === "choose") return show(state, now, config);
  const next = clone(state);
  if (state.phase === "memorise") {
    next.phase = "choose";
    next.until = now + config.chooseSeconds * 1000;
    next.history.push({ type: "turned", round: next.round });
    return next;
  }
  if (state.round >= config.rounds) {
    next.phase = "ended";
    next.history.push({ type: "ended", reason: "rounds" });
    return next;
  }
  next.round += 1;
  deal(next, now, config);
  return next;
}

/** Ends the game where it stands: nobody is left to go on with it. */
export function abandon(state: PokerState): PokerState {
  if (state.phase === "ended") return state;
  const next = clone(state);
  next.phase = "ended";
  next.history.push({ type: "ended", reason: "abandoned" });
  return next;
}

/** Moves the game's clock on by `by` ms: the time it stood still does not count. */
export function shiftClock(state: PokerState, by: number): PokerState {
  if (state.phase === "ended" || by === 0) return state;
  return { ...state, until: state.until + by };
}

/**
 * Where everyone stands: the most wins first, and of those with as many
 * wins the fewest losses first. Players level on both share a place.
 */
export function standingsOf(state: PokerState): Standing[] {
  const better = (a: Tally, b: Tally): boolean => a.wins > b.wins || (a.wins === b.wins && a.losses < b.losses);
  return state.tallies
    .map((tally) => ({ ...tally, place: 1 + state.tallies.filter((other) => better(other, tally)).length }))
    .sort((a, b) => a.place - b.place || a.player - b.player);
}

/**
 * The game as `player` may see it (`null`: someone watching). While the
 * board is turned over its cards are not in it, nor are the cells anyone
 * else has chosen: those come when the round is shown.
 */
export function viewFor(state: PokerState, player: number | null, config: PokerConfig): PokerView {
  const you = player !== null && state.players.includes(player) ? player : null;
  const mine = you === null ? undefined : state.choices.find((choice) => choice.player === you);
  const sharedOut = state.phase !== "memorise" || config.sharedFromStart;
  return {
    phase: state.phase,
    round: state.round,
    rounds: config.rounds,
    you,
    board: state.phase === "choose" ? null : [...state.board],
    shared: sharedOut ? [...state.shared] : null,
    groups: state.groups.map((group) => [...group]),
    mine: mine === undefined ? null : { cells: [...mine.cells], locked: mine.locked },
    locked: state.choices.filter((choice) => choice.locked).map((choice) => choice.player),
    shown: state.shown === null ? null : { hands: state.shown.hands.map(copyShown), outcomes: state.shown.outcomes.map(copyOutcome) },
    standings: standingsOf(state),
    history: [...state.history],
  };
}
