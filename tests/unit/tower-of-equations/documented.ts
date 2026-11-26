/**
 * What the show says of 수식의 탑 (design/games/tower-of-equations.md): its
 * dealer's explanation in the twelfth episode, and what its screen showed of
 * the blocks, the towers and the problems (viewers' captures of the
 * broadcast). The tests hold the game's numbers, its reading of a tower and
 * its moves to these. Towers are written from the bottom block up.
 */

/** Sixteen blocks: the numbers 2, 3, 5 and 7 without an operator, and each with a plus, a minus and a times sign. Four positions. */
export const BLOCKS = ["2", "3", "5", "7", "+2", "+3", "+5", "+7", "-2", "-3", "-5", "-7", "×2", "×3", "×5", "×7"];
export const POSITIONS = 4;

/** Seven points end the game; the first to declare scores or loses one, someone who declared fewer two. */
export const GOAL = 7;
export const FIRST_POINTS = 1;
export const MORE_POINTS = 2;

/**
 * The show gives five minutes for the buzzer, ten seconds to declare, two
 * minutes to declare fewer and two minutes to make the moves; the site gives
 * half of each (the user's decision for every game, 2026-11-26).
 */
export const THINK_SECONDS = 150;
export const SAY_SECONDS = 5;
export const MORE_SECONDS = 60;
export const MOVE_SECONDS = 60;

/** The towers the show's game began with: the fourth position empty. */
export const SHOW_START = [
  ["3", "+3", "×5", "-2", "+5", "-7"],
  ["+2", "5", "+7", "×2", "×7"],
  ["7", "-3", "2", "-5", "×3"],
  [],
];

/** The dealer's example: a tower of four blocks that comes to 25. Read from the top down it is 2 + 7 × 3 + 2. */
export const DEALER_EXAMPLE = { tower: ["+2", "×3", "+7", "2"], target: 25, height: 4 };

/**
 * Towers the show's screen had beside their target number, and what each
 * would come to with the operations done one after another from the top
 * instead: multiplication is done first.
 */
export const SHOW_TOWERS = [
  { round: 1, tower: ["×7", "×2", "+7", "-7", "3"], target: 94, inTurn: 42 },
  { round: 30, tower: ["×3", "+3", "×2", "×5", "5"], target: 59, inTurn: 159 },
  // (the 29th's target number is on the screen; its blocks are from what was said aloud)
  { round: 29, tower: ["×5", "+3", "×7", "7"], target: 64, inTurn: 260 },
];

/** Equations said aloud in the show, and the target number on the screen of the two rounds that have one. */
export const SHOW_SAID = [
  { tower: ["×3", "2"], value: 6 },
  { tower: ["×5", "×3", "3"], value: 45 },
  { tower: ["+2", "×7", "7"], value: 51 },
  { tower: ["-7", "×2", "×7", "7"], value: 91 },
  { tower: ["×5", "+3", "×7", "7"], value: 64 },
];

/**
 * The show's first round: target number 94, target height 5, four moves
 * declared and made. The first move is on the screen (three blocks of the
 * second position, flipped over onto the fourth); the other three are one
 * way from there to the towers the second round began with.
 */
export const SHOW_ROUND_1 = {
  target: 94,
  height: 5,
  declared: 4,
  moves: [
    { from: 1, count: 3, to: 3, flip: true },
    { from: 0, count: 1, to: 3, flip: false },
    { from: 0, count: 5, to: 0, flip: true },
    { from: 0, count: 1, to: 3, flip: false },
  ],
  after: [["+5", "-2", "×5", "+3"], ["+2", "5"], ["7", "-3", "2", "-5", "×3"], ["×7", "×2", "+7", "-7", "3"]],
};

/** The second round's problem, on the towers the first left: one move was declared, and the challenger gave up (the top block was no number without an operator). */
export const SHOW_ROUND_2 = { target: 22, height: 4, declared: 1 };

/**
 * The show's last round: target number 94 and target height 5 again, three
 * moves declared and made, from the towers the thirtieth round left to the
 * towers the game ended on.
 */
export const SHOW_ROUND_31 = {
  target: 94,
  height: 5,
  declared: 3,
  before: [["×3", "+3", "×2", "×5", "5"], ["-7", "×7", "7"], ["+2", "-3", "3", "-2", "+5", "-5", "2"], ["+7"]],
  moves: [
    { from: 0, count: 2, to: 3, flip: false },
    { from: 1, count: 2, to: 0, flip: false },
    { from: 0, count: 4, to: 1, flip: false },
  ],
  after: [["×3"], ["-7", "+3", "×2", "×7", "7"], ["+2", "-3", "3", "-2", "+5", "-5", "2"], ["+7", "×5", "5"]],
};

/**
 * The show's game as its dealer scored it, a round a line: who declared
 * first, who declared fewer (if anyone), and whether the challenger
 * succeeded. Players are A, B and C by their place; rounds 11 to 21 were cut
 * short in the edit and are left out, with the points they came to.
 */
export const SHOW_SCORING: { first: number; fewer?: number; success: boolean }[][] = [
  [
    { first: 0, success: true },
    { first: 1, success: false },
    { first: 1, success: true },
    { first: 0, success: false },
    { first: 2, success: false },
    { first: 1, success: false },
    { first: 1, fewer: 2, success: true },
    { first: 1, fewer: 0, success: true },
    { first: 2, success: true },
    { first: 1, success: true },
  ],
  [
    { first: 2, success: true },
    { first: 1, success: true },
    { first: 1, fewer: 0, success: true },
    { first: 0, fewer: 2, success: true },
    { first: 1, success: true },
    { first: 0, success: true },
    { first: 1, success: true },
    { first: 1, success: false },
    { first: 1, success: true },
    { first: 1, success: true },
  ],
];
/** The points after the tenth round, the points the twenty-second began with, and the points the game ended on. */
export const SHOW_POINTS = { afterTen: [2, 0, 2], beforeTwentyTwo: [3, 3, 3], end: [6, 7, 6] };
