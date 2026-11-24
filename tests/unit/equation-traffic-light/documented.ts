/**
 * What the show says of 수식 신호등 (design/games/equation-traffic-light.md):
 * its dealer's explanation in the last episode, and what is known of the one
 * game its two finalists played. The tests hold the game's numbers and its
 * clues to these.
 */

/** A nine-cell equation, five minutes to create it and five for each answer. */
export const CELLS = 9;
export const CREATE_SECONDS = 300;
export const GUESS_SECONDS = 300;

/** The numbers zero through nine and the symbols for addition, subtraction, multiplication, division, equals and exponent. */
export const SYMBOLS = "0123456789+-×÷=^";

/**
 * The two equations of the show. The first was said aloud by those watching
 * ("91 times 9 to the power of 0"); the second is put together from what its
 * guesser said on the last turn, and no caption has it whole.
 */
export const SHOW_EQUATIONS = ["91×9^0=91", "2^5+15=47"];

/**
 * The first answers of the show (the wiki's table), each with the equation it
 * was an answer to and its clues as worked out from that equation by hand:
 * neither is an equation, and one has four symbols side by side.
 */
export const SHOW_FIRST_ANSWERS = [
  { secret: "2^5+15=47", answer: "0×+-÷12^3", clues: "rryrryyyr" },
  { secret: "91×9^0=91", answer: "34=5×6+78", clues: "rryryrrrr" },
];
