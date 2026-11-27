/**
 * The board of 울타리 치기 (Loop Fence Puzzle): squares, the sides of the
 * squares a fence can run along, and what makes a fence the puzzle's.
 *
 * Design: design/games/loop-fence.md. A board is `width` squares across and
 * `height` down. Some squares have a number, 0 to 3: how many of that
 * square's four sides the fence runs along. The fence is one closed loop
 * along the sides of squares, which neither branches nor crosses itself.
 *
 * A side has a number: first the sides that lie across, a row of them after
 * another from the top (`height + 1` rows of `width`), then the sides that
 * stand upright, likewise (`height` rows of `width + 1`).
 */

/** A puzzle: how large the board is, and the number in each square, a row after another from the top; `null` where a square has none. */
export interface Puzzle {
  width: number;
  height: number;
  clues: (number | null)[];
}

/** What stands for a square with no number where a puzzle is written as rows of text. */
export const BLANK = ".";

/** The puzzle `rows` writes: a digit for a square's number, {@link BLANK} for a square with none. `null` where the rows are not all as long, or have anything else in them. */
export function puzzleOf(rows: readonly string[]): Puzzle | null {
  if (!Array.isArray(rows) || rows.length === 0 || rows.some((row) => typeof row !== "string" || row.length === 0 || row.length !== rows[0].length)) return null;
  const clues: (number | null)[] = [];
  for (const cell of rows.join("")) {
    if (cell === BLANK) clues.push(null);
    else if ("0123".includes(cell)) clues.push(Number(cell));
    else return null;
  }
  return { width: rows[0].length, height: rows.length, clues };
}

/** How many sides a board has. */
export const sidesOf = (board: Pick<Puzzle, "width" | "height">): number => (board.height + 1) * board.width + board.height * (board.width + 1);

/** The side across the top of square (`x`, `y`): the bottom of the square above it. `y` may be `height`, for the bottom of the last row. */
export const across = (board: Pick<Puzzle, "width" | "height">, x: number, y: number): number => y * board.width + x;

/** The side up the left of square (`x`, `y`): the right of the square before it. `x` may be `width`, for the right of the last column. */
export const upright = (board: Pick<Puzzle, "width" | "height">, x: number, y: number): number => (board.height + 1) * board.width + y * (board.width + 1) + x;

/** The four sides of square `cell`: its top, its bottom, its left and its right. */
export function sidesAround(board: Pick<Puzzle, "width" | "height">, cell: number): [number, number, number, number] {
  const [x, y] = [cell % board.width, Math.floor(cell / board.width)];
  return [across(board, x, y), across(board, x, y + 1), upright(board, x, y), upright(board, x + 1, y)];
}

/** The two corners side `side` runs between, each as its number: a row of `width + 1` corners after another from the top. */
export function endsOf(board: Pick<Puzzle, "width" | "height">, side: number): [number, number] {
  const corners = board.width + 1;
  const flat = (board.height + 1) * board.width;
  if (side < flat) {
    const [x, y] = [side % board.width, Math.floor(side / board.width)];
    return [y * corners + x, y * corners + x + 1];
  }
  const [x, y] = [(side - flat) % corners, Math.floor((side - flat) / corners)];
  return [y * corners + x, (y + 1) * corners + x];
}

/** How many of the sides of square `cell` the fence `fence` runs along. */
export const countAround = (board: Pick<Puzzle, "width" | "height">, fence: readonly boolean[], cell: number): number => sidesAround(board, cell).filter((side) => fence[side] === true).length;

/** The number every square of `board` would have for the fence `fence`. */
export function cluesOf(board: Pick<Puzzle, "width" | "height">, fence: readonly boolean[]): number[] {
  return Array.from({ length: board.width * board.height }, (_, cell) => countAround(board, fence, cell));
}

/**
 * Whether `fence` is one closed loop: it has a side, every corner it comes
 * to has exactly two of its sides, and all of it is one piece.
 */
export function isLoop(board: Pick<Puzzle, "width" | "height">, fence: readonly boolean[]): boolean {
  const corners = (board.width + 1) * (board.height + 1);
  const at: number[][] = Array.from({ length: corners }, () => []);
  let count = 0;
  for (let side = 0; side < sidesOf(board); side++) {
    if (fence[side] !== true) continue;
    count += 1;
    const [a, b] = endsOf(board, side);
    at[a].push(b);
    at[b].push(a);
  }
  if (count === 0 || at.some((others) => others.length !== 0 && others.length !== 2)) return false;
  // walked from one of its corners, the loop comes back having passed every side
  const start = at.findIndex((others) => others.length === 2);
  let [before, here, walked] = [start, at[start][0], 1];
  while (here !== start) {
    const next = at[here][0] === before ? at[here][1] : at[here][0];
    [before, here] = [here, next];
    walked += 1;
  }
  return walked === count;
}

/** What is wrong with a fence, the first thing found: it is no single loop, or a square's number is not met. */
export type FenceFault = "not-loop" | "wrong-count";

/** Why `fence` is not the fence `puzzle` asks for; `null` when it is. */
export function faultOf(puzzle: Puzzle, fence: readonly boolean[]): FenceFault | null {
  if (!isLoop(puzzle, fence)) return "not-loop";
  return puzzle.clues.some((clue, cell) => clue !== null && countAround(puzzle, fence, cell) !== clue) ? "wrong-count" : null;
}
