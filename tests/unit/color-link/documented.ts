/**
 * What the show says of 컬러 링크 (design/games/color-link.md): the numbers
 * of its dealer's explanation and of the wiki's rule table, the two boards
 * of its final that are in captures of the broadcast, and the order of the
 * five rounds its two finalists played. The tests hold the game's numbers
 * and its scoring to these.
 */

/** 14 colours, two pieces of each, known by the letters A to N; a board may come with a black pair (X) and a white pair (Y). */
export const LETTERS = "ABCDEFGHIJKLMN";
export const FIXED = "XY";
/** A path is at least six squares long, the two pieces it joins included. */
export const MIN_PATH = 6;
/** The round's first player places one piece; a turn after that is two pieces of different colours. */
export const FIRST_PIECES = 1;
export const TURN_PIECES = 2;
/** Five rounds, and the first to three points wins. */
export const ROUNDS = 5;
export const GOAL = 3;
/** The show gives three minutes to place, three to choose who goes first and five to prove; the site gives half of each (the user's decision, 2026-11-26). */
export const PLACE_SECONDS = 90;
export const CHOOSE_SECONDS = 90;
export const PROVE_SECONDS = 150;

/** The board of the show's first round, with its two X and its two Y (a capture of the broadcast). */
export const SHOW_BOARD_1 = [".........", ".X....Y..", ".........", ".Y.......", ".........", ".........", "..X......", ".........", "........."];

/** The board of the show's second round: three rings of squares, one inside another, each joined to the next by one square (a capture of the broadcast). */
export const SHOW_BOARD_2 = ["...........", ".#########.", ".#.......#.", ".#.##.##.#.", ".#.#...#.#.", ".#.#.#.#.#.", ".#.#...#.#.", ".#.#####.#.", ".#.......#.", ".####.####.", "..........."];

/**
 * The nine pieces on the second board when it was declared impossible, by
 * row and column from 0 (the same capture). Its prover gave the proof up.
 */
export const SHOW_ROUND_2_PIECES: [letter: string, row: number, column: number][] = [
  ["C", 5, 0],
  ["J", 2, 8],
  ["A", 6, 5],
  ["D", 6, 6],
  ["J", 8, 8],
  ["A", 9, 5],
  ["B", 10, 1],
  ["B", 10, 8],
  ["C", 10, 9],
];

/**
 * The show's five rounds: how many pieces were on the board when it was
 * declared impossible, whether the proof was made, and the points after it
 * of the first round's first player and of the other. A proof made is the
 * prover's point, one not made the declarer's.
 */
export const SHOW_ROUNDS: { pieces: number; proved: boolean; score: [number, number] }[] = [
  { pieces: 9, proved: false, score: [0, 1] },
  { pieces: 9, proved: false, score: [1, 1] },
  { pieces: 9, proved: false, score: [1, 2] },
  { pieces: 21, proved: false, score: [2, 2] },
  { pieces: 11, proved: true, score: [2, 3] },
];
