/**
 * What the show says of 만국기 (design/games/flags-around-the-world.md): its
 * dealer's explanation in the twelfth episode, and the scores of the one
 * game played there. The tests hold the game's numbers to these.
 */

/** Ten flags, a second each, three times over in the same order: 30 seconds. */
export const SHOWN = 10;
export const SHOW_SECONDS = 1;
export const PASSES = 3;
/** Five seconds later 25 flags, five of the ten among them, and half the show's minute to find those five (the user's decision, 2026-11-26). */
export const GAP_SECONDS = 5;
export const CHOICES = 25;
export const ANSWERS = 5;
export const CHOOSE_SECONDS = 30;
/** A point for each right one, three rounds. */
export const ROUNDS = 3;

/**
 * The show's game: three players, by the order their scores are read out in
 * the first round, and the points of each in its three rounds. The first of
 * them survived with 13; the other two were level on 11 at the bottom.
 */
export const SHOW_SCORES = [
  [5, 4, 4],
  [4, 3, 4],
  [4, 3, 4],
];

/** The round the two at the bottom then played between themselves: four and five. */
export const SHOW_TIEBREAK = [4, 5];
