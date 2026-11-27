/**
 * What the show says of 신의 시험 (design/games/divine-test.md): the wiki's
 * rules of the test of the place of exile, and the square it was passed
 * with. The tests hold the game's numbers to these.
 */

/** A board of 49 squares, seven by seven, and the tiles 1 to 49. */
export const SIZE = 7;
export const TILES = 49;
/** What every row, every column and both diagonals of a magic square of 49 add up to. */
export const MAGIC = 175;
/** The 1 is on the board from the beginning, on the middle square of the top row. */
export const FIXED = { tile: 1, cell: 3 };
/** The show gave an hour; the site gives half (the user's decision, 2026-11-26). */
export const SECONDS = 1800;

/**
 * The square the test was passed with: the wiki says it is the one the
 * Siamese method makes (1 on the middle of the top row, each next tile up
 * and to the right, round the edges, and under the last where that square
 * is taken).
 */
export const SHOW_SQUARE = [
  [30, 39, 48, 1, 10, 19, 28],
  [38, 47, 7, 9, 18, 27, 29],
  [46, 6, 8, 17, 26, 35, 37],
  [5, 14, 16, 25, 34, 36, 45],
  [13, 15, 24, 33, 42, 44, 4],
  [21, 23, 32, 41, 43, 3, 12],
  [22, 31, 40, 49, 2, 11, 20],
];
