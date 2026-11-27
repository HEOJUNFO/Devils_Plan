/**
 * 비밀 코드 (Secret Code) as the show has it: the third match of the place of
 * exile, episode 7, 00:18:37 to 00:28:00 (the English subtitles; the wiki
 * has the name and the result only, 2026-11-27).
 *
 * What the host says: a picture is shown and a list of conditions, and the
 * code that meets them all is to be found (00:18:58); a code is four
 * letters, given in the order of the alphabet (00:19:06); the buzzer, and
 * then ten seconds to answer (00:19:16); a wrong answer locks its player
 * out of that question (00:19:20); a right one makes them safe at once and
 * takes them out of the rest (00:19:26); three rounds, and whoever has not
 * answered right by the end is out (00:19:33). A player describes the
 * picture: 26 cards, each with a letter from A to Z, a number and a suit
 * (00:20:27). The colours are named only by the conditions.
 *
 * The numbers are not said to be the letters' places in the alphabet, but
 * each round's answer meets its conditions about numbers only if they are:
 * {@link SHOW_ROUNDS} holds that. Which card had which colour and suit was
 * on the screen only.
 */
import type { Condition } from "../../../src/shared/games/secret-code/rules";

/** How many cards, letters to a code, rounds, and players the show's match had. */
export const CARDS = 26;
export const CODE_LENGTH = 4;
export const ROUNDS = 3;
export const SHOW_PLAYERS = 4;

/** Each round's answer, and those of its conditions that are about the numbers alone (the captions' sentences, as conditions). */
export const SHOW_ROUNDS: { answer: string; numbers: Condition[] }[] = [
  {
    // 00:20:17: the sum of the four numbers is 55; the difference of the numbers on the second and fourth cards is 7
    answer: "AOQV",
    numbers: [
      { kind: "sum", how: "is", value: 55 },
      { kind: "difference", first: 2, second: 4, value: 7 },
    ],
  },
  {
    // 00:23:56: the sum is 54; the product of the first and fourth is at most 50; the sum of the largest and smallest is at least 20
    answer: "ANPW",
    numbers: [
      { kind: "sum", how: "is", value: 54 },
      { kind: "product", first: 1, second: 4, how: "most", value: 50 },
      { kind: "ends", how: "least", value: 20 },
    ],
  },
  {
    // 00:26:11: the sum is at most 50
    answer: "CLMS",
    numbers: [{ kind: "sum", how: "most", value: 50 }],
  },
];

/**
 * The other kinds of condition the show's rounds had, one of each as it
 * stood: how many different colours and suits the four cards have, and that
 * the suit (or colour) of the card with the nth lowest number is the one
 * that is so-manieth most often among the cards A to Z.
 */
export const SHOW_KINDS: Condition[] = [
  { kind: "colors", count: 2 },
  { kind: "suits", count: 3 },
  // 00:20:17: the suit of the card with the second-lowest number is the one that appears second most often
  { kind: "common", of: "suit", nth: 2, rank: 2 },
  // 00:23:56: the colour of the card with the third-lowest number is the one that appears least often
  { kind: "common", of: "color", nth: 3, rank: 4 },
];
