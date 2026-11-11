/**
 * 네모 세기 (Count the Rectangles): the rules of one game, as pure functions
 * over plain JSON.
 *
 * Design: design/games/count-rectangles.md. A board of square cells, some
 * with numbers, and a target number are put up; players race to say how many
 * rectangles on the board add up to the target. A cell with no number adds
 * nothing, so with a target of 0 a rectangle of such cells counts too; a
 * board need not be a rectangle itself, and a rectangle lies only on cells
 * the board has (both seen in the broadcast, see the design record). Whoever
 * buzzes first has ten seconds to answer. A wrong answer shuts that player's
 * team out of the problem; two right answers make a team a winner, which then
 * sits out; the game ends when half the teams have won.
 *
 * A "unit" is what the document calls a team: three players who teamed up, or
 * one player alone. Nothing here reads the clock or `Math.random`: the caller
 * passes the time, and the generator's state is kept in the game.
 */
import { randomInt, randomSource, seedFrom } from "../../game/rng";

/** Tunable values. Loaded from `config.json`. */
export interface RectConfig {
  /** Players in a team (the document: three). */
  teamSize: number;
  /** Right answers that make a unit a winner (the document: two). */
  winsNeeded: number;
  /** Seconds a player has to answer after buzzing (the document: ten). */
  answerSeconds: number;
  /** Seconds a problem stays open (the document: five minutes). */
  problemSeconds: number;
  /** Seconds a closed problem's answer stays on show before the next one. Not in the document. */
  pauseSeconds: number;
  /** Problems after which the game ends even if too few units have won. Not in the document. */
  maxProblems: number;
  /** The sizes a board is drawn from; a size listed twice is drawn twice as often. Not in the document. */
  boards: { rows: number; cols: number }[];
  /**
   * Of a hundred boards, about how many have an outline that is not a
   * rectangle: cells cut away from the edge of one of `irregularBoards`,
   * about `cutPercent` of them. The broadcast's boards are of both sorts;
   * how often and how large is not in the document.
   */
  irregularPercent: number;
  irregularBoards: { rows: number; cols: number }[];
  cutPercent: number;
  /** Numbers on a board run from minus this to this, never 0. Not in the document. */
  maxNumber: number;
  /** Of a hundred cells, about how many have no number. Not in the document. */
  blankPercent: number;
  /** The fewest and the most rectangles a problem's answer may be. Not in the document. */
  minAnswer: number;
  maxAnswer: number;
  /** A target lies between minus this and this. Not in the document. */
  maxTarget: number;
  /** The largest answer a player may say. */
  maxSaid: number;
}

/** A player as the game is started with: `id` tells them apart, `team` is 0 for alone or the number of a team. */
export interface RectPlayer {
  id: number;
  team: number;
}

/** A team of three, or a player alone. */
export interface Unit {
  /** The ids of its players, lowest first. */
  members: number[];
  /** Problems it has answered right. */
  wins: number;
  /** The order in which it became a winner, from 1; 0 while it has not. */
  place: number;
}

/** Where a board has no cell at all: no rectangle lies across it. */
export const GAP = "gap";

/** A place on a board: a number, `null` for a cell with no number in it, or {@link GAP}. */
export type Cell = number | null | typeof GAP;

/** A problem: the board and the number to make. */
export interface Board {
  /** The box the board lies in. */
  rows: number;
  cols: number;
  /** Row by row. */
  cells: Cell[];
  target: number;
}

/** A rectangle on a board, by its corner cells, both included. */
export interface Rect {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

/**
 * Where a game stands: a problem is open for buzzing, a player who buzzed is
 * answering, a closed problem's answer is on show, or the game is over.
 */
export type RectPhase = "problem" | "answer" | "pause" | "ended";

/** How a problem closed. */
export type Outcome =
  /** `player` of unit `unit` said the right number. */
  | { kind: "right"; player: number; unit: number }
  /** Its time ran out with no right answer. */
  | { kind: "time" }
  /** Every unit still playing answered wrong. */
  | { kind: "all-wrong" };

/** What has happened, in order. Everything here is seen by everyone. */
export type RectEvent =
  | { type: "problem"; round: number }
  | { type: "buzz"; round: number; player: number }
  | { type: "right"; round: number; player: number; said: number }
  | { type: "wrong"; round: number; player: number; said: number }
  /** The player who buzzed said nothing in time; it counts as a wrong answer. */
  | { type: "silent"; round: number; player: number }
  | { type: "time"; round: number }
  | { type: "all-wrong"; round: number }
  | { type: "won"; round: number; unit: number; place: number }
  /**
   * `half`: enough units have won. `problems`: the last problem allowed has
   * been played. `abandoned`: nobody who could still win is there to go on.
   */
  | { type: "ended"; round: number; reason: "half" | "problems" | "abandoned" };

/** A game in progress. Holds the answer to the open problem: send only {@link viewFor} of it. */
export interface RectState {
  version: 1;
  units: Unit[];
  phase: RectPhase;
  /** Which problem this is, from 1. */
  round: number;
  board: Board;
  /** How many rectangles make the target. */
  answer: number;
  /** When the problem was put up, in ms since the epoch. */
  openedAt: number;
  /** The units that have answered this problem wrong, in the order they did. */
  wrong: number[];
  /** Who is answering, and until when; `null` while nobody is. */
  floor: { player: number; unit: number; until: number } | null;
  /** How this problem closed; `null` while it is open. */
  outcome: Outcome | null;
  /** Until when the closed problem's answer is on show; `null` otherwise. */
  pauseUntil: number | null;
  history: RectEvent[];
  /** The generator's state: the next board is drawn from here. */
  rng: number;
}

/** What a player can ask for. */
export type RectAction = { type: "buzz" } | { type: "answer"; count: number };

/** Why something was refused. */
export type RectRefusal =
  | "game-over"
  /** The player is not in this game. */
  | "not-playing"
  /** Their unit has won and sits out. */
  | "already-won"
  /** Their unit answered this problem wrong. */
  | "shut-out"
  /** Nobody can buzz now: someone is answering, or the problem is closed. */
  | "not-open"
  /** Only the player who buzzed answers. */
  | "not-your-answer"
  | "bad-action"
  /** The number said is not a whole number in range. */
  | "bad-count";

export type RectResult = { ok: true; state: RectState } | { ok: false; reason: RectRefusal };

/** Why a game could not be started. */
export type RectStartRefusal =
  | "bad-config"
  /** Two players with the same id, or an id or team that is not a whole number. */
  | "bad-players"
  /** A team that is not exactly `teamSize` players. */
  | "bad-teams"
  /** Fewer than two units: nobody to race. */
  | "too-few";

/** What one player is sent. `answer` and `solutions` are there only once the problem is closed. */
export interface RectView {
  /** The viewer's id and unit, or `null` for someone watching. */
  you: { player: number; unit: number } | null;
  phase: RectPhase;
  round: number;
  units: Unit[];
  /** How many units must win for the game to end. */
  winnersNeeded: number;
  board: Board;
  wrong: number[];
  /** Who is answering; when their time ends is the caller's to tell (it knows the clock). */
  floor: { player: number; unit: number } | null;
  outcome: Outcome | null;
  answer: number | null;
  solutions: Rect[] | null;
  history: RectEvent[];
}

const isWhole = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);

/** Whether `config` describes a game that can be played. */
export function isValidConfig(config: RectConfig): boolean {
  const positive = [config.teamSize, config.winsNeeded, config.answerSeconds, config.problemSeconds, config.maxProblems, config.maxNumber, config.minAnswer, config.maxSaid];
  if (!positive.every((value) => isWhole(value) && value >= 1)) return false;
  if (!isWhole(config.pauseSeconds) || config.pauseSeconds < 0) return false;
  if (!isWhole(config.blankPercent) || config.blankPercent < 0 || config.blankPercent >= 100) return false;
  if (!isWhole(config.maxAnswer) || config.maxAnswer < config.minAnswer || config.maxAnswer > config.maxSaid) return false;
  if (!isWhole(config.maxTarget) || config.maxTarget < 0) return false;
  if (!isWhole(config.irregularPercent) || config.irregularPercent < 0 || config.irregularPercent > 100) return false;
  if (!isWhole(config.cutPercent) || config.cutPercent < 0 || config.cutPercent >= 100) return false;
  const sizes = (list: unknown): list is { rows: number; cols: number }[] =>
    Array.isArray(list) && list.every((size) => isWhole(size?.rows) && isWhole(size?.cols) && size.rows >= 1 && size.cols >= 1 && size.rows * size.cols >= 2);
  if (!sizes(config.boards) || config.boards.length === 0) return false;
  // boards with a cut outline are drawn only if there is something to cut them from
  return sizes(config.irregularBoards) && (config.irregularPercent === 0 || config.irregularBoards.length > 0);
}

/** Every rectangle of whole cells on a board of `rows` by `cols`, one-cell ones included. */
function everyRect(rows: number, cols: number): Rect[] {
  const all: Rect[] = [];
  for (let top = 0; top < rows; top++) {
    for (let bottom = top; bottom < rows; bottom++) {
      for (let left = 0; left < cols; left++) {
        for (let right = left; right < cols; right++) all.push({ top, left, bottom, right });
      }
    }
  }
  return all;
}

/**
 * The numbers inside `rect` added up: a cell with no number adds nothing, so
 * a rectangle of such cells alone adds up to 0. `null` when the rectangle
 * would lie across a place where the board has no cell: that is no rectangle
 * of this board.
 */
function sumIn(board: Board, rect: Rect): number | null {
  let sum = 0;
  for (let row = rect.top; row <= rect.bottom; row++) {
    for (let col = rect.left; col <= rect.right; col++) {
      const value = board.cells[row * board.cols + col];
      if (value === GAP || value === undefined) return null;
      if (value !== null) sum += value;
    }
  }
  return sum;
}

/**
 * The rectangles on `board` that add up to its target: the ones a player has
 * to count. A rectangle is any block of the board's cells, a single cell
 * included, with or without numbers in it.
 *
 * As the broadcast counts them (design record, "What the broadcast shows"):
 * with a target of 0, a board of thirty cells without numbers and two with a
 * 1 has 114.
 */
export function solutions(board: Board): Rect[] {
  return everyRect(board.rows, board.cols).filter((rect) => sumIn(board, rect) === board.target);
}

/** A board that always works, for the rare draw that finds none. Not one of the show's. */
const FALLBACK: Board = { rows: 3, cols: 3, cells: [2, -3, 5, 4, null, -1, -2, 3, 1], target: 4 };

/** How many boards are drawn before giving up on finding one whose answer is in range. */
const DRAWS = 200;

/** The four places that share a side with a place. */
const SIDES: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Whether the cells left in `there` (row by row, in a box of `rows` by `cols`) are all in one piece. */
function inOnePiece(there: readonly boolean[], rows: number, cols: number): boolean {
  const first = there.indexOf(true);
  if (first < 0) return false;
  const seen = new Set<number>([first]);
  const queue = [first];
  while (queue.length > 0) {
    const index = queue.pop() ?? 0;
    const row = Math.floor(index / cols);
    const col = index % cols;
    for (const [dr, dc] of SIDES) {
      const r = row + dr;
      const c = col + dc;
      if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
      const next = r * cols + c;
      if (there[next] && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen.size === there.filter(Boolean).length;
}

/**
 * The outline of a board that is not a rectangle: a box of `rows` by `cols`
 * with about `percent` of a hundred cells cut away from its edge, what is
 * left still in one piece. Returns which places keep a cell, row by row.
 */
function cutOutline(random: () => number, rows: number, cols: number, percent: number): boolean[] {
  const there: boolean[] = Array.from({ length: rows * cols }, () => true);
  let toCut = Math.round((rows * cols * percent) / 100);
  // a cut that would split the board is not made; a few of those in a row and the board is left as it is
  for (let attempt = 0; toCut > 0 && attempt < rows * cols * 8; attempt++) {
    const index = randomInt(random, rows * cols);
    if (!there[index]) continue;
    const row = Math.floor(index / cols);
    const col = index % cols;
    const onEdge = SIDES.some(([dr, dc]) => {
      const r = row + dr;
      const c = col + dc;
      return r < 0 || r >= rows || c < 0 || c >= cols || !there[r * cols + c];
    });
    if (!onEdge) continue;
    there[index] = false;
    if (inOnePiece(there, rows, cols)) toCut--;
    else there[index] = true;
  }
  return there;
}

/**
 * Draws a problem: a board and a target such that the answer lies in the
 * configured range. Returns the board with its answer.
 */
export function drawBoard(random: () => number, config: RectConfig): { board: Board; answer: number } {
  for (let attempt = 0; attempt < DRAWS; attempt++) {
    const irregular = random() * 100 < config.irregularPercent;
    const sizes = irregular ? config.irregularBoards : config.boards;
    const size = sizes[randomInt(random, sizes.length)];
    const there = irregular ? cutOutline(random, size.rows, size.cols, config.cutPercent) : Array.from({ length: size.rows * size.cols }, () => true);
    // the box is drawn close round what is left
    const rowsLeft = Array.from({ length: size.rows }, (_, row) => row).filter((row) => there.slice(row * size.cols, (row + 1) * size.cols).some(Boolean));
    const colsLeft = Array.from({ length: size.cols }, (_, col) => col).filter((col) => rowsLeft.some((row) => there[row * size.cols + col]));
    const cells: Cell[] = [];
    for (const row of rowsLeft) {
      for (const col of colsLeft) {
        if (!there[row * size.cols + col]) {
          cells.push(GAP);
        } else if (random() * 100 < config.blankPercent) {
          cells.push(null);
        } else {
          const magnitude = 1 + randomInt(random, config.maxNumber);
          cells.push(random() < 0.5 ? -magnitude : magnitude);
        }
      }
    }
    // how many rectangles make each sum
    const counts = new Map<number, number>();
    const board: Board = { rows: rowsLeft.length, cols: colsLeft.length, cells, target: 0 };
    for (const rect of everyRect(board.rows, board.cols)) {
      const sum = sumIn(board, rect);
      if (sum !== null) counts.set(sum, (counts.get(sum) ?? 0) + 1);
    }
    const targets = [...counts]
      .filter(([sum, count]) => Math.abs(sum) <= config.maxTarget && count >= config.minAnswer && count <= config.maxAnswer)
      .map(([sum]) => sum)
      .sort((a, b) => a - b);
    if (targets.length === 0) continue;
    const target = targets[randomInt(random, targets.length)];
    return { board: { ...board, target }, answer: counts.get(target) ?? 0 };
  }
  return { board: FALLBACK, answer: solutions(FALLBACK).length };
}

/** How many units must win for the game to end: half of them, the next whole number up when they are odd. */
export function winnersNeeded(units: number): number {
  return Math.ceil(units / 2);
}

/** The unit `player` belongs to, or -1. */
export function unitOf(state: RectState, player: number): number {
  return state.units.findIndex((unit) => unit.members.includes(player));
}

/** The moment the game next needs the clock, in ms since the epoch, or `null` once it is over. */
export function deadline(state: RectState, config: RectConfig): number | null {
  if (state.phase === "answer") return state.floor?.until ?? null;
  if (state.phase === "problem") return state.openedAt + config.problemSeconds * 1000;
  if (state.phase === "pause") return state.pauseUntil;
  return null;
}

function clone(state: RectState): RectState {
  return {
    ...state,
    units: state.units.map((unit) => ({ ...unit, members: [...unit.members] })),
    wrong: [...state.wrong],
    floor: state.floor === null ? null : { ...state.floor },
    history: [...state.history],
  };
}

/** Puts up problem number `round` at `now`. */
function open(state: RectState, round: number, now: number, config: RectConfig): void {
  const source = randomSource(state.rng);
  const drawn = drawBoard(source.next, config);
  state.rng = source.state;
  state.round = round;
  state.board = drawn.board;
  state.answer = drawn.answer;
  state.openedAt = now;
  state.wrong = [];
  state.floor = null;
  state.outcome = null;
  state.pauseUntil = null;
  state.phase = "problem";
  state.history.push({ type: "problem", round });
}

/** The units still racing: those that have not won. */
function playing(state: RectState): number[] {
  return state.units.flatMap((unit, index) => (unit.place === 0 ? [index] : []));
}

/** Closes the open problem with `outcome`: the game ends, or the answer goes on show. */
function close(state: RectState, outcome: Outcome, now: number, config: RectConfig): void {
  state.outcome = outcome;
  state.floor = null;
  const winners = state.units.filter((unit) => unit.place > 0).length;
  if (winners >= winnersNeeded(state.units.length)) {
    state.phase = "ended";
    state.pauseUntil = null;
    state.history.push({ type: "ended", round: state.round, reason: "half" });
  } else if (state.round >= config.maxProblems) {
    state.phase = "ended";
    state.pauseUntil = null;
    state.history.push({ type: "ended", round: state.round, reason: "problems" });
  } else {
    state.phase = "pause";
    state.pauseUntil = now + config.pauseSeconds * 1000;
  }
}

/** The unit `unit` has answered wrong: it is shut out, and the problem goes on, or closes if nobody is left or its time is up. */
function shutOut(state: RectState, unit: number, now: number, config: RectConfig): void {
  state.wrong.push(unit);
  state.floor = null;
  if (playing(state).every((index) => state.wrong.includes(index))) {
    state.history.push({ type: "all-wrong", round: state.round });
    close(state, { kind: "all-wrong" }, now, config);
  } else if (now >= state.openedAt + config.problemSeconds * 1000) {
    // the problem's time ran out while this answer was being given
    state.history.push({ type: "time", round: state.round });
    close(state, { kind: "time" }, now, config);
  } else {
    state.phase = "problem";
  }
}

/**
 * Starts a game at `now`. Players who named the same team number are a team
 * and must be exactly `teamSize`; a player with team 0 plays alone. Units are
 * numbered by their lowest player id.
 */
export function createGame(
  setup: { players: RectPlayer[]; seed: number; now: number },
  config: RectConfig,
): { ok: true; state: RectState } | { ok: false; reason: RectStartRefusal } {
  if (!isValidConfig(config)) return { ok: false, reason: "bad-config" };
  const players = setup.players;
  if (!Array.isArray(players)) return { ok: false, reason: "bad-players" };
  const ids = new Set<number>();
  for (const player of players) {
    if (typeof player !== "object" || player === null || !isWhole(player.id) || !isWhole(player.team) || player.team < 0) {
      return { ok: false, reason: "bad-players" };
    }
    ids.add(player.id);
  }
  if (ids.size !== players.length) return { ok: false, reason: "bad-players" };

  const teams = new Map<number, number[]>();
  const units: Unit[] = [];
  for (const player of players) {
    if (player.team === 0) units.push({ members: [player.id], wins: 0, place: 0 });
    else teams.set(player.team, [...(teams.get(player.team) ?? []), player.id]);
  }
  for (const members of teams.values()) {
    if (members.length !== config.teamSize) return { ok: false, reason: "bad-teams" };
    units.push({ members: [...members].sort((a, b) => a - b), wins: 0, place: 0 });
  }
  if (units.length < 2) return { ok: false, reason: "too-few" };
  units.sort((a, b) => a.members[0] - b.members[0]);

  const state: RectState = {
    version: 1,
    units,
    phase: "problem",
    round: 0,
    board: FALLBACK,
    answer: 0,
    openedAt: setup.now,
    wrong: [],
    floor: null,
    outcome: null,
    pauseUntil: null,
    history: [],
    rng: seedFrom(setup.seed),
  };
  open(state, 1, setup.now, config);
  return { ok: true, state };
}

/** Reads an action off the wire, returning `null` for anything that is not one. */
export function parseAction(raw: unknown): RectAction | null {
  if (typeof raw !== "object" || raw === null) return null;
  const data = raw as Record<string, unknown>;
  if (data.type === "buzz") return { type: "buzz" };
  if (data.type === "answer") return typeof data.count === "number" ? { type: "answer", count: data.count } : null;
  return null;
}

/** What `player` asked for at `now`, applied; or why it was refused. The input state is not modified. */
export function applyAction(state: RectState, player: number, action: RectAction, now: number, config: RectConfig): RectResult {
  if (state.phase === "ended") return { ok: false, reason: "game-over" };
  const unit = unitOf(state, player);
  if (unit < 0) return { ok: false, reason: "not-playing" };

  if (action.type === "buzz") {
    if (state.units[unit].place > 0) return { ok: false, reason: "already-won" };
    if (state.phase !== "problem") return { ok: false, reason: "not-open" };
    if (state.wrong.includes(unit)) return { ok: false, reason: "shut-out" };
    const next = clone(state);
    next.phase = "answer";
    next.floor = { player, unit, until: now + config.answerSeconds * 1000 };
    next.history.push({ type: "buzz", round: state.round, player });
    return { ok: true, state: next };
  }

  if (action.type !== "answer") return { ok: false, reason: "bad-action" };
  if (state.phase !== "answer" || state.floor === null || state.floor.player !== player) return { ok: false, reason: "not-your-answer" };
  if (!isWhole(action.count) || action.count < 0 || action.count > config.maxSaid) return { ok: false, reason: "bad-count" };
  const next = clone(state);
  if (action.count === state.answer) {
    const won = next.units[unit];
    won.wins++;
    next.history.push({ type: "right", round: state.round, player, said: action.count });
    if (won.wins >= config.winsNeeded) {
      won.place = next.units.filter((other) => other.place > 0).length + 1;
      next.history.push({ type: "won", round: state.round, unit, place: won.place });
    }
    close(next, { kind: "right", player, unit }, now, config);
  } else {
    next.history.push({ type: "wrong", round: state.round, player, said: action.count });
    shutOut(next, unit, now, config);
  }
  return { ok: true, state: next };
}

/**
 * What the clock does at `now`: an answer not given in time counts as wrong,
 * an open problem's time runs out, a closed problem gives way to the next.
 * Returns the state unchanged when nothing is due, so calling it twice is safe.
 */
export function applyTimeout(state: RectState, now: number, config: RectConfig): RectState {
  const due = deadline(state, config);
  if (due === null || now < due) return state;
  const next = clone(state);
  if (state.phase === "answer" && state.floor !== null) {
    next.history.push({ type: "silent", round: state.round, player: state.floor.player });
    shutOut(next, state.floor.unit, now, config);
  } else if (state.phase === "problem") {
    next.history.push({ type: "time", round: state.round });
    close(next, { kind: "time" }, now, config);
  } else if (state.phase === "pause") {
    open(next, state.round + 1, now, config);
  }
  return next;
}

/**
 * Closes the open problem when nobody who is there can still answer it:
 * every unit still racing that `there` says is present has answered wrong.
 * A unit that is not there (the caller knows who is) does not hold a problem
 * open for those who are: without this, one player's wrong answer in a game
 * the other had walked out of left them waiting out the whole of the
 * problem's time. Returns the state unchanged when someone there can still
 * answer, when nobody racing is there at all, or when no problem is open for
 * buzzing. The input state is not modified.
 */
export function closeIfSpent(state: RectState, there: (unit: number) => boolean, now: number, config: RectConfig): RectState {
  if (state.phase !== "problem") return state;
  const present = playing(state).filter(there);
  if (present.length === 0 || !present.every((unit) => state.wrong.includes(unit))) return state;
  const next = clone(state);
  next.history.push({ type: "all-wrong", round: state.round });
  close(next, { kind: "all-wrong" }, now, config);
  return next;
}

/**
 * The game ended where it stands, because none of the units still racing has
 * anyone there to go on (who is there is the caller's to know). An open
 * problem stays unanswered. Returns the state unchanged once the game is
 * over. The input state is not modified.
 */
export function abandon(state: RectState): RectState {
  if (state.phase === "ended") return state;
  const next = clone(state);
  next.phase = "ended";
  next.floor = null;
  next.pauseUntil = null;
  next.history.push({ type: "ended", round: state.round, reason: "abandoned" });
  return next;
}

/**
 * The same game with every clock in it moved on by `by` ms: for a game that
 * stood still for that long (nobody was there to play it). The input state is
 * not modified.
 */
export function shiftClock(state: RectState, by: number): RectState {
  if (by === 0) return state;
  return {
    ...state,
    openedAt: state.openedAt + by,
    floor: state.floor === null ? null : { ...state.floor, until: state.floor.until + by },
    pauseUntil: state.pauseUntil === null ? null : state.pauseUntil + by,
  };
}

/**
 * The game as `player` may see it (`null` for someone watching). Everything
 * is in the open except how many rectangles make the target, which is shown
 * with the rectangles themselves once the problem is closed.
 */
export function viewFor(state: RectState, player: number | null): RectView {
  const unit = player === null ? -1 : unitOf(state, player);
  const closed = state.outcome !== null;
  return {
    you: player !== null && unit >= 0 ? { player, unit } : null,
    phase: state.phase,
    round: state.round,
    units: state.units.map((each) => ({ ...each, members: [...each.members] })),
    winnersNeeded: winnersNeeded(state.units.length),
    board: { ...state.board, cells: [...state.board.cells] },
    wrong: [...state.wrong],
    floor: state.floor === null ? null : { player: state.floor.player, unit: state.floor.unit },
    outcome: state.outcome,
    answer: closed ? state.answer : null,
    solutions: closed ? solutions(state.board) : null,
    history: [...state.history],
  };
}
