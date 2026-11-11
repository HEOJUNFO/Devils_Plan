import { describe, expect, it } from "vitest";
import { randomSource } from "../../../src/shared/game/rng";
import shipped from "../../../src/shared/games/lay-the-grass/config.json";
import {
  TILES,
  abandon,
  applyAction,
  applyTimeout,
  coveredBy,
  createGame,
  deadline,
  drawPark,
  fits,
  hasCell,
  isValidConfig,
  layOrderOf,
  moveFor,
  parkSize,
  parseAction,
  pickOrderOf,
  shiftClock,
  tileOf,
  turned,
  viewFor,
  waysToLay,
  type GrassAction,
  type GrassConfig,
  type GrassState,
  type Park,
  type Placement,
  type Tile,
} from "../../../src/shared/games/lay-the-grass/rules";

/**
 * The bare mini-game, three parks of it: the values shipped, without the
 * either-or choices that go with it. Those have tests of their own
 * (`choices.test.ts`); here the picking and the laying are tested by
 * themselves.
 */
const CONFIG: GrassConfig = { ...shipped, rounds: 3, choices: [] };

/** An arbitrary moment the tests call the start of the game, in ms. */
const START = 2_000_000;
const PICK_MS = CONFIG.pickSeconds * 1000;
const PLACE_MS = CONFIG.placeSeconds * 1000;
const PAUSE_MS = CONFIG.pauseSeconds * 1000;

/** A game of players 0..count-1 started at START, or an error if it could not be. */
function game(count: number, seed = 7, config: GrassConfig = CONFIG): GrassState {
  const created = createGame({ players: Array.from({ length: count }, (_, id) => id), seed, now: START }, config);
  if (!created.ok) throw new Error(`fixture game refused: ${created.reason}`);
  return created.state;
}

/** Applies an action that the test expects to be accepted. */
function act(state: GrassState, player: number, action: GrassAction, now: number, config: GrassConfig = CONFIG): GrassState {
  const result = applyAction(state, player, action, now, config);
  if (!result.ok) throw new Error(`fixture action refused: ${result.reason}`);
  return result.state;
}

/** The same game on a park of the test's own, for cases that need a known shape. */
function onPark(state: GrassState, rows: string[]): GrassState {
  return { ...state, park: { rows } };
}

/** Everyone picks in turn what `tiles` gives them (by player id), a second apart. */
function pickAll(state: GrassState, tiles: Record<number, number>, config: GrassConfig = CONFIG): GrassState {
  let next = state;
  let now = START + 1000;
  while (next.phase === "pick" && next.turn !== null) {
    next = act(next, next.turn.player, { type: "pick", tile: tiles[next.turn.player] }, now, config);
    now += 1000;
  }
  return next;
}

/** The cells of a tile as a set of "row,col", for comparing shapes. */
function shape(tile: Tile): string[] {
  return tile.cells.map((cell) => `${cell.row},${cell.col}`).sort();
}

/** Whether every cell of `park` can be reached from every other by stepping across sides. */
function isConnected(park: Park): boolean {
  const cells: [number, number][] = [];
  park.rows.forEach((line, row) => Array.from(line).forEach((mark, col) => mark === "#" && cells.push([row, col])));
  if (cells.length === 0) return false;
  const seen = new Set<string>([cells[0].join()]);
  const queue = [cells[0]];
  while (queue.length > 0) {
    const [row, col] = queue.pop()!;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next: [number, number] = [row + dr, col + dc];
      if (hasCell(park, next[0], next[1]) && !seen.has(next.join())) {
        seen.add(next.join());
        queue.push(next);
      }
    }
  }
  return seen.size === cells.length;
}

describe("the shipped rules of Lay the Grass", () => {
  it("are a game that can be played", () => {
    expect(isValidConfig(CONFIG)).toBe(true);
  });

  it("give a park the document's number of cells for the document's number of players", () => {
    expect(CONFIG.cellsPerPlayer * 16 + CONFIG.extraCells).toBe(114);
  });

  it.each([
    ["no park at all", { rounds: 0 }],
    ["no time to pick", { pickSeconds: 0 }],
    ["no time to lay", { placeSeconds: 0 }],
    ["a pause of less than nothing", { pauseSeconds: -1 }],
    ["fewer extra cells than none", { extraCells: -1 }],
    ["a box with no width", { maxCols: 0 }],
    ["a default tile that does not exist", { defaultTile: 5 }],
    ["a park built of tiles no tile is the size of", { cellsPerPlayer: 6 }],
    ["half a park", { rounds: 1.5 }],
  ])("are refused with %s", (_what, change) => {
    expect(isValidConfig({ ...CONFIG, ...change })).toBe(false);
    expect(createGame({ players: [0, 1], seed: 1, now: START }, { ...CONFIG, ...change })).toEqual({ ok: false, reason: "bad-config" });
  });
});

describe("the seven tiles", () => {
  it("are numbered as the document numbers them, the number being the points and not the size", () => {
    expect(TILES.map((tile) => tile.number)).toEqual([3, 4, 6, 7, 9, 11, 13]);
    expect(TILES.map((tile) => tile.cells.length)).toEqual([10, 9, 8, 7, 7, 7, 9]);
  });

  it("each have one cell with the number on it, and more holes the higher the number", () => {
    expect(TILES.map((tile) => tile.cells.filter((cell) => cell.kind === "number").length)).toEqual([1, 1, 1, 1, 1, 1, 1]);
    expect(TILES.map((tile) => tile.cells.filter((cell) => cell.kind === "hole").length)).toEqual([0, 2, 3, 4, 5, 6, 8]);
  });

  it("lie in the boxes they are drawn in", () => {
    expect(TILES.map((tile) => [tile.rows, tile.cols])).toEqual([[4, 3], [4, 3], [4, 3], [4, 3], [5, 2], [4, 4], [3, 3]]);
  });

  it("are found by their number, and not by any other", () => {
    expect(tileOf(9)?.number).toBe(9);
    expect(tileOf(5)).toBeUndefined();
  });
});

describe("turning a tile", () => {
  it("lays its box on its side with each quarter turn", () => {
    const nine = tileOf(9)!;

    expect([turned(nine, 1).rows, turned(nine, 1).cols]).toEqual([2, 5]);
    expect([turned(nine, 2).rows, turned(nine, 2).cols]).toEqual([5, 2]);
  });

  it("goes clockwise: the foot of tile 3 points left after one turn", () => {
    const three = tileOf(3)!;

    // drawn, the foot is the one cell of the bottom row; turned once it is the one cell of the left column
    expect(three.cells.filter((cell) => cell.row === 3).map((cell) => cell.col)).toEqual([1]);
    expect(turned(three, 1).cells.filter((cell) => cell.col === 0).map((cell) => cell.row)).toEqual([1]);
    expect(turned(three, 2).cells.filter((cell) => cell.row === 0).map((cell) => cell.col)).toEqual([1]);
    expect(turned(three, 3).cells.filter((cell) => cell.col === 3).map((cell) => cell.row)).toEqual([1]);
  });

  it.each(TILES.map((tile) => tile.number))("brings tile %i back to itself after four turns, with every cell's kind", (number) => {
    const tile = tileOf(number)!;

    expect(turned(tile, 4)).toEqual(tile);
    expect(shape(turned(turned(tile, 1), 3))).toEqual(shape(tile));
    expect(turned(tile, 5).cells.map((cell) => cell.kind).sort()).toEqual(tile.cells.map((cell) => cell.kind).sort());
  });

  it("never makes the mirror image of a tile that has one", () => {
    const mirrored = (tile: Tile): string[] => tile.cells.map((cell) => `${cell.row},${tile.cols - 1 - cell.col}`).sort();
    // tile 9 in the mirror is another tile: no turn of the real one is it
    const nine = tileOf(9)!;

    for (let turns = 0; turns < 4; turns++) expect(shape(turned(nine, turns))).not.toEqual(mirrored(nine));
    // tile 3 is its own mirror image, so the check above means something
    expect(shape(tileOf(3)!)).toEqual(mirrored(tileOf(3)!));
  });
});

describe("laying a tile on a park", () => {
  /** A park the shape of tile 3 with one more cell at its right. */
  const PARK: Park = { rows: ["###.", "####", "###.", ".#.."] };
  const nobody: Placement[] = [];

  it("covers the cells its turned shape lies on", () => {
    expect(coveredBy(tileOf(13)!, 2, 1, 0).map((cell) => [cell.row, cell.col])).toContainEqual([4, 3]);
    expect(coveredBy(tileOf(9)!, 0, 0, 1)).toHaveLength(7);
  });

  it("fits where every cell lies on the park", () => {
    expect(fits(PARK, nobody, 3, 0, 0, 0)).toBe(true);
  });

  it("does not fit where a cell would leave the park or lie where the park has no cell", () => {
    expect(fits(PARK, nobody, 3, 0, 1, 0)).toBe(false);
    expect(fits(PARK, nobody, 3, -1, 0, 0)).toBe(false);
    expect(fits(PARK, nobody, 3, 0, 0, 2)).toBe(false);
    expect(fits(PARK, nobody, 13, 1, 1, 0)).toBe(false);
  });

  it("does not fit on a tile already there, and fits beside it", () => {
    const wide: Park = { rows: ["######", "######", "######"] };
    const there: Placement[] = [{ player: 0, tile: 13, row: 0, col: 0, turns: 0 }];

    expect(fits(wide, there, 13, 0, 2, 0)).toBe(false);
    expect(fits(wide, there, 13, 0, 3, 0)).toBe(true);
  });

  it("does not fit a tile that does not exist", () => {
    expect(fits(PARK, nobody, 5, 0, 0, 0)).toBe(false);
    expect(waysToLay(PARK, nobody, 5)).toEqual([]);
  });

  it("lists every way a tile can still go: by turn, then from the top, then from the left", () => {
    const wide: Park = { rows: ["####", "####", "####"] };

    expect(waysToLay(wide, nobody, 13)).toEqual([
      { row: 0, col: 0, turns: 0 },
      { row: 0, col: 1, turns: 0 },
      { row: 0, col: 0, turns: 1 },
      { row: 0, col: 1, turns: 1 },
      { row: 0, col: 0, turns: 2 },
      { row: 0, col: 1, turns: 2 },
      { row: 0, col: 0, turns: 3 },
      { row: 0, col: 1, turns: 3 },
    ]);
    // the cell at the park's right takes the foot of tile 3 as well as the cell at its bottom does
    expect(waysToLay(PARK, nobody, 3)).toEqual([
      { row: 0, col: 0, turns: 0 },
      { row: 0, col: 0, turns: 3 },
    ]);
  });

  it("lists nothing for a tile with nowhere to go", () => {
    const there: Placement[] = [{ player: 0, tile: 3, row: 0, col: 0, turns: 0 }];

    expect(waysToLay(PARK, there, 13)).toEqual([]);
    expect(waysToLay({ rows: ["##", "##"] }, nobody, 9)).toEqual([]);
  });
});

describe("drawing a park", () => {
  it.each([2, 3, 4, 5, 6])("gives %i players seven cells each and two more, in one piece inside the box", (players) => {
    for (let seed = 1; seed <= 40; seed++) {
      const { park } = drawPark(randomSource(seed * 7919).next, players, CONFIG);

      expect(parkSize(park)).toBe(CONFIG.cellsPerPlayer * players + CONFIG.extraCells);
      expect(park.rows.length).toBeLessThanOrEqual(CONFIG.maxRows);
      expect(Math.max(...park.rows.map((row) => row.length))).toBeLessThanOrEqual(CONFIG.maxCols);
      expect(new Set(park.rows.map((row) => row.length)).size).toBe(1);
      expect(isConnected(park)).toBe(true);
    }
  });

  it.each([2, 3, 4, 5, 6])("has room, while it is empty, for every one of the seven tiles, for %i players", (players) => {
    for (let seed = 1; seed <= 30; seed++) {
      const { park } = drawPark(randomSource(seed * 7919).next, players, CONFIG);

      for (const tile of TILES) expect(waysToLay(park, [], tile.number).length).toBeGreaterThan(0);
    }
  });

  it("has no empty row or column around it", () => {
    const { park } = drawPark(randomSource(99).next, 4, CONFIG);
    const width = park.rows[0].length;

    expect(park.rows[0]).toContain("#");
    expect(park.rows[park.rows.length - 1]).toContain("#");
    expect(park.rows.some((row) => row[0] === "#")).toBe(true);
    expect(park.rows.some((row) => row[width - 1] === "#")).toBe(true);
  });

  it.each([2, 4, 6])("is built of one tile for each of %i players, so that everyone can lay one", (players) => {
    for (let seed = 1; seed <= 25; seed++) {
      const { park, built } = drawPark(randomSource(seed * 104729).next, players, CONFIG);
      const laid: Placement[] = [];

      expect(built).toHaveLength(players);
      for (const placement of built) {
        expect(tileOf(placement.tile)?.cells).toHaveLength(CONFIG.cellsPerPlayer);
        expect(fits(park, laid, placement.tile, placement.row, placement.col, placement.turns)).toBe(true);
        laid.push(placement);
      }
    }
  });

  it("is the same park for the same draws, and another for others", () => {
    const first = drawPark(randomSource(5).next, 4, CONFIG).park;
    const again = drawPark(randomSource(5).next, 4, CONFIG).park;
    const others = [6, 7, 8, 9].map((seed) => drawPark(randomSource(seed).next, 4, CONFIG).park);

    expect(again).toEqual(first);
    expect(others.some((park) => park.rows.join("/") !== first.rows.join("/"))).toBe(true);
  });

  it("draws a plain park of the right size when none will fit the box", () => {
    const cramped: GrassConfig = { ...CONFIG, maxRows: 2, maxCols: 3 };

    const { park, built } = drawPark(randomSource(1).next, 4, cramped);

    expect(built).toEqual([]);
    expect(parkSize(park)).toBe(CONFIG.cellsPerPlayer * 4 + CONFIG.extraCells);
    expect(isConnected(park)).toBe(true);
  });
});

describe("the order of picking and of laying", () => {
  const players = [
    { id: 4, score: 9 },
    { id: 2, score: 3 },
    { id: 7, score: 9 },
    { id: 1, score: 3 },
  ];

  it("lets the player with the fewest points pick first, and of two with the same the one higher in the priority", () => {
    expect(pickOrderOf(players)).toEqual([2, 1, 4, 7]);
  });

  it("lets the lowest tile be laid first, and of two the same the one higher in the priority", () => {
    const picks = [
      { player: 1, tile: 9 },
      { player: 2, tile: 13 },
      { player: 7, tile: 9 },
      { player: 4, tile: 6 },
    ];

    expect(layOrderOf(players, picks)).toEqual([4, 7, 1, 2]);
  });
});

describe("createGame", () => {
  it("draws the priority by lot: every player once, the same for the same seed", () => {
    const state = game(5, 11);

    expect(state.players.map((player) => player.id).sort()).toEqual([0, 1, 2, 3, 4]);
    expect(game(5, 11).players).toEqual(state.players);
    expect(new Set([1, 2, 3, 4, 5, 6].map((seed) => game(5, seed).players.map((player) => player.id).join())).size).toBeGreaterThan(1);
  });

  it("does not let the order players were named in decide the lot", () => {
    const one = createGame({ players: [3, 1, 2], seed: 4, now: START }, CONFIG);
    const other = createGame({ players: [2, 3, 1], seed: 4, now: START }, CONFIG);

    if (!one.ok || !other.ok) throw new Error("fixture game refused");
    expect(other.state.players).toEqual(one.state.players);
  });

  it("starts with nobody having points, the first park up and the highest in the priority to pick", () => {
    const state = game(4);

    expect(state.players.every((player) => player.score === 0)).toBe(true);
    expect(state).toMatchObject({ phase: "pick", round: 1, picks: [], placed: [], failed: [], layOrder: [] });
    expect(state.pickOrder).toEqual(state.players.map((player) => player.id));
    expect(state.turn).toEqual({ player: state.players[0].id, since: START });
    expect(parkSize(state.park)).toBe(CONFIG.cellsPerPlayer * 4 + CONFIG.extraCells);
    expect(state.history).toEqual([{ type: "park", round: 1 }]);
  });

  it.each([
    ["one player alone", [0], "too-few"],
    ["nobody", [], "too-few"],
    ["the same player twice", [1, 1, 2], "bad-players"],
    ["a player who is not a whole number", [0, 1.5], "bad-players"],
  ])("refuses %s", (_what, players, reason) => {
    expect(createGame({ players, seed: 1, now: START }, CONFIG)).toEqual({ ok: false, reason });
  });
});

describe("picking", () => {
  it("takes a pick from the player whose turn it is, in front of everyone, and passes the turn on", () => {
    const state = game(3);
    const [first, second] = state.pickOrder;

    const next = act(state, first, { type: "pick", tile: 9 }, START + 5000);

    expect(next.picks).toEqual([{ player: first, tile: 9 }]);
    expect(next.turn).toEqual({ player: second, since: START + 5000 });
    expect(next.history.at(-1)).toEqual({ type: "pick", round: 1, player: first, tile: 9, forced: false });
    expect(viewFor(next, second, CONFIG).picks).toEqual([{ player: first, tile: 9 }]);
  });

  it("refuses a pick out of turn, from someone not playing, or of a tile that does not exist", () => {
    const state = game(3);
    const [first, second] = state.pickOrder;

    expect(applyAction(state, second, { type: "pick", tile: 9 }, START + 1, CONFIG)).toEqual({ ok: false, reason: "not-your-turn" });
    expect(applyAction(state, 99, { type: "pick", tile: 9 }, START + 1, CONFIG)).toEqual({ ok: false, reason: "not-playing" });
    expect(applyAction(state, first, { type: "pick", tile: 5 }, START + 1, CONFIG)).toEqual({ ok: false, reason: "no-such-tile" });
    expect(applyAction(state, first, { type: "pick", tile: 9.5 }, START + 1, CONFIG)).toEqual({ ok: false, reason: "no-such-tile" });
  });

  it("lets two players pick the same tile", () => {
    const state = game(2);

    const next = pickAll(state, { 0: 9, 1: 9 });

    expect(next.picks.map((pick) => pick.tile)).toEqual([9, 9]);
    expect(next.phase).toBe("place");
  });

  it("does not let a pick be changed: a second one is out of turn", () => {
    const state = game(3);
    const first = state.pickOrder[0];
    const next = act(state, first, { type: "pick", tile: 9 }, START + 1000);

    expect(applyAction(next, first, { type: "pick", tile: 13 }, START + 2000, CONFIG)).toEqual({ ok: false, reason: "not-your-turn" });
  });

  it("starts the laying when the last player has picked: lowest number first, the priority deciding between the same", () => {
    const state = game(3);
    const [high, middle, low] = state.players.map((player) => player.id);

    const next = pickAll(state, { [high]: 13, [middle]: 9, [low]: 9 });

    expect(next.phase).toBe("place");
    expect(next.layOrder).toEqual([middle, low, high]);
    expect(next.turn?.player).toBe(middle);
  });

  it("refuses a pick once the laying has started", () => {
    const next = pickAll(game(2), { 0: 9, 1: 9 });

    expect(applyAction(next, next.turn!.player, { type: "pick", tile: 7 }, START + 9000, CONFIG)).toEqual({ ok: false, reason: "not-picking" });
  });

  it("does not change the state it was given", () => {
    const state = game(2);
    const before = structuredClone(state);

    act(state, state.pickOrder[0], { type: "pick", tile: 9 }, START + 1);

    expect(state).toEqual(before);
  });
});

describe("laying", () => {
  /** Two players on a park of the test's own, with their tiles picked: the laying has begun. */
  function laying(rows: string[], tiles: Record<number, number>): GrassState {
    return pickAll(onPark(game(2), rows), tiles);
  }
  const WIDE = ["######", "######", "######"];
  /** Long enough for tile 9 on its side and tile 13 beside it. */
  const LONG = ["########", "########", "########"];

  it("lays the tile where it fits, and gives the turn to the next", () => {
    const state = laying(WIDE, { 0: 13, 1: 13 });
    const [first, second] = state.layOrder;

    const next = act(state, first, { type: "lay", row: 0, col: 0, turns: 0 }, START + 20_000);

    expect(next.placed).toEqual([{ player: first, tile: 13, row: 0, col: 0, turns: 0 }]);
    expect(next.turn).toEqual({ player: second, since: START + 20_000 });
    expect(next.history.at(-1)).toEqual({ type: "lay", round: 1, player: first, tile: 13, forced: false, cut: 0 });
  });

  it("refuses a tile that would leave the park or lie on another, and changes nothing", () => {
    const state = laying(WIDE, { 0: 13, 1: 13 });
    const [first, second] = state.layOrder;
    const one = act(state, first, { type: "lay", row: 0, col: 0, turns: 0 }, START + 20_000);

    expect(applyAction(state, first, { type: "lay", row: 0, col: 4, turns: 0 }, START + 20_000, CONFIG)).toEqual({ ok: false, reason: "does-not-fit" });
    expect(applyAction(one, second, { type: "lay", row: 0, col: 2, turns: 0 }, START + 21_000, CONFIG)).toEqual({ ok: false, reason: "does-not-fit" });
    expect(one.placed).toHaveLength(1);
  });

  it("refuses a lay out of turn, before the laying, or with a turn or a place that is no number of the grid", () => {
    const picking = game(2);
    const state = laying(WIDE, { 0: 13, 1: 13 });
    const [first, second] = state.layOrder;

    expect(applyAction(picking, picking.turn!.player, { type: "lay", row: 0, col: 0, turns: 0 }, START + 1, CONFIG)).toEqual({ ok: false, reason: "not-laying" });
    expect(applyAction(state, second, { type: "lay", row: 0, col: 0, turns: 0 }, START + 20_000, CONFIG)).toEqual({ ok: false, reason: "not-your-turn" });
    expect(applyAction(state, first, { type: "lay", row: 0, col: 0, turns: 4 }, START + 20_000, CONFIG)).toEqual({ ok: false, reason: "bad-action" });
    expect(applyAction(state, first, { type: "lay", row: 0.5, col: 0, turns: 0 }, START + 20_000, CONFIG)).toEqual({ ok: false, reason: "bad-action" });
  });

  it("takes the tile turned: tile 9 lying on its side", () => {
    const state = laying(["#####", "#####"], { 0: 9, 1: 13 });
    const first = state.layOrder[0];

    expect(applyAction(state, first, { type: "lay", row: 0, col: 0, turns: 0 }, START + 20_000, CONFIG)).toEqual({ ok: false, reason: "does-not-fit" });
    expect(act(state, first, { type: "lay", row: 0, col: 0, turns: 1 }, START + 20_000).placed[0]).toMatchObject({ tile: 9, turns: 1 });
  });

  it("fails a player whose tile has nowhere left to go, when their turn comes, and gives them no points", () => {
    // the park is the shape of tile 3 with one cell more: once tile 3 lies there, tile 13 has no room
    const state = laying(["###.", "####", "###.", ".#.."], { 0: 3, 1: 13 });
    const [first, second] = state.layOrder;

    const next = act(state, first, { type: "lay", row: 0, col: 0, turns: 0 }, START + 20_000);

    expect(state.picks.find((pick) => pick.player === first)?.tile).toBe(3);
    expect(next.failed).toEqual([second]);
    // the failure, and then the points of the park that it closed
    expect(next.history.at(-2)).toEqual({ type: "fail", round: 1, player: second, tile: 13 });
    expect(next.history.at(-1)).toMatchObject({ type: "score", round: 1 });
    expect(next.players.find((player) => player.id === first)?.score).toBe(3);
    expect(next.players.find((player) => player.id === second)?.score).toBe(0);
  });

  it("fails a player whom the tile laid before theirs has left no room: tile 9 on its side across a park three deep", () => {
    const state = laying(WIDE, { 0: 13, 1: 9 });
    const [nine, thirteen] = state.layOrder;

    const next = act(state, nine, { type: "lay", row: 0, col: 0, turns: 1 }, START + 20_000);

    expect(next.failed).toEqual([thirteen]);
    expect(next.phase).toBe("pause");
  });

  it("fails a player at once whose tile never had anywhere to go", () => {
    const state = laying(["####", "####"], { 0: 13, 1: 13 });

    expect(state.failed).toHaveLength(2);
    expect(state.phase).toBe("pause");
    expect(state.players.map((player) => player.score)).toEqual([0, 0]);
  });

  it("gives each player who laid a tile its number in points when the park is closed", () => {
    const state = laying(LONG, { 0: 13, 1: 9 });
    const [nine, thirteen] = state.layOrder;
    const one = act(state, nine, { type: "lay", row: 0, col: 0, turns: 1 }, START + 20_000);

    const closed = act(one, thirteen, { type: "lay", row: 0, col: 5, turns: 0 }, START + 30_000);

    expect(one.players.every((player) => player.score === 0)).toBe(true);
    expect(closed.players.find((player) => player.id === nine)?.score).toBe(9);
    expect(closed.players.find((player) => player.id === thirteen)?.score).toBe(13);
    expect(closed).toMatchObject({ phase: "pause", turn: null, pauseUntil: START + 30_000 + PAUSE_MS });
  });
});

describe("from one park to the next", () => {
  /** A game whose first park has been laid by the room moving for everyone. */
  function afterFirstPark(count: number): GrassState {
    let state = game(count);
    let now = START;
    while (state.phase === "pick" || state.phase === "place") {
      now += 1000;
      state = moveFor(state, now, CONFIG);
    }
    return state;
  }

  it("puts up another park when the pause is over, and not a moment before", () => {
    const paused = afterFirstPark(3);
    const due = paused.pauseUntil!;

    const before = applyTimeout(paused, due - 1, CONFIG);
    const next = applyTimeout(paused, due, CONFIG);

    expect(before).toBe(paused);
    expect(next).toMatchObject({ phase: "pick", round: 2, picks: [], placed: [], failed: [], pauseUntil: null });
    expect(next.turn).toEqual({ player: next.pickOrder[0], since: due });
    expect(next.history.at(-1)).toEqual({ type: "park", round: 2 });
  });

  it("passes the priority on with each park: whoever was highest is lowest in the next", () => {
    const paused = afterFirstPark(4);
    const before = paused.players.map((player) => player.id);

    const second = applyTimeout(paused, paused.pauseUntil!, CONFIG);

    expect(second.players.map((player) => player.id)).toEqual([...before.slice(1), before[0]]);
    expect(paused.players.map((player) => player.id)).toEqual(before);
  });

  it("lets the new priority decide between players with the same points in the next park", () => {
    // nobody can lay anything on this park: everyone has no points when the next one is put up
    const stuck = pickAll(onPark(game(3), ["##", "##"]), { 0: 13, 1: 13, 2: 13 });
    const before = stuck.players.map((player) => player.id);

    const second = applyTimeout(stuck, stuck.pauseUntil!, CONFIG);

    expect(stuck.players.every((player) => player.score === 0)).toBe(true);
    expect(second.pickOrder).toEqual([...before.slice(1), before[0]]);
  });

  it("keeps the points, and lets the player with the fewest pick first in the next park", () => {
    let state = pickAll(onPark(game(2), ["########", "########", "########"]), { 0: 13, 1: 9 });
    const [nine, thirteen] = state.layOrder;
    state = act(state, nine, { type: "lay", row: 0, col: 0, turns: 1 }, START + 20_000);
    state = act(state, thirteen, { type: "lay", row: 0, col: 5, turns: 0 }, START + 30_000);

    const next = applyTimeout(state, state.pauseUntil!, CONFIG);

    expect(next.players.find((player) => player.id === nine)?.score).toBe(9);
    expect(next.pickOrder).toEqual([nine, thirteen]);
  });

  it("ends the game when the last park has been laid, with no park after it", () => {
    let state = game(2);
    let now = START;
    for (let step = 0; state.phase !== "ended"; step++) {
      expect(step).toBeLessThan(200);
      now = deadline(state, CONFIG)!;
      state = applyTimeout(state, now, CONFIG);
    }

    expect(state.round).toBe(CONFIG.rounds);
    expect(state.history.at(-1)).toEqual({ type: "ended", round: CONFIG.rounds, reason: "rounds" });
    expect(state.history.filter((event) => event.type === "park")).toHaveLength(CONFIG.rounds);
    expect(state.turn).toBeNull();
    expect(deadline(state, CONFIG)).toBeNull();
    expect(applyTimeout(state, now + 999_999, CONFIG)).toBe(state);
  });

  it("adds up, over a whole game, exactly the numbers of the tiles that were laid", () => {
    let state = game(4, 31);
    for (let step = 0; state.phase !== "ended"; step++) {
      expect(step).toBeLessThan(400);
      state = applyTimeout(state, deadline(state, CONFIG)!, CONFIG);
    }
    const laid = state.history.filter((event) => event.type === "lay").reduce((sum, event) => sum + (event.type === "lay" ? event.tile : 0), 0);

    expect(state.players.reduce((sum, player) => sum + player.score, 0)).toBe(laid);
    expect(laid).toBeGreaterThan(0);
  });
});

describe("the clock", () => {
  it("gives a player the time to pick, then the time to lay", () => {
    const state = game(2);
    const laying = pickAll(onPark(state, ["######", "######", "######"]), { 0: 13, 1: 13 });

    expect(deadline(state, CONFIG)).toBe(START + PICK_MS);
    expect(deadline(laying, CONFIG)).toBe(laying.turn!.since + PLACE_MS);
  });

  it("picks the default tile for a player out of time, and says the room did", () => {
    const state = game(2);
    const first = state.turn!.player;

    const before = applyTimeout(state, START + PICK_MS - 1, CONFIG);
    const next = applyTimeout(state, START + PICK_MS, CONFIG);

    expect(before).toBe(state);
    expect(next.picks).toEqual([{ player: first, tile: CONFIG.defaultTile }]);
    expect(next.history.at(-1)).toEqual({ type: "pick", round: 1, player: first, tile: CONFIG.defaultTile, forced: true });
    expect(next.turn?.since).toBe(START + PICK_MS);
  });

  it("lays the tile of a player out of time in the first place it fits", () => {
    const state = pickAll(onPark(game(2), ["######", "######", "######"]), { 0: 13, 1: 13 });
    const first = state.turn!.player;
    const due = deadline(state, CONFIG)!;

    const next = applyTimeout(state, due, CONFIG);

    expect(next.placed).toEqual([{ player: first, tile: 13, row: 0, col: 0, turns: 0 }]);
    expect(next.history.at(-1)).toEqual({ type: "lay", round: 1, player: first, tile: 13, forced: true, cut: 0 });
  });

  it("moves for the player on turn whenever the room asks, and for nobody between parks or after the end", () => {
    const state = game(2);
    const paused = pickAll(onPark(state, ["####", "####"]), { 0: 13, 1: 13 });

    expect(moveFor(state, START + 1, CONFIG).picks).toHaveLength(1);
    expect(paused.phase).toBe("pause");
    expect(moveFor(paused, START + 1, CONFIG)).toBe(paused);
    expect(moveFor(abandon(state), START + 1, CONFIG).phase).toBe("ended");
  });

  it("is moved on with a game that stood still", () => {
    const state = game(2);
    const paused = pickAll(onPark(state, ["####", "####"]), { 0: 13, 1: 13 });

    expect(deadline(shiftClock(state, 90_000), CONFIG)).toBe(START + 90_000 + PICK_MS);
    expect(shiftClock(paused, 90_000).pauseUntil).toBe(paused.pauseUntil! + 90_000);
    expect(shiftClock(state, 0)).toBe(state);
    expect(state.turn?.since).toBe(START);
  });
});

describe("a game nobody is left to play", () => {
  it("ends where it stands, keeping the points, and says why", () => {
    const state = game(3);

    const over = abandon(state);

    expect(over).toMatchObject({ phase: "ended", turn: null, pauseUntil: null });
    expect(over.history.at(-1)).toEqual({ type: "ended", round: 1, reason: "abandoned" });
    expect(applyAction(over, state.turn!.player, { type: "pick", tile: 9 }, START + 1, CONFIG)).toEqual({ ok: false, reason: "game-over" });
    expect(abandon(over)).toBe(over);
    expect(state.phase).toBe("pick");
  });
});

describe("viewFor", () => {
  it("shows everyone the same game, and tells each who they are", () => {
    const state = act(game(3), game(3).pickOrder[0], { type: "pick", tile: 11 }, START + 1000);
    const [a, b] = state.players.map((player) => player.id);

    const mine = viewFor(state, a, CONFIG);
    const theirs = viewFor(state, b, CONFIG);

    expect(mine.you).toBe(a);
    expect({ ...theirs, you: a }).toEqual(mine);
    expect(mine).toMatchObject({ phase: "pick", round: 1, rounds: CONFIG.rounds, turn: state.turn!.player });
    expect(mine.park).toEqual(state.park);
  });

  it("is someone watching for a player who is not in the game", () => {
    expect(viewFor(game(2), 99, CONFIG).you).toBeNull();
    expect(viewFor(game(2), null, CONFIG).you).toBeNull();
  });

  it("holds nothing of the generator, and nothing that changes the game when changed", () => {
    const state = game(2);

    const view = viewFor(state, 0, CONFIG);
    view.park.rows[0] = "";
    view.players[0].score = 99;
    view.pickOrder.length = 0;

    expect(JSON.stringify(viewFor(state, 0, CONFIG))).not.toContain("rng");
    expect(state.park.rows[0]).not.toBe("");
    expect(state.players[0].score).toBe(0);
    expect(state.pickOrder).toHaveLength(2);
  });
});

describe("parseAction", () => {
  it("reads a pick and a lay", () => {
    expect(parseAction({ type: "pick", tile: 9 })).toEqual({ type: "pick", tile: 9 });
    expect(parseAction({ type: "lay", row: 1, col: 2, turns: 3 })).toEqual({ type: "lay", row: 1, col: 2, turns: 3 });
  });

  it("takes only what an action is made of", () => {
    expect(parseAction({ type: "lay", row: 1, col: 2, turns: 3, player: 5, tile: 13 })).toEqual({ type: "lay", row: 1, col: 2, turns: 3 });
  });

  it.each([
    ["nothing", null],
    ["text", "pick"],
    ["a pick with no tile", { type: "pick" }],
    ["a pick of a tile named in words", { type: "pick", tile: "9" }],
    ["a lay with no turn", { type: "lay", row: 0, col: 0 }],
    ["something else", { type: "buzz" }],
  ])("does not take %s for an action", (_what, raw) => {
    expect(parseAction(raw)).toBeNull();
  });
});
