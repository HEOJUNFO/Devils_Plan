import { describe, expect, it } from "vitest";
import { randomSource } from "../../../src/shared/game/rng";
import shipped from "../../../src/shared/games/count-rectangles/config.json";
import {
  GAP,
  abandon,
  applyAction,
  applyTimeout,
  closeIfSpent,
  createGame,
  deadline,
  drawBoard,
  isValidConfig,
  parseAction,
  shiftClock,
  solutions,
  unitOf,
  viewFor,
  winnersNeeded,
  type Board,
  type Cell,
  type RectConfig,
  type RectPlayer,
  type RectState,
} from "../../../src/shared/games/count-rectangles/rules";

/** The rules as shipped. */
/** The race alone, as it was before the third choice came with it: that choice has tests of its own (settle.test.ts). */
const CONFIG: RectConfig = { ...shipped, settle: false };

/** An arbitrary moment the tests call the start of the game, in ms. */
const START = 1_000_000;
const ANSWER_MS = CONFIG.answerSeconds * 1000;
const PROBLEM_MS = CONFIG.problemSeconds * 1000;
const PAUSE_MS = CONFIG.pauseSeconds * 1000;

/** The one problem known from the show: of its sixty rectangles, eight add up to 0. */
const KNOWN: Board = { rows: 3, cols: 4, cells: [1, -6, 6, -1, 3, 5, -2, 2, 3, -7, 4, -8], target: 0 };

/** `count` players, each alone, ids 0..count-1. */
function alone(count: number): RectPlayer[] {
  return Array.from({ length: count }, (_, id) => ({ id, team: 0 }));
}

/** A game of `players` started at START, or an error if it could not be. */
function game(players: RectPlayer[], seed = 7, config: RectConfig = CONFIG): RectState {
  const created = createGame({ players, seed, now: START }, config);
  if (!created.ok) throw new Error(`fixture game refused: ${created.reason}`);
  return created.state;
}

/** Applies an action that the test expects to be accepted. */
function act(state: RectState, player: number, action: Parameters<typeof applyAction>[2], now: number, config: RectConfig = CONFIG): RectState {
  const result = applyAction(state, player, action, now, config);
  if (!result.ok) throw new Error(`fixture action refused: ${result.reason}`);
  return result.state;
}

/** `player` buzzes at `now` and says the right number a second later. */
function solve(state: RectState, player: number, now: number, config: RectConfig = CONFIG): RectState {
  return act(act(state, player, { type: "buzz" }, now, config), player, { type: "answer", count: state.answer }, now + 1000, config);
}

/** `player` buzzes at `now` and says a wrong number a second later. */
function miss(state: RectState, player: number, now: number, config: RectConfig = CONFIG): RectState {
  return act(act(state, player, { type: "buzz" }, now, config), player, { type: "answer", count: state.answer + 1 }, now + 1000, config);
}

/** Lets a closed problem's pause run out, so the next problem is open. Returns the state and the moment. */
function next(state: RectState, config: RectConfig = CONFIG): { state: RectState; now: number } {
  if (state.pauseUntil === null) throw new Error("fixture: no pause to wait out");
  return { state: applyTimeout(state, state.pauseUntil, config), now: state.pauseUntil };
}

describe("the shipped rules of Count the Rectangles", () => {
  it("are playable", () => {
    expect(isValidConfig(CONFIG)).toBe(true);
  });

  it("keep the numbers the document gives", () => {
    expect(CONFIG).toMatchObject({ teamSize: 3, winsNeeded: 2, answerSeconds: 10, problemSeconds: 300 });
  });

  it.each([
    ["no board sizes", { boards: [] }],
    ["a board of one cell", { boards: [{ rows: 1, cols: 1 }] }],
    ["a team of nobody", { teamSize: 0 }],
    ["no time to answer", { answerSeconds: 0 }],
    ["every cell blank", { blankPercent: 100 }],
    ["answers that cannot be said", { maxAnswer: CONFIG.maxSaid + 1 }],
    ["a range of answers upside down", { minAnswer: 9, maxAnswer: 3 }],
    ["a negative pause", { pauseSeconds: -1 }],
    ["more than every board cut", { irregularPercent: 101 }],
    ["a board cut away whole", { cutPercent: 100 }],
    ["cut boards with nothing to cut them from", { irregularBoards: [] }],
    ["a box to cut that is one cell", { irregularBoards: [{ rows: 1, cols: 1 }] }],
  ])("are refused with %s", (_what, change) => {
    expect(isValidConfig({ ...CONFIG, ...change })).toBe(false);
  });
});

describe("solutions", () => {
  it("finds the eight rectangles of the problem known from the show", () => {
    expect(solutions(KNOWN)).toHaveLength(8);
  });

  it("counts a single cell that is the target", () => {
    const board: Board = { rows: 1, cols: 3, cells: [5, 1, 5], target: 5 };

    expect(solutions(board)).toEqual([
      { top: 0, left: 0, bottom: 0, right: 0 },
      { top: 0, left: 2, bottom: 0, right: 2 },
    ]);
  });

  it("counts every block of whole cells, wide, tall and square", () => {
    const board: Board = { rows: 2, cols: 2, cells: [1, 1, 1, 1], target: 2 };

    // two side by side twice, two one above the other twice
    expect(solutions(board)).toHaveLength(4);
  });

  it("counts the whole board when it makes the target", () => {
    const board: Board = { rows: 2, cols: 2, cells: [1, 2, 3, 4], target: 10 };

    expect(solutions(board)).toEqual([{ top: 0, left: 0, bottom: 1, right: 1 }]);
  });

  it("adds a cell with no number as nothing", () => {
    const board: Board = { rows: 1, cols: 3, cells: [2, null, 3], target: 5 };

    expect(solutions(board)).toEqual([{ top: 0, left: 0, bottom: 0, right: 2 }]);
  });

  it("counts a rectangle with no number in it when the target is 0: it adds up to nothing", () => {
    const board: Board = { rows: 1, cols: 3, cells: [null, 4, -4], target: 0 };

    // the empty cell alone, all three cells, and the pair 4 and -4
    expect(solutions(board)).toEqual([
      { top: 0, left: 0, bottom: 0, right: 0 },
      { top: 0, left: 0, bottom: 0, right: 2 },
      { top: 0, left: 1, bottom: 0, right: 2 },
    ]);
  });

  it("does not count a rectangle with no number in it for any other target", () => {
    const board: Board = { rows: 1, cols: 3, cells: [null, null, 3], target: 3 };

    // each rectangle that holds the 3, and none of the ones made of empty cells
    expect(solutions(board)).toEqual([
      { top: 0, left: 0, bottom: 0, right: 2 },
      { top: 0, left: 1, bottom: 0, right: 2 },
      { top: 0, left: 2, bottom: 0, right: 2 },
    ]);
  });

  it("counts two rectangles that hold the same numbers and differ only in empty cells as two", () => {
    const board: Board = { rows: 1, cols: 2, cells: [null, 7], target: 7 };

    expect(solutions(board)).toHaveLength(2);
  });

  it("never lays a rectangle across a place where the board has no cell", () => {
    const split: Board = { rows: 1, cols: 3, cells: [5, GAP, 5], target: 10 };
    const corner: Board = { rows: 2, cols: 2, cells: [1, 1, 1, GAP], target: 3 };

    expect(solutions(split)).toEqual([]);
    expect(solutions({ ...split, target: 5 })).toHaveLength(2);
    // the three cells do not make a rectangle; no block of two rows and two columns is whole
    expect(solutions(corner)).toEqual([]);
    expect(solutions({ ...corner, target: 2 })).toHaveLength(2);
  });

  it("does not take a place with no cell for an empty cell: it is no rectangle of nothing either", () => {
    const board: Board = { rows: 1, cols: 3, cells: [GAP, null, GAP], target: 0 };

    expect(solutions(board)).toEqual([{ top: 0, left: 1, bottom: 0, right: 1 }]);
  });

  it("finds nothing when no rectangle makes the target", () => {
    const board: Board = { rows: 2, cols: 2, cells: [1, 2, 3, 4], target: 100 };

    expect(solutions(board)).toEqual([]);
  });
});

/**
 * A board as the notes on the broadcast write it down: numbers, `_` for a
 * cell with no number, `.` for a place with no cell.
 */
function boardOf(rows: string[], target: number): Board {
  const grid = rows.map((row) => row.trim().split(/\s+/));
  const cells: Cell[] = grid.flat().map((mark) => (mark === "." ? GAP : mark === "_" ? null : Number(mark)));
  return { rows: grid.length, cols: grid[0].length, cells, target };
}

describe("the problems seen in the broadcast", () => {
  // Read off frames of the episode (design record, "What the broadcast shows"). They are here to hold the
  // counting to the answers given on air, and are not among the problems the game puts up.
  it("counts the four rectangles the rules screen draws for its example", () => {
    expect(solutions(boardOf(["10 _", "_ 4", "6 _"], 10))).toHaveLength(4);
  });

  it("counts 6 in the first problem, whose board is three blocks joined by single cells", () => {
    const board = boardOf(
      ["1 8 6 . 7 3 1", "3 5 2 . 4 5 8", "7 4 9 21 9 2 6", ". . . . . . 21", ". . . . 9 4 7", ". . . . 2 5 3", ". . . . 6 8 1"],
      20,
    );

    expect(solutions(board)).toHaveLength(6);
  });

  it("counts 114 in the second problem, every one of them a rectangle with no number in it", () => {
    const board = boardOf(
      [". . . . . _ . _ . . .", "_ _ . . _ _ . _ _ . .", "_ _ _ . _ _ . _ _ _ .", "_ _ _ 1 _ _ 1 _ _ _ _", "_ _ . . _ _ . . . . .", ". . . . _ . . . . . ."],
      0,
    );

    expect(solutions(board)).toHaveLength(114);
  });

  it("counts 27 in the problem of the added duel, where most rectangles hold an empty cell", () => {
    const board = boardOf(["1 1 1 1 1 1 1", "1 _ 1 1 1 1 1", "1 1 1 1 _ 1 1", "1 1 1 1 1 1 1", "1 1 _ 1 1 1 1", "1 1 1 1 1 1 1", "1 1 1 1 1 1 _"], 13);

    expect(solutions(board)).toHaveLength(27);
  });
});

describe("drawBoard", () => {
  it("draws the same board from the same place in the sequence", () => {
    expect(drawBoard(randomSource(11).next, CONFIG)).toEqual(drawBoard(randomSource(11).next, CONFIG));
  });

  it("draws different boards from different places", () => {
    expect(drawBoard(randomSource(11).next, CONFIG)).not.toEqual(drawBoard(randomSource(12).next, CONFIG));
  });

  it("draws, over many seeds, only problems that are within what the rules allow", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const { board, answer } = drawBoard(randomSource(seed).next, CONFIG);
      const cut = board.cells.includes(GAP);

      // a whole board is one of the sizes on the list; a cut one lies inside one of the boxes cut from
      if (!cut) expect(CONFIG.boards).toContainEqual({ rows: board.rows, cols: board.cols });
      else expect(CONFIG.irregularBoards.some((box) => board.rows <= box.rows && board.cols <= box.cols)).toBe(true);
      expect(board.cells).toHaveLength(board.rows * board.cols);
      for (const cell of board.cells) {
        if (cell === null || cell === GAP) continue;
        expect(Number.isInteger(cell)).toBe(true);
        expect(cell).not.toBe(0);
        expect(Math.abs(cell)).toBeLessThanOrEqual(CONFIG.maxNumber);
      }
      expect(Math.abs(board.target)).toBeLessThanOrEqual(CONFIG.maxTarget);
      expect(answer).toBe(solutions(board).length);
      expect(answer).toBeGreaterThanOrEqual(CONFIG.minAnswer);
      expect(answer).toBeLessThanOrEqual(CONFIG.maxAnswer);
    }
  });

  it("keeps the answer within its range on boards where far more rectangles would fit", () => {
    // with only 1 and -1 on a four by four board, dozens of rectangles add up to 0
    const crowded: RectConfig = { ...CONFIG, boards: [{ rows: 4, cols: 4 }], maxNumber: 1, blankPercent: 0, minAnswer: 1, maxAnswer: 3 };

    for (let seed = 1; seed <= 100; seed++) {
      const { board, answer } = drawBoard(randomSource(seed).next, crowded);

      expect(answer).toBe(solutions(board).length);
      expect(answer).toBeGreaterThanOrEqual(crowded.minAnswer);
      expect(answer).toBeLessThanOrEqual(crowded.maxAnswer);
    }
  });

  it("keeps the answer from falling below its range", () => {
    const sparse: RectConfig = { ...CONFIG, boards: [{ rows: 3, cols: 3 }], minAnswer: 6, maxAnswer: 12 };

    for (let seed = 1; seed <= 100; seed++) {
      const { answer } = drawBoard(randomSource(seed).next, sparse);

      expect(answer).toBeGreaterThanOrEqual(sparse.minAnswer);
    }
  });

  it("draws boards with an outline that is not a rectangle about as often as the rules say", () => {
    let cut = 0;
    for (let seed = 1; seed <= 300; seed++) {
      if (drawBoard(randomSource(seed).next, CONFIG).board.cells.includes(GAP)) cut++;
    }

    // not every board meant to be cut ends up with a cell missing from its box, so the share may fall a little short
    expect(cut / 300).toBeGreaterThan((CONFIG.irregularPercent - 20) / 100);
    expect(cut / 300).toBeLessThan((CONFIG.irregularPercent + 15) / 100);
  });

  it("keeps a cut board in one piece, with no empty row or column round it", () => {
    const always: RectConfig = { ...CONFIG, irregularPercent: 100 };
    for (let seed = 1; seed <= 150; seed++) {
      const { board } = drawBoard(randomSource(seed).next, always);
      const has = (row: number, col: number): boolean => row >= 0 && row < board.rows && col >= 0 && col < board.cols && board.cells[row * board.cols + col] !== GAP;
      const cells: [number, number][] = [];
      for (let row = 0; row < board.rows; row++) for (let col = 0; col < board.cols; col++) if (has(row, col)) cells.push([row, col]);
      const seen = new Set([cells[0].join()]);
      const queue = [cells[0]];
      while (queue.length > 0) {
        const [row, col] = queue.pop()!;
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (has(row + dr, col + dc) && !seen.has([row + dr, col + dc].join())) {
            seen.add([row + dr, col + dc].join());
            queue.push([row + dr, col + dc]);
          }
        }
      }

      expect(seen.size).toBe(cells.length);
      for (let row = 0; row < board.rows; row++) expect(cells.some((cell) => cell[0] === row)).toBe(true);
      for (let col = 0; col < board.cols; col++) expect(cells.some((cell) => cell[1] === col)).toBe(true);
    }
  });

  it("cuts only from the edge inwards: no place without a cell is walled in by cells", () => {
    const always: RectConfig = { ...CONFIG, irregularPercent: 100 };
    for (let seed = 1; seed <= 150; seed++) {
      const { board } = drawBoard(randomSource(seed).next, always);
      const gap = (row: number, col: number): boolean => board.cells[row * board.cols + col] === GAP;
      // every place with no cell is reached from outside the box across places with no cell
      const open = new Set<string>();
      const queue: [number, number][] = [];
      for (let row = 0; row < board.rows; row++) {
        for (let col = 0; col < board.cols; col++) {
          const rim = row === 0 || col === 0 || row === board.rows - 1 || col === board.cols - 1;
          if (rim && gap(row, col)) {
            open.add([row, col].join());
            queue.push([row, col]);
          }
        }
      }
      while (queue.length > 0) {
        const [row, col] = queue.pop()!;
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const r = row + dr;
          const c = col + dc;
          if (r < 0 || r >= board.rows || c < 0 || c >= board.cols || !gap(r, c) || open.has([r, c].join())) continue;
          open.add([r, c].join());
          queue.push([r, c]);
        }
      }

      expect(open.size).toBe(board.cells.filter((cell) => cell === GAP).length);
    }
  });

  it("cuts about as much of the box away as the rules say", () => {
    const always: RectConfig = { ...CONFIG, irregularPercent: 100, irregularBoards: [{ rows: 4, cols: 6 }] };
    let left = 0;
    for (let seed = 1; seed <= 100; seed++) {
      left += drawBoard(randomSource(seed).next, always).board.cells.filter((cell) => cell !== GAP).length;
    }

    // of twenty-four cells, about seven are cut: seventeen are left
    expect(left / 100).toBeGreaterThan(24 * (1 - (CONFIG.cutPercent + 8) / 100));
    expect(left / 100).toBeLessThan(24 * (1 - (CONFIG.cutPercent - 8) / 100));
  });

  it("draws only whole boards when the rules ask for none to be cut", () => {
    const never: RectConfig = { ...CONFIG, irregularPercent: 0, irregularBoards: [] };

    for (let seed = 1; seed <= 100; seed++) expect(drawBoard(randomSource(seed).next, never).board.cells).not.toContain(GAP);
  });

  it("leaves some cells without a number, as the document says, and fills most", () => {
    let blank = 0;
    let cells = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const { board } = drawBoard(randomSource(seed).next, CONFIG);
      blank += board.cells.filter((cell) => cell === null).length;
      cells += board.cells.filter((cell) => cell !== GAP).length;
    }

    expect(blank).toBeGreaterThan(0);
    expect(blank / cells).toBeLessThan(0.4);
  });

  it("falls back on a board of its own that works when none can be drawn, and not on one of the show's", () => {
    const impossible: RectConfig = { ...CONFIG, boards: [{ rows: 1, cols: 2 }], irregularPercent: 0, minAnswer: 50, maxAnswer: 60 };

    const { board, answer } = drawBoard(randomSource(3).next, impossible);

    expect(board).not.toEqual(KNOWN);
    expect(board.cells).toHaveLength(board.rows * board.cols);
    expect(answer).toBe(solutions(board).length);
    expect(answer).toBeGreaterThanOrEqual(CONFIG.minAnswer);
    expect(answer).toBeLessThanOrEqual(CONFIG.maxAnswer);
  });
});

describe("winnersNeeded", () => {
  it.each([
    [2, 1],
    [3, 2],
    [4, 2],
    [5, 3],
    [6, 3],
    [10, 5],
  ])("is half of %i units, the next whole number up: %i", (units, needed) => {
    expect(winnersNeeded(units)).toBe(needed);
  });
});

describe("createGame", () => {
  it("makes each player who is alone a unit of their own", () => {
    const state = game(alone(4));

    expect(state.units).toEqual([
      { members: [0], wins: 0, place: 0, leader: null },
      { members: [1], wins: 0, place: 0, leader: null },
      { members: [2], wins: 0, place: 0, leader: null },
      { members: [3], wins: 0, place: 0, leader: null },
    ]);
  });

  it("makes three players who named the same team one unit", () => {
    const players: RectPlayer[] = [
      { id: 0, team: 1 },
      { id: 1, team: 0 },
      { id: 2, team: 1 },
      { id: 3, team: 0 },
      { id: 4, team: 1 },
    ];

    const state = game(players);

    expect(state.units.map((unit) => unit.members)).toEqual([[0, 2, 4], [1], [3]]);
    expect(unitOf(state, 4)).toBe(0);
    expect(unitOf(state, 3)).toBe(2);
    expect(unitOf(state, 9)).toBe(-1);
  });

  it("opens the first problem at once", () => {
    const state = game(alone(2));

    expect(state).toMatchObject({ phase: "problem", round: 1, openedAt: START, wrong: [], floor: null, outcome: null });
    expect(state.answer).toBe(solutions(state.board).length);
    expect(state.history).toEqual([{ type: "problem", round: 1 }]);
  });

  it("starts the same game from the same seed, and another from another", () => {
    expect(game(alone(3), 5)).toEqual(game(alone(3), 5));
    expect(game(alone(3), 5).board).not.toEqual(game(alone(3), 6).board);
  });

  it.each([
    ["a team of two", [{ id: 0, team: 1 }, { id: 1, team: 1 }, { id: 2, team: 0 }], "bad-teams"],
    ["a team of four", [0, 1, 2, 3].map((id) => ({ id, team: 1 })).concat([{ id: 4, team: 0 }]), "bad-teams"],
    ["nobody", [], "too-few"],
    ["two players with one id", [{ id: 0, team: 0 }, { id: 0, team: 0 }], "bad-players"],
    ["a team below zero", [{ id: 0, team: -1 }, { id: 1, team: 0 }], "bad-players"],
    ["an id that is not whole", [{ id: 0.5, team: 0 }, { id: 1, team: 0 }], "bad-players"],
  ])("refuses to start with %s", (_what, players, reason) => {
    expect(createGame({ players, seed: 1, now: START }, CONFIG)).toEqual({ ok: false, reason });
  });

  it("starts for one player alone, who wins by being right twice with nobody to race", () => {
    let state = game(alone(1));

    state = solve(state, 0, START + 1000);
    const step = next(state);
    state = solve(step.state, 0, step.now + 1000);

    expect(winnersNeeded(1)).toBe(1);
    expect(state.units).toEqual([{ members: [0], wins: 2, place: 1, leader: null }]);
    expect(state.phase).toBe("ended");
    expect(state.history.at(-1)).toEqual({ type: "ended", round: 2, reason: "half" });
  });

  it("starts for one team and nobody else: three who play it together", () => {
    const state = game([0, 1, 2].map((id) => ({ id, team: 1 })));

    expect(state.units).toEqual([{ members: [0, 1, 2], wins: 0, place: 0, leader: 0 }]);
    expect(state.phase).toBe("problem");
  });

  it("refuses rules that cannot be played", () => {
    expect(createGame({ players: alone(2), seed: 1, now: START }, { ...CONFIG, boards: [] })).toEqual({ ok: false, reason: "bad-config" });
  });
});

describe("buzzing", () => {
  it("gives the floor to the player who buzzes, for ten seconds", () => {
    const state = act(game(alone(3)), 1, { type: "buzz" }, START + 5000);

    expect(state.phase).toBe("answer");
    expect(state.floor).toEqual({ player: 1, unit: 1, until: START + 5000 + ANSWER_MS });
    expect(state.history.at(-1)).toEqual({ type: "buzz", round: 1, player: 1 });
    expect(deadline(state, CONFIG)).toBe(START + 5000 + ANSWER_MS);
  });

  it("refuses a second buzz while someone is answering", () => {
    const state = act(game(alone(3)), 1, { type: "buzz" }, START + 5000);

    expect(applyAction(state, 2, { type: "buzz" }, START + 5001, CONFIG)).toEqual({ ok: false, reason: "not-open" });
  });

  it("refuses someone who is not in the game", () => {
    expect(applyAction(game(alone(2)), 7, { type: "buzz" }, START, CONFIG)).toEqual({ ok: false, reason: "not-playing" });
  });

  it("does not change the state it was given", () => {
    const state = game(alone(2));
    const before = JSON.stringify(state);

    act(state, 0, { type: "buzz" }, START + 1);

    expect(JSON.stringify(state)).toBe(before);
  });
});

describe("answering", () => {
  it("counts a right answer for the unit, closes the problem and shows the answer for a while", () => {
    const state = solve(game(alone(3)), 2, START + 4000);

    expect(state.units[2]).toEqual({ members: [2], wins: 1, place: 0, leader: null });
    expect(state.phase).toBe("pause");
    expect(state.outcome).toEqual({ kind: "right", player: 2, unit: 2 });
    expect(state.pauseUntil).toBe(START + 5000 + PAUSE_MS);
    expect(state.floor).toBeNull();
    expect(state.history.at(-1)).toEqual({ type: "right", round: 1, player: 2, said: state.answer });
  });

  it("shuts a unit that answers wrong out of the problem, which goes on for the others", () => {
    const state = miss(game(alone(3)), 0, START + 4000);

    expect(state.phase).toBe("problem");
    expect(state.wrong).toEqual([0]);
    expect(state.units[0].wins).toBe(0);
    expect(state.history.at(-1)).toMatchObject({ type: "wrong", player: 0 });
    expect(applyAction(state, 0, { type: "buzz" }, START + 6000, CONFIG)).toEqual({ ok: false, reason: "shut-out" });
    expect(applyAction(state, 1, { type: "buzz" }, START + 6000, CONFIG).ok).toBe(true);
  });

  it("shuts the whole team out when one of them answers wrong", () => {
    const players: RectPlayer[] = [0, 1, 2].map((id) => ({ id, team: 1 })).concat(alone(5).slice(3));
    const state = miss(game(players), 1, START + 4000);

    expect(applyAction(state, 0, { type: "buzz" }, START + 6000, CONFIG)).toEqual({ ok: false, reason: "shut-out" });
    expect(applyAction(state, 2, { type: "buzz" }, START + 6000, CONFIG)).toEqual({ ok: false, reason: "shut-out" });
    expect(applyAction(state, 3, { type: "buzz" }, START + 6000, CONFIG).ok).toBe(true);
  });

  it("closes the problem when every unit still playing has answered wrong", () => {
    let state = miss(game(alone(2)), 0, START + 4000);
    state = miss(state, 1, START + 8000);

    expect(state.phase).toBe("pause");
    expect(state.outcome).toEqual({ kind: "all-wrong" });
    expect(state.history.at(-1)).toEqual({ type: "all-wrong", round: 1 });
  });

  it("only takes an answer from the player who buzzed", () => {
    const players: RectPlayer[] = [0, 1, 2].map((id) => ({ id, team: 1 })).concat(alone(4).slice(3));
    const state = act(game(players), 0, { type: "buzz" }, START + 1000);

    expect(applyAction(state, 1, { type: "answer", count: state.answer }, START + 2000, CONFIG)).toEqual({ ok: false, reason: "not-your-answer" });
    expect(applyAction(state, 3, { type: "answer", count: state.answer }, START + 2000, CONFIG)).toEqual({ ok: false, reason: "not-your-answer" });
  });

  it("refuses an answer when nobody has buzzed", () => {
    const state = game(alone(2));

    expect(applyAction(state, 0, { type: "answer", count: state.answer }, START + 1000, CONFIG)).toEqual({ ok: false, reason: "not-your-answer" });
  });

  it.each([["a fraction", 2.5], ["a number below zero", -1], ["a number too large to say", CONFIG.maxSaid + 1], ["not a number", Number.NaN]])(
    "refuses %s as an answer, and the player still has the floor",
    (_what, count) => {
      const state = act(game(alone(2)), 0, { type: "buzz" }, START + 1000);

      expect(applyAction(state, 0, { type: "answer", count }, START + 2000, CONFIG)).toEqual({ ok: false, reason: "bad-count" });
    },
  );

  it("takes zero as an answer like any other", () => {
    const state = act(game(alone(2)), 0, { type: "buzz" }, START + 1000);

    const result = applyAction(state, 0, { type: "answer", count: 0 }, START + 2000, CONFIG);

    expect(result.ok).toBe(true);
  });
});

describe("winning", () => {
  it("makes a unit a winner at its second right answer, in the order units win", () => {
    let state = solve(game(alone(4)), 3, START + 1000);
    let step = next(state);
    state = solve(step.state, 3, step.now + 1000);

    expect(state.units[3]).toEqual({ members: [3], wins: 2, place: 1, leader: null });
    expect(state.history).toContainEqual({ type: "won", round: 2, unit: 3, place: 1 });
    expect(state.phase).toBe("pause");

    step = next(state);
    state = solve(step.state, 0, step.now + 1000);
    step = next(state);
    state = solve(step.state, 0, step.now + 1000);
    expect(state.units[0].place).toBe(2);
  });

  it("keeps a unit that has won out of the problems that follow", () => {
    let state = solve(game(alone(4)), 3, START + 1000);
    let step = next(state);
    state = solve(step.state, 3, step.now + 1000);
    step = next(state);

    expect(applyAction(step.state, 3, { type: "buzz" }, step.now + 1000, CONFIG)).toEqual({ ok: false, reason: "already-won" });
  });

  it("closes a problem as all wrong without waiting for the units that have won", () => {
    let state = solve(game(alone(3)), 2, START + 1000);
    let step = next(state);
    state = solve(step.state, 2, step.now + 1000);
    step = next(state);

    state = miss(step.state, 0, step.now + 1000);
    state = miss(state, 1, step.now + 5000);

    expect(state.outcome).toEqual({ kind: "all-wrong" });
  });

  it("ends the game the moment half the units have won", () => {
    let state = solve(game(alone(2)), 1, START + 1000);
    const step = next(state);
    state = solve(step.state, 1, step.now + 1000);

    expect(state.phase).toBe("ended");
    expect(state.pauseUntil).toBeNull();
    expect(state.history.at(-1)).toEqual({ type: "ended", round: 2, reason: "half" });
    expect(deadline(state, CONFIG)).toBeNull();
    expect(applyAction(state, 0, { type: "buzz" }, step.now + 9000, CONFIG)).toEqual({ ok: false, reason: "game-over" });
  });

  it("goes on while fewer than half have won", () => {
    let state = solve(game(alone(3)), 1, START + 1000);
    const step = next(state);
    state = solve(step.state, 1, step.now + 1000);

    // one winner of three is not half
    expect(state.phase).toBe("pause");
  });

  it("counts a team as one unit towards the half", () => {
    const players: RectPlayer[] = [0, 1, 2].map((id) => ({ id, team: 1 })).concat([{ id: 3, team: 0 }]);
    let state = solve(game(players), 2, START + 1000);
    const step = next(state);
    state = solve(step.state, 0, step.now + 1000);

    // two right answers by different members of the team: the team has won, and one unit of two is half
    expect(state.units[0]).toEqual({ members: [0, 1, 2], wins: 2, place: 1, leader: 0 });
    expect(state.phase).toBe("ended");
  });
});

describe("the clock", () => {
  it("does nothing before anything is due", () => {
    const state = game(alone(2));

    expect(applyTimeout(state, START + PROBLEM_MS - 1, CONFIG)).toBe(state);
  });

  it("counts an answer not given within ten seconds as wrong", () => {
    const buzzed = act(game(alone(3)), 1, { type: "buzz" }, START + 1000);

    const early = applyTimeout(buzzed, START + 1000 + ANSWER_MS - 1, CONFIG);
    const late = applyTimeout(buzzed, START + 1000 + ANSWER_MS, CONFIG);

    expect(early).toBe(buzzed);
    expect(late.phase).toBe("problem");
    expect(late.wrong).toEqual([1]);
    expect(late.history.at(-1)).toEqual({ type: "silent", round: 1, player: 1 });
  });

  it("closes a problem nobody has got right after five minutes", () => {
    const state = applyTimeout(game(alone(2)), START + PROBLEM_MS, CONFIG);

    expect(state.phase).toBe("pause");
    expect(state.outcome).toEqual({ kind: "time" });
    expect(state.pauseUntil).toBe(START + PROBLEM_MS + PAUSE_MS);
    expect(state.history.at(-1)).toEqual({ type: "time", round: 1 });
  });

  it("lets a player who buzzed just before the five minutes were up finish answering", () => {
    const buzzed = act(game(alone(2)), 0, { type: "buzz" }, START + PROBLEM_MS - 2000);

    const waiting = applyTimeout(buzzed, START + PROBLEM_MS, CONFIG);
    const right = applyAction(buzzed, 0, { type: "answer", count: buzzed.answer }, START + PROBLEM_MS + 3000, CONFIG);

    expect(waiting).toBe(buzzed);
    expect(right.ok && right.state.outcome).toEqual({ kind: "right", player: 0, unit: 0 });
  });

  it("closes the problem for time when an answer given after the five minutes is wrong", () => {
    const buzzed = act(game(alone(3)), 0, { type: "buzz" }, START + PROBLEM_MS - 2000);

    const state = act(buzzed, 0, { type: "answer", count: buzzed.answer + 1 }, START + PROBLEM_MS + 3000);

    expect(state.outcome).toEqual({ kind: "time" });
    expect(state.phase).toBe("pause");
  });

  it("puts up the next problem when the pause is over, with nobody shut out", () => {
    let state = miss(game(alone(3)), 0, START + 1000);
    state = solve(state, 1, START + 4000);
    const step = next(state);

    expect(step.state).toMatchObject({ phase: "problem", round: 2, openedAt: step.now, wrong: [], floor: null, outcome: null, pauseUntil: null });
    expect(step.state.history.at(-1)).toEqual({ type: "problem", round: 2 });
    expect(step.state.answer).toBe(solutions(step.state.board).length);
    expect(applyAction(step.state, 0, { type: "buzz" }, step.now + 1, CONFIG).ok).toBe(true);
  });

  it("keeps the units' right answers from problem to problem", () => {
    const state = solve(game(alone(3)), 1, START + 1000);

    expect(next(state).state.units[1].wins).toBe(1);
  });

  it("ends the game after the last problem allowed, even if too few have won", () => {
    const short: RectConfig = { ...CONFIG, maxProblems: 2 };
    let state = applyTimeout(game(alone(3), 7, short), START + PROBLEM_MS, short);
    const step = next(state, short);

    state = applyTimeout(step.state, step.now + PROBLEM_MS, short);

    expect(state.phase).toBe("ended");
    expect(state.history.at(-1)).toEqual({ type: "ended", round: 2, reason: "problems" });
  });

  it("does not change the state it was given", () => {
    const state = game(alone(2));
    const before = JSON.stringify(state);

    applyTimeout(state, START + PROBLEM_MS, CONFIG);

    expect(JSON.stringify(state)).toBe(before);
  });
});

describe("a game that stood still", () => {
  /** How long the fixtures let a game stand, in ms. */
  const STOOD = 90_000;

  it("has its open problem's time moved on by as long as it stood", () => {
    const state = game(alone(2));

    const moved = shiftClock(state, STOOD);

    expect(moved.openedAt).toBe(START + STOOD);
    expect(deadline(moved, CONFIG)).toBe(START + STOOD + PROBLEM_MS);
  });

  it("has the time to answer moved on with it", () => {
    const answering = act(game(alone(2)), 1, { type: "buzz" }, START + 2000);

    const moved = shiftClock(answering, STOOD);

    expect(moved.floor).toEqual({ player: 1, unit: 1, until: START + 2000 + ANSWER_MS + STOOD });
    expect(deadline(moved, CONFIG)).toBe(START + 2000 + ANSWER_MS + STOOD);
  });

  it("has the pause before the next problem moved on with it", () => {
    const closed = solve(game(alone(3)), 0, START + 2000);

    const moved = shiftClock(closed, STOOD);

    expect(moved.pauseUntil).toBe(START + 3000 + PAUSE_MS + STOOD);
  });

  it("is otherwise the same game, and the one given is not changed", () => {
    const state = act(game(alone(2)), 0, { type: "buzz" }, START + 2000);
    const before = structuredClone(state);

    const moved = shiftClock(state, STOOD);

    expect(state).toEqual(before);
    expect({ ...moved, openedAt: state.openedAt, floor: state.floor }).toEqual(state);
  });

  it("is the very same state when it did not stand at all", () => {
    const state = game(alone(2));

    expect(shiftClock(state, 0)).toBe(state);
  });
});

describe("a problem nobody who is there can still answer", () => {
  /** Units 0 and 1 are there; unit 2 is not. */
  const there = (unit: number): boolean => unit !== 2;

  it("is closed as wrong all round when everyone there has answered wrong", () => {
    const state = miss(miss(game(alone(3)), 0, START + 1000), 1, START + 3000);

    const closed = closeIfSpent(state, there, START + 5000, CONFIG);

    expect(state.phase).toBe("problem");
    expect(closed).toMatchObject({ phase: "pause", outcome: { kind: "all-wrong" }, pauseUntil: START + 5000 + PAUSE_MS });
    expect(closed.history.at(-1)).toEqual({ type: "all-wrong", round: 1 });
    expect(viewFor(closed, 0).answer).toBe(state.answer);
  });

  it("stays open while someone there has not answered", () => {
    const state = miss(game(alone(3)), 0, START + 1000);

    expect(closeIfSpent(state, there, START + 5000, CONFIG)).toBe(state);
  });

  it("stays open when nobody racing is there at all: that is for whoever knows they are gone to deal with", () => {
    const state = miss(game(alone(2)), 0, START + 1000);

    expect(closeIfSpent(state, () => false, START + 5000, CONFIG)).toBe(state);
  });

  it("does not wait for a unit that has won, there or not", () => {
    let step = next(solve(game(alone(4)), 3, START + 1000));
    step = next(solve(step.state, 3, step.now + 1000));
    const wrong = miss(miss(step.state, 0, step.now + 1000), 1, step.now + 3000);

    // unit 3 has won and sits out; unit 2 is not there; units 0 and 1 are wrong
    expect(wrong.units[3].place).toBe(1);
    expect(closeIfSpent(wrong, there, step.now + 5000, CONFIG).outcome).toEqual({ kind: "all-wrong" });
  });

  it("is left alone while a player is answering, even one who has gone since buzzing: their time is theirs", () => {
    const answering = act(miss(game(alone(3)), 0, START + 1000), 1, { type: "buzz" }, START + 3000);

    // unit 0 is wrong and is the only one there; unit 1 buzzed and then dropped
    expect(closeIfSpent(answering, (unit) => unit === 0, START + 4000, CONFIG)).toBe(answering);
  });

  it("is not closed a second time, nor once the game is over", () => {
    const closed = closeIfSpent(miss(miss(game(alone(3)), 0, START + 1000), 1, START + 3000), there, START + 5000, CONFIG);
    const over = abandon(miss(game(alone(3)), 0, START + 1000));

    expect(closed.phase).toBe("pause");
    expect(closeIfSpent(closed, there, START + 6000, CONFIG)).toBe(closed);
    expect(closeIfSpent(over, (unit) => unit === 0, START + 6000, CONFIG)).toBe(over);
  });

  it("does not change the state it was given", () => {
    const state = miss(miss(game(alone(3)), 0, START + 1000), 1, START + 3000);
    const before = structuredClone(state);

    closeIfSpent(state, there, START + 5000, CONFIG);

    expect(state).toEqual(before);
  });
});

describe("a game nobody is left to play", () => {
  it("ends where it stands, and says why", () => {
    const state = solve(game(alone(4)), 2, START + 2000);

    const over = abandon(state);

    expect(over.phase).toBe("ended");
    expect(over.history.at(-1)).toEqual({ type: "ended", round: 1, reason: "abandoned" });
    expect(over.units).toEqual(state.units);
    expect(deadline(over, CONFIG)).toBeNull();
  });

  it("takes the turn to answer from whoever had it", () => {
    const answering = act(game(alone(2)), 0, { type: "buzz" }, START + 2000);

    const over = abandon(answering);

    expect(over.floor).toBeNull();
    expect(applyAction(over, 0, { type: "answer", count: answering.answer }, START + 3000, CONFIG)).toEqual({ ok: false, reason: "game-over" });
  });

  it("leaves an open problem's answer unsaid", () => {
    const state = game(alone(2));

    const seen = viewFor(abandon(state), 0);

    expect(seen.phase).toBe("ended");
    expect(seen.answer).toBeNull();
    expect(seen.solutions).toBeNull();
  });

  it("keeps the winners it had", () => {
    let state = game(alone(4));
    state = solve(state, 1, START + 1000);
    state = applyTimeout(state, START + 2000 + PAUSE_MS, CONFIG);
    state = solve(state, 1, START + 3000 + PAUSE_MS);

    const over = abandon(state);

    expect(over.units[1]).toMatchObject({ wins: CONFIG.winsNeeded, place: 1 });
  });

  it("changes nothing in a game already over, and never the state it was given", () => {
    const state = game(alone(2));
    const before = structuredClone(state);

    const over = abandon(state);

    expect(state).toEqual(before);
    expect(abandon(over)).toBe(over);
  });
});

describe("viewFor", () => {
  it("shows the board and the target, and not the answer, while a problem is open", () => {
    const state = game(alone(3));

    const view = viewFor(state, 1);

    expect(view.board).toEqual(state.board);
    expect(view.answer).toBeNull();
    expect(view.solutions).toBeNull();
    expect(JSON.stringify(view)).not.toContain('"answer":' + state.answer);
  });

  it("still keeps the answer back while someone is answering", () => {
    const state = act(game(alone(3)), 0, { type: "buzz" }, START + 1);

    const view = viewFor(state, 2);

    expect(view.floor).toEqual({ player: 0, unit: 0 });
    expect(view.answer).toBeNull();
    expect(view.solutions).toBeNull();
  });

  it("shows the answer and the rectangles themselves once the problem is closed", () => {
    const state = solve(game(alone(3)), 0, START + 1000);

    const view = viewFor(state, 2);

    expect(view.answer).toBe(state.answer);
    expect(view.solutions).toEqual(solutions(state.board));
    expect(view.solutions).toHaveLength(state.answer);
  });

  it("tells a player which unit is theirs, and someone watching that they have none", () => {
    const state = game(alone(3));

    expect(viewFor(state, 2).you).toEqual({ player: 2, unit: 2 });
    expect(viewFor(state, null).you).toBeNull();
    expect(viewFor(state, 9).you).toBeNull();
  });

  it("shows everyone the same game", () => {
    const state = miss(game(alone(3)), 0, START + 1000);

    const { you: _mine, ...mine } = viewFor(state, 0);
    const { you: _theirs, ...theirs } = viewFor(state, 2);

    expect(mine).toEqual(theirs);
  });

  it("says how many units must win", () => {
    expect(viewFor(game(alone(5)), 0).winnersNeeded).toBe(3);
  });

  it("gives a copy: changing the view does not change the game", () => {
    const state = game(alone(2));
    const view = viewFor(state, 0);

    view.board.cells[0] = 99;
    view.units[0].members.push(5);
    view.wrong.push(1);

    expect(state.board.cells[0]).not.toBe(99);
    expect(state.units[0].members).toEqual([0]);
    expect(state.wrong).toEqual([]);
  });
});

describe("parseAction", () => {
  it("reads a buzz and an answer", () => {
    expect(parseAction({ type: "buzz", extra: 1 })).toEqual({ type: "buzz" });
    expect(parseAction({ type: "answer", count: 8 })).toEqual({ type: "answer", count: 8 });
  });

  it.each([["an answer with no number", { type: "answer" }], ["an answer in words", { type: "answer", count: "8" }], ["another game's move", { type: "rotate", steps: 1 }], ["text", "buzz"], ["nothing", null]])(
    "does not take %s for an action",
    (_what, raw) => {
      expect(parseAction(raw)).toBeNull();
    },
  );
});
