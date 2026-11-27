/**
 * A search for the fences of a puzzle of 울타리 치기.
 *
 * The room never judges a fence by this: a fence is right when it is one
 * loop and meets every number (`faultOf` of `fence.ts`). The search is for
 * making the puzzles the game comes with, each of which has one fence and
 * no other (`tools/loop-fence-puzzles.ts`), for the tests that hold them to
 * that, and for the bot that fills a place while developing.
 */
import { across, endsOf, sidesAround, sidesOf, upright, type Puzzle } from "./fence";

/**
 * The fences of `puzzle`, up to `limit` of them: each as whether the fence
 * runs along each side.
 *
 * The sides are decided one after another, with or without fence: corner by
 * corner from the top left, the side to its right and the side under it, so
 * that a corner's four sides are all decided as soon as may be. A try is
 * given up as soon as a corner has three sides of fence or is left with
 * one, a square has more than its number or can no longer come to it, or
 * the fence closes to a loop while another piece of it lies elsewhere.
 */
export function fencesOf(puzzle: Puzzle, limit: number): boolean[][] {
  const count = sidesOf(puzzle);
  const cornerCount = (puzzle.width + 1) * (puzzle.height + 1);
  const ends = Array.from({ length: count }, (_, side) => endsOf(puzzle, side));
  // of each corner and of each square with a number: its sides, and which of them is decided last
  const cornerSides: number[][] = Array.from({ length: cornerCount }, () => []);
  ends.forEach(([a, b], side) => {
    cornerSides[a].push(side);
    cornerSides[b].push(side);
  });
  const cellsAt: number[][] = Array.from({ length: count }, () => []);
  puzzle.clues.forEach((clue, cell) => {
    if (clue !== null) for (const side of sidesAround(puzzle, cell)) cellsAt[side].push(cell);
  });
  const order: number[] = [];
  for (let y = 0; y <= puzzle.height; y++) {
    for (let x = 0; x <= puzzle.width; x++) {
      if (x < puzzle.width) order.push(across(puzzle, x, y));
      if (y < puzzle.height) order.push(upright(puzzle, x, y));
    }
  }
  const turnOf: number[] = [];
  order.forEach((side, turn) => (turnOf[side] = turn));
  const lastOfCorner: number[][] = Array.from({ length: count }, () => []);
  cornerSides.forEach((sides, corner) => lastOfCorner[sides.reduce((last, side) => (turnOf[side] > turnOf[last] ? side : last))].push(corner));

  const fence: boolean[] = Array.from({ length: count }, () => false);
  const degree = Array.from({ length: cornerCount }, () => 0);
  /** Of a corner a piece of fence ends at: the corner its other end is at. */
  const far = Array.from({ length: cornerCount }, (_, corner) => corner);
  const around = puzzle.clues.map(() => 0);
  const open = puzzle.clues.map(() => 4);
  /** How many pieces of fence there are that are not a closed loop, and whether a loop has closed. */
  let pieces = 0;
  let closed = false;
  const found: boolean[][] = [];

  /** Whether the squares beside `side` can still come to their numbers. */
  const cellsOk = (side: number): boolean => cellsAt[side].every((cell) => around[cell] <= (puzzle.clues[cell] as number) && around[cell] + open[cell] >= (puzzle.clues[cell] as number));
  /** Whether the corners whose last side `side` is have none or two sides of fence. */
  const cornersOk = (side: number): boolean => lastOfCorner[side].every((corner) => degree[corner] === 0 || degree[corner] === 2);

  function decide(turn: number): void {
    if (found.length >= limit) return;
    if (turn === count) {
      if (closed && pieces === 0) found.push([...fence]);
      return;
    }
    const side = order[turn];
    const [a, b] = ends[side];
    for (const cell of cellsAt[side]) open[cell] -= 1;

    // with fence along it: not at a corner that has two already, and not once the loop has closed
    if (!closed && degree[a] < 2 && degree[b] < 2) {
      const [endA, endB] = [degree[a] === 1 ? far[a] : a, degree[b] === 1 ? far[b] : b];
      const closes = degree[a] === 1 && degree[b] === 1 && far[a] === b;
      // (a loop may close only when it is all the fence there is)
      if (!closes || pieces === 1) {
        const [wasA, wasB, wasPieces] = [far[endA], far[endB], pieces];
        if (closes) {
          closed = true;
          pieces = 0;
        } else {
          pieces += degree[a] === 0 && degree[b] === 0 ? 1 : degree[a] === 1 && degree[b] === 1 ? -1 : 0;
          far[endA] = endB;
          far[endB] = endA;
        }
        fence[side] = true;
        degree[a] += 1;
        degree[b] += 1;
        for (const cell of cellsAt[side]) around[cell] += 1;
        if (cellsOk(side) && cornersOk(side)) decide(turn + 1);
        for (const cell of cellsAt[side]) around[cell] -= 1;
        degree[a] -= 1;
        degree[b] -= 1;
        fence[side] = false;
        if (closes) closed = false;
        else {
          far[endA] = wasA;
          far[endB] = wasB;
        }
        pieces = wasPieces;
      }
    }
    // without
    if (found.length < limit && cellsOk(side) && cornersOk(side)) decide(turn + 1);
    for (const cell of cellsAt[side]) open[cell] += 1;
  }

  decide(0);
  return found;
}
