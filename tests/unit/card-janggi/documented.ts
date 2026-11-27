/**
 * What the show says of 카드 장기 (design/games/card-janggi.md): the numbers
 * of its dealer's explanation and of the wiki's rule table, the board and
 * the cards as captures of the broadcast show them, and the order of the
 * first round its two finalists played. The tests hold the game's numbers
 * and its turns to these.
 */

/** The board: six squares across and five down, a great piece and three small ones a side (captures of the broadcast). */
export const BOARD = ["......", "a....b", "Aa..bB", "a....b", "......"];

/** The squares, as the tests name them: a to f across, 1 to 5 down from the top. */
export const at = (name: string): number => (Number(name[1]) - 1) * 6 + "abcdef".indexOf(name[0]);

/**
 * The five movement cards and the squares each reaches, as steps across and
 * down: the wiki's words, and the grey squares of the cards in captures of
 * the broadcast.
 */
export const CARDS: Record<string, [number, number][]> = {
  rat: [[0, -1], [1, 0], [0, 1], [-1, 0]],
  horse: [[1, -2], [2, -1], [2, 1], [1, 2], [-1, 2], [-2, 1], [-2, -1], [-1, -2]],
  monkey: [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]],
  elephant: [[1, -1], [2, -2], [1, 1], [2, 2], [-1, 1], [-2, 2], [-1, -1], [-2, -2]],
  giraffe: [[0, -2], [2, 0], [0, 2], [-2, 0]],
};

/** The round's first player lays all five cards, the second four of them. */
export const SECOND_CARDS = 4;
/** Three rounds, and two wins take the game. */
export const ROUNDS = 3;
export const GOAL = 2;
/** The show gives three minutes to lay the cards and 90 seconds to move; the site gives half of each (the user's decision, 2026-11-26). */
export const ARRANGE_SECONDS = 90;
export const MOVE_SECONDS = 45;

/** The first two moves of the show's first round, both by the rat card (a capture of the broadcast). */
export const SHOW_FIRST_MOVES: [from: string, to: string][] = [
  ["a4", "b4"],
  ["f2", "e2"],
];

/**
 * The way a great piece has to the square the other began on, as the show's
 * players said it (elephant, giraffe, horse) and its first round ended by
 * it: the winner's great piece went this way from the right.
 */
export const SHOW_WAY_HOME: [card: string, from: string, to: string][] = [
  ["elephant", "f3", "d1"],
  ["giraffe", "d1", "b1"],
  ["horse", "b1", "a3"],
];

/**
 * The order of the show's first round: who moved, and when the cards were
 * laid again. `1` is the round's first player, `2` the second. The second
 * player laid theirs again after their fourth move, the first after their
 * fifth, and the moves went on turn about.
 */
export const SHOW_ROUND_1_ORDER = ["1", "2", "1", "2", "1", "2", "1", "2", "2 lays", "1", "1 lays", "2", "1", "2"];
