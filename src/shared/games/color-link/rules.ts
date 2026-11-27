/**
 * The rules of 컬러 링크 (Color Link), the second game of the show's final.
 *
 * Design: design/games/color-link.md. Two players and a board of squares
 * that is another one every round; some boards come with a black pair (X)
 * and a white pair (Y) on them. There are 28 pieces of 14 colours, two of a
 * colour, known by the letters A to N. The round's first player places one
 * piece; from then on a turn is two pieces of different colours. The two
 * pieces of a colour have to be joined by a path of at least six squares,
 * their own two included, and no two paths may overlap or cross; a piece
 * with no partner yet has to be one that can still be joined to it. Nobody
 * checks that while pieces are placed. Instead of placing, a player may
 * declare the board impossible: whoever placed last then has to prove the
 * connections, placing the partner of every piece without one and drawing a
 * path for every pair. A proof earns the prover a point, a failed one earns
 * it the declarer. Five rounds, and the first to three points wins.
 *
 * Everything here is a pure function of what it is given. A state is plain
 * JSON, and nothing in it is hidden: both players see all of it.
 */
import { randomInt, randomSource, seedFrom } from "../../game/rng";

/** A board as the config has it: a row of squares after another, from the top. See {@link EMPTY}, {@link NONE} and the letters. */
export interface BoardPlan {
  rows: string[];
}

/** The numbers of the game. The brief says which are the show's and which are filled in for a room. */
export interface LinkConfig {
  /** The letters the pieces of a colour are known by: two pieces of each. */
  letters: string;
  /** The letters of the pairs a board may come with. */
  fixed: string;
  /** The fewest squares a path has, the two it joins included. */
  minPath: number;
  /** How many pieces a round's first turn is, and every turn after it. */
  firstPieces: number;
  turnPieces: number;
  /** How many rounds there are at most, and the points that win. */
  rounds: number;
  goal: number;
  /** Seconds to place a turn's pieces, to choose who goes first, and to prove the connections. */
  placeSeconds: number;
  chooseSeconds: number;
  proveSeconds: number;
  /** Seconds a round's outcome is on show before the next board. Not in the show. */
  showSeconds: number;
  /** The boards, one for each round in turn. */
  boards: BoardPlan[];
}

/** A square with nothing on it, and what is no square of the board at all. */
export const EMPTY = ".";
export const NONE = "#";

const isWhole = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);

/** The board of a round: how many squares across and down, and what is on each, a row after another from the top. */
export interface Board {
  width: number;
  height: number;
  cells: string;
}

/** `plan` as a board; `null` where its rows are not all as long, or there are none. */
export function boardOf(plan: BoardPlan): Board | null {
  const rows = plan.rows;
  if (!Array.isArray(rows) || rows.length === 0 || rows.some((row) => typeof row !== "string" || row.length !== rows[0].length || row.length === 0)) return null;
  return { width: rows[0].length, height: rows.length, cells: rows.join("") };
}

/** How many of `piece` are on `cells`. */
const countOf = (cells: string, piece: string): number => [...cells].filter((cell) => cell === piece).length;

/** Whether a game can be played with `config`. */
export function isValidConfig(config: LinkConfig): boolean {
  if (typeof config.letters !== "string" || config.letters.length < 2 || new Set(config.letters).size !== config.letters.length) return false;
  if (typeof config.fixed !== "string" || new Set(config.fixed + config.letters).size !== config.fixed.length + config.letters.length) return false;
  if ([...config.letters, ...config.fixed].some((letter) => letter === EMPTY || letter === NONE)) return false;
  if (!isWhole(config.minPath) || config.minPath < 2) return false;
  if (!isWhole(config.firstPieces) || config.firstPieces < 1 || !isWhole(config.turnPieces) || config.turnPieces < 1 || config.turnPieces > config.letters.length) return false;
  if (!isWhole(config.goal) || config.goal < 1 || !isWhole(config.rounds) || config.rounds < config.goal || config.rounds > config.goal * 2 - 1) return false;
  if (!(config.placeSeconds > 0) || !(config.chooseSeconds > 0) || !(config.proveSeconds > 0) || !(config.showSeconds > 0)) return false;
  if (!Array.isArray(config.boards) || config.boards.length < config.rounds) return false;
  return config.boards.every((plan) => {
    const board = boardOf(plan);
    if (board === null || board.width > 16 || board.height > 16) return false;
    // nothing on a board to begin with but the pairs it comes with, both pieces of each or neither
    if ([...board.cells].some((cell) => cell !== EMPTY && cell !== NONE && !config.fixed.includes(cell))) return false;
    return [...config.fixed].every((letter) => [0, 2].includes(countOf(board.cells, letter)));
  });
}

/** A piece to be placed: which letter, and on which square (a row's times the board's width, plus the column's). */
export interface Placing {
  letter: string;
  cell: number;
}

/** Why pieces are not ones a player may place. */
export type PlacingRefusal =
  /** Not as many pieces as the turn is, or not a letter and a square of the board each. */
  | "bad-pieces"
  /** A square that is taken, or the same square twice. */
  | "cell-taken"
  /** Two pieces of a turn have the same colour. */
  | "same-colour"
  /** Both pieces of that colour are on the board. */
  | "colour-used";

/**
 * Whether `pieces` are a turn of `count` that may be placed on `board`:
 * `null`, or why not. Whether they can ever be joined is not looked at.
 */
export function checkPlacing(board: Board, pieces: readonly Placing[], count: number, config: Pick<LinkConfig, "letters">): PlacingRefusal | null {
  if (pieces.length !== count) return "bad-pieces";
  if (!pieces.every((piece) => typeof piece.letter === "string" && piece.letter.length === 1 && config.letters.includes(piece.letter) && isWhole(piece.cell) && piece.cell >= 0 && piece.cell < board.cells.length)) return "bad-pieces";
  if (new Set(pieces.map((piece) => piece.cell)).size !== pieces.length || pieces.some((piece) => board.cells[piece.cell] !== EMPTY)) return "cell-taken";
  if (new Set(pieces.map((piece) => piece.letter)).size !== pieces.length) return "same-colour";
  return pieces.some((piece) => countOf(board.cells, piece.letter) >= 2) ? "colour-used" : null;
}

/** The letters of which fewer than two pieces are on `cells`: those a piece can still be placed of. */
export function lettersLeft(cells: string, config: Pick<LinkConfig, "letters">): string[] {
  return [...config.letters].filter((letter) => countOf(cells, letter) < 2);
}

/** Whether a turn of `count` pieces can be placed on `board` at all: squares enough, and colours enough. */
export function canPlace(board: Board, count: number, config: Pick<LinkConfig, "letters">): boolean {
  return countOf(board.cells, EMPTY) >= count && lettersLeft(board.cells, config).length >= count;
}

/** The letters with one piece on `cells` and no partner, in the order of the letters. */
export function unpaired(cells: string, config: Pick<LinkConfig, "letters">): string[] {
  return [...config.letters].filter((letter) => countOf(cells, letter) === 1);
}

/** `cells` with `pieces` on it. */
function withPieces(cells: string, pieces: readonly Placing[]): string {
  const next = [...cells];
  for (const piece of pieces) next[piece.cell] = piece.letter;
  return next.join("");
}

/** Why a proof is not one. */
export type ProofRefusal =
  /** Not the partner of every piece without one, each on an empty square of its own. */
  | "bad-partners"
  /** Something that is no path: fewer than two squares, or a square that is not of the board. */
  | "bad-path"
  /** A path does not begin and end on the two pieces of one colour. */
  | "wrong-ends"
  /** A pair has two paths, or none. */
  | "pair-missing"
  /** A step of a path is not to the square beside, above or below. */
  | "not-adjacent"
  /** A path goes over a piece that is not one of its two. */
  | "through-piece"
  /** Two paths share a square, or a path comes back to one of its own. */
  | "paths-overlap"
  /** A path has fewer squares than a path must. */
  | "path-too-short";

/**
 * Whether `paths` prove the connections of `board` once `partners` are
 * placed on it: `null`, or why not. `partners` are the second piece of every
 * colour that has one piece. A path is the squares it goes over from one
 * piece of a pair to the other, both included; a step is to the square
 * beside, above or below.
 */
export function checkProof(board: Board, partners: readonly Placing[], paths: readonly (readonly number[])[], config: Pick<LinkConfig, "letters" | "fixed" | "minPath">): ProofRefusal | null {
  const alone = unpaired(board.cells, config);
  if (partners.length !== alone.length || !alone.every((letter) => partners.some((piece) => piece.letter === letter))) return "bad-partners";
  if (!partners.every((piece) => isWhole(piece.cell) && piece.cell >= 0 && piece.cell < board.cells.length && board.cells[piece.cell] === EMPTY)) return "bad-partners";
  if (new Set(partners.map((piece) => piece.cell)).size !== partners.length) return "bad-partners";
  const cells = withPieces(board.cells, partners);
  const pairs = [...config.fixed, ...config.letters].filter((letter) => countOf(cells, letter) === 2);
  const joined = new Set<string>();
  const used = new Set<number>();
  for (const path of paths) {
    if (!Array.isArray(path) || path.length < 2 || !path.every((cell) => isWhole(cell) && cell >= 0 && cell < cells.length && cells[cell] !== NONE)) return "bad-path";
    const letter = cells[path[0]];
    if (!pairs.includes(letter) || cells[path[path.length - 1]] !== letter || path[0] === path[path.length - 1]) return "wrong-ends";
    if (joined.has(letter)) return "pair-missing";
    joined.add(letter);
    for (let at = 0; at < path.length; at++) {
      const cell = path[at];
      if (at > 0) {
        const before = path[at - 1];
        const [dx, dy] = [(cell % board.width) - (before % board.width), Math.floor(cell / board.width) - Math.floor(before / board.width)];
        if (Math.abs(dx) + Math.abs(dy) !== 1) return "not-adjacent";
      }
      if (at > 0 && at < path.length - 1 && cells[cell] !== EMPTY) return "through-piece";
      if (used.has(cell)) return "paths-overlap";
      used.add(cell);
    }
    if (path.length < config.minPath) return "path-too-short";
  }
  return joined.size === pairs.length ? null : "pair-missing";
}

/**
 * Where a game stands: the loser of the last round chooses who goes first,
 * pieces are placed, the connections are proved, a round's outcome is on
 * show; or the game is over.
 */
export type LinkPhase = "choose" | "place" | "prove" | "show" | "ended";

/** Why a game is over: three points, one of its two left, or nobody left to go on with it. */
export type LinkEnd = "played" | "left" | "abandoned";

/**
 * How a round came out: the connections were proved, the proof was given
 * up, its time ran out, or a turn's time ran out with no pieces placed.
 */
export type RoundHow = "proved" | "forfeit" | "unproved" | "late";

/** A round that was played. */
export interface RoundLine {
  round: number;
  /** Who has the round's point. */
  winner: number;
  how: RoundHow;
  /** Who declared the board impossible and who had to prove it; `null` where a turn's time ran out. */
  declarer: number | null;
  prover: number | null;
  /** How many pieces the players had placed. */
  pieces: number;
  /** The board as the round left it, with the partners a proof placed. */
  cells: string;
  /** The paths of the proof, where the connections were proved. */
  paths: number[][];
}

/** Something that happened, as everyone is told it. */
export type LinkEvent =
  | { type: "round"; round: number }
  | { type: "chose"; player: number; first: number; forced: boolean }
  | { type: "placed"; player: number; pieces: Placing[] }
  | { type: "declared"; player: number; prover: number }
  | { type: "round-over"; round: number; winner: number; how: RoundHow }
  | { type: "ended"; reason: LinkEnd };

/** How many of the latest events a state keeps. */
export const HISTORY_KEPT = 24;

/** One game, as the room stores it. Nothing in it is hidden from its players. */
export interface LinkState {
  version: 1;
  /** The two players, by the number each is known by, in the order of their numbers. */
  players: number[];
  /** Which round is being played, from 1. */
  round: number;
  phase: LinkPhase;
  scores: { player: number; points: number }[];
  /** The round's board. */
  board: Board;
  /** Who chooses who goes first, while that is chosen; `null` otherwise. */
  chooser: number | null;
  /** Who goes first in the round; `null` until it is chosen. */
  first: number | null;
  /** Whose turn it is to place or to declare; `null` outside a turn. */
  turn: number | null;
  /** How many pieces the players have placed in the round. */
  pieces: number;
  /** Who placed last in the round; `null` while nobody has. */
  last: number | null;
  /** Who declared the board impossible and who is proving it, while it is proved; `null` otherwise. */
  declarer: number | null;
  prover: number | null;
  /** The rounds that have been played. */
  log: RoundLine[];
  /** Who won; `null` while nobody has. */
  winner: number | null;
  /** When the last thing was done, in ms since the epoch. */
  at: number;
  /** When the step being played is over, in ms since the epoch; `null` once the game is over. */
  until: number | null;
  /** The state of the game's own random sequence. */
  rng: number;
  /** The latest things that happened, and how many have happened in all. */
  history: LinkEvent[];
  events: number;
  /** Why the game is over; `null` while it is played. */
  ended: LinkEnd | null;
}

/** What a player can ask. */
export type LinkAction =
  /** I go first (or second) in this round. */
  | { type: "choose"; first: boolean }
  /** These are my turn's pieces. */
  | { type: "place"; pieces: Placing[] }
  /** This board cannot be connected. */
  | { type: "declare" }
  /** These are the partners and the paths. */
  | { type: "prove"; partners: Placing[]; paths: number[][] }
  /** I give up the proof. */
  | { type: "forfeit" };

/** Why something asked was refused. */
export type LinkRefusal =
  | PlacingRefusal
  | ProofRefusal
  /** Who goes first is not being chosen now, or not by this player. */
  | "not-choosing"
  /** No pieces are being placed now. */
  | "not-placing"
  /** It is the other player's turn. */
  | "not-your-turn"
  /** Nobody has placed a piece in this round yet: there is nobody to prove anything. */
  | "nothing-placed"
  /** No proof is being made now, or not by this player. */
  | "not-proving"
  /** The player is not one of the game's two. */
  | "not-playing"
  /** Not something a player can ask. */
  | "bad-action"
  /** The game is over. */
  | "game-over";

export type LinkResult = { ok: true; state: LinkState } | { ok: false; reason: LinkRefusal };

/** Why a game was not started. */
export type LinkStartRefusal = "bad-config" | "too-few" | "too-many" | "bad-players";

/** A game as one player sees it. */
export interface LinkView {
  phase: LinkPhase;
  /** The number of the player this is for; `null` for someone watching. */
  you: number | null;
  players: number[];
  round: number;
  scores: { player: number; points: number }[];
  board: Board;
  chooser: number | null;
  first: number | null;
  turn: number | null;
  /** How many pieces the turn being played is; 0 outside a turn. */
  due: number;
  /** Whether the player whose turn it is can place that many at all; if not, all there is to do is declare. */
  room: boolean;
  pieces: number;
  last: number | null;
  declarer: number | null;
  prover: number | null;
  log: RoundLine[];
  winner: number | null;
  /** How the game ended for each player, once it is played to its end. */
  places: { player: number; place: number }[] | null;
  history: LinkEvent[];
  events: number;
  ended: LinkEnd | null;
}

function clone(state: LinkState): LinkState {
  return {
    ...state,
    scores: state.scores.map((each) => ({ ...each })),
    board: { ...state.board },
    log: [...state.log],
    history: [...state.history],
  };
}

/** Records something that happened, at `now`. `state` is changed. */
function tell(state: LinkState, event: LinkEvent, now?: number): void {
  if (now !== undefined) state.at = now;
  state.history.push(event);
  if (state.history.length > HISTORY_KEPT) state.history.splice(0, state.history.length - HISTORY_KEPT);
  state.events += 1;
}

const otherOf = (state: Pick<LinkState, "players">, player: number): number => state.players.find((each) => each !== player) ?? player;

/** How many pieces the turn being played is: one for the round's first, two after it. */
export function dueOf(state: Pick<LinkState, "phase" | "pieces">, config: Pick<LinkConfig, "firstPieces" | "turnPieces">): number {
  if (state.phase !== "place") return 0;
  return state.pieces === 0 ? config.firstPieces : config.turnPieces;
}

/** `first` goes first: their turn begins. `state` is changed. */
function openTurns(state: LinkState, first: number, now: number, config: LinkConfig): void {
  state.phase = "place";
  state.chooser = null;
  state.first = first;
  state.turn = first;
  state.until = now + config.placeSeconds * 1000;
}

/**
 * Begins a round on its own board. Who goes first in the first round is
 * drawn; in every other the loser of the round before chooses. `state` is
 * changed.
 */
function openRound(state: LinkState, now: number, config: LinkConfig): void {
  const before = state.log.at(-1);
  state.round += 1;
  state.board = boardOf(config.boards[(state.round - 1) % config.boards.length]) as Board;
  state.pieces = 0;
  state.last = null;
  state.declarer = null;
  state.prover = null;
  state.first = null;
  state.turn = null;
  tell(state, { type: "round", round: state.round }, now);
  if (before === undefined) {
    const source = randomSource(state.rng);
    const first = state.players[randomInt(source.next, state.players.length)];
    state.rng = source.state;
    tell(state, { type: "chose", player: first, first, forced: true }, now);
    openTurns(state, first, now, config);
    return;
  }
  state.phase = "choose";
  state.chooser = otherOf(state, before.winner);
  state.until = now + config.chooseSeconds * 1000;
}

/** Starts a game for `players`. */
export function createGame(start: { players: readonly number[]; seed: number; now: number }, config: LinkConfig): { ok: true; state: LinkState } | { ok: false; reason: LinkStartRefusal } {
  if (!isValidConfig(config)) return { ok: false, reason: "bad-config" };
  if (!Array.isArray(start.players) || !start.players.every((player) => isWhole(player) && player >= 0)) return { ok: false, reason: "bad-players" };
  if (new Set(start.players).size !== start.players.length) return { ok: false, reason: "bad-players" };
  if (start.players.length < 2) return { ok: false, reason: "too-few" };
  if (start.players.length > 2) return { ok: false, reason: "too-many" };
  const players = [...start.players].sort((a, b) => a - b);
  const state: LinkState = {
    version: 1,
    players,
    round: 0,
    phase: "choose",
    scores: players.map((player) => ({ player, points: 0 })),
    board: boardOf(config.boards[0]) as Board,
    chooser: null,
    first: null,
    turn: null,
    pieces: 0,
    last: null,
    declarer: null,
    prover: null,
    log: [],
    winner: null,
    at: start.now,
    until: null,
    rng: seedFrom(start.seed),
    history: [],
    events: 0,
    ended: null,
  };
  openRound(state, start.now, config);
  return { ok: true, state };
}

/** What a player sent, as an action; `null` for anything else. Whether it can be done is the game's to say. */
export function parseAction(raw: unknown): LinkAction | null {
  if (typeof raw !== "object" || raw === null) return null;
  const data = raw as Record<string, unknown>;
  const placings = (value: unknown): Placing[] | null => {
    if (!Array.isArray(value) || value.length > 32) return null;
    const pieces: Placing[] = [];
    for (const each of value) {
      if (typeof each !== "object" || each === null) return null;
      const { letter, cell } = each as Record<string, unknown>;
      if (typeof letter !== "string" || letter.length !== 1 || !isWhole(cell)) return null;
      pieces.push({ letter, cell });
    }
    return pieces;
  };
  if (data.type === "choose") return typeof data.first === "boolean" ? { type: "choose", first: data.first } : null;
  if (data.type === "place") {
    const pieces = placings(data.pieces);
    return pieces === null ? null : { type: "place", pieces };
  }
  if (data.type === "declare") return { type: "declare" };
  if (data.type === "forfeit") return { type: "forfeit" };
  if (data.type === "prove") {
    const partners = placings(data.partners);
    if (partners === null || !Array.isArray(data.paths) || data.paths.length > 32) return null;
    const paths: number[][] = [];
    for (const path of data.paths) {
      if (!Array.isArray(path) || path.length > 256 || !path.every((cell) => isWhole(cell))) return null;
      paths.push([...(path as number[])]);
    }
    return { type: "prove", partners, paths };
  }
  return null;
}

/** Who the game waits for: whoever chooses, places or proves. */
export function awaited(state: Pick<LinkState, "phase" | "chooser" | "turn" | "prover">): number[] {
  const who = state.phase === "choose" ? state.chooser : state.phase === "place" ? state.turn : state.phase === "prove" ? state.prover : null;
  return who === null ? [] : [who];
}

/** Ends the game. `state` is changed. */
function finish(state: LinkState, reason: LinkEnd, now?: number): void {
  state.phase = "ended";
  state.until = null;
  state.turn = null;
  state.chooser = null;
  state.ended = reason;
  tell(state, { type: "ended", reason }, now);
}

/**
 * The round is over: `winner` has its point. Its outcome goes on show, or
 * the game ends where that is the winning point or the last round. `state`
 * is changed.
 */
function closeRound(state: LinkState, winner: number, how: RoundHow, cells: string, paths: readonly (readonly number[])[], now: number, config: LinkConfig): void {
  const score = state.scores.find((each) => each.player === winner);
  if (score !== undefined) score.points += 1;
  state.log.push({ round: state.round, winner, how, declarer: state.declarer, prover: state.prover, pieces: state.pieces, cells, paths: paths.map((path) => [...path]) });
  state.board = { ...state.board, cells };
  state.turn = null;
  tell(state, { type: "round-over", round: state.round, winner, how }, now);
  if ((score?.points ?? 0) >= config.goal || state.round >= config.rounds) {
    const top = Math.max(...state.scores.map((each) => each.points));
    const leaders = state.scores.filter((each) => each.points === top);
    state.winner = leaders.length === 1 ? leaders[0].player : null;
    return finish(state, "played", now);
  }
  state.phase = "show";
  state.until = now + config.showSeconds * 1000;
}

/** What comes of `player` doing `action` at `now`. `state` is not changed. */
export function applyAction(state: LinkState, player: number, action: LinkAction, now: number, config: LinkConfig): LinkResult {
  if (state.phase === "ended") return { ok: false, reason: "game-over" };
  if (!state.players.includes(player)) return { ok: false, reason: "not-playing" };
  if (action.type === "choose") {
    if (state.phase !== "choose" || state.chooser !== player) return { ok: false, reason: "not-choosing" };
    const next = clone(state);
    const first = action.first ? player : otherOf(state, player);
    tell(next, { type: "chose", player, first, forced: false }, now);
    openTurns(next, first, now, config);
    return { ok: true, state: next };
  }
  if (action.type === "place" || action.type === "declare") {
    if (state.phase !== "place") return { ok: false, reason: "not-placing" };
    if (state.turn !== player) return { ok: false, reason: "not-your-turn" };
    const next = clone(state);
    if (action.type === "declare") {
      if (state.last === null) return { ok: false, reason: "nothing-placed" };
      next.phase = "prove";
      next.declarer = player;
      next.prover = state.last;
      next.turn = null;
      next.until = now + config.proveSeconds * 1000;
      tell(next, { type: "declared", player, prover: state.last }, now);
      return { ok: true, state: next };
    }
    const wrong = checkPlacing(state.board, action.pieces, dueOf(state, config), config);
    if (wrong !== null) return { ok: false, reason: wrong };
    next.board = { ...next.board, cells: withPieces(next.board.cells, action.pieces) };
    next.pieces += action.pieces.length;
    next.last = player;
    next.turn = otherOf(state, player);
    next.until = now + config.placeSeconds * 1000;
    tell(next, { type: "placed", player, pieces: action.pieces.map((piece) => ({ ...piece })) }, now);
    return { ok: true, state: next };
  }
  if (action.type === "prove" || action.type === "forfeit") {
    if (state.phase !== "prove" || state.prover !== player || state.declarer === null) return { ok: false, reason: "not-proving" };
    const next = clone(state);
    if (action.type === "forfeit") {
      closeRound(next, state.declarer, "forfeit", state.board.cells, [], now, config);
      return { ok: true, state: next };
    }
    // a proof that is none changes nothing: the prover has the rest of the time to make another
    const wrong = checkProof(state.board, action.partners, action.paths, config);
    if (wrong !== null) return { ok: false, reason: wrong };
    closeRound(next, player, "proved", withPieces(state.board.cells, action.partners), action.paths, now, config);
    return { ok: true, state: next };
  }
  return { ok: false, reason: "bad-action" };
}

/** The game ended, where one of its two is not `there`. Returns `state` itself otherwise. */
export function closeIfLeft(state: LinkState, there: (player: number) => boolean): LinkState {
  if (state.phase === "ended" || state.players.every(there)) return state;
  const next = clone(state);
  finish(next, "left");
  return next;
}

/** The moment the game next needs the clock, in ms since the epoch; `null` once it is over. */
export function deadline(state: LinkState): number | null {
  return state.phase === "ended" ? null : state.until;
}

/**
 * What the clock brings at `now`: whoever was to choose goes second; a
 * player whose turn ran out loses the round; a proof not made in time has
 * failed; and a round's outcome has been on show long enough. Returns
 * `state` itself when nothing is due.
 */
export function applyTimeout(state: LinkState, now: number, config: LinkConfig): LinkState {
  if (state.phase === "ended" || state.until === null || now < state.until) return state;
  const next = clone(state);
  if (state.phase === "choose" && state.chooser !== null) {
    const first = otherOf(state, state.chooser);
    tell(next, { type: "chose", player: state.chooser, first, forced: true }, now);
    openTurns(next, first, now, config);
  } else if (state.phase === "place" && state.turn !== null) {
    closeRound(next, otherOf(state, state.turn), "late", state.board.cells, [], now, config);
  } else if (state.phase === "prove" && state.declarer !== null) {
    closeRound(next, state.declarer, "unproved", state.board.cells, [], now, config);
  } else if (state.phase === "show") {
    openRound(next, now, config);
  } else {
    return state;
  }
  return next;
}

/** The game given up where it stands: nobody is left to go on with it. */
export function abandon(state: LinkState): LinkState {
  if (state.phase === "ended") return state;
  const next = clone(state);
  finish(next, "abandoned");
  return next;
}

/** The game with its clock moved on by `by` ms: it stood still that long. */
export function shiftClock(state: LinkState, by: number): LinkState {
  if (state.phase === "ended" || by === 0) return state;
  return { ...state, at: state.at + by, until: state.until === null ? null : state.until + by };
}

/**
 * How a game played to its end came out: the winner first and the other
 * second, or both first where neither has more points. `null` while it is
 * played, and for a game cut short.
 */
export function placesOf(state: Pick<LinkState, "phase" | "ended" | "players" | "winner">): { player: number; place: number }[] | null {
  if (state.phase !== "ended" || state.ended !== "played") return null;
  const winner = state.winner;
  if (winner === null) return state.players.map((player) => ({ player, place: 1 }));
  return state.players.map((player) => ({ player, place: player === winner ? 1 : 2 })).sort((a, b) => a.place - b.place || a.player - b.player);
}

/** The game as `player` sees it (`null`: someone watching). Everyone sees the same board. */
export function viewFor(state: LinkState, player: number | null, config: Pick<LinkConfig, "letters" | "firstPieces" | "turnPieces">): LinkView {
  const seated = player !== null && state.players.includes(player);
  const due = dueOf(state, config);
  return {
    phase: state.phase,
    you: seated ? player : null,
    players: [...state.players],
    round: state.round,
    scores: state.scores.map((each) => ({ ...each })),
    board: { ...state.board },
    chooser: state.chooser,
    first: state.first,
    turn: state.turn,
    due,
    room: due > 0 && canPlace(state.board, due, config),
    pieces: state.pieces,
    last: state.last,
    declarer: state.declarer,
    prover: state.prover,
    log: state.log.map((line) => ({ ...line, paths: line.paths.map((path) => [...path]) })),
    winner: state.winner,
    places: placesOf(state),
    history: state.history.map((event) => (event.type === "placed" ? { ...event, pieces: event.pieces.map((piece) => ({ ...piece })) } : { ...event })),
    events: state.events,
    ended: state.ended,
  };
}
