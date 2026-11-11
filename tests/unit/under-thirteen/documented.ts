/**
 * The show's own match of this game, as it was played in the third episode:
 * what each of its seven players put in over fourteen rounds, who passed, and
 * the penalties its dealer gave. Rebuilt from what the dealer says aloud while
 * the match is played, in viewers' subtitle files of the episode, and not
 * checked against the release itself (design/games/under-thirteen.md says from
 * where, and what of it is a reading); the document the other games follow
 * has this game's rules only. Written by a script, so that no number is
 * copied by hand.
 *
 * Who played is left out. The players are numbers: as they stood, clockwise,
 * from whoever held the first-player marker in the first round.
 */
import type { Chip, Stand } from "../../../src/shared/games/under-thirteen/rules";

/** One round of the match. */
export interface DocumentedRound {
  /** Who held the first-player marker. */
  first: number;
  /** What each player put in, by player: the card, the chip, and with the rainbow chip the stand they named. */
  picks: [card: number, chip: Chip, stand?: Stand][];
  /** The order the dealer called the players in, before anyone passed. */
  order: number[];
  /** Who passed, in the order they did. */
  passes: number[];
  /** The penalties the dealer gave, in the order given: who, and how many points. */
  penalties: [player: number, points: number][];
}

/** The fourteen rounds. */
export const MATCH: DocumentedRound[] = [
  {
    first: 0,
    picks: [[5, "red"], [6, "green"], [5, "blue"], [5, "green"], [6, "red"], [5, "blue"], [5, "red"]],
    order: [1, 4, 0, 2, 3, 5, 6],
    passes: [],
    penalties: [[6, 2]],
  },
  {
    first: 6,
    picks: [[2, "blue"], [1, "red"], [1, "green"], [2, "red"], [3, "blue"], [3, "green"], [6, "red"]],
    order: [6, 4, 5, 0, 3, 1, 2],
    passes: [],
    penalties: [[4, 2], [5, 2], [3, 2]],
  },
  {
    first: 3,
    picks: [[4, "red"], [5, "blue"], [6, "red"], [6, "blue"], [4, "red"], [6, "red"], [4, "rainbow", "blue"]],
    order: [6, 3, 5, 2, 1, 4, 0],
    passes: [3, 2, 1, 4],
    penalties: [[0, 3], [1, 3], [2, 2]],
  },
  {
    first: 2,
    picks: [[1, "green"], [4, "red"], [3, "green"], [3, "rainbow", "red"], [5, "green"], [4, "red"], [3, "blue"]],
    order: [3, 4, 5, 1, 2, 6, 0],
    passes: [5],
    penalties: [[1, 2], [6, 2], [0, 4]],
  },
  {
    first: 0,
    picks: [[3, "rainbow", "green"], [0, "green"], [4, "rainbow", "green"], [1, "green"], [2, "green"], [2, "green"], [2, "green"]],
    order: [2, 0, 4, 5, 6, 3, 1],
    passes: [6],
    penalties: [[3, 5]],
  },
  {
    first: 3,
    picks: [[6, "blue"], [3, "rainbow", "blue"], [2, "blue"], [4, "red"], [0, "blue"], [0, "blue"], [1, "green"]],
    order: [1, 0, 3, 2, 6, 4, 5],
    passes: [],
    penalties: [[2, 3]],
  },
  {
    first: 2,
    picks: [[0, "green"], [2, "blue"], [0, "red"], [0, "blue"], [1, "rainbow", "blue"], [1, "rainbow", "green"], [0, "blue"]],
    order: [4, 5, 1, 2, 3, 6, 0],
    passes: [],
    penalties: [],
  },
  {
    first: 2,
    picks: [[0, "blue"], [0, "red"], [6, "blue"], [6, "green"], [6, "rainbow", "blue"], [6, "red"], [6, "rainbow", "green"]],
    order: [4, 6, 2, 3, 5, 0, 1],
    passes: [],
    penalties: [[2, 8], [3, 7], [5, 4]],
  },
  {
    first: 5,
    picks: [[2, "rainbow", "green"], [6, "green"], [0, "red"], [1, "blue"], [3, "green"], [4, "green"], [5, "red"]],
    order: [0, 1, 6, 5, 4, 3, 2],
    passes: [1],
    penalties: [[4, 3]],
  },
  {
    first: 4,
    picks: [[5, "green"], [5, "rainbow", "blue"], [1, "rainbow", "red"], [3, "green"], [5, "blue"], [5, "blue"], [4, "blue"]],
    order: [1, 2, 4, 5, 0, 6, 3],
    passes: [4, 5],
    penalties: [[0, 2], [6, 4], [4, 2]],
  },
  {
    first: 4,
    picks: [[4, "blue"], [1, "blue"], [4, "green"], [2, "blue"], [4, "green"], [3, "blue"], [2, "green"]],
    order: [4, 0, 2, 5, 6, 3, 1],
    passes: [2, 3],
    penalties: [[6, 3], [1, 3]],
  },
  {
    first: 1,
    picks: [[3, "green"], [4, "blue"], [3, "blue"], [5, "rainbow", "blue"], [2, "blue"], [0, "red"], [3, "blue"]],
    order: [3, 1, 2, 6, 0, 4, 5],
    passes: [2, 6],
    penalties: [[4, 4]],
  },
  {
    first: 4,
    picks: [[6, "red"], [3, "green"], [2, "green"], [0, "red"], [0, "red"], [2, "green"], [0, "red"]],
    order: [0, 1, 5, 2, 4, 6, 3],
    passes: [5],
    penalties: [[0, 6], [2, 4]],
  },
  {
    first: 2,
    picks: [[1, "red"], [2, "red"], [5, "red"], [4, "red"], [1, "red"], [1, "rainbow", "green"], [1, "green"]],
    order: [5, 2, 3, 1, 4, 6, 0],
    passes: [3, 1],
    penalties: [[0, 6]],
  },
];

/** What each player's penalty points came to, by player. */
export const TOTALS = [21, 8, 17, 14, 11, 6, 11];
