import { describe, expect, it } from "vitest";
import configJson from "../../../src/shared/games/wall-go-2/config.json";
import {
  abandon,
  applyAction,
  applyTimeout,
  canMove,
  closeIfLeft,
  createGame,
  deadline,
  freeSides,
  isParted,
  isValidConfig,
  kindsToPlace,
  moveOn,
  movesOf,
  ownersOf,
  parseAction,
  placesOf,
  regionsOf,
  scoresOf,
  shiftClock,
  viewFor,
  wallOn,
  type Board,
  type Cell,
  type Counter,
  type Dir,
  type WallAction,
  type WallConfig,
  type WallState,
} from "../../../src/shared/games/wall-go-2/rules";
import { DUEL, SQUARES, SQUARE_REACH, THREE } from "./documented";

const config = configJson as WallConfig;
const T0 = 1_000_000;

/** A board of the game's size with `counters` on it and no wall. */
function boardOf(counters: Counter[], size = config.size): Board {
  return { size, counters, walls: Array.from({ length: size * size * 2 }, () => 0) };
}

/** Puts a wall of `player` on `side` of `cell`. `board` is changed. */
function wall(board: Board, cell: Cell, side: Dir, player = 0): void {
  const at = side === "left" ? { x: cell.x - 1, y: cell.y } : side === "up" ? { x: cell.x, y: cell.y - 1 } : cell;
  board.walls[(at.y * board.size + at.x) * 2 + (side === "left" || side === "right" ? 0 : 1)] = player + 1;
}

/** Walls right across the board below row `y`. */
function wallBelow(board: Board, y: number): void {
  for (let x = 0; x < board.size; x++) wall(board, { x, y }, "down");
}

/** Walls right down the board to the right of column `x`. */
function wallRightOf(board: Board, x: number): void {
  for (let y = 0; y < board.size; y++) wall(board, { x, y }, "right");
}

const ends = (board: Board, index: number): string[] =>
  movesOf(board, index, config.squareReach)
    .filter((move) => !move.breaks)
    .map((move) => `${move.to.x},${move.to.y}`)
    .sort();

function start(players: number[], turnSeconds = 90, seed = 1): WallState {
  const created = createGame({ players, seed, now: T0, turnSeconds }, config);
  if (!created.ok) throw new Error(created.reason);
  return created.state;
}

function act(state: WallState, player: number, action: WallAction, now = T0): WallState {
  const result = applyAction(state, player, action, now, config);
  if (!result.ok) throw new Error(result.reason);
  return result.state;
}

const refusal = (state: WallState, player: number, action: WallAction): string => {
  const result = applyAction(state, player, action, T0, config);
  return result.ok ? "ok" : result.reason;
};

/** Places every counter still to be placed, each on the next square of `cells`. */
function placeAll(state: WallState, cells: Cell[]): WallState {
  let next = state;
  let at = 0;
  while (next.phase === "place") {
    const kind = kindsToPlace(next, next.turn, config)[0];
    next = act(next, next.turn, { type: "place", kind, ...cells[at++] });
  }
  return next;
}

/** A game of three in play, on a board the test sets up: `order` to play, the first to move. */
function playing(board: Board, order: number[], mode: "three" | "duel" = "three"): WallState {
  const state = start(mode === "three" ? [0, 1, 2] : [0, 1]);
  return { ...state, ...board, mode, order, phase: "move", turn: order[0], placing: [], until: T0 + 90_000 };
}

describe("the numbers of the game", () => {
  it("are the show's: 49 squares, a reach of two, one counter of each kind for three and two for two", () => {
    expect(isValidConfig(config)).toBe(true);
    expect(config.size * config.size).toBe(SQUARES);
    expect(config.squareReach).toBe(SQUARE_REACH);
    expect(config.countersOfThree).toBe(THREE.square);
    expect(config.countersOfTwo).toBe(DUEL.round);
  });

  it("set the round counters of a game of two one square in from each corner, a diagonal to each player", () => {
    expect(config.duelRounds).toEqual([
      [{ x: 1, y: 5 }, { x: 5, y: 1 }],
      [{ x: 5, y: 5 }, { x: 1, y: 1 }],
    ]);
  });

  it("are refused when the set squares are off the board, shared, or too few", () => {
    expect(isValidConfig({ ...config, duelRounds: [[{ x: 1, y: 5 }, { x: 7, y: 1 }], config.duelRounds[1]] })).toBe(false);
    expect(isValidConfig({ ...config, duelRounds: [[{ x: 1, y: 1 }, { x: 5, y: 1 }], config.duelRounds[1]] })).toBe(false);
    expect(isValidConfig({ ...config, duelRounds: [[{ x: 1, y: 5 }], config.duelRounds[1]] })).toBe(false);
    expect(isValidConfig({ ...config, size: 2 })).toBe(false);
    expect(isValidConfig({ ...config, betweenSeconds: 0 })).toBe(false);
  });
});

describe("starting a match", () => {
  it("takes two or three players and no other number", () => {
    expect(createGame({ players: [0], seed: 1, now: T0, turnSeconds: 0 }, config)).toEqual({ ok: false, reason: "too-few" });
    expect(createGame({ players: [0, 1, 2, 3], seed: 1, now: T0, turnSeconds: 0 }, config)).toEqual({ ok: false, reason: "too-many" });
    expect(createGame({ players: [0, 0], seed: 1, now: T0, turnSeconds: 0 }, config)).toEqual({ ok: false, reason: "bad-players" });
    expect(start([0, 1]).mode).toBe("duel");
    expect(start([3, 5, 9]).mode).toBe("three");
  });

  it("draws who is first by the seed, and goes round the players from them", () => {
    const firsts = new Set<number>();
    for (let seed = 0; seed < 40; seed++) {
      const state = start([0, 1, 2], 90, seed);
      firsts.add(state.order[0]);
      const at = [0, 1, 2].indexOf(state.order[0]);
      expect(state.order).toEqual([0, 1, 2].map((_, nth) => [0, 1, 2][(at + nth) % 3]));
    }
    expect([...firsts].sort()).toEqual([0, 1, 2]);
  });

  it("has three players place a counter each in turn and then in the reverse order, on an empty board", () => {
    const state = start([0, 1, 2]);
    expect(state.counters).toEqual([]);
    expect(state.phase).toBe("place");
    expect(state.placing).toEqual(THREE.placing.map((nth) => state.order[nth]));
    expect(state.turn).toBe(state.order[0]);
  });

  it("has two players find their round counters set and place the square ones first, second, second, first", () => {
    const state = start([0, 1]);
    expect(state.counters).toEqual([
      { player: state.order[0], kind: "round", x: 1, y: 5 },
      { player: state.order[0], kind: "round", x: 5, y: 1 },
      { player: state.order[1], kind: "round", x: 5, y: 5 },
      { player: state.order[1], kind: "round", x: 1, y: 1 },
    ]);
    expect(state.placing).toEqual(DUEL.placing.map((nth) => state.order[nth]));
    expect(kindsToPlace(state, state.order[0], config)).toEqual(["square"]);
  });

  it("gives a turn the room's time, and no end where the room sets none", () => {
    expect(deadline(start([0, 1], 90))).toBe(T0 + 90_000);
    expect(deadline(start([0, 1], 0))).toBeNull();
  });
});

describe("placing the counters", () => {
  it("lets a player choose which kind goes down first, and not a kind already down", () => {
    let state = start([0, 1, 2]);
    const [a] = state.order;
    state = act(state, a, { type: "place", kind: "round", x: 3, y: 3 });
    expect(state.counters).toEqual([{ player: a, kind: "round", x: 3, y: 3 }]);
    // the other four placements before the first player's second
    for (let x = 0; x < 4; x++) state = act(state, state.turn, { type: "place", kind: kindsToPlace(state, state.turn, config)[0], x, y: 0 });
    expect(state.turn).toBe(a);
    expect(refusal(state, a, { type: "place", kind: "round", x: 6, y: 6 })).toBe("kind-placed");
    expect(refusal(state, a, { type: "place", kind: "square", x: 3, y: 3 })).toBe("square-taken");
    expect(refusal(state, a, { type: "place", kind: "square", x: 7, y: 0 })).toBe("square-taken");
  });

  it("refuses whoever's turn it is not, and a move before the counters are down", () => {
    const state = start([0, 1, 2]);
    const [a, b] = state.order;
    expect(refusal(state, b, { type: "place", kind: "square", x: 0, y: 0 })).toBe("not-your-turn");
    expect(refusal(state, a, { type: "move", from: { x: 0, y: 0 }, path: ["right"], breaker: false })).toBe("not-moving");
    expect(refusal(state, a, { type: "wall", side: "up" })).toBe("not-walling");
    expect(refusal(state, 7, { type: "place", kind: "square", x: 0, y: 0 })).toBe("not-playing");
  });

  it("gives the first player the first move once every counter is down", () => {
    const state = placeAll(start([0, 1, 2]), [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 6 }, { x: 2, y: 6 }, { x: 0, y: 6 }]);
    expect(state.phase).toBe("move");
    expect(state.turn).toBe(state.order[0]);
    expect(state.counters).toHaveLength(6);
    expect(state.placing).toEqual([]);
  });
});

describe("how a square counter goes", () => {
  it("one or two squares in a straight line", () => {
    const board = boardOf([{ player: 0, kind: "square", x: 3, y: 3 }]);
    expect(ends(board, 0)).toEqual(["1,3", "2,3", "3,1", "3,2", "3,4", "3,5", "4,3", "5,3"]);
  });

  it("not off the board", () => {
    const board = boardOf([{ player: 0, kind: "square", x: 0, y: 0 }]);
    expect(ends(board, 0)).toEqual(["0,1", "0,2", "1,0", "2,0"]);
  });

  it("not onto another counter, nor past one", () => {
    const board = boardOf([
      { player: 0, kind: "square", x: 3, y: 3 },
      { player: 1, kind: "round", x: 4, y: 3 },
      { player: 0, kind: "round", x: 3, y: 5 },
    ]);
    expect(ends(board, 0)).toEqual(["1,3", "2,3", "3,1", "3,2", "3,4"]);
  });

  it("not through a wall, which stops the second step as it stops the first", () => {
    const board = boardOf([{ player: 0, kind: "square", x: 3, y: 3 }]);
    wall(board, { x: 3, y: 3 }, "right");
    wall(board, { x: 3, y: 2 }, "up");
    expect(ends(board, 0)).toEqual(["1,3", "2,3", "3,2", "3,4", "3,5"]);
  });
});

describe("how a round counter goes", () => {
  it("one square, and from there one more to its left or right: never two in a line, never back", () => {
    const board = boardOf([{ player: 0, kind: "round", x: 3, y: 3 }]);
    expect(ends(board, 0)).toEqual(["2,2", "2,2", "2,3", "2,4", "2,4", "3,2", "3,4", "4,2", "4,2", "4,3", "4,4", "4,4"]);
    expect(ends(board, 0)).not.toContain("3,3");
    expect(ends(board, 0)).not.toContain("5,3");
  });

  it("not round a corner whose first square has a counter on it", () => {
    const board = boardOf([
      { player: 0, kind: "round", x: 0, y: 0 },
      { player: 1, kind: "square", x: 1, y: 0 },
    ]);
    // right is taken; down, and from there the turn to the right (left is off the board)
    expect(ends(board, 0)).toEqual(["0,1", "1,1"]);
  });

  it("not through a wall on either step", () => {
    const board = boardOf([{ player: 0, kind: "round", x: 0, y: 0 }]);
    wall(board, { x: 0, y: 0 }, "right");
    wall(board, { x: 0, y: 1 }, "right");
    expect(ends(board, 0)).toEqual(["0,1"]);
  });
});

describe("a turn: a move, then a wall", () => {
  const set = (): WallState =>
    playing(
      boardOf([
        { player: 0, kind: "square", x: 3, y: 3 },
        { player: 0, kind: "round", x: 0, y: 6 },
        { player: 1, kind: "square", x: 6, y: 0 },
        { player: 2, kind: "square", x: 0, y: 0 },
      ]),
      [0, 1, 2],
    );

  it("moves the counter and then waits for the same player's wall", () => {
    const state = act(set(), 0, { type: "move", from: { x: 3, y: 3 }, path: ["up", "up"], breaker: false });
    expect(state.counters[0]).toEqual({ player: 0, kind: "square", x: 3, y: 1 });
    expect(state.phase).toBe("wall");
    expect(state.turn).toBe(0);
    expect(state.moved).toBe(0);
    expect(state.history.at(-1)).toEqual({ type: "moved", player: 0, kind: "square", from: { x: 3, y: 3 }, to: { x: 3, y: 1 }, broke: false });
  });

  it("refuses a way the counter does not go, a counter that is not the player's, and a second move", () => {
    const state = set();
    expect(refusal(state, 0, { type: "move", from: { x: 3, y: 3 }, path: ["up", "left"], breaker: false })).toBe("bad-move");
    expect(refusal(state, 0, { type: "move", from: { x: 3, y: 3 }, path: ["up", "up", "up"], breaker: false })).toBe("bad-move");
    expect(refusal(state, 0, { type: "move", from: { x: 0, y: 6 }, path: ["up", "up"], breaker: false })).toBe("bad-move");
    expect(refusal(state, 0, { type: "move", from: { x: 6, y: 0 }, path: ["down"], breaker: false })).toBe("not-your-counter");
    expect(refusal(state, 1, { type: "move", from: { x: 6, y: 0 }, path: ["down"], breaker: false })).toBe("not-your-turn");
    const moved = act(state, 0, { type: "move", from: { x: 3, y: 3 }, path: ["up"], breaker: false });
    expect(refusal(moved, 0, { type: "move", from: { x: 3, y: 2 }, path: ["up"], breaker: false })).toBe("not-moving");
  });

  it("does not let a wall be placed in place of a move while a counter can move", () => {
    expect(refusal(set(), 0, { type: "wall", side: "up", at: { x: 3, y: 3 } })).toBe("must-move");
  });

  it("places the wall on a side of the counter just moved, and passes the turn", () => {
    let state = act(set(), 0, { type: "move", from: { x: 3, y: 3 }, path: ["up"], breaker: false });
    state = act(state, 0, { type: "wall", side: "left" }, T0 + 5_000);
    expect(wallOn(state, { x: 3, y: 2 }, "left")).toBe(0);
    expect(wallOn(state, { x: 2, y: 2 }, "right")).toBe(0);
    expect(state.phase).toBe("move");
    expect(state.turn).toBe(1);
    expect(state.moved).toBeNull();
    expect(state.until).toBe(T0 + 5_000 + 90_000);
  });

  it("keeps who placed each wall", () => {
    let state = act(set(), 0, { type: "move", from: { x: 3, y: 3 }, path: ["up"], breaker: false });
    state = act(state, 0, { type: "wall", side: "left" });
    state = act(state, 1, { type: "move", from: { x: 6, y: 0 }, path: ["down"], breaker: false });
    state = act(state, 1, { type: "wall", side: "down" });
    expect(wallOn(state, { x: 3, y: 2 }, "left")).toBe(0);
    expect(wallOn(state, { x: 6, y: 1 }, "down")).toBe(1);
    expect(wallOn(state, { x: 6, y: 2 }, "up")).toBe(1);
    expect(wallOn(state, { x: 6, y: 1 }, "right")).toBeNull();
    expect(state.turn).toBe(2);
  });

  it("refuses a wall where one stands and on the edge of the board", () => {
    const board = set();
    wall(board, { x: 3, y: 2 }, "up", 1);
    let state = act(board, 0, { type: "move", from: { x: 3, y: 3 }, path: ["up"], breaker: false });
    expect(refusal(state, 0, { type: "wall", side: "up" })).toBe("wall-there");
    state = act(set(), 0, { type: "move", from: { x: 0, y: 6 }, path: ["up"], breaker: false });
    expect(refusal(state, 0, { type: "wall", side: "left" })).toBe("wall-there");
    expect(freeSides(state, { x: 0, y: 5 })).toEqual(["up", "right", "down"]);
  });

  it("lets a player none of whose counters can move place a wall beside one of them", () => {
    const board = boardOf([
      { player: 0, kind: "square", x: 0, y: 0 },
      { player: 1, kind: "square", x: 1, y: 0 },
      { player: 1, kind: "round", x: 0, y: 1 },
      { player: 2, kind: "square", x: 6, y: 6 },
    ]);
    const state = playing(board, [0, 1, 2]);
    expect(canMove(state, 0, config.squareReach)).toBe(false);
    expect(refusal(state, 0, { type: "wall", side: "right" })).toBe("not-your-counter");
    const next = act(state, 0, { type: "wall", side: "right", at: { x: 0, y: 0 } });
    expect(wallOn(next, { x: 0, y: 0 }, "right")).toBe(0);
    expect(next.turn).toBe(1);
  });
});

describe("the wall breaker", () => {
  const set = (mode: "three" | "duel" = "three"): WallState => {
    const board = boardOf([
      { player: 0, kind: "square", x: 3, y: 3 },
      { player: 1, kind: "square", x: 6, y: 0 },
      { player: 2, kind: "square", x: 0, y: 0 },
    ]);
    wall(board, { x: 3, y: 3 }, "right", 1);
    return playing(board, mode === "three" ? [0, 1, 2] : [0, 1], mode);
  };

  it("takes a counter through one wall in the game of three, and the wall is gone", () => {
    const state = act(set(), 0, { type: "move", from: { x: 3, y: 3 }, path: ["right", "right"], breaker: true });
    expect(state.counters[0]).toMatchObject({ x: 5, y: 3 });
    expect(wallOn(state, { x: 3, y: 3 }, "right")).toBeNull();
    expect(state.breakers).toEqual([0]);
    expect(state.history.at(-1)).toMatchObject({ type: "moved", broke: true });
  });

  it("is not used unasked: a wall in the way stops the move", () => {
    expect(refusal(set(), 0, { type: "move", from: { x: 3, y: 3 }, path: ["right"], breaker: false })).toBe("wall-in-the-way");
  });

  it("is refused where no wall is in the way, and where two are", () => {
    const state = set();
    expect(refusal(state, 0, { type: "move", from: { x: 3, y: 3 }, path: ["left"], breaker: true })).toBe("nothing-to-break");
    wall(state, { x: 4, y: 3 }, "right", 2);
    expect(refusal(state, 0, { type: "move", from: { x: 3, y: 3 }, path: ["right", "right"], breaker: true })).toBe("wall-in-the-way");
  });

  it("is each player's once", () => {
    const state = { ...set(), breakers: [0] };
    expect(refusal(state, 0, { type: "move", from: { x: 3, y: 3 }, path: ["right"], breaker: true })).toBe("wall-in-the-way");
  });

  it("is not there in a game of two", () => {
    expect(refusal(set("duel"), 0, { type: "move", from: { x: 3, y: 3 }, path: ["right"], breaker: true })).toBe("wall-in-the-way");
    expect(viewFor(set("duel"), 0, config).breaking).toBe(false);
    expect(viewFor(set(), 0, config).breaking).toBe(true);
  });
});

describe("regions and what they are worth", () => {
  it("counts the whole board as one region with no wall on it", () => {
    const board = boardOf([{ player: 0, kind: "square", x: 0, y: 0 }]);
    expect(new Set(regionsOf(board)).size).toBe(1);
    expect(scoresOf(board, [0])).toEqual([{ player: 0, total: 49, largest: 49, place: 1 }]);
  });

  it("is not parted while two players' counters share a region", () => {
    const board = boardOf([
      { player: 0, kind: "square", x: 0, y: 0 },
      { player: 1, kind: "square", x: 6, y: 6 },
    ]);
    expect(isParted(board)).toBe(false);
    expect(scoresOf(board, [0, 1]).map((score) => score.total)).toEqual([0, 0]);
    wallBelow(board, 2);
    expect(isParted(board)).toBe(true);
  });

  it("adds up the regions a player's counters are in, a region two of them share once", () => {
    const board = boardOf([
      { player: 0, kind: "square", x: 0, y: 0 },
      { player: 0, kind: "round", x: 1, y: 0 },
      { player: 0, kind: "square", x: 0, y: 6 },
      { player: 1, kind: "square", x: 6, y: 3 },
    ]);
    wallBelow(board, 0); // row 0: 7 squares, two counters of player 0
    wallBelow(board, 4); // rows 1 to 4: 28 squares, player 1; rows 5 and 6: 14 squares, player 0
    expect(scoresOf(board, [0, 1])).toEqual([
      { player: 1, total: 28, largest: 28, place: 1 },
      { player: 0, total: 21, largest: 14, place: 2 },
    ]);
  });

  it("gives a region with no counter in it to nobody", () => {
    const board = boardOf([
      { player: 0, kind: "square", x: 0, y: 0 },
      { player: 1, kind: "square", x: 0, y: 6 },
    ]);
    wallBelow(board, 1);
    wallBelow(board, 4);
    expect(scoresOf(board, [0, 1]).map((score) => [score.player, score.total])).toEqual([[1, 14], [0, 14]].sort((a, b) => a[0] - b[0]));
    const owners = ownersOf(board);
    expect(owners[0]).toBe(0);
    expect(owners[3 * 7]).toBeNull();
    expect(owners[6 * 7]).toBe(1);
  });

  it("parts players level in squares by the larger region, and has those level in both share a place", () => {
    const board = boardOf([
      { player: 0, kind: "square", x: 0, y: 0 },
      { player: 0, kind: "round", x: 0, y: 2 },
      { player: 1, kind: "square", x: 0, y: 4 },
      { player: 2, kind: "square", x: 0, y: 6 },
    ]);
    wallBelow(board, 0); // row 0: 7, player 0
    wallBelow(board, 2); // rows 1 and 2: 14, player 0
    wallBelow(board, 5); // rows 3 to 5: 21, player 1; row 6: 7, player 2
    expect(scoresOf(board, [0, 1, 2])).toEqual([
      { player: 1, total: 21, largest: 21, place: 1 },
      { player: 0, total: 21, largest: 14, place: 2 },
      { player: 2, total: 7, largest: 7, place: 3 },
    ]);
    const level = boardOf([
      { player: 0, kind: "square", x: 0, y: 0 },
      { player: 1, kind: "square", x: 3, y: 3 },
    ], 4);
    wallBelow(level, 1);
    expect(scoresOf(level, [0, 1]).map((score) => score.place)).toEqual([1, 1]);
  });
});

describe("the end of a game", () => {
  /** Player 0 above the wall but for one gap at the right; players 1 and 2 below, parted but for one gap. */
  const nearly = (): WallState => {
    const board = boardOf([
      { player: 0, kind: "round", x: 5, y: 1 },
      { player: 1, kind: "square", x: 0, y: 6 },
      { player: 2, kind: "square", x: 6, y: 6 },
    ]);
    for (let x = 0; x < 6; x++) wall(board, { x, y: 2 }, "down");
    for (let y = 3; y < 6; y++) wall(board, { x: 2, y }, "right");
    return playing(board, [0, 1, 2]);
  };

  it("comes at once when a wall parts every player's counters", () => {
    let state = nearly();
    // 0 moves to the gap in the wall across and closes it
    state = act(state, 0, { type: "move", from: { x: 5, y: 1 }, path: ["down", "right"], breaker: false });
    state = act(state, 0, { type: "wall", side: "down" });
    expect(state.phase).toBe("move");
    // 1 goes to the gap in the wall down and closes it: all three are parted
    state = act(state, 1, { type: "move", from: { x: 0, y: 6 }, path: ["right", "right"], breaker: false });
    state = act(state, 1, { type: "wall", side: "right" }, T0 + 9_000);
    expect(state.phase).toBe("between");
    expect(state.results).toEqual([
      {
        stage: 1,
        mode: "three",
        scores: [
          { player: 0, total: 21, largest: 21, place: 1 },
          { player: 2, total: 16, largest: 16, place: 2 },
          { player: 1, total: 12, largest: 12, place: 3 },
        ],
      },
    ]);
    expect(state.until).toBe(T0 + 9_000 + config.betweenSeconds * 1000);
    expect(refusal(state, 2, { type: "move", from: { x: 6, y: 6 }, path: ["up"], breaker: false })).toBe("not-your-turn");
  });

  it("is followed by the game of two between those who were not first, whoever held more to play first", () => {
    let state = nearly();
    state = act(state, 0, { type: "move", from: { x: 5, y: 1 }, path: ["down", "right"], breaker: false });
    state = act(state, 0, { type: "wall", side: "down" });
    state = act(state, 1, { type: "move", from: { x: 0, y: 6 }, path: ["right", "right"], breaker: false });
    state = act(state, 1, { type: "wall", side: "right" }, T0 + 9_000);
    expect(applyTimeout(state, T0 + 9_000 + 11_999, config)).toBe(state);
    const next = applyTimeout(state, T0 + 21_000, config);
    expect(next.stage).toBe(2);
    expect(next.mode).toBe("duel");
    expect(next.order).toEqual([2, 1]);
    expect(next.phase).toBe("place");
    expect(next.turn).toBe(2);
    expect(next.placing).toEqual([2, 1, 1, 2]);
    expect(next.breakers).toEqual([]);
    expect(next.walls.every((each) => each === 0)).toBe(true);
    expect(next.counters).toEqual([
      { player: 2, kind: "round", x: 1, y: 5 },
      { player: 2, kind: "round", x: 5, y: 1 },
      { player: 1, kind: "round", x: 5, y: 5 },
      { player: 1, kind: "round", x: 1, y: 1 },
    ]);
    expect(refusal(next, 0, { type: "place", kind: "square", x: 0, y: 0 })).toBe("not-playing");
    expect(placesOf(next)).toBeNull();
  });

  it("ends a match of three with first place to the first game's winner and the rest by the second game", () => {
    const board = boardOf([
      { player: 2, kind: "round", x: 1, y: 5 },
      { player: 1, kind: "round", x: 5, y: 5 },
      { player: 2, kind: "square", x: 0, y: 0 },
      { player: 1, kind: "square", x: 6, y: 0 },
    ]);
    for (let y = 0; y < 7; y++) if (y !== 0) wall(board, { x: 2, y }, "right");
    const first = { stage: 1, mode: "three" as const, scores: scoresOf(boardOf([{ player: 0, kind: "square" as const, x: 0, y: 0 }]), [0, 1, 2]) };
    let state: WallState = { ...playing(board, [2, 1], "duel"), players: [0, 1, 2], stage: 2, results: [first] };
    state = act(state, 2, { type: "move", from: { x: 0, y: 0 }, path: ["right", "right"], breaker: false });
    state = act(state, 2, { type: "wall", side: "right" });
    expect(state.phase).toBe("ended");
    expect(state.ended).toBe("played");
    expect(deadline(state)).toBeNull();
    // 2 holds columns 0 to 2 (21 squares), 1 holds columns 3 to 6 (28)
    expect(placesOf(state)).toEqual([
      { player: 0, place: 1 },
      { player: 1, place: 2 },
      { player: 2, place: 3 },
    ]);
    expect(refusal(state, 1, { type: "move", from: { x: 6, y: 0 }, path: ["down"], breaker: false })).toBe("game-over");
  });

  it("ends a match of three after one game where first place is shared: there is nobody to send on", () => {
    const board = boardOf([
      { player: 0, kind: "square", x: 0, y: 0 },
      { player: 1, kind: "square", x: 0, y: 3 },
      { player: 2, kind: "square", x: 1, y: 6 },
    ]);
    wallBelow(board, 2);
    for (let x = 1; x < 7; x++) wall(board, { x, y: 5 }, "down");
    let state = playing(board, [2, 0, 1]);
    // rows 0 to 2 are player 0's (21); 2 goes up through the gap and closes it behind: rows 3 to 5 (21) shared by 1 and 2 no more
    state = act(state, 2, { type: "move", from: { x: 1, y: 6 }, path: ["left"], breaker: false });
    state = act(state, 2, { type: "wall", side: "up" });
    expect(state.phase).toBe("ended");
    expect(state.results[0].scores.map((score) => [score.player, score.total, score.place])).toEqual([
      [0, 21, 1],
      [1, 21, 1],
      [2, 7, 3],
    ]);
    expect(placesOf(state)).toEqual([
      { player: 0, place: 1 },
      { player: 1, place: 1 },
      { player: 2, place: 3 },
    ]);
  });

  it("ends a match of two after its one game, with that game's places", () => {
    const board = boardOf([
      { player: 0, kind: "square", x: 0, y: 0 },
      { player: 1, kind: "square", x: 6, y: 0 },
    ]);
    for (let y = 1; y < 7; y++) wall(board, { x: 2, y }, "right");
    let state = playing(board, [0, 1], "duel");
    state = act(state, 0, { type: "move", from: { x: 0, y: 0 }, path: ["right", "right"], breaker: false });
    state = act(state, 0, { type: "wall", side: "right" });
    expect(state.ended).toBe("played");
    expect(placesOf(state)).toEqual([
      { player: 1, place: 1 },
      { player: 0, place: 2 },
    ]);
    expect(viewFor(state, 0, config).stages).toBe(1);
  });
});

describe("a turn whose time runs out", () => {
  it("places a counter still to be placed on an empty square", () => {
    const state = start([0, 1, 2]);
    expect(applyTimeout(state, T0 + 89_999, config)).toBe(state);
    const next = applyTimeout(state, T0 + 90_000, config);
    expect(next.counters).toHaveLength(1);
    expect(next.counters[0].player).toBe(state.order[0]);
    expect(next.history.at(-1)).toMatchObject({ type: "placed", forced: true });
    expect(next.turn).toBe(state.order[1]);
    expect(next.until).toBe(T0 + 180_000);
  });

  it("moves no counter, and places a wall beside the counter the player moved last", () => {
    const board = boardOf([
      { player: 0, kind: "square", x: 3, y: 3 },
      { player: 0, kind: "round", x: 0, y: 6 },
      { player: 1, kind: "square", x: 6, y: 0 },
      { player: 2, kind: "square", x: 0, y: 0 },
    ]);
    const state: WallState = { ...playing(board, [0, 1, 2]), last: [{ player: 0, counter: 1 }] };
    const next = applyTimeout(state, T0 + 90_000, config);
    expect(next.counters).toEqual(state.counters);
    const event = next.history.at(-1);
    expect(event).toMatchObject({ type: "wall", player: 0, x: 0, y: 6, forced: true });
    expect(next.walls.filter((each) => each !== 0)).toEqual([1]);
    expect(next.turn).toBe(1);
  });

  it("places the wall beside the counter just moved when the move was made and the wall was not", () => {
    const board = boardOf([
      { player: 0, kind: "square", x: 3, y: 3 },
      { player: 1, kind: "square", x: 6, y: 0 },
      { player: 2, kind: "square", x: 0, y: 0 },
    ]);
    const moved = act(playing(board, [0, 1, 2]), 0, { type: "move", from: { x: 3, y: 3 }, path: ["down", "down"], breaker: false }, T0 + 80_000);
    // the move does not give the turn more time
    expect(moved.until).toBe(T0 + 90_000);
    const next = applyTimeout(moved, T0 + 90_000, config);
    expect(next.history.at(-1)).toMatchObject({ type: "wall", player: 0, x: 3, y: 5, forced: true });
    expect(next.turn).toBe(1);
  });
});

describe("players who are not there", () => {
  it("are not waited for: the room places their counters and their walls", () => {
    const state = start([0, 1, 2], 0);
    const gone = state.order[0];
    const next = moveOn(state, (player) => player !== gone, T0, config);
    expect(next.counters).toHaveLength(1);
    expect(next.turn).toBe(state.order[1]);
    expect(moveOn(next, (player) => player !== gone, T0, config)).toBe(next);
  });

  it("end the match when fewer than two of a game's players are left", () => {
    const state = start([0, 1, 2]);
    expect(closeIfLeft(state, (player) => player !== 0)).toBe(state);
    const over = closeIfLeft(state, (player) => player === 0);
    expect(over.phase).toBe("ended");
    expect(over.ended).toBe("left");
    expect(placesOf(over)).toBeNull();
    expect(over.history.at(-1)).toEqual({ type: "ended", reason: "left" });
  });

  it("leave a match with nobody in it abandoned", () => {
    const over = abandon(start([0, 1]));
    expect(over.ended).toBe("abandoned");
    expect(abandon(over)).toBe(over);
  });
});

describe("the clock", () => {
  it("is moved on by the time the match stood still", () => {
    const state = start([0, 1]);
    const shifted = shiftClock(state, 30_000);
    expect(shifted.until).toBe(T0 + 120_000);
    expect(shifted.at).toBe(T0 + 30_000);
    expect(shiftClock(state, 0)).toBe(state);
    const free = shiftClock(start([0, 1], 0), 30_000);
    expect(free.until).toBeNull();
    expect(free.at).toBe(T0 + 30_000);
  });
});

describe("what comes off the wire", () => {
  it("is read when it is one of the three things a player can ask", () => {
    expect(parseAction({ type: "place", kind: "round", x: 1, y: 2 })).toEqual({ type: "place", kind: "round", x: 1, y: 2 });
    expect(parseAction({ type: "move", from: { x: 1, y: 2 }, path: ["up", "left"] })).toEqual({ type: "move", from: { x: 1, y: 2 }, path: ["up", "left"], breaker: false });
    expect(parseAction({ type: "move", from: { x: 1, y: 2 }, path: ["up"], breaker: true })).toMatchObject({ breaker: true });
    expect(parseAction({ type: "wall", side: "down" })).toEqual({ type: "wall", side: "down" });
    expect(parseAction({ type: "wall", side: "down", at: { x: 0, y: 0 } })).toEqual({ type: "wall", side: "down", at: { x: 0, y: 0 } });
  });

  it("is nothing otherwise", () => {
    for (const raw of [null, 3, {}, { type: "place", kind: "star", x: 0, y: 0 }, { type: "place", kind: "round", x: 0.5, y: 0 }, { type: "move", from: { x: 0, y: 0 }, path: [] }, { type: "move", from: { x: 0, y: 0 }, path: ["north"] }, { type: "move", path: ["up"] }, { type: "wall", side: "in" }, { type: "wall", side: "up", at: 3 }]) {
      expect(parseAction(raw)).toBeNull();
    }
  });
});

describe("what a player is sent", () => {
  it("is the whole board, the same for everyone but for who they are", () => {
    const state = placeAll(start([0, 1, 2]), [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 6 }, { x: 2, y: 6 }, { x: 0, y: 6 }]);
    const mine = viewFor(state, 1, config);
    const watching = viewFor(state, null, config);
    expect(mine.you).toBe(1);
    expect(watching.you).toBeNull();
    expect({ ...mine, you: null }).toEqual(watching);
    expect(mine.stages).toBe(2);
    expect(mine.turn).toBe(state.order[0]);
    expect(mine.owners).toHaveLength(49);
    expect(mine.owners.every((owner) => owner === null)).toBe(true);
    expect(viewFor(state, 8, config).you).toBeNull();
  });

  it("names the kinds whoever's turn it is still has to place", () => {
    const state = start([0, 1, 2]);
    expect(viewFor(state, null, config).toPlace).toEqual(["square", "round"]);
    const next = act(state, state.order[0], { type: "place", kind: "square", x: 0, y: 0 });
    expect(viewFor(next, null, config).toPlace).toEqual(["square", "round"]);
    expect(kindsToPlace(next, state.order[0], config)).toEqual(["round"]);
  });
});
