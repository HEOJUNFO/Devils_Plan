/**
 * What the show says of 벽바둑Ⅱ (design/games/wall-go-2.md): its dealer's
 * explanation in the tenth episode, and what the players are seen to do.
 * The tests hold the game's numbers and its order of play to these.
 */

/** The board: 49 squares. */
export const SQUARES = 49;

/** A square counter goes one or two squares in a straight line. */
export const SQUARE_REACH = 2;

/** The game of three: one counter of each kind a player, placed in turn and then in the reverse order (1, 2, 3, 3, 2, 1). */
export const THREE = { square: 1, round: 1, placing: [0, 1, 2, 2, 1, 0] };

/** The game of two: two counters of each kind, the round ones on set squares, the square ones placed first, second, second, first. */
export const DUEL = { square: 2, round: 2, placing: [0, 1, 1, 0] };
