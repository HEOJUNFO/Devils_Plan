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
 * sits out; the race ends when half the teams have won.
 *
 * With the mini-game goes the third either-or choice of the main match it is
 * part of ({@link Card}), made once the race is over: it is how the document
 * shares out the race's points. A winning team and a losing team each decide
 * by majority how theirs fall between its leader and the other two; a player
 * alone takes a small loss or plays an added contest for more.
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
  /**
   * Whether the third either-or choice is made once the race is over. Off,
   * the game ends with the race and nobody is given points: the document's
   * points cannot be shared out without the choice.
   */
  settle: boolean;
  /** Seconds everyone has for that choice. Not in the document. */
  chooseSeconds: number;
  /** What the race is worth (the document): a player alone wins 7 or loses 3, and a winning team shares 7. */
  winPoints: number;
  losePoints: number;
  /** A winning team's shares: 독식 gives its leader 5 and the others 1 each, 헌신 its leader 1 and the others 3 each. */
  hogLeader: number;
  hogMember: number;
  devoteLeader: number;
  devoteMember: number;
  /** A losing team's: with 희생 its leader alone loses 3, with 질책 the others lose 2 each. */
  sacrificeLeader: number;
  blameMember: number;
  /** What 안전 costs a player alone, and what 도전's added contest costs its losers and gives its winner in pieces. */
  safeLoss: number;
  duelLoss: number;
  duelPieces: number;
  /** Problems the added contest runs to at most; with nobody right by then, nobody has won it. Not in the document. */
  duelProblems: number;
  /** What the room chooses for a player who has not chosen in time, by their card. Not in the document. */
  defaultOptions: { winners: number; losers: number; alone: number };
}

/**
 * A player as the game is started with: `id` tells them apart, `team` is 0
 * for alone or the number of a team. `since` orders the players of a team by
 * when they took it: the first is its leader (absent: the lowest id).
 */
export interface RectPlayer {
  id: number;
  team: number;
  since?: number;
}

/** A team of three, or a player alone. */
export interface Unit {
  /** The ids of its players, lowest first. */
  members: number[];
  /** Problems it has answered right. */
  wins: number;
  /** The order in which it became a winner, from 1; 0 while it has not. */
  place: number;
  /** A team's leader, the document's "대표": whose share of the points differs from the others'. `null` for a player alone. */
  leader: number | null;
}

/** One of the two options of a choice. */
export type Option = 1 | 2;

/**
 * Which card of the third choice a player is given, by how their side came
 * out of the race. `winners`, to a team that won: 1 독식, 2 헌신. `losers`,
 * to a team that did not: 1 희생, 2 질책. `alone`, to a player without a
 * team, winner or not: 1 도전 (the added contest), 2 안전.
 */
export type Card = "winners" | "losers" | "alone";

/** What a player chose. `forced`: the room chose for them when their time was up. */
export interface Chosen {
  player: number;
  option: Option;
  forced: boolean;
}

/** What a team decided: the option most of its players chose. */
export interface Decision {
  unit: number;
  option: Option;
}

/**
 * The added contest of those who chose 도전: problems of the game itself,
 * put to them alone. Whoever first answers one right has won it and all the
 * others have lost.
 */
export interface Duel {
  /** Who is in it, lowest id first. */
  players: number[];
  /** Which of its problems this is, from 1. */
  round: number;
  /** Who won it; `null` while it goes on, and for good when nobody did. */
  winner: number | null;
}

/** How a player's points came about. */
export interface ScoreLine {
  player: number;
  /** What the race gave or took: all of it for a player alone, their share of it in a team. */
  race: number;
  /** What their own choice took: 안전's price, or the added contest lost. Nought in a team. */
  choice: number;
  /** Pieces won in the added contest. They are the main match's, and count for nothing here. */
  pieces: number;
  /** `race` and `choice` together. */
  total: number;
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
 * answering, a closed problem's answer is on show, the third choice is being
 * made, or the game is over. The first three are the race's, and after the
 * choice the added contest's ({@link RectState.duel}).
 */
export type RectPhase = "problem" | "answer" | "pause" | "choose" | "ended";

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
  /** `duel`: which problem of the added contest it is, when it is one. */
  | { type: "problem"; round: number; duel?: number }
  | { type: "buzz"; round: number; player: number }
  | { type: "right"; round: number; player: number; said: number }
  | { type: "wrong"; round: number; player: number; said: number }
  /** The player who buzzed said nothing in time; it counts as a wrong answer. */
  | { type: "silent"; round: number; player: number }
  | { type: "time"; round: number }
  | { type: "all-wrong"; round: number }
  | { type: "won"; round: number; unit: number; place: number }
  /** The race is over and the third choice is up. `half`, `problems`: as for `ended`. */
  | { type: "raced"; round: number; reason: "half" | "problems" }
  /** Everyone has chosen: what each player chose, and what each team decided by it. */
  | { type: "choice"; chosen: Chosen[]; decisions: Decision[] }
  /** The added contest begins, between `players`. */
  | { type: "duel"; players: number[] }
  /** It is over: who won it, or `null` when nobody answered right in the problems it had. */
  | { type: "duel-over"; winner: number | null }
  | { type: "score"; lines: ScoreLine[] }
  /**
   * `half`: enough units have won. `problems`: the last problem allowed has
   * been played. `abandoned`: nobody who could still win is there to go on.
   */
  | { type: "ended"; round: number; reason: "half" | "problems" | "abandoned" };

/** A game in progress. Holds the answer to the open problem: send only {@link viewFor} of it. */
export interface RectState {
  version: 2;
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
  /** How the race ended, once it has: the third choice follows it. `null` during the race and in a game without the choice. */
  raced: "half" | "problems" | null;
  /** Since when the third choice has been up; `null` when it is not. */
  choosing: { since: number } | null;
  /** What each player has chosen so far, in the order they did. Secret until everyone has. */
  choices: Chosen[];
  /** What each team decided, once everyone has chosen. */
  decisions: Decision[];
  /** The added contest, once the choices call for one. */
  duel: Duel | null;
  /** Everyone's points, once the game is over; `null` before, and for a game that gives none. */
  scores: ScoreLine[] | null;
  history: RectEvent[];
  /** The generator's state: the next board is drawn from here. */
  rng: number;
}

/** What a player can ask for. */
export type RectAction = { type: "buzz" } | { type: "answer"; count: number } | { type: "choose"; option: number };

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
  /** No choice is being made now. */
  | "not-choosing"
  /** A choice once made stands. */
  | "already-chosen"
  /** The added contest is between those who chose it. */
  | "not-in-duel"
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
  /** Nobody at all. */
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
  /**
   * The third choice while it is being made: the viewer's card (`null` for
   * someone watching), who has chosen so far, and what the viewer chose.
   * What the others chose is not sent until everyone has.
   */
  choosing: { card: Card | null; chosen: number[]; mine: Option | null } | null;
  /** What everyone chose and each team decided, once everyone has chosen. */
  choices: Chosen[];
  decisions: Decision[];
  duel: Duel | null;
  scores: ScoreLine[] | null;
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
  if (!sizes(config.irregularBoards) || (config.irregularPercent !== 0 && config.irregularBoards.length === 0)) return false;
  if (typeof config.settle !== "boolean") return false;
  if (![config.chooseSeconds, config.duelProblems].every((value) => isWhole(value) && value >= 1)) return false;
  const amounts = [
    config.winPoints,
    config.losePoints,
    config.hogLeader,
    config.hogMember,
    config.devoteLeader,
    config.devoteMember,
    config.sacrificeLeader,
    config.blameMember,
    config.safeLoss,
    config.duelLoss,
    config.duelPieces,
  ];
  if (!amounts.every((value) => isWhole(value) && value >= 0)) return false;
  const defaults = config.defaultOptions;
  return typeof defaults === "object" && defaults !== null && [defaults.winners, defaults.losers, defaults.alone].every((option) => option === 1 || option === 2);
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
  if (state.phase === "choose") return state.choosing === null ? null : state.choosing.since + config.chooseSeconds * 1000;
  return null;
}

function clone(state: RectState): RectState {
  return {
    ...state,
    units: state.units.map((unit) => ({ ...unit, members: [...unit.members] })),
    wrong: [...state.wrong],
    floor: state.floor === null ? null : { ...state.floor },
    choosing: state.choosing === null ? null : { ...state.choosing },
    choices: [...state.choices],
    decisions: [...state.decisions],
    duel: state.duel === null ? null : { ...state.duel, players: [...state.duel.players] },
    scores: state.scores === null ? null : [...state.scores],
    history: [...state.history],
  };
}

/** Which card of the third choice `player` is given, or `null` for someone who is not in the game. */
export function cardOf(state: RectState, player: number): Card | null {
  const unit = state.units[unitOf(state, player)];
  if (unit === undefined) return null;
  if (unit.members.length === 1) return "alone";
  return unit.place > 0 ? "winners" : "losers";
}

/** What `player` chose, or `null` while they have not. */
export function optionOf(state: Pick<RectState, "choices">, player: number): Option | null {
  return state.choices.find((chosen) => chosen.player === player)?.option ?? null;
}

/** The players whose choice the game is waiting for, lowest id first. */
export function awaited(state: RectState): number[] {
  if (state.phase !== "choose") return [];
  return state.units
    .flatMap((unit) => unit.members)
    .filter((player) => optionOf(state, player) === null)
    .sort((a, b) => a - b);
}

/** What the room chooses for `player` when their time is up. */
function defaultFor(state: RectState, player: number, config: RectConfig): Option {
  const card = cardOf(state, player) ?? "alone";
  return config.defaultOptions[card] === 1 ? 1 : 2;
}

/**
 * Everyone's points, by rule 9 of the document and the third choice. A
 * player alone has the race's points whole, less what their own choice took;
 * a team's are shared as it decided, its leader's share apart from the
 * others'. A team whose decision is not there (the choice was never made)
 * is given the one the room would have chosen.
 */
export function scoreLines(state: RectState, config: RectConfig): ScoreLine[] {
  const lines: ScoreLine[] = [];
  state.units.forEach((unit, index) => {
    const won = unit.place > 0;
    if (unit.members.length === 1) {
      const player = unit.members[0];
      const race = won ? config.winPoints : -config.losePoints;
      const dares = (optionOf(state, player) ?? defaultFor(state, player, config)) === 1;
      const beat = dares && state.duel !== null && state.duel.winner === player;
      const choice = !dares ? -config.safeLoss : beat ? 0 : -config.duelLoss;
      lines.push({ player, race, choice, pieces: beat ? config.duelPieces : 0, total: race + choice });
      return;
    }
    const decided = state.decisions.find((each) => each.unit === index)?.option ?? defaultFor(state, unit.members[0], config);
    for (const player of unit.members) {
      const leads = player === unit.leader;
      const race = won
        ? decided === 1
          ? leads
            ? config.hogLeader
            : config.hogMember
          : leads
            ? config.devoteLeader
            : config.devoteMember
        : decided === 1
          ? leads
            ? -config.sacrificeLeader
            : 0
          : leads
            ? 0
            : -config.blameMember;
      lines.push({ player, race, choice: 0, pieces: 0, total: race });
    }
  });
  return lines.sort((a, b) => a.player - b.player);
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
  state.history.push(state.duel === null ? { type: "problem", round } : { type: "problem", round, duel: state.duel.round });
}

/** The units a problem is put to: those that have not won, or in the added contest those of its players. */
function playing(state: RectState): number[] {
  const duel = state.duel;
  if (duel !== null) return state.units.flatMap((unit, index) => (unit.members.some((player) => duel.players.includes(player)) ? [index] : []));
  return state.units.flatMap((unit, index) => (unit.place === 0 ? [index] : []));
}

/** The game is over: the points are counted, where it gives any. */
function finish(state: RectState, config: RectConfig): void {
  state.pauseUntil = null;
  state.choosing = null;
  state.scores = scoreLines(state, config);
  state.history.push({ type: "score", lines: state.scores });
  state.phase = "ended";
  state.history.push({ type: "ended", round: state.round, reason: state.raced ?? "half" });
}

/** The race is over for `reason`: the third choice is put to everyone, or without it the game ends here. */
function endRace(state: RectState, reason: "half" | "problems", now: number, config: RectConfig): void {
  state.pauseUntil = null;
  if (!config.settle) {
    state.phase = "ended";
    state.history.push({ type: "ended", round: state.round, reason });
    return;
  }
  state.raced = reason;
  state.phase = "choose";
  state.choosing = { since: now };
  state.history.push({ type: "raced", round: state.round, reason });
}

/** Closes the open problem with `outcome`: the race or the added contest ends, or the answer goes on show. */
function close(state: RectState, outcome: Outcome, now: number, config: RectConfig): void {
  state.outcome = outcome;
  state.floor = null;
  if (state.duel !== null) {
    // the added contest: over with the first right answer, or with its last problem
    if (state.duel.winner !== null || state.duel.round >= config.duelProblems) {
      state.history.push({ type: "duel-over", winner: state.duel.winner });
      finish(state, config);
    } else {
      state.phase = "pause";
      state.pauseUntil = now + config.pauseSeconds * 1000;
    }
    return;
  }
  const winners = state.units.filter((unit) => unit.place > 0).length;
  if (winners >= winnersNeeded(state.units.length)) endRace(state, "half", now, config);
  else if (state.round >= config.maxProblems) endRace(state, "problems", now, config);
  else {
    state.phase = "pause";
    state.pauseUntil = now + config.pauseSeconds * 1000;
  }
}

/**
 * Everyone has chosen: each team's decision is what most of its players
 * chose (what the room would choose, should they be evenly split), and the
 * players alone who chose 도전 play the added contest. With nobody for it
 * the game is over.
 */
function resolve(state: RectState, now: number, config: RectConfig): void {
  state.choosing = null;
  state.decisions = state.units.flatMap((unit, index) => {
    if (unit.members.length === 1) return [];
    const first = unit.members.filter((player) => optionOf(state, player) === 1).length;
    const second = unit.members.length - first;
    const option: Option = first > second ? 1 : second > first ? 2 : defaultFor(state, unit.members[0], config);
    return [{ unit: index, option }];
  });
  state.history.push({ type: "choice", chosen: [...state.choices], decisions: [...state.decisions] });
  const daring = state.units
    .filter((unit) => unit.members.length === 1 && optionOf(state, unit.members[0]) === 1)
    .map((unit) => unit.members[0])
    .sort((a, b) => a - b);
  if (daring.length === 0) {
    finish(state, config);
    return;
  }
  state.duel = { players: daring, round: 1, winner: null };
  state.history.push({ type: "duel", players: [...daring] });
  open(state, state.round + 1, now, config);
}

/** `player` chose `option`; with everyone's choice in, they are settled. */
function chose(state: RectState, player: number, option: Option, forced: boolean, now: number, config: RectConfig): void {
  state.choices.push({ player, option, forced });
  if (awaited(state).length === 0) resolve(state, now, config);
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
    if (player.since !== undefined && typeof player.since !== "number") return { ok: false, reason: "bad-players" };
    ids.add(player.id);
  }
  if (ids.size !== players.length) return { ok: false, reason: "bad-players" };

  const teams = new Map<number, RectPlayer[]>();
  const units: Unit[] = [];
  for (const player of players) {
    if (player.team === 0) units.push({ members: [player.id], wins: 0, place: 0, leader: null });
    else teams.set(player.team, [...(teams.get(player.team) ?? []), player]);
  }
  for (const members of teams.values()) {
    if (members.length !== config.teamSize) return { ok: false, reason: "bad-teams" };
    // the leader: whoever took the team first, and of those who cannot be told apart by that the lowest id
    const leader = [...members].sort((a, b) => (a.since ?? Infinity) - (b.since ?? Infinity) || a.id - b.id)[0];
    units.push({ members: members.map((member) => member.id).sort((a, b) => a - b), wins: 0, place: 0, leader: leader.id });
  }
  // one unit alone is a game: a player, or a team of three, with the problems to get right and nobody to race
  if (units.length < 1) return { ok: false, reason: "too-few" };
  units.sort((a, b) => a.members[0] - b.members[0]);

  const state: RectState = {
    version: 2,
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
    raced: null,
    choosing: null,
    choices: [],
    decisions: [],
    duel: null,
    scores: null,
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
  if (data.type === "choose") return typeof data.option === "number" ? { type: "choose", option: data.option } : null;
  return null;
}

/** What `player` asked for at `now`, applied; or why it was refused. The input state is not modified. */
export function applyAction(state: RectState, player: number, action: RectAction, now: number, config: RectConfig): RectResult {
  if (state.phase === "ended") return { ok: false, reason: "game-over" };
  const unit = unitOf(state, player);
  if (unit < 0) return { ok: false, reason: "not-playing" };

  if (action.type === "choose") {
    if (state.phase !== "choose") return { ok: false, reason: "not-choosing" };
    if (action.option !== 1 && action.option !== 2) return { ok: false, reason: "bad-action" };
    if (optionOf(state, player) !== null) return { ok: false, reason: "already-chosen" };
    const next = clone(state);
    chose(next, player, action.option, false, now, config);
    return { ok: true, state: next };
  }

  if (action.type === "buzz") {
    // the added contest is its players' alone; in the race a unit that has won sits out
    if (state.duel !== null && !state.duel.players.includes(player)) return { ok: false, reason: "not-in-duel" };
    if (state.duel === null && state.units[unit].place > 0) return { ok: false, reason: "already-won" };
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
    next.history.push({ type: "right", round: state.round, player, said: action.count });
    if (next.duel !== null) {
      // the first right answer wins the added contest
      next.duel.winner = player;
    } else {
      const won = next.units[unit];
      won.wins++;
      if (won.wins >= config.winsNeeded) {
        won.place = next.units.filter((other) => other.place > 0).length + 1;
        next.history.push({ type: "won", round: state.round, unit, place: won.place });
      }
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
    if (next.duel !== null) next.duel.round++;
    open(next, state.round + 1, now, config);
  } else if (state.phase === "choose") {
    // the room chooses for everyone who has not: the last of them settles the choice
    for (const player of awaited(state)) chose(next, player, defaultFor(next, player, config), true, now, config);
  }
  return next;
}

/**
 * The room chooses for `player`, whose choice the game is waiting for: what
 * it would choose for them at the end of the time, without waiting for it
 * (they have left the room). Returns the state unchanged when no choice of
 * theirs is awaited. The input state is not modified.
 */
export function moveFor(state: RectState, player: number, now: number, config: RectConfig): RectState {
  if (!awaited(state).includes(player)) return state;
  const next = clone(state);
  chose(next, player, defaultFor(next, player, config), true, now, config);
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
  next.choosing = null;
  next.history.push({ type: "ended", round: state.round, reason: "abandoned" });
  return next;
}

/**
 * The added contest ended where it stands with nobody having won it: none of
 * its players is there to go on (who is there is the caller's to know). The
 * race and the choices stand, and the points are counted. Returns the state
 * unchanged when no contest is on. The input state is not modified.
 */
export function endDuel(state: RectState, config: RectConfig): RectState {
  if (state.phase === "ended" || state.duel === null) return state;
  const next = clone(state);
  next.floor = null;
  next.history.push({ type: "duel-over", winner: null });
  finish(next, config);
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
    choosing: state.choosing === null ? null : { since: state.choosing.since + by },
  };
}

/**
 * The game as `player` may see it (`null` for someone watching). Everything
 * is in the open except how many rectangles make the target, which is shown
 * with the rectangles themselves once the problem is closed, and what the
 * others have chosen while the third choice is still being made.
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
    choosing:
      state.phase !== "choose"
        ? null
        : {
            card: player === null ? null : cardOf(state, player),
            chosen: state.choices.map((chosen) => chosen.player),
            mine: player === null ? null : optionOf(state, player),
          },
    // what is still being chosen is nobody's to see but the chooser's
    choices: state.phase === "choose" ? [] : [...state.choices],
    decisions: [...state.decisions],
    duel: state.duel === null ? null : { ...state.duel, players: [...state.duel.players] },
    scores: state.scores === null ? null : [...state.scores],
    history: [...state.history],
  };
}
