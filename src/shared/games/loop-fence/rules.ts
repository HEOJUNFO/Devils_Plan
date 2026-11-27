/**
 * The rules of 울타리 치기 (Loop Fence Puzzle), the fourth match of the show's
 * place of exile.
 *
 * Design: design/games/loop-fence.md. Everyone has the same board of squares,
 * some with a number from 0 to 3, and draws a fence along the sides of the
 * squares: one closed loop, with as many of its sides round each numbered
 * square as the number says. Whoever thinks theirs is done presses the
 * buzzer and has it checked. A fence that is right passes; the game goes on
 * for the others, and the one who has not passed when all the others have is
 * last. The show says no more than that: what a wrong fence costs, how long
 * there is and how large the board is are filled in for a room.
 *
 * Everything here is a pure function of what it is given. A state is plain
 * JSON. A fence is its player's alone until the game is over:
 * {@link viewFor} gives each player their own, and of the others only how
 * far they are. What makes a fence right is in `fence.ts`.
 */
import { faultOf, puzzleOf, sidesOf, type FenceFault, type Puzzle } from "./fence";

/** One puzzle the game comes with: its numbers as rows of text, and the one fence that meets them, a "1" for each side it runs along. */
export interface StoredPuzzle {
  rows: string[];
  fence: string;
}

/** The numbers of the game. The brief says which are the show's and which are filled in for a room. */
export interface FenceConfig {
  /** Seconds the players have. */
  seconds: number;
  /** Seconds a player cannot press the buzzer again after a fence that was wrong. */
  lockSeconds: number;
  /** How many players a game takes at most. */
  maxPlayers: number;
  /** The puzzles a game is drawn from. */
  puzzles: StoredPuzzle[];
}

const isWhole = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);

/** What a player has on a side: nothing, a piece of fence, or a cross for "no fence here", which is a note of their own and nothing the game reads. */
export const NONE = 0;
export const FENCE = 1;
export const CROSS = 2;

/** Whether a game can be played with `config`. Whether each puzzle has its fence, and no other, is for the tests to say. */
export function isValidConfig(config: FenceConfig): boolean {
  if (!(config.seconds > 0) || !(config.lockSeconds >= 0) || !isWhole(config.maxPlayers) || config.maxPlayers < 2) return false;
  if (!Array.isArray(config.puzzles) || config.puzzles.length === 0) return false;
  return config.puzzles.every((stored) => {
    const puzzle = puzzleOf(stored.rows);
    return puzzle !== null && typeof stored.fence === "string" && stored.fence.length === sidesOf(puzzle) && /^[01]+$/.test(stored.fence);
  });
}

/** Where the game stands. */
export type FencePhase = "play" | "ended";

/**
 * Why a game is over: all but one passed, the time ran out, too few are left
 * to go on with it, or nobody is.
 */
export type FenceEnd = "played" | "time" | "left" | "abandoned";

/** One player's board as the room holds it. */
export interface Board {
  player: number;
  /** What the player has on each side ({@link NONE}, {@link FENCE}, {@link CROSS}), by the side's number. */
  marks: number[];
  /** How many times the buzzer was pressed with a fence that was wrong. */
  wrong: number;
  /** What was wrong with the fence the buzzer was last pressed with; `null` once the board has been changed since, and before any. */
  fault: FenceFault | null;
  /** Until when the buzzer cannot be pressed, in ms since the epoch; `null` when it can. */
  lockedUntil: number | null;
  /** How many ms after the start the fence passed; `null` while it has not. */
  done: number | null;
  /** Whether the player has left the room. */
  left: boolean;
  /** When something was last done on the board, in ms since the epoch. */
  at: number;
}

/** Something that happened, as everyone is told it. No event says where a fence runs. */
export type FenceEvent = { type: "passed"; player: number; place: number; ms: number } | { type: "wrong"; player: number } | { type: "left"; player: number } | { type: "ended"; reason: FenceEnd };

/** How many of the latest events a state keeps. */
export const HISTORY_KEPT = 24;

/** One game, as the room stores it. */
export interface FenceState {
  version: 1;
  /** The players, by the number each is known by, in the order of their numbers. */
  players: number[];
  phase: FencePhase;
  /** Which of the config's puzzles is played. */
  puzzle: number;
  boards: Board[];
  /** Who has passed, in the order they did. */
  passed: number[];
  /** When the game began, in ms since the epoch. A clock that stood still moves it on. */
  startedAt: number;
  /** When the last thing was done, in ms since the epoch. */
  at: number;
  /** When the time is up, in ms since the epoch; `null` once the game is over. */
  until: number | null;
  history: FenceEvent[];
  events: number;
  ended: FenceEnd | null;
}

/** What a player can ask. */
export type FenceAction =
  /** This side gets that: nothing, a piece of fence, or a cross. */
  | { type: "mark"; side: number; to: number }
  /** Everything is taken off the board. */
  | { type: "clear" }
  /** The buzzer: the fence is done, check it. */
  | { type: "buzz" };

/** Why something asked was refused. */
export type FenceRefusal =
  /** No side of the board. */
  | "bad-side"
  /** The side has that already, or there is nothing to take off. */
  | "no-change"
  /** The buzzer was pressed with a wrong fence a moment ago. */
  | "locked"
  /** The player's fence has passed. */
  | "already-passed"
  /** The player is not one of the game's. */
  | "not-playing"
  /** Not something a player can ask. */
  | "bad-action"
  /** The game is over. */
  | "game-over";

export type FenceResult = { ok: true; state: FenceState } | { ok: false; reason: FenceRefusal };

/** Why a game was not started. */
export type FenceStartRefusal = "bad-config" | "too-few" | "too-many" | "bad-players";

/** How far a player is, as everyone may see it. */
export interface Standing {
  player: number;
  /** How many sides of their board have fence. */
  lines: number;
  /** How many times they pressed the buzzer with a wrong fence. */
  wrong: number;
  /** How many ms after the start they passed; `null` while they have not. */
  done: number | null;
  left: boolean;
}

/** A game as one player sees it. */
export interface FenceView {
  phase: FencePhase;
  /** The number of the player this is for; `null` for someone watching. */
  you: number | null;
  players: number[];
  /** The board and its numbers. */
  puzzle: Puzzle;
  /** What this player has on each side; nothing anywhere for someone watching. */
  marks: number[];
  /** What was wrong with the fence this player last pressed the buzzer with, while the board is as it was then. */
  fault: FenceFault | null;
  standings: Standing[];
  passed: number[];
  /** How many ms the game has run, as of the state's last change. */
  elapsed: number;
  /** The puzzle's fence, once the game is over: whether it runs along each side. */
  answer: boolean[] | null;
  /** How the game ended for each player, once it is played to its end. */
  places: { player: number; place: number }[] | null;
  history: FenceEvent[];
  events: number;
  ended: FenceEnd | null;
}

function clone(state: FenceState): FenceState {
  return { ...state, boards: state.boards.map((board) => ({ ...board, marks: [...board.marks] })), passed: [...state.passed], history: [...state.history] };
}

/** Records something that happened, at `now`. `state` is changed. */
function tell(state: FenceState, event: FenceEvent, now?: number): void {
  if (now !== undefined) state.at = now;
  state.history.push(event);
  if (state.history.length > HISTORY_KEPT) state.history.splice(0, state.history.length - HISTORY_KEPT);
  state.events += 1;
}

/** Ends the game. `state` is changed. */
function finish(state: FenceState, reason: FenceEnd, now?: number): void {
  state.phase = "ended";
  state.until = null;
  state.ended = reason;
  tell(state, { type: "ended", reason }, now);
}

/** The puzzle a game is played on. */
export function puzzleIn(state: Pick<FenceState, "puzzle">, config: Pick<FenceConfig, "puzzles">): Puzzle {
  return puzzleOf(config.puzzles[state.puzzle].rows) as Puzzle;
}

/** The players still at their boards: neither passed nor gone. */
export function awaited(state: Pick<FenceState, "phase" | "boards">): number[] {
  return state.phase === "ended" ? [] : state.boards.filter((board) => board.done === null && !board.left).map((board) => board.player);
}

/**
 * Ends the game where it has come to its end: with one player or none still
 * at a board, once somebody has passed; and with fewer than two players
 * left in the room. `state` is changed.
 */
function closeIfOver(state: FenceState, now?: number): void {
  if (state.phase === "ended") return;
  const here = state.boards.filter((board) => !board.left).length;
  const at = awaited(state).length;
  if (state.passed.length > 0 && at <= 1) return finish(state, "played", now);
  if (here < 2) finish(state, "left", now);
}

/** Starts a game for `players` on the puzzle `chance` (a number in [0, 1)) draws. */
export function createGame(start: { players: readonly number[]; now: number; chance: number }, config: FenceConfig): { ok: true; state: FenceState } | { ok: false; reason: FenceStartRefusal } {
  if (!isValidConfig(config)) return { ok: false, reason: "bad-config" };
  if (!Array.isArray(start.players) || !start.players.every((player) => isWhole(player) && player >= 0)) return { ok: false, reason: "bad-players" };
  if (new Set(start.players).size !== start.players.length) return { ok: false, reason: "bad-players" };
  if (start.players.length < 2) return { ok: false, reason: "too-few" };
  if (start.players.length > config.maxPlayers) return { ok: false, reason: "too-many" };
  const players = [...start.players].sort((a, b) => a - b);
  const puzzle = Math.min(config.puzzles.length - 1, Math.max(0, Math.floor((Number.isFinite(start.chance) ? start.chance : 0) * config.puzzles.length)));
  const sides = sidesOf(puzzleOf(config.puzzles[puzzle].rows) as Puzzle);
  return {
    ok: true,
    state: {
      version: 1,
      players,
      phase: "play",
      puzzle,
      boards: players.map((player) => ({ player, marks: Array.from({ length: sides }, () => NONE), wrong: 0, fault: null, lockedUntil: null, done: null, left: false, at: start.now })),
      passed: [],
      startedAt: start.now,
      at: start.now,
      until: start.now + config.seconds * 1000,
      history: [],
      events: 0,
      ended: null,
    },
  };
}

/** What a player sent, as an action; `null` for anything else. Whether it can be done is the game's to say. */
export function parseAction(raw: unknown): FenceAction | null {
  if (typeof raw !== "object" || raw === null) return null;
  const data = raw as Record<string, unknown>;
  if (data.type === "mark") return isWhole(data.side) && (data.to === NONE || data.to === FENCE || data.to === CROSS) ? { type: "mark", side: data.side, to: data.to } : null;
  if (data.type === "clear") return { type: "clear" };
  if (data.type === "buzz") return { type: "buzz" };
  return null;
}

/**
 * The board `marks` after `action` (a mark, or everything off), or why it
 * cannot be done. `marks` is not changed. The screen draws by this before
 * the room has answered, so that the two never differ.
 */
export function markOn(marks: readonly number[], action: FenceAction): { ok: true; marks: number[] } | { ok: false; reason: FenceRefusal } {
  if (action.type === "clear") return marks.every((mark) => mark === NONE) ? { ok: false, reason: "no-change" } : { ok: true, marks: marks.map(() => NONE) };
  if (action.type !== "mark") return { ok: false, reason: "bad-action" };
  if (action.side < 0 || action.side >= marks.length) return { ok: false, reason: "bad-side" };
  if (marks[action.side] === action.to) return { ok: false, reason: "no-change" };
  const next = [...marks];
  next[action.side] = action.to;
  return { ok: true, marks: next };
}

/** The fence on a board: whether it runs along each side. */
export const fenceOn = (marks: readonly number[]): boolean[] => marks.map((mark) => mark === FENCE);

/** What comes of `player` doing `action` at `now`. `state` is not changed. */
export function applyAction(state: FenceState, player: number, action: FenceAction, now: number, config: FenceConfig): FenceResult {
  if (state.phase === "ended") return { ok: false, reason: "game-over" };
  const mine = state.boards.find((board) => board.player === player);
  if (mine === undefined || mine.left) return { ok: false, reason: "not-playing" };
  if (mine.done !== null) return { ok: false, reason: "already-passed" };
  if (action.type === "buzz") {
    if (mine.lockedUntil !== null && now < mine.lockedUntil) return { ok: false, reason: "locked" };
    const next = clone(state);
    const board = next.boards.find((each) => each.player === player) as Board;
    board.at = now;
    board.lockedUntil = null;
    board.fault = faultOf(puzzleIn(state, config), fenceOn(board.marks));
    if (board.fault === null) {
      board.done = Math.max(0, now - next.startedAt);
      next.passed.push(player);
      tell(next, { type: "passed", player, place: next.passed.length, ms: board.done }, now);
      closeIfOver(next, now);
    } else {
      board.wrong += 1;
      board.lockedUntil = now + config.lockSeconds * 1000;
      tell(next, { type: "wrong", player }, now);
    }
    return { ok: true, state: next };
  }
  const result = markOn(mine.marks, action);
  if (!result.ok) return result;
  const next = clone(state);
  const board = next.boards.find((each) => each.player === player) as Board;
  board.marks = result.marks;
  board.fault = null;
  board.at = now;
  next.at = now;
  return { ok: true, state: next };
}

/**
 * The game with whoever is not `there` gone from it: their board stays as
 * it is and can pass no more. It is over where that leaves fewer than two
 * in the room, or one still at a board after somebody passed. Returns
 * `state` itself where nobody new is gone.
 */
export function closeIfLeft(state: FenceState, there: (player: number) => boolean): FenceState {
  if (state.phase === "ended" || state.boards.every((board) => board.left || there(board.player))) return state;
  const next = clone(state);
  for (const board of next.boards) {
    if (board.left || there(board.player)) continue;
    board.left = true;
    tell(next, { type: "left", player: board.player });
  }
  closeIfOver(next);
  return next;
}

/** The moment the game next needs the clock, in ms since the epoch; `null` once it is over. */
export function deadline(state: FenceState): number | null {
  return state.phase === "ended" ? null : state.until;
}

/** What the clock brings at `now`: the time is up. Returns `state` itself when it is not. */
export function applyTimeout(state: FenceState, now: number): FenceState {
  if (state.phase === "ended" || state.until === null || now < state.until) return state;
  const next = clone(state);
  finish(next, "time", now);
  return next;
}

/** The game given up where it stands: nobody is left to go on with it. */
export function abandon(state: FenceState): FenceState {
  if (state.phase === "ended") return state;
  const next = clone(state);
  finish(next, "abandoned");
  return next;
}

/** The game with its clock moved on by `by` ms: it stood still that long. */
export function shiftClock(state: FenceState, by: number): FenceState {
  if (state.phase === "ended" || by === 0) return state;
  return {
    ...state,
    startedAt: state.startedAt + by,
    at: state.at + by,
    until: state.until === null ? null : state.until + by,
    boards: state.boards.map((board) => ({ ...board, at: board.at + by, lockedUntil: board.lockedUntil === null ? null : board.lockedUntil + by })),
  };
}

/**
 * How a game played to its end came out: those who passed in the order they
 * did, and everyone else together after them. `null` while it is played,
 * and for a game cut short.
 */
export function placesOf(state: Pick<FenceState, "phase" | "ended" | "players" | "passed">): { player: number; place: number }[] | null {
  if (state.phase !== "ended" || (state.ended !== "played" && state.ended !== "time")) return null;
  const rest = state.passed.length + 1;
  return state.players
    .map((player) => ({ player, place: state.passed.includes(player) ? state.passed.indexOf(player) + 1 : rest }))
    .sort((a, b) => a.place - b.place || a.player - b.player);
}

/** How long `player` still cannot press the buzzer at `now`, in ms; 0 when they can. */
export function lockLeft(state: Pick<FenceState, "boards">, player: number | null, now: number): number {
  const until = state.boards.find((board) => board.player === player)?.lockedUntil ?? null;
  return until === null ? 0 : Math.max(0, until - now);
}

/** The game as `player` sees it (`null`: someone watching): their own fence, how far everyone is, and the puzzle's fence once it is over. */
export function viewFor(state: FenceState, player: number | null, config: Pick<FenceConfig, "puzzles">): FenceView {
  const mine = player === null ? undefined : state.boards.find((board) => board.player === player);
  const puzzle = puzzleIn(state, config);
  return {
    phase: state.phase,
    you: mine === undefined ? null : mine.player,
    players: [...state.players],
    puzzle,
    marks: mine === undefined ? Array.from({ length: sidesOf(puzzle) }, () => NONE) : [...mine.marks],
    fault: mine === undefined ? null : mine.fault,
    standings: state.boards.map((board) => ({
      player: board.player,
      lines: board.marks.filter((mark) => mark === FENCE).length,
      wrong: board.wrong,
      done: board.done,
      left: board.left,
    })),
    passed: [...state.passed],
    elapsed: Math.max(0, state.at - state.startedAt),
    answer: state.phase === "ended" ? [...config.puzzles[state.puzzle].fence].map((side) => side === "1") : null,
    places: placesOf(state),
    history: state.history.map((event) => ({ ...event })),
    events: state.events,
    ended: state.ended,
  };
}
