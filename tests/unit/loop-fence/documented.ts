/**
 * 울타리 치기 (Loop Fence Puzzle) as the show has it: the fourth match of the
 * place of exile, episode 8, 00:36:32 to 00:44:45 (the English subtitles;
 * the wiki has the name and the result only, 2026-11-27).
 *
 * What the host says, in order:
 * - the numbers on the board are looked at and the dots are joined into one
 *   fence (00:37:01)
 * - every square has four dots and may hold a number from 0 to 3 (00:37:16)
 * - a number says how many lines join the dots round it (00:37:22); a square
 *   with no number does not say (00:37:28)
 * - all the lines have to join into one closed loop (00:37:34); more than
 *   one fence is not allowed (00:37:42)
 * - not every dot has to be used, and every number has to be met (00:37:46)
 * - whoever is done presses the buzzer and has the answer checked (00:37:54)
 * - whoever does not finish is out (00:37:59)
 * And the commentary: lines do not cross, and two lines or none leave a dot
 * (00:39:27).
 *
 * One puzzle is given, to all four at once; three pass one after another and
 * the fourth is out. The show does not say how large the board is, how long
 * there is, or what a wrong answer costs.
 */

/** The numbers a square may hold. */
export const NUMBERS = [0, 1, 2, 3];

/** How many passed of the four who played, and how many were out. */
export const SHOW_PLAYERS = 4;
export const SHOW_PASSED = 3;
