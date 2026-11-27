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
 * The two equations of the show, the winner's first: as the wiki's table of
 * the game gives them (its page of 2026-11-27). The first was also said aloud
 * by those watching ("91 times 9 to the power of 0"). The second has an
 * expression on the right of its equals symbol and a number on the left.
 */
export const SHOW_EQUATIONS = ["91×9^0=91", "47=2^5+15"];

/**
 * The first answers of the show, each with the equation it was an answer to
 * and the clues the wiki's table gives it: neither is an equation, and one
 * has four symbols side by side.
 */
export const SHOW_FIRST_ANSWERS = [
  { secret: "47=2^5+15", answer: "0×+-÷12^3", clues: "rryrryyyr" },
  { secret: "91×9^0=91", answer: "34=5×6+78", clues: "rryryrrrr" },
];

/**
 * The second, third and fourth answers of the show with the clues the same
 * table gives them, the winner's first in each turn. The fourth turn ended
 * the game: one answer was the equation, the other had three cells wrong.
 */
export const SHOW_LATER_ANSWERS = [
  { secret: "47=2^5+15", answer: "4^5+78+96", clues: "gyyryrgrr" },
  { secret: "91×9^0=91", answer: "9^21÷-=20", clues: "gyryrrgry" },
  { secret: "47=2^5+15", answer: "11^2=5+77", clues: "yrygyggyr" },
  { secret: "91×9^0=91", answer: "9^1×10=91", clues: "gyyyrgggg" },
  { secret: "47=2^5+15", answer: "47=2^5+15", clues: "ggggggggg" },
  { secret: "91×9^0=91", answer: "91^1×0=91", clues: "ggyrygggg" },
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
