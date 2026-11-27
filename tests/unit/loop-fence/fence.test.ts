import { describe, expect, it } from "vitest";
import { across, cluesOf, countAround, endsOf, faultOf, isLoop, puzzleOf, sidesAround, sidesOf, upright, type Puzzle } from "../../../src/shared/games/loop-fence/fence";
import puzzles from "../../../src/shared/games/loop-fence/puzzles.json";
import { fencesOf } from "../../../src/shared/games/loop-fence/solve";
import { NUMBERS } from "./documented";

const board = (width: number, height: number): Puzzle => ({ width, height, clues: Array.from({ length: width * height }, () => null) });

/** The fence round the squares `cells` of `on`, each on its own. Sides two of them share are drawn twice over, which leaves them drawn. */
function round(on: Puzzle, cells: number[]): boolean[] {
  const fence = Array.from({ length: sidesOf(on) }, () => false);
  for (const cell of cells) for (const side of sidesAround(on, cell)) fence[side] = true;
  return fence;
}

/** The fence round the squares `cells` of `on` taken together: the sides one of them has and no other. */
function bound(on: Puzzle, cells: number[]): boolean[] {
  const times = Array.from({ length: sidesOf(on) }, () => 0);
  for (const cell of cells) for (const side of sidesAround(on, cell)) times[side] += 1;
  return times.map((count) => count === 1);
}

describe("the board of 울타리 치기", () => {
  it("has a side for every pair of dots next to each other", () => {
    expect(sidesOf(board(7, 7))).toBe(8 * 7 + 7 * 8);
    expect(sidesOf(board(2, 1))).toBe(7);
  });

  it("gives every square four sides, and squares next to each other one of them in common", () => {
    const on = board(3, 2);
    expect(sidesAround(on, 0)).toEqual([across(on, 0, 0), across(on, 0, 1), upright(on, 0, 0), upright(on, 1, 0)]);
    expect(sidesAround(on, 0).filter((side) => sidesAround(on, 1).includes(side))).toEqual([upright(on, 1, 0)]);
    expect(sidesAround(on, 1).filter((side) => sidesAround(on, 4).includes(side))).toEqual([across(on, 1, 1)]);
    expect(new Set(Array.from({ length: 6 }, (_, cell) => sidesAround(on, cell)).flat()).size).toBe(sidesOf(on));
  });

  it("runs each side between two dots next to each other", () => {
    const on = board(3, 2);
    expect(endsOf(on, across(on, 1, 0))).toEqual([1, 2]);
    expect(endsOf(on, across(on, 2, 2))).toEqual([10, 11]);
    expect(endsOf(on, upright(on, 0, 0))).toEqual([0, 4]);
    expect(endsOf(on, upright(on, 3, 1))).toEqual([7, 11]);
  });

  it("reads a puzzle from rows of text, and refuses rows that are not one", () => {
    expect(puzzleOf(["3.", ".0"])).toEqual({ width: 2, height: 2, clues: [3, null, null, 0] });
    expect(puzzleOf(["3.", "."])).toBeNull();
    expect(puzzleOf(["4."])).toBeNull();
    expect(puzzleOf([])).toBeNull();
  });
});

describe("a fence", () => {
  it("is a loop when it goes round once and closes", () => {
    const on = board(3, 3);
    expect(isLoop(on, round(on, [4]))).toBe(true);
    expect(isLoop(on, bound(on, [0, 1, 4, 7]))).toBe(true);
    expect(isLoop(on, bound(on, [0, 1, 2, 3, 4, 5, 6, 7, 8]))).toBe(true);
  });

  it("is none with nothing drawn, left open, or with a branch", () => {
    const on = board(3, 3);
    const open = round(on, [4]);
    open[across(on, 1, 1)] = false;
    const branch = round(on, [4]);
    branch[across(on, 0, 1)] = true;
    expect(isLoop(on, round(on, []))).toBe(false);
    expect(isLoop(on, open)).toBe(false);
    expect(isLoop(on, branch)).toBe(false);
  });

  it("is none as two fences: the show allows one", () => {
    const on = board(3, 3);
    expect(isLoop(on, round(on, [0, 8]))).toBe(false);
    expect(isLoop(on, round(on, [0, 2]))).toBe(false);
  });

  it("is none where it crosses itself at a dot", () => {
    const on = board(2, 2);
    // two squares that touch at a corner: four lines leave the middle dot
    expect(isLoop(on, bound(on, [0, 3]))).toBe(false);
  });

  it("is counted round a square by the sides it runs along", () => {
    const on = board(3, 3);
    const fence = bound(on, [0, 1, 4]);
    expect(cluesOf(on, fence)).toEqual([3, 2, 1, 2, 3, 1, 0, 1, 0]);
    expect(countAround(on, fence, 4)).toBe(3);
    expect(cluesOf(on, fence).every((count) => count <= 4)).toBe(true);
  });

  it("is right when it is one loop and every number is met; a square with no number asks nothing", () => {
    const puzzle = puzzleOf(["3..", ".3.", "0.."]) as Puzzle;
    expect(faultOf(puzzle, bound(puzzle, [0, 1, 4]))).toBeNull();
    expect(faultOf(puzzle, bound(puzzle, [0, 1, 4, 7]))).toBe("wrong-count");
    expect(faultOf(puzzle, bound(puzzle, [0, 1, 4, 3]))).toBe("wrong-count");
  });

  it("is wrong as two loops even where every number is met", () => {
    const puzzle = puzzleOf(["3..", ".0.", "..3"]) as Puzzle;
    expect(faultOf(puzzle, round(puzzle, [0, 8]))).toBe("not-loop");
  });
});

describe("the search for a puzzle's fences", () => {
  it("finds every loop of a board with no numbers", () => {
    // a board of one square has one loop; of two squares, three; of two by two, thirteen
    expect(fencesOf(board(1, 1), 100)).toHaveLength(1);
    expect(fencesOf(board(2, 1), 100)).toHaveLength(3);
    expect(fencesOf(board(2, 2), 100)).toHaveLength(13);
  });

  it("finds only loops that meet the numbers, and stops at as many as asked for", () => {
    const puzzle = puzzleOf(["3..", ".3.", "0.."]) as Puzzle;
    const found = fencesOf(puzzle, 100);
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((fence) => faultOf(puzzle, fence) === null)).toBe(true);
    expect(new Set(found.map((fence) => fence.join())).size).toBe(found.length);
    expect(fencesOf(board(2, 2), 5)).toHaveLength(5);
  });

  it("finds none where the numbers cannot be met", () => {
    expect(fencesOf(puzzleOf(["33", "33"]) as Puzzle, 10)).toEqual([]);
    expect(fencesOf(puzzleOf(["0"]) as Puzzle, 10)).toEqual([]);
  });

  it("finds the one fence of a board whose every square has its number", () => {
    const on = board(4, 4);
    const fence = bound(on, [0, 1, 5, 6, 10, 9, 13]);
    const puzzle: Puzzle = { ...on, clues: cluesOf(on, fence) };
    expect(fencesOf(puzzle, 10)).toEqual([fence]);
  });
});

describe("the puzzles the game comes with", () => {
  const read = puzzles.map((stored) => ({ stored, puzzle: puzzleOf(stored.rows) as Puzzle }));

  it("are 48 boards of seven squares by seven, no two the same", () => {
    expect(read).toHaveLength(48);
    expect(read.every(({ puzzle }) => puzzle !== null && puzzle.width === 7 && puzzle.height === 7)).toBe(true);
    expect(new Set(puzzles.map((stored) => stored.rows.join("/"))).size).toBe(puzzles.length);
  });

  it("have only the numbers the show's squares hold, on 26 of the 49 squares", () => {
    for (const { puzzle } of read) {
      const numbers = puzzle.clues.filter((clue): clue is number => clue !== null);
      expect(numbers.every((clue) => NUMBERS.includes(clue))).toBe(true);
      expect(numbers).toHaveLength(26);
    }
  });

  it("each have the fence stored with them, and no other", () => {
    for (const { stored, puzzle } of read) {
      const fence = [...stored.fence].map((side) => side === "1");
      expect(faultOf(puzzle, fence)).toBeNull();
      expect(fencesOf(puzzle, 2)).toEqual([fence]);
    }
  });
});
