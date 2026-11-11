/**
 * The rules of 큐브 세기 (Count the Cubes): one problem, a solid built of
 * cubes, which every player counts and answers on their own. Pure functions
 * over plain data: nothing here reads the clock or stores anything.
 *
 * Design: design/games/count-cubes.md. The procedure is the document's own
 * (answer for yourself, twenty seconds shut out after a wrong answer, over
 * when all but one have it, ranked in the order they got it). What the
 * document does not give is the picture, and that is filled in here: see
 * {@link Solid}. Lines marked (gap) are such fills.
 */
import { randomInt, randomSource, seedFrom } from "../../game/rng";

/** The numbers of the game. Loaded from `config.json`. */
export interface CubesConfig {
  /** Seconds a player may give no answer after a wrong one (document, rule 3). */
  lockSeconds: number;
  /** (gap) Seconds the problem stays up; when they run out the game ends with those who have it. */
  problemSeconds: number;
  /** (gap) The fewest and the most cubes along a side of the solid's floor. */
  minSide: number;
  maxSide: number;
  /** (gap) The fewest and the most cubes the solid is high at its back corner. */
  minHeight: number;
  maxHeight: number;
  /** (gap) The fewest and the most steps cut into the solid. */
  minCuts: number;
  maxCuts: number;
  /** (gap) The fewest and the most cubes a problem may come to. */
  minAnswer: number;
  maxAnswer: number;
  /** The largest number a player can enter. */
  maxSaid: number;
}

/**
 * (gap) The picture: a solid of cubes standing on a floor of `rows` by `cols`
 * squares, `heights[row * cols + col]` cubes high on each. Row 0 and column 0
 * meet at the back corner; the solid is looked at from the opposite corner.
 *
 * Every column is at least as high as the one in front of it, along both
 * rows and columns ({@link isTerraced}). So no column hides behind another:
 * the top of each can be seen, and the picture has one answer. The cubes
 * inside, under the ones seen, count like any other.
 */
export interface Solid {
  rows: number;
  cols: number;
  heights: number[];
}

const isWhole = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);

/** How high the solid stands at `row`, `col`; nothing stands off its floor. */
export function heightAt(solid: Solid, row: number, col: number): number {
  if (row < 0 || col < 0 || row >= solid.rows || col >= solid.cols) return 0;
  return solid.heights[row * solid.cols + col];
}

/** How many cubes the solid is made of. */
export function countOf(solid: Solid): number {
  return solid.heights.reduce((sum, height) => sum + height, 0);
}

/** Whether `solid` is one a picture can show whole: well formed, and never higher in front than behind. */
export function isTerraced(solid: Solid): boolean {
  if (!isWhole(solid.rows) || !isWhole(solid.cols) || solid.rows < 1 || solid.cols < 1) return false;
  if (!Array.isArray(solid.heights) || solid.heights.length !== solid.rows * solid.cols) return false;
  for (let row = 0; row < solid.rows; row++) {
    for (let col = 0; col < solid.cols; col++) {
      const height = heightAt(solid, row, col);
      if (!isWhole(height) || height < 0) return false;
      if (height < heightAt(solid, row + 1, col) || height < heightAt(solid, row, col + 1)) return false;
    }
  }
  return true;
}

/** Whether the numbers of `config` can make a game. */
export function isValidConfig(config: CubesConfig): boolean {
  const whole = [
    config.lockSeconds,
    config.problemSeconds,
    config.minSide,
    config.maxSide,
    config.minHeight,
    config.maxHeight,
    config.minCuts,
    config.maxCuts,
    config.minAnswer,
    config.maxAnswer,
    config.maxSaid,
  ].every(isWhole);
  return (
    whole &&
    config.lockSeconds >= 0 &&
    config.problemSeconds >= 1 &&
    config.minSide >= 2 &&
    config.maxSide >= config.minSide &&
    config.minHeight >= 2 &&
    config.maxHeight >= config.minHeight &&
    config.minCuts >= 1 &&
    config.maxCuts >= config.minCuts &&
    config.minAnswer >= 1 &&
    config.maxAnswer >= config.minAnswer &&
    config.maxSaid >= config.maxAnswer
  );
}

/** How many solids are drawn before the plain one is used. */
const DRAWS = 200;

/** A whole number from `low` to `high`, both included. */
function between(random: () => number, low: number, high: number): number {
  return low + randomInt(random, high - low + 1);
}

/**
 * One solid as it comes: a block, with steps cut into it towards the viewer.
 * A cut takes every column at or in front of one square down to a height, so
 * the solid stays terraced whatever is cut. A cut that starts on the back
 * row or the back column runs the whole width of the block, as a stair does;
 * any other bites the near corner off.
 */
function cutBlock(random: () => number, config: CubesConfig): Solid {
  const rows = between(random, config.minSide, config.maxSide);
  const cols = between(random, config.minSide, config.maxSide);
  const top = between(random, config.minHeight, config.maxHeight);
  const heights = new Array<number>(rows * cols).fill(top);
  const cuts = between(random, config.minCuts, config.maxCuts);
  for (let cut = 0; cut < cuts; cut++) {
    const kind = randomInt(random, 3);
    const row = kind === 0 ? 0 : between(random, 1, rows - 1);
    const col = kind === 1 ? 0 : between(random, 1, cols - 1);
    // a stair leaves something standing; a corner may be cut down to the floor
    const to = kind === 2 ? between(random, 0, top - 1) : between(random, 1, top - 1);
    for (let r = row; r < rows; r++) {
      for (let c = col; c < cols; c++) heights[r * cols + c] = Math.min(heights[r * cols + c], to);
    }
  }
  return { rows, cols, heights };
}

/** The solid used when none drawn would do: two steps down to each side of a small block. */
function plainSolid(config: CubesConfig): Solid {
  const side = Math.max(2, config.minSide);
  const top = Math.max(2, config.minHeight);
  const heights: number[] = [];
  for (let row = 0; row < side; row++) {
    for (let col = 0; col < side; col++) heights.push(Math.max(1, top - Math.max(row, col)));
  }
  return { rows: side, cols: side, heights };
}

/**
 * Draws a problem with `random`: a block with steps cut into it that comes
 * to a number of cubes the game allows, and has more than one height to it
 * (a bare block is a multiplication, not a count).
 */
export function drawSolid(random: () => number, config: CubesConfig): Solid {
  for (let draw = 0; draw < DRAWS; draw++) {
    const solid = cutBlock(random, config);
    const count = countOf(solid);
    if (count < config.minAnswer || count > config.maxAnswer) continue;
    if (new Set(solid.heights).size < 2) continue;
    return solid;
  }
  return plainSolid(config);
}

/** Where a game stands: the problem is up, or the game is over. */
export type CubesPhase = "open" | "ended";

/** How a game ended: enough had the answer, the time ran out, or nobody was left to go on. */
export type CubesEnd = "ranked" | "time" | "abandoned";

/** Something that happened, as everyone is told it: who was right or wrong, never what was said. */
export type CubesEvent =
  | { type: "right"; player: number; place: number; took: number }
  | { type: "wrong"; player: number }
  | { type: "ended"; reason: CubesEnd };

/** One game, as the room stores it. Holds the answer: send only {@link viewFor} of it. */
export interface CubesState {
  version: 1;
  /** The players, by the number each is known by. */
  players: number[];
  phase: CubesPhase;
  solid: Solid;
  /** When the problem was put up, in ms since the epoch. */
  openedAt: number;
  /** When the problem comes down, in ms since the epoch. */
  closesAt: number;
  /** Those who have the answer, first first, and how long each took in ms. */
  ranked: { player: number; took: number }[];
  /** Wrong answers: how many each player has given, and until when they are shut out. */
  wrong: { player: number; count: number; until: number }[];
  history: CubesEvent[];
}

/** What a player can ask: to answer with a number of cubes. */
export type CubesAction = { type: "answer"; said: number };

/** Why an answer was not taken. */
export type CubesRefusal =
  /** The game is over. */
  | "game-over"
  /** The one asking is not a player of this game. */
  | "not-playing"
  /** What was sent is not an answer the game knows. */
  | "bad-action"
  /** The player already has the answer. */
  | "already-right"
  /** The player answered wrong and is still shut out. */
  | "locked";

export type CubesResult = { ok: true; state: CubesState } | { ok: false; reason: CubesRefusal };

/** Why a game was not made. */
export type CubesStartRefusal = "bad-config" | "too-few" | "bad-players";

/** What one player, or someone watching, is sent of a game. */
export interface CubesView {
  phase: CubesPhase;
  /** The number of the player this is for; `null` for someone watching. */
  you: number | null;
  solid: Solid;
  /** How many right answers end the game: all the players but one (document, rule 4). */
  needed: number;
  /** Those who have the answer, first first. */
  ranked: { player: number; took: number }[];
  /** How many wrong answers each player has given. */
  wrong: { player: number; count: number }[];
  /** How many cubes there are: `null` until the game is over. */
  answer: number | null;
  history: CubesEvent[];
}

function clone(state: CubesState): CubesState {
  return {
    ...state,
    ranked: state.ranked.map((entry) => ({ ...entry })),
    wrong: state.wrong.map((entry) => ({ ...entry })),
    history: [...state.history],
  };
}

/** How many right answers end a game of `players` players: all but one, and one where there are only two (document, rule 4). */
export function neededOf(players: number): number {
  return Math.max(1, players - 1);
}

/** Starts a game for `players` with a problem drawn from `seed`. */
export function createGame(
  start: { players: readonly number[]; seed: number; now: number },
  config: CubesConfig,
): { ok: true; state: CubesState } | { ok: false; reason: CubesStartRefusal } {
  if (!isValidConfig(config)) return { ok: false, reason: "bad-config" };
  if (!Array.isArray(start.players) || !start.players.every(isWhole)) return { ok: false, reason: "bad-players" };
  if (new Set(start.players).size !== start.players.length) return { ok: false, reason: "bad-players" };
  if (start.players.length < 2) return { ok: false, reason: "too-few" };
  const random = randomSource(seedFrom(start.seed));
  return {
    ok: true,
    state: {
      version: 1,
      players: [...start.players].sort((a, b) => a - b),
      phase: "open",
      solid: drawSolid(random.next, config),
      openedAt: start.now,
      closesAt: start.now + config.problemSeconds * 1000,
      ranked: [],
      wrong: [],
      history: [],
    },
  };
}

/** Reads an answer as it came off the wire; `null` for anything else. */
export function parseAction(raw: unknown): CubesAction | null {
  if (typeof raw !== "object" || raw === null) return null;
  const data = raw as Record<string, unknown>;
  if (data.type !== "answer" || !isWhole(data.said) || data.said < 0) return null;
  return { type: "answer", said: data.said };
}

/** Until when `player` is shut out, in ms since the epoch; 0 when they are not. */
export function lockedUntil(state: CubesState, player: number): number {
  return state.wrong.find((entry) => entry.player === player)?.until ?? 0;
}

/**
 * Ends the game if enough have the answer. `there` says whether a player
 * still holds a place in the room: one who has gone cannot answer, so they
 * are the one, or among the ones, the game does not wait for. With nobody
 * gone the game is over when all but one have it (document, rule 4); with
 * someone gone, when everyone still there has it.
 */
export function closeIfDone(state: CubesState, there: (player: number) => boolean): CubesState {
  if (state.phase === "ended") return state;
  const open = state.players.filter((player) => !state.ranked.some((entry) => entry.player === player));
  const gone = open.filter((player) => !there(player)).length;
  const left = open.length - gone;
  if (gone === 0 ? left > 1 : left > 0) return state;
  const next = clone(state);
  next.phase = "ended";
  next.history.push({ type: "ended", reason: "ranked" });
  return next;
}

/**
 * An answer by `player` at `now`. Right: they take the next place. Wrong:
 * they are shut out for `lockSeconds` (document, rule 3). The state given is
 * not changed. Whether enough have it now is for {@link closeIfDone}, which
 * needs to know who is still there.
 */
export function applyAction(state: CubesState, player: number, action: CubesAction, now: number, config: CubesConfig): CubesResult {
  if (state.phase === "ended") return { ok: false, reason: "game-over" };
  if (!state.players.includes(player)) return { ok: false, reason: "not-playing" };
  const move = parseAction(action);
  if (move === null || move.said > config.maxSaid) return { ok: false, reason: "bad-action" };
  if (state.ranked.some((entry) => entry.player === player)) return { ok: false, reason: "already-right" };
  if (now < lockedUntil(state, player)) return { ok: false, reason: "locked" };
  const next = clone(state);
  if (move.said === countOf(state.solid)) {
    const took = Math.max(0, now - state.openedAt);
    next.ranked.push({ player, took });
    next.history.push({ type: "right", player, place: next.ranked.length, took });
    return { ok: true, state: next };
  }
  const until = now + config.lockSeconds * 1000;
  const before = next.wrong.find((entry) => entry.player === player);
  if (before === undefined) next.wrong.push({ player, count: 1, until });
  else {
    before.count += 1;
    before.until = until;
  }
  next.history.push({ type: "wrong", player });
  return { ok: true, state: next };
}

/** The moment the game next needs the clock: when the problem comes down. `null` once it is over. */
export function deadline(state: CubesState): number | null {
  return state.phase === "ended" ? null : state.closesAt;
}

/** The problem's time may have run out: then the game is over with those who have the answer. Returns `state` itself when it has not. */
export function applyTimeout(state: CubesState, now: number): CubesState {
  if (state.phase === "ended" || now < state.closesAt) return state;
  const next = clone(state);
  next.phase = "ended";
  next.history.push({ type: "ended", reason: "time" });
  return next;
}

/** Ends the game where it stands: nobody is left to go on with it. */
export function abandon(state: CubesState): CubesState {
  if (state.phase === "ended") return state;
  const next = clone(state);
  next.phase = "ended";
  next.history.push({ type: "ended", reason: "abandoned" });
  return next;
}

/** Moves every clock of the game on by `by` ms: the time it stood still does not count. */
export function shiftClock(state: CubesState, by: number): CubesState {
  if (state.phase === "ended" || by === 0) return state;
  return {
    ...state,
    openedAt: state.openedAt + by,
    closesAt: state.closesAt + by,
    wrong: state.wrong.map((entry) => ({ ...entry, until: entry.until + by })),
  };
}

/** The game as `player` may see it (`null`: someone watching). The answer is in it only once the game is over. */
export function viewFor(state: CubesState, player: number | null): CubesView {
  return {
    phase: state.phase,
    you: player !== null && state.players.includes(player) ? player : null,
    solid: state.solid,
    needed: neededOf(state.players.length),
    ranked: state.ranked.map((entry) => ({ ...entry })),
    wrong: state.wrong.map((entry) => ({ player: entry.player, count: entry.count })),
    answer: state.phase === "ended" ? countOf(state.solid) : null,
    history: [...state.history],
  };
}
