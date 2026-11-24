/**
 * The rules of 수식 신호등 (Equation Traffic Light), the last game of the
 * show's final.
 *
 * Design: design/games/equation-traffic-light.md. Two players. In five
 * minutes each creates a nine-cell equation, kept from the other: the
 * numbers 0 to 9 and the symbols for addition, subtraction, multiplication,
 * division, equals and exponent, no two symbols next to each other, no
 * leading zero, and true. Then, turn after turn, both have five minutes to
 * answer with nine cells of the same numbers and symbols (an answer need not
 * be an equation). Once both answers are in they are shown with a colour
 * clue on every cell: green for the right position, yellow for a number or
 * symbol that is in the equation at another position, red for one that is
 * not, or of which the equation has no more. No answer in time, no clues.
 * Whoever answers with the opponent's equation wins; if both do on the same
 * turn, they play again.
 *
 * Everything here is a pure function of what it is given. A state is plain
 * JSON; it holds both equations, so only {@link viewFor} of it is ever sent.
 */
import { randomInt, randomSource, seedFrom } from "../../game/rng";

/** The numbers and symbols a cell can hold, in the order a keypad shows them. */
export const SYMBOLS = "0123456789+-×÷=^";
const DIGITS = "0123456789";

/** The numbers of the game. The first three are the show's; the rest are filled in for a room (the brief says which). */
export interface EqConfig {
  /** How many cells an equation, and an answer, has. */
  cells: number;
  /** Seconds to create an equation, and seconds for each answer. */
  createSeconds: number;
  guessSeconds: number;
  /** A value with more digits than this is not worked out: the equation has no value. Not in the show. */
  maxDigits: number;
  /** After this many turns running with no answer from anyone, the game is given up. Not in the show. */
  idleTurns: number;
  /** Equations the room gives a player who has created none in time. Not in the show. */
  stock: string[];
}

const isWhole = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);
const isDigit = (cell: string): boolean => cell.length === 1 && DIGITS.includes(cell);

/** An exact value: `n` over `d`, in lowest terms, `d` above zero. */
export interface Fraction {
  n: bigint;
  d: bigint;
}

function gcd(a: bigint, b: bigint): bigint {
  let [x, y] = [a < 0n ? -a : a, b < 0n ? -b : b];
  while (y !== 0n) [x, y] = [y, x % y];
  return x;
}

function fraction(n: bigint, d: bigint): Fraction {
  const sign = d < 0n ? -1n : 1n;
  const by = gcd(n, d) || 1n;
  return { n: (sign * n) / by, d: (sign * d) / by };
}

/** A value as a player reads it: a whole number, or a fraction with a stroke. */
export function shown(value: Fraction): string {
  return value.d === 1n ? `${value.n}` : `${value.n}/${value.d}`;
}

/** `base` to the power of `exponent`, both whole and not below zero; `null` for 0 to the power of 0 and for more digits than `maxDigits`. */
function power(base: bigint, exponent: bigint, maxDigits: number): bigint | null {
  if (exponent === 0n) return base === 0n ? null : 1n;
  if (base === 0n || base === 1n) return base;
  // how many digits the power has, nearly enough: the exponent times the base's own
  const digits = `${base}`;
  const size = digits.length - 1 + Math.log10(Number(digits.slice(0, 15)) / 10 ** (Math.min(digits.length, 15) - 1));
  if (exponent > BigInt(maxDigits * 4) || Number(exponent) * size > maxDigits) return null;
  return base ** exponent;
}

/**
 * The value of one side of an equation: numbers with symbols between them,
 * no equals symbol. The exponent is done first (one after another, from the
 * right), then multiplication and division from the left, then addition and
 * subtraction from the left. Division is exact. `null` for what is no such
 * side, for a division by zero, for 0 to the power of 0, and for a value of
 * more than `maxDigits` digits.
 */
export function valueOf(side: string, maxDigits: number): Fraction | null {
  const cells = [...side];
  if (cells.length === 0 || !isDigit(cells[0]) || !isDigit(cells[cells.length - 1])) return null;
  const numbers: bigint[] = [];
  const signs: string[] = [];
  let run = "";
  for (const cell of cells) {
    if (isDigit(cell)) run += cell;
    else {
      if (run === "" || !"+-×÷^".includes(cell)) return null;
      numbers.push(BigInt(run));
      signs.push(cell);
      run = "";
    }
  }
  numbers.push(BigInt(run));
  // the exponents, from the right: what stands before one is always a whole number written out
  const factors: Fraction[] = [];
  const between: string[] = [];
  for (let at = 0; at < numbers.length; ) {
    let end = at;
    while (signs[end] === "^") end += 1;
    let value: bigint | null = numbers[end];
    for (let back = end - 1; back >= at && value !== null; back--) value = power(numbers[back], value, maxDigits);
    if (value === null || `${value}`.length > maxDigits) return null;
    factors.push({ n: value, d: 1n });
    if (end < signs.length) between.push(signs[end]);
    at = end + 1;
  }
  // multiplication and division, from the left
  const terms: Fraction[] = [factors[0]];
  const joins: string[] = [];
  between.forEach((sign, at) => {
    const next = factors[at + 1];
    const last = terms[terms.length - 1];
    if (sign === "×") terms[terms.length - 1] = fraction(last.n * next.n, last.d * next.d);
    else if (sign === "÷") terms[terms.length - 1] = next.n === 0n ? { n: 0n, d: 0n } : fraction(last.n * next.d, last.d * next.n);
    else {
      terms.push(next);
      joins.push(sign);
    }
  });
  // (a division by zero left its mark: nothing can be made of it)
  if (terms.some((term) => term.d === 0n)) return null;
  let total = terms[0];
  joins.forEach((sign, at) => {
    const next = terms[at + 1];
    total = fraction(sign === "+" ? total.n * next.d + next.n * total.d : total.n * next.d - next.n * total.d, total.d * next.d);
  });
  return `${total.n}`.length > maxDigits || `${total.d}`.length > maxDigits ? null : total;
}

/** Why something is not an equation a player may create, or an answer a player may give. */
export type CellsRefusal =
  /** Not as many cells as an equation has. */
  | "wrong-length"
  /** A cell holds what is neither a number nor one of the symbols. */
  | "bad-symbol";

/** Why nine cells of numbers and symbols are not an equation a player may create. */
export type EquationRefusal =
  | CellsRefusal
  /** It begins or ends with a symbol. */
  | "symbol-at-edge"
  /** Two symbols are next to each other. */
  | "symbols-together"
  /** It has no equals symbol, or more than one. */
  | "one-equals"
  /** A number of more than one digit begins with 0. */
  | "leading-zero"
  /** A side has no value: a division by zero, 0 to the power of 0, or a number too large to work out. */
  | "no-value"
  /** The two sides are not equal. */
  | "not-true";

/** Whether `cells` is nine cells of the numbers and symbols: `null`, or why not. All that is asked of an answer. */
export function checkAnswer(cells: string, config: Pick<EqConfig, "cells">): CellsRefusal | null {
  const each = [...cells];
  if (each.length !== config.cells) return "wrong-length";
  return each.every((cell) => SYMBOLS.includes(cell)) ? null : "bad-symbol";
}

/** Whether `equation` is one a player may create: `null`, or why not. */
export function checkEquation(equation: string, config: Pick<EqConfig, "cells" | "maxDigits">): EquationRefusal | null {
  const wrong = checkAnswer(equation, config);
  if (wrong !== null) return wrong;
  const cells = [...equation];
  if (!isDigit(cells[0]) || !isDigit(cells[cells.length - 1])) return "symbol-at-edge";
  if (cells.some((cell, at) => at > 0 && !isDigit(cell) && !isDigit(cells[at - 1]))) return "symbols-together";
  if (cells.filter((cell) => cell === "=").length !== 1) return "one-equals";
  if (cells.some((cell, at) => cell === "0" && (at === 0 || !isDigit(cells[at - 1])) && isDigit(cells[at + 1] ?? ""))) return "leading-zero";
  const [left, right] = equation.split("=").map((side) => valueOf(side, config.maxDigits));
  if (left === null || right === null) return "no-value";
  return left.n === right.n && left.d === right.d ? null : "not-true";
}

/**
 * The colour clues of `answer` against `secret`, a letter a cell: `g` green
 * for the right position, `y` yellow for a number or symbol the equation has
 * at another position, `r` red for one it has not, or has no more of. Of a
 * number or symbol the answer has more often than the equation, those in
 * their position are green first, then yellow from the left for as many as
 * the equation has left, and the rest red.
 */
export function cluesOf(secret: string, answer: string): string {
  const target = [...secret];
  const cells = [...answer];
  const left = new Map<string, number>();
  target.forEach((cell, at) => {
    if (cells[at] !== cell) left.set(cell, (left.get(cell) ?? 0) + 1);
  });
  return cells
    .map((cell, at) => {
      if (target[at] === cell) return "g";
      const more = left.get(cell) ?? 0;
      if (more <= 0) return "r";
      left.set(cell, more - 1);
      return "y";
    })
    .join("");
}

/** Whether a game can be played with `config`. */
export function isValidConfig(config: EqConfig): boolean {
  if (!isWhole(config.cells) || config.cells < 3 || config.cells > 15) return false;
  if (!(config.createSeconds > 0) || !(config.guessSeconds > 0)) return false;
  if (!isWhole(config.maxDigits) || config.maxDigits < config.cells) return false;
  if (!isWhole(config.idleTurns) || config.idleTurns < 1) return false;
  return Array.isArray(config.stock) && config.stock.length > 0 && config.stock.every((equation) => checkEquation(equation, config) === null);
}

/** Where a game stands: the equations are being created, answers are waited for, or the game is over. */
export type EqPhase = "create" | "guess" | "ended";

/** Why a game is over: won, one of its two left, nobody left to go on with it, or nobody answering any more. */
export type EqEnd = "played" | "left" | "abandoned" | "stalled";

/** One player's answer of a turn as it was shown; `null` twice for no answer in time. */
export interface AnswerLine {
  player: number;
  cells: string | null;
  clues: string | null;
}

/** A turn that was played: the answers of both, in the order of the players' numbers. */
export interface Row {
  turn: number;
  answers: AnswerLine[];
}

/** Something that happened, as everyone is told it. */
export type EqEvent =
  | { type: "round"; round: number }
  | { type: "created"; player: number; forced: boolean }
  | { type: "answered"; player: number }
  | { type: "clues"; turn: number; solved: number[]; missed: number[] }
  | { type: "ended"; reason: EqEnd };

/** How many of the latest events a state keeps. */
export const HISTORY_KEPT = 24;
/** How many of the latest turns a state keeps the answers of. */
export const ROWS_KEPT = 40;
/** How many of the room's unguessable numbers a state keeps, for the equations the room gives. */
const SPARE_KEPT = 32;

/** One game, as the room stores it. It holds both equations: send only {@link viewFor} of it. */
export interface EqState {
  version: 1;
  /** The two players, by the number each is known by, in the order of their numbers. */
  players: number[];
  /** Which game of equations this is, from 1: one more each time both answered right on the same turn. */
  round: number;
  phase: EqPhase;
  /** Each player's equation; `null` until it is created. `forced`: the room gave it. Never sent to the other. */
  secrets: { player: number; equation: string | null; forced: boolean }[];
  /** Which turn is being played, from 1; 0 while the equations are created. */
  turn: number;
  /** The answers given in the turn being played and not shown yet. */
  answers: { player: number; cells: string }[];
  /** The turns that have been shown, the latest of them. */
  rows: Row[];
  /** How many turns running nobody has answered. */
  idle: number;
  /** Who won; `null` while nobody has. */
  winner: number | null;
  /** When the last thing was done, in ms since the epoch. */
  at: number;
  /** When the step being played is over, in ms since the epoch; `null` once the game is over. */
  until: number | null;
  /** Numbers nobody could have guessed, for the equations the room gives. Never sent. */
  spare: number[];
  /** The state of the game's own random sequence. */
  rng: number;
  /** The latest things that happened, and how many have happened in all. */
  history: EqEvent[];
  events: number;
  /** Why the game is over; `null` while it is played. */
  ended: EqEnd | null;
}

/** What a player can ask. */
export type EqAction =
  /** This is my equation. */
  | { type: "create"; equation: string }
  /** This is my answer for the turn. */
  | { type: "answer"; cells: string };

/** Why something asked was refused. */
export type EqRefusal =
  | EquationRefusal
  /** The equations are not being created now. */
  | "not-creating"
  /** No answer is waited for now. */
  | "not-guessing"
  /** The player is not one of the game's two. */
  | "not-playing"
  /** The player has answered in this turn. */
  | "already-answered"
  /** Not something a player can ask. */
  | "bad-action"
  /** The game is over. */
  | "game-over";

export type EqResult = { ok: true; state: EqState } | { ok: false; reason: EqRefusal };

/** Why a game was not started. */
export type EqStartRefusal = "bad-config" | "too-few" | "too-many" | "bad-players";

/** A game as one player sees it. */
export interface EqView {
  phase: EqPhase;
  /** The number of the player this is for; `null` for someone watching. */
  you: number | null;
  players: number[];
  round: number;
  turn: number;
  /** Who has done what the step waits for: created an equation, or answered in the turn. */
  ready: number[];
  /** This player's own equation, and their answer of the turn while it is not shown; `null` for someone watching. */
  mine: { equation: string | null; answer: string | null } | null;
  /** The turns that have been shown. */
  rows: Row[];
  /** Both equations, once the game is over; `null` while it is played. */
  secrets: { player: number; equation: string }[] | null;
  winner: number | null;
  /** How the game ended for each player, once it is won. */
  places: { player: number; place: number }[] | null;
  history: EqEvent[];
  events: number;
  ended: EqEnd | null;
}

function clone(state: EqState): EqState {
  return {
    ...state,
    secrets: state.secrets.map((each) => ({ ...each })),
    answers: state.answers.map((each) => ({ ...each })),
    rows: [...state.rows],
    spare: [...state.spare],
    history: [...state.history],
  };
}

/** Records something that happened, at `now`. `state` is changed. */
function tell(state: EqState, event: EqEvent, now?: number): void {
  if (now !== undefined) state.at = now;
  state.history.push(event);
  if (state.history.length > HISTORY_KEPT) state.history.splice(0, state.history.length - HISTORY_KEPT);
  state.events += 1;
}

/** Begins a game of equations: both create one. `state` is changed. */
function openRound(state: EqState, now: number, config: EqConfig): void {
  state.round += 1;
  state.phase = "create";
  state.secrets = state.players.map((player) => ({ player, equation: null, forced: false }));
  state.turn = 0;
  state.answers = [];
  state.rows = [];
  state.idle = 0;
  state.until = now + config.createSeconds * 1000;
  tell(state, { type: "round", round: state.round }, now);
}

/** Starts a game for `players`. */
export function createGame(
  start: { players: readonly number[]; seed: number; now: number; chance?: readonly number[] },
  config: EqConfig,
): { ok: true; state: EqState } | { ok: false; reason: EqStartRefusal } {
  if (!isValidConfig(config)) return { ok: false, reason: "bad-config" };
  if (!Array.isArray(start.players) || !start.players.every((player) => isWhole(player) && player >= 0)) return { ok: false, reason: "bad-players" };
  if (new Set(start.players).size !== start.players.length) return { ok: false, reason: "bad-players" };
  if (start.players.length < 2) return { ok: false, reason: "too-few" };
  if (start.players.length > 2) return { ok: false, reason: "too-many" };
  const state: EqState = {
    version: 1,
    players: [...start.players].sort((a, b) => a - b),
    round: 0,
    phase: "create",
    secrets: [],
    turn: 0,
    answers: [],
    rows: [],
    idle: 0,
    winner: null,
    at: start.now,
    until: null,
    spare: (start.chance ?? []).slice(0, SPARE_KEPT).map((word) => word >>> 0),
    rng: seedFrom(start.seed),
    history: [],
    events: 0,
    ended: null,
  };
  openRound(state, start.now, config);
  return { ok: true, state };
}

/** What a player sent, as an action; `null` for anything else. Whether it can be done is the game's to say. */
export function parseAction(raw: unknown): EqAction | null {
  if (typeof raw !== "object" || raw === null) return null;
  const data = raw as Record<string, unknown>;
  if (data.type === "create") return typeof data.equation === "string" && data.equation.length <= 64 ? { type: "create", equation: data.equation } : null;
  if (data.type === "answer") return typeof data.cells === "string" && data.cells.length <= 64 ? { type: "answer", cells: data.cells } : null;
  return null;
}

/** Who the game waits for: whoever has not created an equation, or has not answered in the turn. */
export function awaited(state: Pick<EqState, "phase" | "players" | "secrets" | "answers">): number[] {
  if (state.phase === "create") return state.secrets.filter((each) => each.equation === null).map((each) => each.player);
  if (state.phase === "guess") return state.players.filter((player) => !state.answers.some((each) => each.player === player));
  return [];
}

/** Ends the game. `state` is changed. */
function finish(state: EqState, reason: EqEnd, now?: number): void {
  state.phase = "ended";
  state.until = null;
  state.ended = reason;
  tell(state, { type: "ended", reason }, now);
}

/** Begins the next turn. `state` is changed. */
function openTurn(state: EqState, now: number, config: EqConfig): void {
  state.phase = "guess";
  state.turn += 1;
  state.answers = [];
  state.until = now + config.guessSeconds * 1000;
  state.at = now;
}

/** The turn is over: the answers that are in are shown with their clues. `state` is changed. */
function reveal(state: EqState, now: number, config: EqConfig): void {
  const secretOf = (player: number): string => state.secrets.find((each) => each.player !== player)?.equation ?? "";
  const answers: AnswerLine[] = state.players.map((player) => {
    const given = state.answers.find((each) => each.player === player);
    return given === undefined ? { player, cells: null, clues: null } : { player, cells: given.cells, clues: cluesOf(secretOf(player), given.cells) };
  });
  state.rows.push({ turn: state.turn, answers });
  if (state.rows.length > ROWS_KEPT) state.rows.splice(0, state.rows.length - ROWS_KEPT);
  const solved = answers.filter((each) => each.cells !== null && each.cells === secretOf(each.player)).map((each) => each.player);
  const missed = answers.filter((each) => each.cells === null).map((each) => each.player);
  state.idle = missed.length === state.players.length ? state.idle + 1 : 0;
  state.answers = [];
  tell(state, { type: "clues", turn: state.turn, solved, missed }, now);
  if (solved.length === 1) {
    state.winner = solved[0];
    return finish(state, "played", now);
  }
  // both at the same time: they play again until a single winner can be determined
  if (solved.length > 1) return openRound(state, now, config);
  if (state.idle >= config.idleTurns) return finish(state, "stalled", now);
  openTurn(state, now, config);
}

/** What comes of `player` doing `action` at `now`. `state` is not changed. */
export function applyAction(state: EqState, player: number, action: EqAction, now: number, config: EqConfig): EqResult {
  if (state.phase === "ended") return { ok: false, reason: "game-over" };
  if (action.type === "create") {
    if (state.phase !== "create") return { ok: false, reason: "not-creating" };
    if (!state.players.includes(player)) return { ok: false, reason: "not-playing" };
    const wrong = checkEquation(action.equation, config);
    if (wrong !== null) return { ok: false, reason: wrong };
    const next = clone(state);
    const own = next.secrets.find((each) => each.player === player) as EqState["secrets"][number];
    const again = own.equation !== null;
    own.equation = action.equation;
    own.forced = false;
    if (!again) tell(next, { type: "created", player, forced: false }, now);
    if (awaited(next).length === 0) openTurn(next, now, config);
    return { ok: true, state: next };
  }
  if (action.type === "answer") {
    if (state.phase !== "guess") return { ok: false, reason: "not-guessing" };
    if (!state.players.includes(player)) return { ok: false, reason: "not-playing" };
    if (state.answers.some((each) => each.player === player)) return { ok: false, reason: "already-answered" };
    const wrong = checkAnswer(action.cells, config);
    if (wrong !== null) return { ok: false, reason: wrong };
    const next = clone(state);
    next.answers.push({ player, cells: action.cells });
    tell(next, { type: "answered", player }, now);
    if (awaited(next).length === 0) reveal(next, now, config);
    return { ok: true, state: next };
  }
  return { ok: false, reason: "bad-action" };
}

/**
 * One of the room's own equations, by a number nobody could have guessed
 * while there is one left (`chanceOf` in `rng.ts` says why not from the
 * game's own sequence). `state` is changed.
 */
function stockEquation(state: EqState, config: EqConfig): string {
  const word = state.spare.shift();
  if (word !== undefined) return config.stock[randomInt(randomSource(word | 0).next, config.stock.length)];
  const source = randomSource(state.rng);
  const picked = config.stock[randomInt(source.next, config.stock.length)];
  state.rng = source.state;
  return picked;
}

/** The game ended, where one of its two is not `there`. Returns `state` itself otherwise. */
export function closeIfLeft(state: EqState, there: (player: number) => boolean): EqState {
  if (state.phase === "ended" || state.players.every(there)) return state;
  const next = clone(state);
  finish(next, "left");
  return next;
}

/** The moment the game next needs the clock, in ms since the epoch; `null` once it is over. */
export function deadline(state: EqState): number | null {
  return state.phase === "ended" ? null : state.until;
}

/**
 * What the clock brings at `now`: an equation of the room's for whoever has
 * created none, or the turn's clues for the answers that are in. Returns
 * `state` itself when nothing is due.
 */
export function applyTimeout(state: EqState, now: number, config: EqConfig): EqState {
  if (state.phase === "ended" || state.until === null || now < state.until) return state;
  const next = clone(state);
  if (state.phase === "create") {
    for (const own of next.secrets) {
      if (own.equation !== null) continue;
      own.equation = stockEquation(next, config);
      own.forced = true;
      tell(next, { type: "created", player: own.player, forced: true }, now);
    }
    openTurn(next, now, config);
  } else reveal(next, now, config);
  return next;
}

/** The game given up where it stands: nobody is left to go on with it. */
export function abandon(state: EqState): EqState {
  if (state.phase === "ended") return state;
  const next = clone(state);
  finish(next, "abandoned");
  return next;
}

/** The game with its clock moved on by `by` ms: it stood still that long. */
export function shiftClock(state: EqState, by: number): EqState {
  if (state.phase === "ended" || by === 0) return state;
  return { ...state, at: state.at + by, until: state.until === null ? null : state.until + by };
}

/** How a game that was won came out: the winner first, the other second. `null` while it is played, and for a game cut short. */
export function placesOf(state: Pick<EqState, "phase" | "ended" | "players" | "winner">): { player: number; place: number }[] | null {
  if (state.phase !== "ended" || state.ended !== "played" || state.winner === null) return null;
  const winner = state.winner;
  return state.players.map((player) => ({ player, place: player === winner ? 1 : 2 })).sort((a, b) => a.place - b.place || a.player - b.player);
}

/**
 * The game as `player` sees it (`null`: someone watching). An equation is
 * its creator's alone until the game is over; an answer is its giver's
 * alone until the turn's clues are shown, and then everyone's.
 */
export function viewFor(state: EqState, player: number | null): EqView {
  const own = player === null ? undefined : state.secrets.find((each) => each.player === player);
  const over = state.phase === "ended";
  return {
    phase: state.phase,
    you: player !== null && state.players.includes(player) ? player : null,
    players: [...state.players],
    round: state.round,
    turn: state.turn,
    ready: state.players.filter((each) => !awaited(state).includes(each) && !over),
    mine: own === undefined ? null : { equation: own.equation, answer: state.answers.find((each) => each.player === player)?.cells ?? null },
    rows: state.rows.map((row) => ({ turn: row.turn, answers: row.answers.map((each) => ({ ...each })) })),
    secrets: over ? state.secrets.flatMap((each) => (each.equation === null ? [] : [{ player: each.player, equation: each.equation }])) : null,
    winner: state.winner,
    places: placesOf(state),
    history: state.history.map((event) => ({ ...event })),
    events: state.events,
    ended: state.ended,
  };
}
