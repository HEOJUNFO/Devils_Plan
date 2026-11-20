/**
 * The rules of 벽바둑Ⅱ (Wall Go II): on a board of squares each player moves
 * one of their counters and then places a wall on one side of it. Once the
 * walls have parted the players' counters from one another the game is over,
 * and each player scores the squares of the regions their counters are in.
 * Pure functions over plain data: nothing here reads the clock or stores
 * anything.
 *
 * Design: design/games/wall-go-2.md. From the show, as its dealer gives
 * them: a square counter that goes one or two squares in a straight line, a
 * round counter that goes one square and may then turn left or right for one
 * more, no square with another counter on it, no way through a wall, a wall
 * that must be placed on one of the four sides of the counter just moved and
 * not where one stands, a first game of three in which each player may once
 * break a wall on their way, the counters placed in turn and then in the
 * reverse order, the end at once when the counters are parted, the squares
 * of the regions added up and the larger region to part those level, and a
 * second game between the two who did not come first, with two counters of
 * each kind, the round ones on squares set beforehand, and no wall breaker.
 * What the show does not say, and what a room needs beyond it, is filled in
 * and marked (gap).
 */
import { randomInt, randomSource, seedFrom } from "../../game/rng";

/** The ways a counter goes and the sides a wall stands on. */
export const DIRS = ["up", "right", "down", "left"] as const;
export type Dir = (typeof DIRS)[number];

/** The two kinds of counter. */
export type Kind = "square" | "round";

/** A square of the board: `x` from the left, `y` from the top, both from 0. */
export interface Cell {
  x: number;
  y: number;
}

/** The numbers of the game. Loaded from `config.json`. */
export interface WallConfig {
  /** How many squares a side of the board has (the show's board has 49 squares). */
  size: number;
  /** How far a square counter goes in its line at most (the show: two). */
  squareReach: number;
  /** How many counters of each kind a player has in the game of three (the show: one), and in the game of two (the show: two). */
  countersOfThree: number;
  countersOfTwo: number;
  /**
   * (gap) Where the round counters stand at the start of a game of two: the
   * first player's, then the second player's. The show says only that the
   * squares are set beforehand; these are the squares of the first Wall Go,
   * one in from each corner, a diagonal to each player.
   */
  duelRounds: [Cell[], Cell[]];
  /** (gap) Seconds the end of the first game is shown before the second begins. */
  betweenSeconds: number;
}

const isWhole = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);

/** Whether `value` names a way to go. */
export function isDir(value: unknown): value is Dir {
  return typeof value === "string" && (DIRS as readonly string[]).includes(value);
}

/** Whether `config` can be played with. */
export function isValidConfig(config: WallConfig): boolean {
  const inside = (cell: Cell): boolean => isWhole(cell?.x) && isWhole(cell?.y) && cell.x >= 0 && cell.y >= 0 && cell.x < config.size && cell.y < config.size;
  if (!isWhole(config.size) || config.size < 3 || config.size > 9) return false;
  if (!isWhole(config.squareReach) || config.squareReach < 1) return false;
  if (!isWhole(config.countersOfThree) || config.countersOfThree < 1 || !isWhole(config.countersOfTwo) || config.countersOfTwo < 1) return false;
  if (!Array.isArray(config.duelRounds) || config.duelRounds.length !== 2) return false;
  const set = config.duelRounds.flat();
  if (!config.duelRounds.every((cells) => Array.isArray(cells) && cells.length === config.countersOfTwo) || !set.every(inside)) return false;
  if (new Set(set.map((cell) => `${cell.x},${cell.y}`)).size !== set.length) return false;
  // room on the board for every counter of the game of three, and of the game of two
  if (config.countersOfThree * 2 * 3 > config.size * config.size || config.countersOfTwo * 2 * 2 > config.size * config.size) return false;
  return typeof config.betweenSeconds === "number" && config.betweenSeconds > 0;
}

/** A counter on the board. */
export interface Counter extends Cell {
  player: number;
  kind: Kind;
}

/**
 * The board as it stands: what the moves are worked out from. A game's
 * state has it, and so has what a player is sent, so that a page shows where
 * a counter can go by the same rules the room holds it to.
 */
export interface Board {
  size: number;
  counters: Counter[];
  /**
   * The walls, two numbers a square: on its right side, then on its lower
   * side. 0 for none, else the player who placed it, plus one. The edge of
   * the board is a wall that is in no list.
   */
  walls: number[];
}

/** Which game of the match is played: all three, or two of them (or the two of a match of two). */
export type Mode = "three" | "duel";

/** The step a game is at: counters are placed, a counter is to be moved, a wall is to be placed, the first game's end is shown, or the match is over. */
export type WallPhase = "place" | "move" | "wall" | "between" | "ended";

/** Why a match is over: it was played out, too few of its players are left, or nobody is there. */
export type WallEnd = "played" | "left" | "abandoned";

/** What a player's counters hold when a game ends. */
export interface Score {
  player: number;
  /** The squares of the regions their counters are in, a region two of them share counted once. */
  total: number;
  /** The squares of the largest of those regions: what parts players level in the total. */
  largest: number;
  /** 1 for the most; players level in both share a place. */
  place: number;
}

/** A game of the match that has ended. */
export interface StageResult {
  stage: number;
  mode: Mode;
  scores: Score[];
}

/** Something that happened, as everyone is told it. */
export type WallEvent =
  | { type: "stage"; stage: number; mode: Mode; order: number[] }
  | { type: "placed"; player: number; kind: Kind; x: number; y: number; forced: boolean }
  | { type: "moved"; player: number; kind: Kind; from: Cell; to: Cell; broke: boolean }
  | { type: "wall"; player: number; x: number; y: number; side: Dir; forced: boolean }
  | { type: "passed"; player: number }
  | { type: "scored"; stage: number }
  | { type: "ended"; reason: WallEnd };

/** How many of the latest events a state keeps: enough for a page that was away a few turns to play them out. */
export const HISTORY_KEPT = 24;

/** One match, as the room stores it. Nothing in it is hidden from anyone. */
export interface WallState extends Board {
  version: 1;
  /** The players of the match, by the number each is known by, in the order of their numbers. */
  players: number[];
  /** The game being played: 1, or 2 for the game between the two who did not come first. */
  stage: number;
  mode: Mode;
  /** The players of the game being played, in the order of their turns. */
  order: number[];
  phase: WallPhase;
  /** Whose turn it is: to place a counter, to move one, or to place a wall. */
  turn: number;
  /** Whose counters are still to be placed, in the order they are: the head is `turn`. Empty once all are. */
  placing: number[];
  /** Who has broken a wall in this game. */
  breakers: number[];
  /** While a wall is to be placed: which counter was moved, by its place in `counters`. `null` at any other time. */
  moved: number | null;
  /** The counter each player moved last, by its place in `counters`: where a wall goes for them when their time runs out. */
  last: { player: number; counter: number }[];
  /** Seconds a turn lasts; 0 for no limit. The room's own (the show: ninety). */
  turnSeconds: number;
  /** When the last thing was done, in ms since the epoch: what a step with no limit is timed from. */
  at: number;
  /** When the turn, or the showing of the first game's end, is over, in ms since the epoch; `null` for a turn with no limit, and once the match is over. */
  until: number | null;
  /** The games that have ended, the first first. */
  results: StageResult[];
  /** The state of the game's own random sequence. */
  rng: number;
  /** The latest things that happened, and how many have happened in all. */
  history: WallEvent[];
  events: number;
  /** Why the match is over; `null` while it is played. */
  ended: WallEnd | null;
}

/** What a player can ask. */
export type WallAction =
  /** To place a counter of `kind` on an empty square, when it is their turn to. */
  | { type: "place"; kind: Kind; x: number; y: number }
  /** To move the counter at `from` along `path`, a square each step; `breaker` to break the one wall in its way. */
  | { type: "move"; from: Cell; path: Dir[]; breaker: boolean }
  /** To place a wall on `side` of the counter just moved; or, for a player none of whose counters can move, of their counter at `at`. */
  | { type: "wall"; side: Dir; at?: Cell };

/** Why something asked was not done. */
export type WallRefusal =
  /** The match is over. */
  | "game-over"
  /** The one asking is not a player of the game being played. */
  | "not-playing"
  /** What was sent is nothing the game knows. */
  | "bad-action"
  /** It is someone else's turn. */
  | "not-your-turn"
  /** Counters are not being placed now, or this is not the time to move, or to place a wall. */
  | "not-placing"
  | "not-moving"
  | "not-walling"
  /** The square is not on the board or has a counter on it. */
  | "square-taken"
  /** The player has no counter of that kind left to place. */
  | "kind-placed"
  /** There is no counter of the player's on that square. */
  | "not-your-counter"
  /** That counter does not go that way: not its kind of move, off the board, or onto or through another counter. */
  | "bad-move"
  /** A wall is in the way, and the player did not ask to break it or has no wall breaker. */
  | "wall-in-the-way"
  /** The wall breaker was asked for with no wall in the way, or with more than one. */
  | "nothing-to-break"
  /** A counter of the player's can move: a wall cannot be placed in place of a move. */
  | "must-move"
  /** A wall stands on that side already, or it is the edge of the board. */
  | "wall-there";

export type WallResult = { ok: true; state: WallState } | { ok: false; reason: WallRefusal };

/** Why a match was not made. */
export type WallStartRefusal = "bad-config" | "too-few" | "too-many" | "bad-players";

/** A way a counter can go. */
export interface Move {
  path: Dir[];
  to: Cell;
  /** Whether a wall is in the way, which the wall breaker would break. */
  breaks: boolean;
}

/** What one player, or someone watching, is sent of a match. Nothing in a match is hidden. */
export interface WallView extends Board {
  phase: WallPhase;
  stage: number;
  /** How many games the match is: two for three players, one for two. */
  stages: number;
  mode: Mode;
  /** The number of the player this is for; `null` for someone watching. */
  you: number | null;
  players: number[];
  order: number[];
  turn: number | null;
  placing: number[];
  /** The kinds of counter whoever's turn it is still has to place, where counters are being placed. */
  toPlace: Kind[];
  breakers: number[];
  /** Whether a wall can be broken in this game. */
  breaking: boolean;
  moved: number | null;
  turnSeconds: number;
  /** Whose each square is as the walls stand: the player whose counters alone are in its region, else `null`. Row after row. */
  owners: (number | null)[];
  /** What each player of the game being played holds as the walls stand. */
  scores: Score[];
  results: StageResult[];
  /** Where each player of the match ended, once it is over; `null` before. */
  places: { player: number; place: number }[] | null;
  history: WallEvent[];
  events: number;
  ended: WallEnd | null;
}

const STEP: Record<Dir, Cell> = { up: { x: 0, y: -1 }, right: { x: 1, y: 0 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 } };

/** The square next to `cell` on `dir`. */
export function stepFrom(cell: Cell, dir: Dir): Cell {
  return { x: cell.x + STEP[dir].x, y: cell.y + STEP[dir].y };
}

const onBoard = (board: Pick<Board, "size">, cell: Cell): boolean => cell.x >= 0 && cell.y >= 0 && cell.x < board.size && cell.y < board.size;

/** Where the wall on `side` of `cell` is in `walls`; `null` for the edge of the board. */
export function wallIndex(board: Pick<Board, "size">, cell: Cell, side: Dir): number | null {
  const there = stepFrom(cell, side);
  if (!onBoard(board, cell) || !onBoard(board, there)) return null;
  const at = side === "left" || side === "up" ? there : cell;
  return (at.y * board.size + at.x) * 2 + (side === "left" || side === "right" ? 0 : 1);
}

/** Who placed the wall on `side` of `cell`: `null` where there is none; the edge of the board is nobody's. */
export function wallOn(board: Board, cell: Cell, side: Dir): number | null {
  const index = wallIndex(board, cell, side);
  if (index === null) return null;
  const held = board.walls[index] ?? 0;
  return held === 0 ? null : held - 1;
}

/** Whether there is no going from `cell` to its neighbour on `side`: a wall, or the edge of the board. */
export function isBlocked(board: Board, cell: Cell, side: Dir): boolean {
  const index = wallIndex(board, cell, side);
  return index === null || (board.walls[index] ?? 0) !== 0;
}

/** The counter on `cell`, by its place in the board's list; -1 for none. */
export function counterAt(board: Board, cell: Cell): number {
  return board.counters.findIndex((each) => each.x === cell.x && each.y === cell.y);
}

/** The sides of `cell` a wall can be placed on: those with no wall, and not the edge. */
export function freeSides(board: Board, cell: Cell): Dir[] {
  return DIRS.filter((side) => !isBlocked(board, cell, side));
}

/** The turns a round counter that has gone `dir` may take: to its left and to its right. */
function turnsFrom(dir: Dir): Dir[] {
  return dir === "up" || dir === "down" ? ["left", "right"] : ["up", "down"];
}

/**
 * The ways the counter `index` can go: a square counter one square or more
 * in a straight line, up to its reach; a round counter one square, and from
 * there one more to its left or right. Never onto or (gap: the show's two
 * English captions differ) through another counter, and never back to where
 * it stands: every way ends on another square, so a counter that is moved
 * does move. A way with one wall in it is given with `breaks`: it is there
 * for a player with a wall breaker, and for nobody else. With two walls in
 * it, it is no way.
 */
export function movesOf(board: Board, index: number, reach: number): Move[] {
  const counter = board.counters[index];
  if (counter === undefined) return [];
  const moves: Move[] = [];
  /** Follows `path` from the counter: where it ends and how many walls are in it, or `null` where it leaves the board or meets a counter. */
  const follow = (path: Dir[]): { to: Cell; walls: number } | null => {
    let at: Cell = { x: counter.x, y: counter.y };
    let walls = 0;
    for (const dir of path) {
      const next = stepFrom(at, dir);
      if (!onBoard(board, next) || counterAt(board, next) >= 0) return null;
      if (isBlocked(board, at, dir)) walls += 1;
      at = next;
    }
    return { to: at, walls };
  };
  const add = (path: Dir[]): boolean => {
    const end = follow(path);
    if (end === null) return false;
    if (end.walls <= 1) moves.push({ path, to: end.to, breaks: end.walls === 1 });
    return true;
  };
  for (const dir of DIRS) {
    if (counter.kind === "square") {
      // as far as its reach, and no farther than the first square it cannot enter
      for (let far = 1; far <= reach; far++) if (!add(Array.from({ length: far }, () => dir))) break;
    } else if (add([dir])) {
      for (const turn of turnsFrom(dir)) add([dir, turn]);
    }
  }
  return moves;
}

/** Whether `player` has a counter that can move without breaking a wall. */
export function canMove(board: Board, player: number, reach: number): boolean {
  return board.counters.some((counter, index) => counter.player === player && movesOf(board, index, reach).some((move) => !move.breaks));
}

/** The squares of the board by region, as the walls part them: for each square the number of its region, row after row. */
export function regionsOf(board: Board): number[] {
  const region = Array.from({ length: board.size * board.size }, () => -1);
  let next = 0;
  for (let start = 0; start < region.length; start++) {
    if (region[start] >= 0) continue;
    const open = [start];
    region[start] = next;
    while (open.length > 0) {
      const at = open.pop() as number;
      const cell = { x: at % board.size, y: Math.floor(at / board.size) };
      for (const side of DIRS) {
        if (isBlocked(board, cell, side)) continue;
        const there = stepFrom(cell, side);
        const index = there.y * board.size + there.x;
        if (region[index] >= 0) continue;
        region[index] = next;
        open.push(index);
      }
    }
    next += 1;
  }
  return region;
}

/** For each region, the players who have a counter in it. */
function holdersOf(board: Board, region: readonly number[]): Map<number, Set<number>> {
  const holders = new Map<number, Set<number>>();
  for (const counter of board.counters) {
    const of = region[counter.y * board.size + counter.x];
    holders.set(of, (holders.get(of) ?? new Set<number>()).add(counter.player));
  }
  return holders;
}

/** Whether the counters are parted: no region has counters of two players in it. */
export function isParted(board: Board): boolean {
  for (const players of holdersOf(board, regionsOf(board)).values()) if (players.size > 1) return false;
  return true;
}

/** Whose each square is: the player whose counters alone are in its region; `null` for a region shared, and (gap) for one with no counter in it, which is nobody's. */
export function ownersOf(board: Board): (number | null)[] {
  const region = regionsOf(board);
  const holders = holdersOf(board, region);
  return region.map((of) => {
    const players = holders.get(of);
    return players !== undefined && players.size === 1 ? ([...players][0] as number) : null;
  });
}

/**
 * What each of `players` holds as the walls stand: the squares of the
 * regions that are theirs alone, each region once however many of their
 * counters are in it (gap), and the largest of those regions. The most
 * squares is first; of players with as many, whoever has the larger region;
 * those level in both share a place.
 */
export function scoresOf(board: Board, players: readonly number[]): Score[] {
  const region = regionsOf(board);
  const holders = holdersOf(board, region);
  const sizes = new Map<number, number>();
  for (const of of region) sizes.set(of, (sizes.get(of) ?? 0) + 1);
  const lines = players.map((player) => {
    const theirs = [...holders].filter(([, held]) => held.size === 1 && held.has(player)).map(([of]) => sizes.get(of) ?? 0);
    return { player, total: theirs.reduce((sum, each) => sum + each, 0), largest: Math.max(0, ...theirs) };
  });
  const better = (a: (typeof lines)[number], b: (typeof lines)[number]): boolean => a.total > b.total || (a.total === b.total && a.largest > b.largest);
  return lines.map((line) => ({ ...line, place: 1 + lines.filter((other) => better(other, line)).length })).sort((a, b) => a.place - b.place || a.player - b.player);
}

function clone(state: WallState): WallState {
  return {
    ...state,
    players: [...state.players],
    order: [...state.order],
    counters: state.counters.map((each) => ({ ...each })),
    walls: [...state.walls],
    placing: [...state.placing],
    breakers: [...state.breakers],
    last: state.last.map((each) => ({ ...each })),
    results: state.results.map((each) => ({ ...each, scores: each.scores.map((score) => ({ ...score })) })),
    history: [...state.history],
  };
}

/** Records something that happened. `state` is changed. */
function tell(state: WallState, event: WallEvent, now?: number): void {
  if (now !== undefined) state.at = now;
  state.history.push(event);
  if (state.history.length > HISTORY_KEPT) state.history.splice(0, state.history.length - HISTORY_KEPT);
  state.events += 1;
}

/** When a turn that begins at `now` is over; `null` where turns have no limit. */
const turnEnd = (state: WallState, now: number): number | null => (state.turnSeconds > 0 ? now + state.turnSeconds * 1000 : null);

/** The kinds of counter `player` still has to place in the game being played. */
export function kindsToPlace(state: Pick<WallState, "counters" | "mode">, player: number, config: WallConfig): Kind[] {
  const each = state.mode === "three" ? config.countersOfThree : config.countersOfTwo;
  const kinds: Kind[] = [];
  for (const kind of ["square", "round"] as const) {
    if (state.counters.filter((counter) => counter.player === player && counter.kind === kind).length < each) kinds.push(kind);
  }
  return kinds;
}

/**
 * Sets up the game `stage` for `order`, the first to play first: an empty
 * board, and the order in which counters are placed, which is the order of
 * play and then its reverse, as often as there are counters to place. In a
 * game of two the round counters stand on their squares already and only
 * the square ones are placed. `state` is changed.
 */
function openStage(state: WallState, stage: number, mode: Mode, order: number[], now: number, config: WallConfig): void {
  state.stage = stage;
  state.mode = mode;
  state.order = [...order];
  state.counters = [];
  state.walls = Array.from({ length: config.size * config.size * 2 }, () => 0);
  state.breakers = [];
  state.moved = null;
  state.last = [];
  if (mode === "duel") {
    order.forEach((player, at) => {
      for (const cell of config.duelRounds[at] ?? []) state.counters.push({ player, kind: "round", x: cell.x, y: cell.y });
    });
  }
  const each = mode === "three" ? config.countersOfThree * 2 : config.countersOfTwo;
  state.placing = [];
  for (let nth = 0; nth < each; nth++) state.placing.push(...(nth % 2 === 0 ? order : [...order].reverse()));
  state.phase = "place";
  state.turn = state.placing[0] ?? order[0];
  state.until = turnEnd(state, now);
  tell(state, { type: "stage", stage, mode, order: [...order] }, now);
}

/**
 * Starts a match for `players`: three play the show's two games, two play
 * the game of two alone (gap: the show's match is of three). (gap) Who is
 * first in the first game is drawn from `seed`; the show draws balls.
 * `turnSeconds` is the room's limit on a turn, 0 for none.
 */
export function createGame(
  start: { players: readonly number[]; seed: number; now: number; turnSeconds: number },
  config: WallConfig,
): { ok: true; state: WallState } | { ok: false; reason: WallStartRefusal } {
  if (!isValidConfig(config)) return { ok: false, reason: "bad-config" };
  if (!Array.isArray(start.players) || !start.players.every((player) => isWhole(player) && player >= 0)) return { ok: false, reason: "bad-players" };
  if (new Set(start.players).size !== start.players.length) return { ok: false, reason: "bad-players" };
  if (start.players.length < 2) return { ok: false, reason: "too-few" };
  if (start.players.length > 3) return { ok: false, reason: "too-many" };
  if (!(start.turnSeconds >= 0)) return { ok: false, reason: "bad-config" };
  const players = [...start.players].sort((a, b) => a - b);
  const random = randomSource(seedFrom(start.seed));
  // the order of play: from a player drawn by chance, round the players in the order of their numbers
  const from = randomInt(random.next, players.length);
  const order = [...players.slice(from), ...players.slice(0, from)];
  const state: WallState = {
    version: 1,
    players,
    size: config.size,
    counters: [],
    walls: [],
    stage: 1,
    mode: players.length === 3 ? "three" : "duel",
    order,
    phase: "place",
    turn: order[0],
    placing: [],
    breakers: [],
    moved: null,
    last: [],
    turnSeconds: start.turnSeconds,
    at: start.now,
    until: null,
    results: [],
    rng: random.state,
    history: [],
    events: 0,
    ended: null,
  };
  openStage(state, 1, state.mode, order, start.now, config);
  return { ok: true, state };
}

/** Reads what a player asked as it came off the wire; `null` for anything else. */
export function parseAction(raw: unknown): WallAction | null {
  if (typeof raw !== "object" || raw === null) return null;
  const data = raw as Record<string, unknown>;
  const cell = (value: unknown): Cell | null => {
    if (typeof value !== "object" || value === null) return null;
    const { x, y } = value as Record<string, unknown>;
    return isWhole(x) && isWhole(y) ? { x, y } : null;
  };
  if (data.type === "place") {
    if ((data.kind !== "square" && data.kind !== "round") || !isWhole(data.x) || !isWhole(data.y)) return null;
    return { type: "place", kind: data.kind, x: data.x, y: data.y };
  }
  if (data.type === "move") {
    const from = cell(data.from);
    if (from === null || !Array.isArray(data.path) || data.path.length < 1 || data.path.length > 8 || !data.path.every(isDir)) return null;
    return { type: "move", from, path: [...(data.path as Dir[])], breaker: data.breaker === true };
  }
  if (data.type === "wall") {
    if (!isDir(data.side)) return null;
    if (data.at === undefined) return { type: "wall", side: data.side };
    const at = cell(data.at);
    return at === null ? null : { type: "wall", side: data.side, at };
  }
  return null;
}

/** Whether `player` can do anything on their turn: move a counter, or place a wall beside one. */
function canAct(state: WallState, player: number, config: WallConfig): boolean {
  if (canMove(state, player, config.squareReach)) return true;
  return state.counters.some((counter) => counter.player === player && freeSides(state, counter).length > 0);
}

/**
 * Ends the game being played and says what everyone holds. After the game
 * of three, whoever is first alone is safe and the other two play the game
 * of two, the one who held more of the two first (gap: of two level in
 * everything, whoever played earlier). (gap) Where two or all three are
 * level in first place there is nobody to send on, and the match ends as
 * it stands. After any other game the match is over. `state` is changed.
 */
function closeStage(state: WallState, now: number, config: WallConfig): void {
  const scores = scoresOf(state, state.order);
  state.results.push({ stage: state.stage, mode: state.mode, scores });
  state.moved = null;
  tell(state, { type: "scored", stage: state.stage });
  const first = scores.filter((score) => score.place === 1);
  if (state.mode === "three" && first.length === 1) {
    state.phase = "between";
    state.until = now + config.betweenSeconds * 1000;
    return;
  }
  state.phase = "ended";
  state.until = null;
  state.ended = "played";
  tell(state, { type: "ended", reason: "played" });
}

/**
 * The turn passes to the next player of the game who can do anything: one
 * with no counter that can move and no side to place a wall on is passed
 * over (gap). `state` is changed.
 */
function nextTurn(state: WallState, now: number, config: WallConfig): void {
  state.moved = null;
  state.phase = "move";
  const at = state.order.indexOf(state.turn);
  for (let nth = 1; nth <= state.order.length; nth++) {
    const player = state.order[(at + nth) % state.order.length];
    if (canAct(state, player, config)) {
      state.turn = player;
      state.until = turnEnd(state, now);
      return;
    }
    tell(state, { type: "passed", player });
  }
  // nobody can do anything: the counters are as parted as they will ever be
  closeStage(state, now, config);
}

/** Places a counter for `player`. Then it is the next to place, or with every counter placed, the first player's turn to move. `state` is changed. */
function put(state: WallState, player: number, kind: Kind, cell: Cell, forced: boolean, now: number, config: WallConfig): void {
  state.counters.push({ player, kind, x: cell.x, y: cell.y });
  state.placing.shift();
  tell(state, { type: "placed", player, kind, x: cell.x, y: cell.y, forced }, now);
  const next = state.placing[0];
  if (next !== undefined) {
    state.turn = next;
    state.until = turnEnd(state, now);
    return;
  }
  // the first player moves first; nextTurn goes on from whoever is before them
  state.turn = state.order[state.order.length - 1];
  nextTurn(state, now, config);
}

/** Places a wall for `player` on `side` of the counter `index`, and ends the game if that parts the counters; else the turn passes. `state` is changed. */
function build(state: WallState, player: number, index: number, side: Dir, forced: boolean, now: number, config: WallConfig): void {
  const counter = state.counters[index];
  const at = wallIndex(state, counter, side) as number;
  state.walls[at] = player + 1;
  tell(state, { type: "wall", player, x: counter.x, y: counter.y, side, forced }, now);
  if (isParted(state)) closeStage(state, now, config);
  else nextTurn(state, now, config);
}

/** Does what `player` asked, if the rules allow it. `state` is not changed. */
export function applyAction(state: WallState, player: number, action: WallAction, now: number, config: WallConfig): WallResult {
  if (state.phase === "ended") return { ok: false, reason: "game-over" };
  if (!state.order.includes(player)) return { ok: false, reason: "not-playing" };
  if (state.phase === "between" || state.turn !== player) return { ok: false, reason: "not-your-turn" };
  if (action.type === "place") {
    if (state.phase !== "place") return { ok: false, reason: "not-placing" };
    const cell = { x: action.x, y: action.y };
    if (!onBoard(state, cell) || counterAt(state, cell) >= 0) return { ok: false, reason: "square-taken" };
    if (!kindsToPlace(state, player, config).includes(action.kind)) return { ok: false, reason: "kind-placed" };
    const next = clone(state);
    put(next, player, action.kind, cell, false, now, config);
    return { ok: true, state: next };
  }
  if (action.type === "move") {
    if (state.phase !== "move") return { ok: false, reason: "not-moving" };
    const index = counterAt(state, action.from);
    const counter = state.counters[index];
    if (counter === undefined || counter.player !== player) return { ok: false, reason: "not-your-counter" };
    const move = movesOf(state, index, config.squareReach).find((each) => each.path.length === action.path.length && each.path.every((dir, at) => dir === action.path[at]));
    if (move === undefined) {
      // a way that is the counter's own but for its walls is told apart from one that is no way of its kind
      const bare = movesOf({ ...state, walls: [] }, index, config.squareReach).some((each) => each.path.length === action.path.length && each.path.every((dir, at) => dir === action.path[at]));
      return { ok: false, reason: bare ? "wall-in-the-way" : "bad-move" };
    }
    const mayBreak = state.mode === "three" && !state.breakers.includes(player);
    if (move.breaks && !(action.breaker && mayBreak)) return { ok: false, reason: "wall-in-the-way" };
    if (!move.breaks && action.breaker) return { ok: false, reason: "nothing-to-break" };
    const next = clone(state);
    if (move.breaks) {
      // the wall in the way is gone from the board (gap: the show does not say what becomes of it)
      let at: Cell = { x: counter.x, y: counter.y };
      for (const dir of move.path) {
        const wall = wallIndex(next, at, dir);
        if (wall !== null && next.walls[wall] !== 0) next.walls[wall] = 0;
        at = stepFrom(at, dir);
      }
      next.breakers.push(player);
    }
    next.counters[index] = { ...counter, x: move.to.x, y: move.to.y };
    next.moved = index;
    next.last = [...next.last.filter((each) => each.player !== player), { player, counter: index }];
    next.phase = "wall";
    tell(next, { type: "moved", player, kind: counter.kind, from: { x: counter.x, y: counter.y }, to: { ...move.to }, broke: move.breaks }, now);
    return { ok: true, state: next };
  }
  let index: number;
  if (state.phase === "wall" && state.moved !== null) index = state.moved;
  else if (state.phase === "move") {
    // a wall in place of a move: only for a player none of whose counters can move
    if (canMove(state, player, config.squareReach)) return { ok: false, reason: "must-move" };
    index = action.at === undefined ? -1 : counterAt(state, action.at);
    if (state.counters[index]?.player !== player) return { ok: false, reason: "not-your-counter" };
  } else return { ok: false, reason: "not-walling" };
  if (!freeSides(state, state.counters[index]).includes(action.side)) return { ok: false, reason: "wall-there" };
  const next = clone(state);
  build(next, player, index, action.side, false, now, config);
  return { ok: true, state: next };
}

/**
 * (gap) Does for whoever's turn it is what their time has run out on, or
 * what they are not there to do: a counter still to be placed goes on an
 * empty square drawn by chance; a wall goes on a free side, drawn by
 * chance, of the counter just moved, or with none moved this turn, of the
 * counter they moved last (the first of theirs that has a free side where
 * that one has none). The show says that a wall is placed at random and
 * does not say that a counter is moved: none is. `state` is changed.
 */
function actForThem(state: WallState, now: number, config: WallConfig): void {
  const random = randomSource(state.rng);
  const player = state.turn;
  if (state.phase === "place") {
    const empty: Cell[] = [];
    for (let y = 0; y < state.size; y++) for (let x = 0; x < state.size; x++) if (counterAt(state, { x, y }) < 0) empty.push({ x, y });
    const kind = kindsToPlace(state, player, config)[0] ?? "square";
    const cell = empty[randomInt(random.next, empty.length)];
    state.rng = random.state;
    put(state, player, kind, cell, true, now, config);
    return;
  }
  const own = state.counters.map((counter, index) => ({ counter, index })).filter((each) => each.counter.player === player);
  const lastMoved = state.last.find((each) => each.player === player)?.counter;
  const wanted = state.phase === "wall" && state.moved !== null ? state.moved : (lastMoved ?? own[0]?.index ?? -1);
  const index = [wanted, ...own.map((each) => each.index)].find((each) => each >= 0 && freeSides(state, state.counters[each]).length > 0);
  if (index === undefined) {
    tell(state, { type: "passed", player }, now);
    nextTurn(state, now, config);
    return;
  }
  const sides = freeSides(state, state.counters[index]);
  const side = sides[randomInt(random.next, sides.length)];
  state.rng = random.state;
  build(state, player, index, side, true, now, config);
}

/**
 * Moves the match on where whoever's turn it is, is not `there`: what they
 * would be waited for is done for them at once, turn after turn. Returns
 * `state` itself when the turn is someone's who is there.
 */
export function moveOn(state: WallState, there: (player: number) => boolean, now: number, config: WallConfig): WallState {
  let next = state;
  // bounded: every turn done for someone places a counter or a wall, or passes with nobody able to place one
  for (let turns = 0; turns < 4 * state.size * state.size; turns++) {
    if (next.phase === "ended" || next.phase === "between" || there(next.turn)) break;
    if (next === state) next = clone(state);
    actForThem(next, now, config);
  }
  return next;
}

/**
 * (gap) Ends the match if fewer than two players of the game being played
 * are `there`: there is nobody to play against. Returns `state` itself
 * otherwise.
 */
export function closeIfLeft(state: WallState, there: (player: number) => boolean): WallState {
  if (state.phase === "ended" || state.order.filter(there).length >= 2) return state;
  const next = clone(state);
  next.phase = "ended";
  next.until = null;
  next.ended = "left";
  tell(next, { type: "ended", reason: "left" });
  return next;
}

/** The moment the match next needs the clock. `null` for a turn with no limit, and once it is over. */
export function deadline(state: WallState): number | null {
  return state.phase === "ended" ? null : state.until;
}

/**
 * The time of the turn may have run out, or the first game's end has been
 * shown long enough. One step at a time: whatever follows gets its whole
 * time from `now`. Returns `state` itself when nothing is due.
 */
export function applyTimeout(state: WallState, now: number, config: WallConfig): WallState {
  if (state.phase === "ended" || state.until === null || now < state.until) return state;
  const next = clone(state);
  if (state.phase === "between") {
    // the two who were not first, the one who held more first
    const scores = state.results.at(-1)?.scores ?? [];
    const rest = scores.filter((score) => score.place !== 1).map((score) => score.player);
    rest.sort((a, b) => (scores.find((s) => s.player === a)?.place ?? 0) - (scores.find((s) => s.player === b)?.place ?? 0) || state.order.indexOf(a) - state.order.indexOf(b));
    openStage(next, state.stage + 1, "duel", rest, now, config);
    return next;
  }
  actForThem(next, now, config);
  return next;
}

/** Ends the match where it stands: nobody is left to go on with it. */
export function abandon(state: WallState): WallState {
  if (state.phase === "ended") return state;
  const next = clone(state);
  next.phase = "ended";
  next.until = null;
  next.ended = "abandoned";
  tell(next, { type: "ended", reason: "abandoned" });
  return next;
}

/** Moves the match's clock on by `by` ms: the time it stood still does not count. */
export function shiftClock(state: WallState, by: number): WallState {
  if (state.phase === "ended" || by === 0) return state;
  return { ...state, at: state.at + by, until: state.until === null ? null : state.until + by };
}

/**
 * Where everyone ended in a match played out: after the show's two games,
 * whoever was first of three is first, and the other two are second and
 * third as their game of two came out, level in second where they were
 * level in it. A match that was one game has that game's places. `null`
 * while the match is played, and for one cut short.
 */
export function placesOf(state: WallState): { player: number; place: number }[] | null {
  if (state.phase !== "ended" || state.ended !== "played") return null;
  const last = state.results.at(-1);
  if (last === undefined) return null;
  const places = new Map<number, number>();
  if (state.results.length > 1) {
    for (const score of state.results[0].scores) if (score.place === 1) places.set(score.player, 1);
    for (const score of last.scores) places.set(score.player, score.place + 1);
  } else for (const score of last.scores) places.set(score.player, score.place);
  return state.players.map((player) => ({ player, place: places.get(player) ?? state.players.length })).sort((a, b) => a.place - b.place || a.player - b.player);
}

/** The match as `player` sees it (`null`: someone watching). Everyone sees the same board; only `you` differs. */
export function viewFor(state: WallState, player: number | null, config: WallConfig): WallView {
  const playing = state.phase !== "ended" && state.phase !== "between";
  return {
    size: state.size,
    counters: state.counters.map((each) => ({ ...each })),
    walls: [...state.walls],
    phase: state.phase,
    stage: state.stage,
    stages: state.players.length === 3 ? 2 : 1,
    mode: state.mode,
    you: player !== null && state.players.includes(player) ? player : null,
    players: [...state.players],
    order: [...state.order],
    turn: playing ? state.turn : null,
    placing: [...state.placing],
    toPlace: state.phase === "place" ? kindsToPlace(state, state.turn, config) : [],
    breakers: [...state.breakers],
    breaking: state.mode === "three",
    moved: state.moved,
    turnSeconds: state.turnSeconds,
    owners: ownersOf(state),
    scores: scoresOf(state, state.order),
    results: state.results.map((each) => ({ ...each, scores: each.scores.map((score) => ({ ...score })) })),
    places: placesOf(state),
    history: state.history.map((event) => ({ ...event })),
    events: state.events,
    ended: state.ended,
  };
}
