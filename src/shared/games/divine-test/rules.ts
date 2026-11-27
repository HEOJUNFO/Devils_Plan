/**
 * The rules of 신의 시험 (The Divine Test), the test of the show's place of
 * exile: a magic square of 49.
 *
 * Design: design/games/divine-test.md. Each player has a board of seven
 * squares by seven of their own and the tiles 1 to 49, the 1 already on the
 * middle square of the top row. The tiles are to be laid so that every row,
 * every column and both diagonals add up to the same number (175). A board
 * laid so passes at once: nothing is handed in. A tile laid can be moved or
 * taken back as often as its player likes. In the show one prisoner at a
 * time had an hour; here everyone in the room has the same half hour, and
 * the game is over when all but one have passed or the time is up.
 *
 * Everything here is a pure function of what it is given. A state is plain
 * JSON. A board is its player's alone: {@link viewFor} gives each player
 * their own, and of the others only how far they are.
 */

/** The numbers of the game. The brief says which are the show's and which are filled in for a room. */
export interface DivineConfig {
  /** How many squares the board is across and down. */
  size: number;
  /** The tiles that are on the board from the beginning and stay where they are. */
  fixed: { tile: number; cell: number }[];
  /** Seconds the players have. */
  seconds: number;
  /** How many players a game takes at most. */
  maxPlayers: number;
}

const isWhole = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);

/** What every row, column and diagonal of a board `size` across has to add up to. */
export const magicOf = (size: number): number => (size * (size * size + 1)) / 2;

/** Whether a game can be played with `config`. */
export function isValidConfig(config: DivineConfig): boolean {
  if (!isWhole(config.size) || config.size < 3 || config.size > 9) return false;
  const cells = config.size * config.size;
  if (!Array.isArray(config.fixed)) return false;
  if (!config.fixed.every((each) => isWhole(each.tile) && each.tile >= 1 && each.tile <= cells && isWhole(each.cell) && each.cell >= 0 && each.cell < cells)) return false;
  if (new Set(config.fixed.map((each) => each.tile)).size !== config.fixed.length || new Set(config.fixed.map((each) => each.cell)).size !== config.fixed.length) return false;
  return config.seconds > 0 && isWhole(config.maxPlayers) && config.maxPlayers >= 2;
}

/** A board as a game begins on it: nothing on a square (0) but the tiles that are fixed. */
export function emptyBoard(config: Pick<DivineConfig, "size" | "fixed">): number[] {
  const cells = Array.from({ length: config.size * config.size }, () => 0);
  for (const each of config.fixed) cells[each.cell] = each.tile;
  return cells;
}

/**
 * The lines of a board `size` across, each as its squares: the rows from the
 * top, the columns from the left, the diagonal from the top left and the one
 * from the top right.
 */
export function linesOf(size: number): number[][] {
  const along = Array.from({ length: size }, (_, n) => n);
  return [...along.map((y) => along.map((x) => y * size + x)), ...along.map((x) => along.map((y) => y * size + x)), along.map((n) => n * size + n), along.map((n) => n * size + (size - 1 - n))];
}

/** What the tiles on each line of `cells` add up to, in the order of {@link linesOf}; a square with no tile adds nothing. */
export function sumsOf(cells: readonly number[], size: number): number[] {
  return linesOf(size).map((line) => line.reduce((sum, cell) => sum + cells[cell], 0));
}

/** How many lines of `cells` have a tile on every square and add up to what they have to. */
export function linesRight(cells: readonly number[], size: number): number {
  const magic = magicOf(size);
  return linesOf(size).filter((line) => line.every((cell) => cells[cell] !== 0) && line.reduce((sum, cell) => sum + cells[cell], 0) === magic).length;
}

/** Whether `cells` is the square the test asks for: every tile once, and every line adding up to the same. */
export function isMagic(cells: readonly number[], size: number): boolean {
  if (cells.length !== size * size || cells.some((tile) => tile === 0)) return false;
  if (new Set(cells).size !== cells.length || cells.some((tile) => tile < 1 || tile > cells.length)) return false;
  return linesRight(cells, size) === size * 2 + 2;
}

/** Where the game stands. */
export type DivinePhase = "play" | "ended";

/**
 * Why a game is over: all but one passed, the time ran out, too few are left
 * to go on with it, or nobody is.
 */
export type DivineEnd = "played" | "time" | "left" | "abandoned";

/** One player's board as the room holds it. */
export interface Board {
  player: number;
  /** The tile on each square, a row after another from the top; 0 where there is none. */
  cells: number[];
  /** How many times a tile was laid, moved or taken back. */
  moves: number;
  /** How many ms after the start the board passed; `null` while it has not. */
  done: number | null;
  /** Whether the player has left the room. */
  left: boolean;
  /** When something was last done on the board, in ms since the epoch. */
  at: number;
}

/** Something that happened, as everyone is told it. No event says what is on a board. */
export type DivineEvent = { type: "passed"; player: number; place: number; ms: number } | { type: "left"; player: number } | { type: "ended"; reason: DivineEnd };

/** How many of the latest events a state keeps. */
export const HISTORY_KEPT = 24;

/** One game, as the room stores it. */
export interface DivineState {
  version: 1;
  /** The players, by the number each is known by, in the order of their numbers. */
  players: number[];
  phase: DivinePhase;
  boards: Board[];
  /** Who has passed, in the order they did. */
  passed: number[];
  /** When the game began, in ms since the epoch. A clock that stood still moves it on. */
  startedAt: number;
  /** When the last thing was done, in ms since the epoch. */
  at: number;
  /** When the time is up, in ms since the epoch; `null` once the game is over. */
  until: number | null;
  history: DivineEvent[];
  events: number;
  ended: DivineEnd | null;
}

/** What a player can ask. */
export type DivineAction =
  /** This tile goes on that square: from beside the board, or from the square it is on. A tile already there changes places with it, or goes back beside the board. */
  | { type: "put"; tile: number; cell: number }
  /** The tile on that square goes back beside the board. */
  | { type: "take"; cell: number };

/** Why something asked was refused. */
export type DivineRefusal =
  /** No tile of the game's, or one that stays where it is. */
  | "bad-tile"
  /** No square of the board, or one whose tile stays where it is. */
  | "bad-cell"
  /** There is no tile on that square. */
  | "empty-cell"
  /** The tile is on that square already. */
  | "no-change"
  /** The player's board has passed. */
  | "already-passed"
  /** The player is not one of the game's. */
  | "not-playing"
  /** Not something a player can ask. */
  | "bad-action"
  /** The game is over. */
  | "game-over";

export type DivineResult = { ok: true; state: DivineState } | { ok: false; reason: DivineRefusal };

/** Why a game was not started. */
export type DivineStartRefusal = "bad-config" | "too-few" | "too-many" | "bad-players";

/** How far a player is, as everyone may see it. */
export interface Standing {
  player: number;
  /** How many tiles are on their board, those fixed included. */
  placed: number;
  /** How many lines of their board are right. */
  lines: number;
  moves: number;
  /** How many ms after the start they passed; `null` while they have not. */
  done: number | null;
  left: boolean;
}

/** A game as one player sees it. */
export interface DivineView {
  phase: DivinePhase;
  /** The number of the player this is for; `null` for someone watching. */
  you: number | null;
  players: number[];
  /** This player's own board; for someone watching, a board with only the fixed tiles. */
  cells: number[];
  standings: Standing[];
  passed: number[];
  /** How many ms the game has run, as of the state's last change. */
  elapsed: number;
  /** How the game ended for each player, once it is played to its end. */
  places: { player: number; place: number }[] | null;
  history: DivineEvent[];
  events: number;
  ended: DivineEnd | null;
}

function clone(state: DivineState): DivineState {
  return { ...state, boards: state.boards.map((board) => ({ ...board, cells: [...board.cells] })), passed: [...state.passed], history: [...state.history] };
}

/** Records something that happened, at `now`. `state` is changed. */
function tell(state: DivineState, event: DivineEvent, now?: number): void {
  if (now !== undefined) state.at = now;
  state.history.push(event);
  if (state.history.length > HISTORY_KEPT) state.history.splice(0, state.history.length - HISTORY_KEPT);
  state.events += 1;
}

/** Ends the game. `state` is changed. */
function finish(state: DivineState, reason: DivineEnd, now?: number): void {
  state.phase = "ended";
  state.until = null;
  state.ended = reason;
  tell(state, { type: "ended", reason }, now);
}

/** The players still at their boards: neither passed nor gone. */
export function awaited(state: Pick<DivineState, "phase" | "boards">): number[] {
  return state.phase === "ended" ? [] : state.boards.filter((board) => board.done === null && !board.left).map((board) => board.player);
}

/**
 * Ends the game where it has come to its end: with one player or none still
 * at a board, once somebody has passed; and with fewer than two players
 * left in the room. `state` is changed.
 */
function closeIfOver(state: DivineState, now?: number): void {
  if (state.phase === "ended") return;
  const here = state.boards.filter((board) => !board.left).length;
  const at = awaited(state).length;
  if (state.passed.length > 0 && at <= 1) return finish(state, "played", now);
  if (here < 2) finish(state, "left", now);
}

/** Starts a game for `players`. */
export function createGame(start: { players: readonly number[]; now: number }, config: DivineConfig): { ok: true; state: DivineState } | { ok: false; reason: DivineStartRefusal } {
  if (!isValidConfig(config)) return { ok: false, reason: "bad-config" };
  if (!Array.isArray(start.players) || !start.players.every((player) => isWhole(player) && player >= 0)) return { ok: false, reason: "bad-players" };
  if (new Set(start.players).size !== start.players.length) return { ok: false, reason: "bad-players" };
  if (start.players.length < 2) return { ok: false, reason: "too-few" };
  if (start.players.length > config.maxPlayers) return { ok: false, reason: "too-many" };
  const players = [...start.players].sort((a, b) => a - b);
  return {
    ok: true,
    state: {
      version: 1,
      players,
      phase: "play",
      boards: players.map((player) => ({ player, cells: emptyBoard(config), moves: 0, done: null, left: false, at: start.now })),
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
export function parseAction(raw: unknown): DivineAction | null {
  if (typeof raw !== "object" || raw === null) return null;
  const data = raw as Record<string, unknown>;
  if (data.type === "put") return isWhole(data.tile) && isWhole(data.cell) ? { type: "put", tile: data.tile, cell: data.cell } : null;
  if (data.type === "take") return isWhole(data.cell) ? { type: "take", cell: data.cell } : null;
  return null;
}

/**
 * The board `cells` after `action`, or why it cannot be done. A tile laid
 * where another is sends that one where it came from itself: its square, or
 * beside the board. `cells` is not changed. The screen lays a tile by this
 * before the room has answered, so that the two never differ.
 */
export function layOn(cells: readonly number[], action: DivineAction, config: Pick<DivineConfig, "size" | "fixed">): { ok: true; cells: number[] } | { ok: false; reason: DivineRefusal } {
  const count = config.size * config.size;
  if (action.cell < 0 || action.cell >= count || config.fixed.some((each) => each.cell === action.cell)) return { ok: false, reason: "bad-cell" };
  const next = [...cells];
  if (action.type === "take") {
    if (next[action.cell] === 0) return { ok: false, reason: "empty-cell" };
    next[action.cell] = 0;
    return { ok: true, cells: next };
  }
  if (action.type !== "put") return { ok: false, reason: "bad-action" };
  if (action.tile < 1 || action.tile > count || config.fixed.some((each) => each.tile === action.tile)) return { ok: false, reason: "bad-tile" };
  const from = next.indexOf(action.tile);
  if (from === action.cell) return { ok: false, reason: "no-change" };
  if (from >= 0) next[from] = next[action.cell];
  next[action.cell] = action.tile;
  return { ok: true, cells: next };
}

/** What comes of `player` doing `action` at `now`. `state` is not changed. */
export function applyAction(state: DivineState, player: number, action: DivineAction, now: number, config: DivineConfig): DivineResult {
  if (state.phase === "ended") return { ok: false, reason: "game-over" };
  const mine = state.boards.find((board) => board.player === player);
  if (mine === undefined || mine.left) return { ok: false, reason: "not-playing" };
  if (mine.done !== null) return { ok: false, reason: "already-passed" };
  const result = layOn(mine.cells, action, config);
  if (!result.ok) return result;
  const next = clone(state);
  const board = next.boards.find((each) => each.player === player) as Board;
  board.cells = result.cells;
  board.moves += 1;
  board.at = now;
  next.at = now;
  if (isMagic(board.cells, config.size)) {
    board.done = Math.max(0, now - next.startedAt);
    next.passed.push(player);
    tell(next, { type: "passed", player, place: next.passed.length, ms: board.done }, now);
    closeIfOver(next, now);
  }
  return { ok: true, state: next };
}

/**
 * The game with whoever is not `there` gone from it: their board stays as
 * it is and can pass no more. It is over where that leaves fewer than two
 * in the room, or one still at a board after somebody passed. Returns
 * `state` itself where nobody new is gone.
 */
export function closeIfLeft(state: DivineState, there: (player: number) => boolean): DivineState {
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
export function deadline(state: DivineState): number | null {
  return state.phase === "ended" ? null : state.until;
}

/** What the clock brings at `now`: the time is up. Returns `state` itself when it is not. */
export function applyTimeout(state: DivineState, now: number): DivineState {
  if (state.phase === "ended" || state.until === null || now < state.until) return state;
  const next = clone(state);
  finish(next, "time", now);
  return next;
}

/** The game given up where it stands: nobody is left to go on with it. */
export function abandon(state: DivineState): DivineState {
  if (state.phase === "ended") return state;
  const next = clone(state);
  finish(next, "abandoned");
  return next;
}

/** The game with its clock moved on by `by` ms: it stood still that long. */
export function shiftClock(state: DivineState, by: number): DivineState {
  if (state.phase === "ended" || by === 0) return state;
  return {
    ...state,
    startedAt: state.startedAt + by,
    at: state.at + by,
    until: state.until === null ? null : state.until + by,
    boards: state.boards.map((board) => ({ ...board, at: board.at + by })),
  };
}

/**
 * How a game played to its end came out: those who passed in the order they
 * did, and everyone else together after them. `null` while it is played,
 * and for a game cut short.
 */
export function placesOf(state: Pick<DivineState, "phase" | "ended" | "players" | "passed">): { player: number; place: number }[] | null {
  if (state.phase !== "ended" || (state.ended !== "played" && state.ended !== "time")) return null;
  const rest = state.passed.length + 1;
  return state.players
    .map((player) => ({ player, place: state.passed.includes(player) ? state.passed.indexOf(player) + 1 : rest }))
    .sort((a, b) => a.place - b.place || a.player - b.player);
}

/** The game as `player` sees it (`null`: someone watching): their own board, and how far everyone is. */
export function viewFor(state: DivineState, player: number | null, config: Pick<DivineConfig, "size" | "fixed">): DivineView {
  const mine = player === null ? undefined : state.boards.find((board) => board.player === player);
  return {
    phase: state.phase,
    you: mine === undefined ? null : mine.player,
    players: [...state.players],
    cells: mine === undefined ? emptyBoard(config) : [...mine.cells],
    standings: state.boards.map((board) => ({
      player: board.player,
      placed: board.cells.filter((tile) => tile !== 0).length,
      lines: linesRight(board.cells, config.size),
      moves: board.moves,
      done: board.done,
      left: board.left,
    })),
    passed: [...state.passed],
    elapsed: Math.max(0, state.at - state.startedAt),
    places: placesOf(state),
    history: state.history.map((event) => ({ ...event })),
    events: state.events,
    ended: state.ended,
  };
}
