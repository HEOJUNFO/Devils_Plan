/**
 * What the show says of 그라데이션 (design/games/gradation.md): its dealer's
 * explanation in the thirteenth episode, and the three matches its players
 * played, as the dealer read the numbers out. The cups of the first two
 * matches are also in the wiki's tables of them (its page of 2026-11-27),
 * which name the cup of every round. The tests hold the game's numbers and
 * its order of play to these.
 */

/** Seven cube cups, darker at both ends and lighter toward the middle: black, dark gray, light gray, white. */
export const CUPS = 7;
export const SHADES = [0, 1, 2, 3, 2, 1, 0];

/** Twenty number cubes: two of each number from zero to nine. */
export const HIGHEST = 9;
export const COPIES = 2;

/** The total of the numbers in the cups cannot exceed 30. */
export const MAX_SUM = 30;

/** The show gives five minutes to distribute the cubes; the site gives half (the user's decision, 2026-11-26). */
export const ARRANGE_SECONDS = 150;

/** Two consecutive wins end the game. */
export const WINS_IN_A_ROW = 2;

/** One cup of a round: the number in it, and the cup's shade where a caption or the wiki's table names it (0 black to 3 white). */
export type ShowCup = [value: number, shade?: number];

/** One round of a match: who was the first player, and the cup each of the match's two submitted, in the order of `players`. */
export interface ShowRound {
  first: number;
  cups: [ShowCup, ShowCup];
  /** Who won the round; `null` for a tie. */
  winner: number | null;
}

/** One match of the show. Players are known by the ball they drew, less one: 0, 1 and 2. */
export interface ShowMatch {
  players: [number, number];
  /** The cups of each, from the left. A number no caption gives is filled in with one the rules allow (see the brief). */
  cups: [number[], number[]];
  rounds: ShowRound[];
  /** The points of each at the end, and who won. */
  score: [number, number];
  winner: number;
}

/** The three matches of the show (episode 13, 01:35:10 to 01:54:46). */
export const SHOW: ShowMatch[] = [
  {
    players: [0, 1],
    // the first's third cup is in no caption and was not submitted: the wiki's table has 4 in it
    cups: [
      [0, 0, 4, 5, 6, 7, 8],
      [0, 0, 1, 6, 7, 7, 9],
    ],
    rounds: [
      { first: 0, cups: [[6, 2], [9, 0]], winner: 1 },
      { first: 1, cups: [[7, 1], [7, 2]], winner: null },
      { first: 1, cups: [[8, 0], [7, 1]], winner: 0 },
      { first: 0, cups: [[0, 1], [0, 0]], winner: null },
      { first: 0, cups: [[0, 0], [1, 2]], winner: 1 },
      { first: 1, cups: [[5, 3], [6, 3]], winner: 1 },
    ],
    score: [1, 3],
    winner: 1,
  },
  {
    players: [1, 2],
    cups: [
      [0, 0, 1, 6, 6, 8, 9],
      [0, 1, 2, 2, 8, 8, 9],
    ],
    rounds: [
      { first: 1, cups: [[0, 0], [1, 1]], winner: 2 },
      { first: 2, cups: [[8, 1], [2, 2]], winner: 1 },
      { first: 1, cups: [[1, 2], [2, 3]], winner: 2 },
      { first: 2, cups: [[0, 1], [9, 0]], winner: 2 },
      { first: 2, cups: [[6, 3], [0, 0]], winner: 1 },
      { first: 1, cups: [[9, 0], [8, 1]], winner: 1 },
      { first: 1, cups: [[6, 2], [8, 2]], winner: 2 },
    ],
    score: [3, 4],
    winner: 2,
  },
  {
    players: [2, 0],
    // the second's last cup is in no caption: 8 or 9
    cups: [
      [0, 1, 3, 3, 6, 8, 9],
      [0, 2, 2, 3, 7, 7, 8],
    ],
    rounds: [
      { first: 2, cups: [[6], [2, 2]], winner: 2 },
      { first: 2, cups: [[1, 1], [3, 3]], winner: 0 },
      { first: 0, cups: [[3], [2, 1]], winner: 2 },
      { first: 2, cups: [[9, 0], [0, 0]], winner: 2 },
      { first: 2, cups: [[3], [7]], winner: 0 },
      { first: 0, cups: [[8], [7]], winner: 2 },
    ],
    score: [4, 2],
    winner: 2,
  },
];
