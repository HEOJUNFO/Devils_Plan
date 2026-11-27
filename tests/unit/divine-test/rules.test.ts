import { describe, expect, it } from "vitest";
import configJson from "../../../src/shared/games/divine-test/config.json";
import {
  abandon,
  applyAction,
  applyTimeout,
  awaited,
  closeIfLeft,
  createGame,
  deadline,
  emptyBoard,
  isMagic,
  isValidConfig,
  linesOf,
  linesRight,
  magicOf,
  parseAction,
  placesOf,
  shiftClock,
  sumsOf,
  viewFor,
  type DivineConfig,
  type DivineState,
} from "../../../src/shared/games/divine-test/rules";
import { siamese } from "../../../src/shared/games/divine-test/siamese";
import { FIXED, MAGIC, SECONDS, SHOW_SQUARE, SIZE, TILES } from "./documented";

const config: DivineConfig = configJson;
const T0 = 1_000_000;
const SQUARE = SHOW_SQUARE.flat();

function game(players: number[] = [0, 1]): DivineState {
  const created = createGame({ players, now: T0 }, config);
  if (!created.ok) throw new Error(created.reason);
  return created.state;
}

function did(state: DivineState, player: number, action: unknown, now = T0 + 1000): DivineState {
  const parsed = parseAction(action);
  if (parsed === null) throw new Error(`not an action: ${JSON.stringify(action)}`);
  const result = applyAction(state, player, parsed, now, config);
  if (!result.ok) throw new Error(`${result.reason}: ${JSON.stringify(action)}`);
  return result.state;
}

const refusal = (state: DivineState, player: number, action: unknown, now = T0 + 1000): string | null => {
  const parsed = parseAction(action);
  if (parsed === null) return "unparsed";
  const result = applyAction(state, player, parsed, now, config);
  return result.ok ? null : result.reason;
};

const boardOf = (state: DivineState, player: number): number[] => state.boards.find((board) => board.player === player)?.cells ?? [];

/** `state` after `player` laid every tile of the show's square but the last `short`, the lowest first. */
function laid(state: DivineState, player: number, short = 0, now = T0 + 1000): DivineState {
  let next = state;
  for (let tile = 2; tile <= TILES - short; tile++) next = did(next, player, { type: "put", tile, cell: SQUARE.indexOf(tile) }, now);
  return next;
}

describe("the numbers of 신의 시험", () => {
  it("are the show's: a board of seven by seven, the tiles 1 to 49, the 1 on the middle of the top row", () => {
    expect([config.size, config.size * config.size]).toEqual([SIZE, TILES]);
    expect(config.fixed).toEqual([FIXED]);
    expect(magicOf(config.size)).toBe(MAGIC);
    expect(isValidConfig(config)).toBe(true);
    const board = emptyBoard(config);
    expect(board).toHaveLength(TILES);
    expect(board.filter((tile) => tile !== 0)).toEqual([1]);
    expect(board[FIXED.cell]).toBe(1);
  });

  it("give half the show's hour", () => {
    expect(config.seconds).toBe(SECONDS);
  });

  it("refuse a config a game cannot be played with", () => {
    expect(isValidConfig({ ...config, size: 2 })).toBe(false);
    expect(isValidConfig({ ...config, fixed: [{ tile: 50, cell: 3 }] })).toBe(false);
    expect(isValidConfig({ ...config, fixed: [{ tile: 1, cell: 49 }] })).toBe(false);
    expect(isValidConfig({ ...config, fixed: [{ tile: 1, cell: 3 }, { tile: 2, cell: 3 }] })).toBe(false);
    expect(isValidConfig({ ...config, seconds: 0 })).toBe(false);
    expect(isValidConfig({ ...config, maxPlayers: 1 })).toBe(false);
  });
});

describe("a magic square of 49", () => {
  it("has sixteen lines: seven rows, seven columns and two diagonals", () => {
    const lines = linesOf(SIZE);
    expect(lines).toHaveLength(16);
    expect(lines[0]).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(lines[7]).toEqual([0, 7, 14, 21, 28, 35, 42]);
    expect(lines[14]).toEqual([0, 8, 16, 24, 32, 40, 48]);
    expect(lines[15]).toEqual([6, 12, 18, 24, 30, 36, 42]);
  });

  it("is the square the show's test was passed with: every line adds up to 175", () => {
    expect(sumsOf(SQUARE, SIZE)).toEqual(Array.from({ length: 16 }, () => MAGIC));
    expect(linesRight(SQUARE, SIZE)).toBe(16);
    expect(isMagic(SQUARE, SIZE)).toBe(true);
    expect(SQUARE[FIXED.cell]).toBe(FIXED.tile);
  });

  it("is made by the Siamese method, as the wiki says of the show's", () => {
    expect(siamese(SIZE)).toEqual(SQUARE);
    expect(isMagic(siamese(5), 5)).toBe(true);
    expect(isMagic(siamese(3), 3)).toBe(true);
  });

  it("is any other square whose lines add up, too: the square turned over from left to right has the 1 where it was", () => {
    const mirrored = SHOW_SQUARE.flatMap((row) => [...row].reverse());
    expect(mirrored[FIXED.cell]).toBe(1);
    expect(mirrored).not.toEqual(SQUARE);
    expect(isMagic(mirrored, SIZE)).toBe(true);
  });

  it("is not a board with a square empty, a tile twice, or one line wrong", () => {
    const short = [...SQUARE];
    short[10] = 0;
    expect(isMagic(short, SIZE)).toBe(false);
    expect(linesRight(short, SIZE)).toBe(14);
    const twice = [...SQUARE];
    twice[0] = twice[1];
    expect(isMagic(twice, SIZE)).toBe(false);
    // two tiles of a row changed over: the row still adds up, their two columns do not
    const swapped = [...SQUARE];
    [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
    expect(isMagic(swapped, SIZE)).toBe(false);
    expect(linesRight(swapped, SIZE)).toBe(13);
    expect(isMagic(SQUARE.slice(1), SIZE)).toBe(false);
  });
});

describe("a game of 신의 시험", () => {
  it("gives every player a board of their own with the 1 on it, and half an hour", () => {
    const state = game([2, 0, 5]);
    expect(state.players).toEqual([0, 2, 5]);
    expect(state.boards.map((board) => board.cells)).toEqual([emptyBoard(config), emptyBoard(config), emptyBoard(config)]);
    expect([state.phase, awaited(state)]).toEqual(["play", [0, 2, 5]]);
    expect(deadline(state)).toBe(T0 + SECONDS * 1000);
  });

  it("takes two players or more, up to six", () => {
    expect(createGame({ players: [0], now: T0 }, config)).toEqual({ ok: false, reason: "too-few" });
    expect(createGame({ players: [0, 1, 2, 3, 4, 5, 6], now: T0 }, config)).toEqual({ ok: false, reason: "too-many" });
    expect(createGame({ players: [0, 0], now: T0 }, config)).toEqual({ ok: false, reason: "bad-players" });
    expect(createGame({ players: [0, 1], now: T0 }, { ...config, size: 1 })).toEqual({ ok: false, reason: "bad-config" });
    expect(createGame({ players: [0, 1, 2, 3, 4, 5], now: T0 }, config).ok).toBe(true);
  });

  it("lays a tile on a player's own board and on nobody else's", () => {
    const state = did(game(), 0, { type: "put", tile: 30, cell: 0 });
    expect(boardOf(state, 0)[0]).toBe(30);
    expect(boardOf(state, 1)).toEqual(emptyBoard(config));
    expect(state.boards[0].moves).toBe(1);
  });

  it("lets a tile be moved, taken back, and laid where another is, as often as its player likes", () => {
    let state = did(game(), 0, { type: "put", tile: 30, cell: 0 });
    // moved: it is on the new square and no longer on the old
    state = did(state, 0, { type: "put", tile: 30, cell: 8 });
    expect([boardOf(state, 0)[0], boardOf(state, 0)[8]]).toEqual([0, 30]);
    // laid from beside the board where another is: that one goes back beside the board
    state = did(state, 0, { type: "put", tile: 12, cell: 8 });
    expect(boardOf(state, 0).filter((tile) => tile !== 0).sort((a, b) => a - b)).toEqual([1, 12]);
    // moved onto a square another is on: the two change places
    state = did(state, 0, { type: "put", tile: 30, cell: 0 });
    state = did(state, 0, { type: "put", tile: 30, cell: 8 });
    expect([boardOf(state, 0)[0], boardOf(state, 0)[8]]).toEqual([12, 30]);
    state = did(state, 0, { type: "take", cell: 8 });
    expect(boardOf(state, 0)[8]).toBe(0);
    expect(state.boards[0].moves).toBe(6);
  });

  it("keeps the 1 where it is, and takes no tile or square the board has not", () => {
    const state = did(game(), 0, { type: "put", tile: 30, cell: 0 });
    expect(refusal(state, 0, { type: "put", tile: 1, cell: 10 })).toBe("bad-tile");
    expect(refusal(state, 0, { type: "put", tile: 5, cell: FIXED.cell })).toBe("bad-cell");
    expect(refusal(state, 0, { type: "take", cell: FIXED.cell })).toBe("bad-cell");
    expect(refusal(state, 0, { type: "put", tile: 50, cell: 10 })).toBe("bad-tile");
    expect(refusal(state, 0, { type: "put", tile: 0, cell: 10 })).toBe("bad-tile");
    expect(refusal(state, 0, { type: "put", tile: 5, cell: 49 })).toBe("bad-cell");
    expect(refusal(state, 0, { type: "put", tile: 5, cell: -1 })).toBe("bad-cell");
    expect(refusal(state, 0, { type: "take", cell: 20 })).toBe("empty-cell");
    expect(refusal(state, 0, { type: "put", tile: 30, cell: 0 })).toBe("no-change");
    expect(refusal(state, 7, { type: "put", tile: 5, cell: 10 })).toBe("not-playing");
  });

  it("passes a board at once when its last tile makes every line add up, with nothing handed in", () => {
    const three = game([0, 1, 2]);
    const nearly = laid(three, 1, 1);
    expect([nearly.passed, nearly.boards[1].done]).toEqual([[], null]);
    const state = did(nearly, 1, { type: "put", tile: 49, cell: SQUARE.indexOf(49) }, T0 + 600_000);
    expect(state.passed).toEqual([1]);
    expect(state.boards[1].done).toBe(600_000);
    expect(state.history.at(-1)).toEqual({ type: "passed", player: 1, place: 1, ms: 600_000 });
    // two are still at their boards: the game goes on, and the board that passed is done with
    expect([state.phase, awaited(state)]).toEqual(["play", [0, 2]]);
    expect(refusal(state, 1, { type: "take", cell: 0 })).toBe("already-passed");
  });

  it("does not pass a board that is full and wrong, and lets its player go on", () => {
    let state = laid(game(), 0, 2);
    // the last two tiles on each other's squares
    state = did(state, 0, { type: "put", tile: 48, cell: SQUARE.indexOf(49) });
    state = did(state, 0, { type: "put", tile: 49, cell: SQUARE.indexOf(48) });
    expect(boardOf(state, 0).every((tile) => tile !== 0)).toBe(true);
    expect([state.passed, state.phase]).toEqual([[], "play"]);
    // changed over, they pass it
    state = did(state, 0, { type: "put", tile: 48, cell: SQUARE.indexOf(48) });
    expect(state.passed).toEqual([0]);
  });

  it("is over when all but one have passed, and places them in the order they passed", () => {
    let state = laid(game([0, 1, 2]), 2, 0, T0 + 100_000);
    expect(state.phase).toBe("play");
    state = laid(state, 0, 0, T0 + 200_000);
    expect([state.phase, state.ended, state.passed]).toEqual(["ended", "played", [2, 0]]);
    expect(placesOf(state)).toEqual([
      { player: 2, place: 1 },
      { player: 0, place: 2 },
      { player: 1, place: 3 },
    ]);
    expect(deadline(state)).toBeNull();
    expect(refusal(state, 1, { type: "put", tile: 5, cell: 10 })).toBe("game-over");
  });

  it("is over for two as soon as one has passed", () => {
    const state = laid(game(), 1);
    expect([state.phase, state.ended]).toEqual(["ended", "played"]);
    expect(placesOf(state)).toEqual([
      { player: 1, place: 1 },
      { player: 0, place: 2 },
    ]);
  });

  it("is over when the time is up: whoever has not passed has failed, as in the show", () => {
    const state = game([0, 1, 2]);
    expect(applyTimeout(state, T0 + SECONDS * 1000 - 1)).toBe(state);
    const passed = laid(state, 1, 0, T0 + 5000);
    const over = applyTimeout(passed, T0 + SECONDS * 1000);
    expect([over.phase, over.ended]).toEqual(["ended", "time"]);
    expect(placesOf(over)).toEqual([
      { player: 1, place: 1 },
      { player: 0, place: 2 },
      { player: 2, place: 2 },
    ]);
    // nobody passed: nobody is ahead of anybody
    expect(placesOf(applyTimeout(state, T0 + SECONDS * 1000))?.map((each) => each.place)).toEqual([1, 1, 1]);
  });
});

describe("what a player of 신의 시험 is shown", () => {
  it("is their own board, and of the others only how far they are", () => {
    let state = did(game([0, 1, 2]), 0, { type: "put", tile: 30, cell: 0 });
    state = laid(state, 1, 40);
    const mine = viewFor(state, 0, config);
    expect(mine.you).toBe(0);
    expect(mine.cells).toEqual(boardOf(state, 0));
    expect(mine.standings).toEqual([
      { player: 0, placed: 2, lines: 0, moves: 1, done: null, left: false },
      { player: 1, placed: 9, lines: 0, moves: 8, done: null, left: false },
      { player: 2, placed: 1, lines: 0, moves: 0, done: null, left: false },
    ]);
    // someone watching is shown nobody's board
    const watching = viewFor(state, null, config);
    expect([watching.you, watching.cells]).toEqual([null, emptyBoard(config)]);
    expect(viewFor(state, 9, config).you).toBeNull();
    expect(JSON.stringify(mine)).not.toContain("boards");
  });

  it("counts the lines that are right on a board, also to the others", () => {
    const state = laid(game([0, 1, 2]), 1, 1);
    // all but the 49: its row, its column and no diagonal are short of it
    expect(viewFor(state, 0, config).standings[1]).toMatchObject({ placed: 48, lines: 14 });
  });
});

describe("a game of 신의 시험 that someone leaves", () => {
  it("goes on without them while two are still in the room, and counts them after those who passed", () => {
    const state = closeIfLeft(game([0, 1, 2]), (player) => player !== 1);
    expect([state.phase, awaited(state)]).toEqual(["play", [0, 2]]);
    expect(state.history.at(-1)).toEqual({ type: "left", player: 1 });
    expect(refusal(state, 1, { type: "put", tile: 5, cell: 10 })).toBe("not-playing");
    expect(closeIfLeft(state, (player) => player !== 1)).toBe(state);
    const over = laid(state, 2);
    expect([over.phase, over.ended]).toEqual(["ended", "played"]);
    expect(placesOf(over)).toEqual([
      { player: 2, place: 1 },
      { player: 0, place: 2 },
      { player: 1, place: 2 },
    ]);
  });

  it("is cut short when fewer than two are left in the room, and places nobody", () => {
    const state = game();
    expect(closeIfLeft(state, () => true)).toBe(state);
    const left = closeIfLeft(state, (player) => player === 0);
    expect([left.phase, left.ended]).toEqual(["ended", "left"]);
    expect(placesOf(left)).toBeNull();
  });

  it("is over, and played, when whoever was still at a board leaves after another passed", () => {
    const passed = laid(game([0, 1, 2]), 0);
    const over = closeIfLeft(passed, (player) => player !== 1);
    expect([over.phase, over.ended]).toEqual(["ended", "played"]);
    expect(placesOf(over)?.map((each) => each.place)).toEqual([1, 2, 2]);
  });

  it("is given up where nobody is left to go on with it, and moves its clock on by as long as it stood still", () => {
    const state = game();
    const given = abandon(state);
    expect([given.phase, given.ended]).toEqual(["ended", "abandoned"]);
    expect(abandon(given)).toBe(given);
    expect(shiftClock(state, 0)).toBe(state);
    const shifted = shiftClock(state, 7000);
    expect([deadline(shifted), shifted.startedAt, shifted.boards[0].at]).toEqual([T0 + SECONDS * 1000 + 7000, T0 + 7000, T0 + 7000]);
    // the time a board took is counted without the time the game stood still
    expect(laid(shifted, 0, 0, T0 + 9000).boards[0].done).toBe(2000);
  });
});

describe("what a player of 신의 시험 can send", () => {
  it("is read as an action or as nothing", () => {
    expect(parseAction({ type: "put", tile: 5, cell: 10 })).toEqual({ type: "put", tile: 5, cell: 10 });
    expect(parseAction({ type: "put", tile: 5.5, cell: 10 })).toBeNull();
    expect(parseAction({ type: "put", tile: 5 })).toBeNull();
    expect(parseAction({ type: "take", cell: 10 })).toEqual({ type: "take", cell: 10 });
    expect(parseAction({ type: "take", cell: "10" })).toBeNull();
    expect(parseAction({ type: "pass" })).toBeNull();
    expect(parseAction(null)).toBeNull();
  });
});
