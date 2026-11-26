/**
 * What the show says of 포인트 오목 (design/games/point-gomoku.md): its
 * dealer's explanation at the start of the thirteenth episode, the board of
 * the rule pictures, and the bets of its one match that were said aloud or
 * shown. The tests hold the game's numbers and its placing of stones to
 * these.
 */

/** A board of nineteen lines each way (counted on two of the show's rule pictures), and a line of five stones. */
export const SIZE = 19;
export const LINE = 5;

/** Three consecutive spots a round, ten new points for each player, at least one on a spot. */
export const SPOTS = 3;
export const ROUND_POINTS = 10;
export const MIN_BET = 1;

/** The show gives 90 seconds to mark the spots and 90 to bet; the site gives half of each (the user's decision for every game, 2026-11-26). */
export const SELECT_SECONDS = 45;
export const BET_SECONDS = 45;

/**
 * The dealer's own example: with three, one and one bet of the first
 * round's ten points, half of the five left is two and a half, so two carry
 * over and the second round has twelve.
 */
export const DEALER_EXAMPLE = { bets: [3, 1, 1], left: 5, carried: 2, next: 12 };

/**
 * A round of the show, read from two pictures of the screen and from what
 * both players said: the selector had thirteen points and bet one, nine and
 * three, the other had thirteen and bet one, five and five. The first spot
 * went to the other (the same bet), the second to the selector, the third
 * to the other; the selector was left with none and the other with two.
 */
export const SHOW_ROUND = {
  points: { selector: 13, other: 13 },
  bets: { selector: [1, 9, 3], other: [1, 5, 5] },
  owners: ["other", "selector", "other"] as const,
  left: { selector: 0, other: 2 },
};

/** Another: the selector bet eight, one and one, and every spot went to the other. */
export const SHOW_SWEEP = { selector: [8, 1, 1] };
