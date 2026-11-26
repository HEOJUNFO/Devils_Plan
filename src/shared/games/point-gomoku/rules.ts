/**
 * The rules of 포인트 오목 (Point Gomoku), the last match of the show's exile
 * zone.
 *
 * Design: design/games/point-gomoku.md. Two players, one with black stones
 * and one with white. A round is selection, betting and stone placement.
 * One of the two is the round's selector, turn about: the selector marks
 * three consecutive intersections of the board, in a straight or a diagonal
 * line. Both then have ten new points, on top of what they carried over,
 * and bet them on the three spots unseen: a whole number on each, at least
 * one. On each spot the player who bet more has their stone placed; with
 * the same bet on a spot, the one who is not the selector. Half the points
 * a player has left, rounded down, carry over to the next round. Bets and
 * points left are never shown to the opponent. Once the three stones are
 * placed, whoever has a line of five stones wins; a line of six or more is
 * not a line of five. If both complete lines at the same time, whoever has
 * more of them wins.
 *
 * Everything here is a pure function of what it is given. A state is plain
 * JSON; it holds both players' points and bets, so only {@link viewFor} of
 * it is ever sent.
 */
import { randomInt, randomSource, seedFrom } from "../../game/rng";

/** The numbers of the game. The brief says which are the show's and which are filled in for a room. */
export interface OmokConfig {
  /** How many lines the board has each way: a stone goes on an intersection of two. */
  size: number;
  /** How many stones in a row, no more and no fewer, win. */
  line: number;
  /** How many consecutive intersections a selector marks. */
  spots: number;
  /** The points each player is given at the start of every round. */
  roundPoints: number;
  /** The fewest points that can be bet on a spot. */
  minBet: number;
  /** Seconds the selector has to mark the spots, and seconds both have to bet. */
  selectSeconds: number;
  betSeconds: number;
  /** After this many rounds running in which the room did everything for both players, the game is given up. Not in the show. */
  idleRounds: number;
}

const isWhole = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);

/** The four ways a line runs, as steps across and down: across, down, and the two diagonals. */
const WAYS: readonly (readonly [number, number])[] = [
  [1, 0],
  [0, 1],
  [1, 1],
  [-1, 1],
];

/** An empty intersection, and the stones of the two players by their place in {@link OmokState.order}. */
export const EMPTY = ".";
export const STONES = "bw";

/** Whether a game can be played with `config`. */
export function isValidConfig(config: OmokConfig): boolean {
  if (!isWhole(config.size) || config.size < 5 || config.size > 19) return false;
  if (!isWhole(config.line) || config.line < 3 || config.line > config.size) return false;
  if (!isWhole(config.spots) || config.spots < 1 || config.spots > config.size) return false;
  if (!isWhole(config.minBet) || config.minBet < 0) return false;
  if (!isWhole(config.roundPoints) || config.roundPoints < config.minBet * config.spots) return false;
  if (!(config.selectSeconds > 0) || !(config.betSeconds > 0)) return false;
  return isWhole(config.idleRounds) && config.idleRounds >= 1;
}

/** Why spots are not ones a selector may mark. */
export type SpotsRefusal =
  /** Not as many different intersections of the board as a selector marks. */
  | "bad-spots"
  /** One of them has a stone on it. */
  | "spot-taken"
  /** They are not next to each other in one straight or diagonal line. */
  | "not-in-line";

/**
 * Whether `spots` (intersections by number: a row's times the board's size,
 * plus the column's) are ones a selector may mark on `board`: `null`, or
 * why not. They may be given in any order.
 */
export function checkSpots(board: string, spots: readonly number[], config: Pick<OmokConfig, "size" | "spots">): SpotsRefusal | null {
  const { size } = config;
  if (spots.length !== config.spots || new Set(spots).size !== spots.length) return "bad-spots";
  if (!spots.every((spot) => isWhole(spot) && spot >= 0 && spot < size * size)) return "bad-spots";
  if (spots.some((spot) => board[spot] !== EMPTY)) return "spot-taken";
  const sorted = [...spots].sort((a, b) => a - b);
  const step = (from: number, to: number): string => `${(to % size) - (from % size)},${Math.floor(to / size) - Math.floor(from / size)}`;
  if (sorted.length < 2) return null;
  const first = step(sorted[0], sorted[1]);
  if (!WAYS.some(([dx, dy]) => `${dx},${dy}` === first)) return "not-in-line";
  return sorted.every((spot, at) => at === 0 || step(sorted[at - 1], spot) === first) ? null : "not-in-line";
}

/** Every set of spots a selector could mark on `board`, each from its top (or left) end. */
export function openSpots(board: string, config: Pick<OmokConfig, "size" | "spots">): number[][] {
  const { size } = config;
  const found: number[][] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      for (const [dx, dy] of WAYS) {
        const cells: number[] = [];
        for (let n = 0; n < config.spots; n++) {
          const [cx, cy] = [x + dx * n, y + dy * n];
          if (cx < 0 || cx >= size || cy < 0 || cy >= size || board[cy * size + cx] !== EMPTY) break;
          cells.push(cy * size + cx);
        }
        if (cells.length === config.spots) found.push(cells);
      }
    }
  }
  return found;
}

/**
 * The lines of exactly `config.line` stones on `board`, for each of the two
 * stones: a run of more is no line. Each line is its intersections, from
 * its top (or left) end.
 */
export function linesOf(board: string, config: Pick<OmokConfig, "size" | "line">): number[][][] {
  const { size } = config;
  const lines: number[][][] = [[], []];
  const at = (x: number, y: number): string => (x < 0 || x >= size || y < 0 || y >= size ? "" : board[y * size + x]);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const stone = at(x, y);
      const who = STONES.indexOf(stone);
      if (stone === EMPTY || who < 0) continue;
      for (const [dx, dy] of WAYS) {
        // a run is counted once, from its first stone
        if (at(x - dx, y - dy) === stone) continue;
        const cells: number[] = [];
        for (let n = 0; at(x + dx * n, y + dy * n) === stone; n++) cells.push((y + dy * n) * size + x + dx * n);
        if (cells.length === config.line) lines[who].push(cells);
      }
    }
  }
  return lines;
}

/** Why bets are not ones a player may make. */
export type BetsRefusal =
  /** Not a whole number for each spot. */
  | "bad-bets"
  /** A spot has fewer points on it than the least that can be bet. */
  | "bet-too-low"
  /** More points than the player has. */
  | "bets-over";

/** Whether `bets`, one for each spot, are ones a player with `points` may make: `null`, or why not. */
export function checkBets(bets: readonly number[], points: number, config: Pick<OmokConfig, "spots" | "minBet">): BetsRefusal | null {
  if (bets.length !== config.spots || !bets.every((bet) => isWhole(bet) && bet >= 0)) return "bad-bets";
  if (bets.some((bet) => bet < config.minBet)) return "bet-too-low";
  return bets.reduce((sum, bet) => sum + bet, 0) > points ? "bets-over" : null;
}

/** Where a game stands: the selector is marking spots, both are betting, or the game is over. */
export type OmokPhase = "select" | "bet" | "ended";

/**
 * Why a game is over: a line of five, both with as many lines at the same
 * time, no room left to mark spots, one of its two left, nobody left to go
 * on with it, or nobody playing any more.
 */
export type OmokEnd = "played" | "level" | "full" | "left" | "abandoned" | "stalled";

/** A round that was played. `bets` are in the order of `spots`. */
export interface RoundLine {
  round: number;
  selector: number;
  /** The spots marked, from their top (or left) end. */
  spots: number[];
  /** Whose stone was placed on each spot. */
  owners: number[];
  /** What each player bet. Sent only once the game is over. */
  bets: { player: number; bets: number[] }[];
}

/** Something that happened, as everyone is told it. */
export type OmokEvent =
  | { type: "round"; round: number; selector: number }
  | { type: "selected"; player: number; forced: boolean }
  | { type: "bet"; player: number; forced: boolean }
  | { type: "placed"; round: number; spots: number[]; owners: number[] }
  | { type: "ended"; reason: OmokEnd };

/** How many of the latest events a state keeps. */
export const HISTORY_KEPT = 24;
/** How many of the room's unguessable numbers a state keeps, for the spots the room marks. */
const SPARE_KEPT = 32;

/** One game, as the room stores it. It holds both players' points and bets: send only {@link viewFor} of it. */
export interface OmokState {
  version: 1;
  /** The two players, by the number each is known by, in the order of their numbers. */
  players: number[];
  /** The same two in the order of their stones: black, who is the first round's selector, then white. */
  order: number[];
  /** Which round is being played, from 1. */
  round: number;
  phase: OmokPhase;
  /** The round's selector. */
  selector: number;
  /** The board, a row after another from the top: {@link EMPTY}, or one of {@link STONES}. */
  board: string;
  /** The spots marked in the round being played; `null` until they are. */
  spots: number[] | null;
  /** The points each player has to bet with in the round being played; once the game is over, what each had left. Never sent to the other while it is played. */
  purses: { player: number; points: number }[];
  /** The bets made in the round being played. `forced`: the room made them. Never sent to the other. */
  bets: { player: number; bets: number[]; forced: boolean }[];
  /** The rounds that have been played. */
  log: RoundLine[];
  /** How many rounds running the room has done everything for both players. */
  idle: number;
  /** Whether the room marked the spots of the round being played. */
  roomMarked: boolean;
  /** Who won; `null` while nobody has. */
  winner: number | null;
  /** The lines of five the game ended on, of both players. */
  lines: number[][];
  /** When the last thing was done, in ms since the epoch. */
  at: number;
  /** When the step being played is over, in ms since the epoch; `null` once the game is over. */
  until: number | null;
  /** Numbers nobody could have guessed, for the spots the room marks. Never sent. */
  spare: number[];
  /** The state of the game's own random sequence. */
  rng: number;
  /** The latest things that happened, and how many have happened in all. */
  history: OmokEvent[];
  events: number;
  /** Why the game is over; `null` while it is played. */
  ended: OmokEnd | null;
}

/** What a player can ask. */
export type OmokAction =
  /** These are the spots of the round. */
  | { type: "select"; spots: number[] }
  /** These are my bets, in the order of the spots. */
  | { type: "bet"; bets: number[] };

/** Why something asked was refused. */
export type OmokRefusal =
  | SpotsRefusal
  | BetsRefusal
  /** No spots are being marked now. */
  | "not-selecting"
  /** The player is not the round's selector. */
  | "not-selector"
  /** No bets are being made now. */
  | "not-betting"
  /** The player is not one of the game's two. */
  | "not-playing"
  /** The player has bet in this round. */
  | "already-bet"
  /** Not something a player can ask. */
  | "bad-action"
  /** The game is over. */
  | "game-over";

export type OmokResult = { ok: true; state: OmokState } | { ok: false; reason: OmokRefusal };

/** Why a game was not started. */
export type OmokStartRefusal = "bad-config" | "too-few" | "too-many" | "bad-players";

/** A game as one player sees it. */
export interface OmokView {
  phase: OmokPhase;
  /** The number of the player this is for; `null` for someone watching. */
  you: number | null;
  players: number[];
  /** The two in the order of their stones: black, then white. */
  order: number[];
  round: number;
  selector: number;
  board: string;
  spots: number[] | null;
  /** Who has done what the step waits for: marked the spots, or bet. */
  ready: number[];
  /** This player's points for the round and the bets they have made in it; `null` for someone watching. */
  mine: { points: number; bets: number[] | null } | null;
  /** The rounds played; what was bet in them only once the game is over. */
  log: RoundLine[];
  /** The points each player had left after the last bets, once the game is over; `null` while it is played. */
  purses: { player: number; points: number }[] | null;
  winner: number | null;
  /** The lines of five the game ended on. */
  lines: number[][];
  /** How the game ended for each player, once it is played to its end. */
  places: { player: number; place: number }[] | null;
  history: OmokEvent[];
  events: number;
  ended: OmokEnd | null;
}

function clone(state: OmokState): OmokState {
  return {
    ...state,
    spots: state.spots === null ? null : [...state.spots],
    purses: state.purses.map((each) => ({ ...each })),
    bets: state.bets.map((each) => ({ ...each, bets: [...each.bets] })),
    log: [...state.log],
    lines: [...state.lines],
    spare: [...state.spare],
    history: [...state.history],
  };
}

/** Records something that happened, at `now`. `state` is changed. */
function tell(state: OmokState, event: OmokEvent, now?: number): void {
  if (now !== undefined) state.at = now;
  state.history.push(event);
  if (state.history.length > HISTORY_KEPT) state.history.splice(0, state.history.length - HISTORY_KEPT);
  state.events += 1;
}

const otherOf = (state: Pick<OmokState, "players">, player: number): number => state.players.find((each) => each !== player) ?? player;

/** Begins a round: its selector marks the spots. `state` is changed. */
function openRound(state: OmokState, now: number, config: OmokConfig): void {
  state.round += 1;
  // black marks the first round's, and from the second they take turns
  state.selector = state.round % 2 === 1 ? state.order[0] : state.order[1];
  state.phase = "select";
  state.spots = null;
  state.roomMarked = false;
  state.bets = [];
  // the round's new points, on top of what was carried over
  for (const purse of state.purses) purse.points += config.roundPoints;
  state.until = now + config.selectSeconds * 1000;
  tell(state, { type: "round", round: state.round, selector: state.selector }, now);
}

/** Starts a game for `players`. Which of the two has black, and marks the first spots, is drawn. */
export function createGame(
  start: { players: readonly number[]; seed: number; now: number; chance?: readonly number[] },
  config: OmokConfig,
): { ok: true; state: OmokState } | { ok: false; reason: OmokStartRefusal } {
  if (!isValidConfig(config)) return { ok: false, reason: "bad-config" };
  if (!Array.isArray(start.players) || !start.players.every((player) => isWhole(player) && player >= 0)) return { ok: false, reason: "bad-players" };
  if (new Set(start.players).size !== start.players.length) return { ok: false, reason: "bad-players" };
  if (start.players.length < 2) return { ok: false, reason: "too-few" };
  if (start.players.length > 2) return { ok: false, reason: "too-many" };
  const players = [...start.players].sort((a, b) => a - b);
  const source = randomSource(seedFrom(start.seed));
  const black = players[randomInt(source.next, players.length)];
  const state: OmokState = {
    version: 1,
    players,
    order: [black, players.find((each) => each !== black) as number],
    round: 0,
    phase: "select",
    selector: black,
    board: EMPTY.repeat(config.size * config.size),
    spots: null,
    purses: players.map((player) => ({ player, points: 0 })),
    bets: [],
    log: [],
    idle: 0,
    roomMarked: false,
    winner: null,
    lines: [],
    at: start.now,
    until: null,
    spare: (start.chance ?? []).slice(0, SPARE_KEPT).map((word) => word >>> 0),
    rng: source.state,
    history: [],
    events: 0,
    ended: null,
  };
  openRound(state, start.now, config);
  return { ok: true, state };
}

/** What a player sent, as an action; `null` for anything else. Whether it can be done is the game's to say. */
export function parseAction(raw: unknown): OmokAction | null {
  if (typeof raw !== "object" || raw === null) return null;
  const data = raw as Record<string, unknown>;
  const numbers = (value: unknown): number[] | null => (Array.isArray(value) && value.length <= 16 && value.every((each) => isWhole(each)) ? [...(value as number[])] : null);
  if (data.type === "select") {
    const spots = numbers(data.spots);
    return spots === null ? null : { type: "select", spots };
  }
  if (data.type === "bet") {
    const bets = numbers(data.bets);
    return bets === null ? null : { type: "bet", bets };
  }
  return null;
}

/** Who the game waits for: the selector while spots are marked, whoever has not bet while bets are made. */
export function awaited(state: Pick<OmokState, "phase" | "players" | "selector" | "bets">): number[] {
  if (state.phase === "select") return [state.selector];
  if (state.phase === "bet") return state.players.filter((player) => !state.bets.some((each) => each.player === player));
  return [];
}

/** Ends the game. `state` is changed. */
function finish(state: OmokState, reason: OmokEnd, now?: number): void {
  state.phase = "ended";
  state.until = null;
  state.ended = reason;
  tell(state, { type: "ended", reason }, now);
}

/** The spots are marked: both bet. `state` is changed. */
function openBets(state: OmokState, spots: readonly number[], forced: boolean, now: number, config: OmokConfig): void {
  state.spots = [...spots].sort((a, b) => a - b);
  state.roomMarked = forced;
  state.phase = "bet";
  state.bets = [];
  state.until = now + config.betSeconds * 1000;
  tell(state, { type: "selected", player: state.selector, forced }, now);
}

/**
 * Both bets are in: on each spot the stone of whoever bet more is placed,
 * or of the one who is not the selector where they bet the same; half of
 * what each has left carries over; and the board is looked at for lines of
 * five. `state` is changed.
 */
function place(state: OmokState, now: number, config: OmokConfig): void {
  const spots = state.spots ?? [];
  const selector = state.selector;
  const other = otherOf(state, selector);
  const betOf = (player: number): number[] => state.bets.find((each) => each.player === player)?.bets ?? spots.map(() => config.minBet);
  const [mine, theirs] = [betOf(selector), betOf(other)];
  const owners = spots.map((_, at) => (mine[at] > theirs[at] ? selector : other));
  const board = [...state.board];
  spots.forEach((spot, at) => {
    board[spot] = STONES[state.order.indexOf(owners[at])];
  });
  state.board = board.join("");
  state.log.push({ round: state.round, selector, spots: [...spots], owners, bets: state.players.map((player) => ({ player, bets: [...betOf(player)] })) });
  // what each has left of the round's points: shown as it is if the game ends here
  for (const purse of state.purses) purse.points -= betOf(purse.player).reduce((sum, bet) => sum + bet, 0);
  const idle = state.roomMarked && state.bets.every((each) => each.forced);
  state.idle = idle ? state.idle + 1 : 0;
  state.bets = [];
  state.spots = null;
  tell(state, { type: "placed", round: state.round, spots: [...spots], owners }, now);

  const lines = linesOf(state.board, config);
  const counts = state.order.map((_, who) => lines[who].length);
  if (counts[0] + counts[1] > 0) {
    state.lines = [...lines[0], ...lines[1]];
    if (counts[0] === counts[1]) return finish(state, "level", now);
    state.winner = state.order[counts[0] > counts[1] ? 0 : 1];
    return finish(state, "played", now);
  }
  if (openSpots(state.board, config).length === 0) return finish(state, "full", now);
  if (state.idle >= config.idleRounds) return finish(state, "stalled", now);
  // half the points left, rounded down, carry over to the next round
  for (const purse of state.purses) purse.points = Math.floor(purse.points / 2);
  openRound(state, now, config);
}

/** What comes of `player` doing `action` at `now`. `state` is not changed. */
export function applyAction(state: OmokState, player: number, action: OmokAction, now: number, config: OmokConfig): OmokResult {
  if (state.phase === "ended") return { ok: false, reason: "game-over" };
  if (!state.players.includes(player)) return { ok: false, reason: "not-playing" };
  if (action.type === "select") {
    if (state.phase !== "select") return { ok: false, reason: "not-selecting" };
    if (player !== state.selector) return { ok: false, reason: "not-selector" };
    const wrong = checkSpots(state.board, action.spots, config);
    if (wrong !== null) return { ok: false, reason: wrong };
    const next = clone(state);
    openBets(next, action.spots, false, now, config);
    return { ok: true, state: next };
  }
  if (action.type === "bet") {
    if (state.phase !== "bet") return { ok: false, reason: "not-betting" };
    if (state.bets.some((each) => each.player === player)) return { ok: false, reason: "already-bet" };
    const points = state.purses.find((each) => each.player === player)?.points ?? 0;
    const wrong = checkBets(action.bets, points, config);
    if (wrong !== null) return { ok: false, reason: wrong };
    const next = clone(state);
    next.bets.push({ player, bets: [...action.bets], forced: false });
    tell(next, { type: "bet", player, forced: false }, now);
    if (awaited(next).length === 0) place(next, now, config);
    return { ok: true, state: next };
  }
  return { ok: false, reason: "bad-action" };
}

/**
 * Spots of the room's marking, by a number nobody could have guessed while
 * there is one left (`chanceOf` in `rng.ts` says why not from the game's own
 * sequence). `state` is changed.
 */
function roomSpots(state: OmokState, config: OmokConfig): number[] {
  const open = openSpots(state.board, config);
  const word = state.spare.shift();
  if (word !== undefined) return open[randomInt(randomSource(word | 0).next, open.length)];
  const source = randomSource(state.rng);
  const picked = open[randomInt(source.next, open.length)];
  state.rng = source.state;
  return picked;
}

/** The game ended, where one of its two is not `there`. Returns `state` itself otherwise. */
export function closeIfLeft(state: OmokState, there: (player: number) => boolean): OmokState {
  if (state.phase === "ended" || state.players.every(there)) return state;
  const next = clone(state);
  finish(next, "left");
  return next;
}

/** The moment the game next needs the clock, in ms since the epoch; `null` once it is over. */
export function deadline(state: OmokState): number | null {
  return state.phase === "ended" ? null : state.until;
}

/**
 * What the clock brings at `now`: spots of the room's marking where the
 * selector has marked none, or the least bet on every spot for whoever has
 * not bet. Returns `state` itself when nothing is due.
 */
export function applyTimeout(state: OmokState, now: number, config: OmokConfig): OmokState {
  if (state.phase === "ended" || state.until === null || now < state.until) return state;
  const next = clone(state);
  if (state.phase === "select") {
    openBets(next, roomSpots(next, config), true, now, config);
    return next;
  }
  for (const player of awaited(state)) {
    next.bets.push({ player, bets: (next.spots ?? []).map(() => config.minBet), forced: true });
    tell(next, { type: "bet", player, forced: true }, now);
  }
  place(next, now, config);
  return next;
}

/** The game given up where it stands: nobody is left to go on with it. */
export function abandon(state: OmokState): OmokState {
  if (state.phase === "ended") return state;
  const next = clone(state);
  finish(next, "abandoned");
  return next;
}

/** The game with its clock moved on by `by` ms: it stood still that long. */
export function shiftClock(state: OmokState, by: number): OmokState {
  if (state.phase === "ended" || by === 0) return state;
  return { ...state, at: state.at + by, until: state.until === null ? null : state.until + by };
}

/**
 * How a game played to its end came out: the winner first and the other
 * second, or both first where neither won. `null` while it is played, and
 * for a game cut short.
 */
export function placesOf(state: Pick<OmokState, "phase" | "ended" | "players" | "winner">): { player: number; place: number }[] | null {
  if (state.phase !== "ended") return null;
  if (state.ended === "level" || state.ended === "full") return state.players.map((player) => ({ player, place: 1 }));
  if (state.ended !== "played" || state.winner === null) return null;
  const winner = state.winner;
  return state.players.map((player) => ({ player, place: player === winner ? 1 : 2 })).sort((a, b) => a.place - b.place || a.player - b.player);
}

/**
 * The game as `player` sees it (`null`: someone watching). A player's
 * points and bets are theirs alone until the game is over; which stone went
 * on which spot is everyone's.
 */
export function viewFor(state: OmokState, player: number | null): OmokView {
  const seated = player !== null && state.players.includes(player);
  const over = state.phase === "ended";
  const purse = seated ? state.purses.find((each) => each.player === player) : undefined;
  const waited = awaited(state);
  return {
    phase: state.phase,
    you: seated ? player : null,
    players: [...state.players],
    order: [...state.order],
    round: state.round,
    selector: state.selector,
    board: state.board,
    spots: state.spots === null ? null : [...state.spots],
    ready: state.phase === "bet" ? state.players.filter((each) => !waited.includes(each)) : [],
    mine: purse === undefined ? null : { points: purse.points, bets: state.bets.find((each) => each.player === player)?.bets.slice() ?? null },
    log: state.log.map((line) => ({ ...line, spots: [...line.spots], owners: [...line.owners], bets: over ? line.bets.map((each) => ({ player: each.player, bets: [...each.bets] })) : [] })),
    purses: over ? state.purses.map((each) => ({ ...each })) : null,
    winner: state.winner,
    lines: state.lines.map((line) => [...line]),
    places: placesOf(state),
    history: state.history.map((event) => ({ ...event })),
    events: state.events,
    ended: state.ended,
  };
}
