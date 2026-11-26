/**
 * What the show says of 수식 신호등 (design/games/equation-traffic-light.md):
 * its dealer's explanation in the last episode, and what is known of the one
 * game its two finalists played. The tests hold the game's numbers and its
 * clues to these.
 */

/** A nine-cell equation. The show gives five minutes to create it and five for each answer; the site gives half of each (the user's decision, 2026-11-26). */
export const CELLS = 9;
export const CREATE_SECONDS = 150;
export const GUESS_SECONDS = 150;

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

/**
 * The wiki's two examples of an answer that has a number more often than the
 * equation does (its rule table of 2026-11-25; the colours are read from the
 * page): the ones left over toward the back are red, but one in its position
 * is green before any of the others is yellow.
 */
export const WIKI_CLUE_EXAMPLES = [
  { secret: "2+2+39=43", answer: "3+2×22=47", clues: "yggryrggr" },
  { secret: "13×21=273", answer: "2+239=241", clues: "yrryrggry" },
];
