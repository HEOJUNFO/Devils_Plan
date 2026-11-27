/**
 * What the show says of HIT, STAY (design/games/hit-stay.md): the numbers of
 * its dealer's explanation, and the game its five players played, as far as
 * the captions have it: who was first, the limit, every bet, call, raise and
 * fold, every hit and stay, the totals said at a showdown, and the chips
 * after each round as worked out from those. The tests play it again.
 *
 * The captions have no cards but a few, so the rounds have only the total a
 * player showed. The wiki's tables of the first ten rounds (its page of
 * 2026-11-27) have the cards: the hands of five showdowns are below.
 */

/** One seven, two sixes, three fives, four fours, five threes, six twos, seven ones and seven negative ones: 35 cards. */
export const DECK: [value: number, copies: number][] = [
  [7, 1],
  [6, 2],
  [5, 3],
  [4, 4],
  [3, 5],
  [2, 6],
  [1, 7],
  [-1, 7],
];
export const CARDS = 35;
/** Three cards each, one of them revealed; 30 chips; a basic bet of one chip, one more after every tenth round; a die of five through 12. */
export const DEALT = 3;
export const START_CHIPS = 30;
export const BASIC_BET = 1;
export const BASIC_BET_EVERY = 10;
export const LIMITS = [5, 6, 7, 8, 9, 10, 11, 12];

/**
 * The chips the show's five began with, by seat (the order the first player
 * went round in): 30, the ten more each took before the game, and a chip
 * for every Piece held.
 */
export const SHOW_CHIPS = [45, 40, 44, 44, 48];

/** A round of the show. Seats are 1 to 5. */
export interface ShowRound {
  /** Who was first. */
  first: number;
  /** The captions have this seat first where the rules here would have the other (round 21: the same seat as in round 20). */
  firstAsShown?: true;
  limit: number;
  /**
   * The first round of betting, the additional cards and the second round of
   * betting, each a list of `<seat><what>`: `b<n>` a bet or a raise to `n`
   * chips in that round of betting, `c` a call, `f` a fold, `h` a hit, `s` a
   * stay. Empty where there was none.
   */
  bet1: string;
  hits: string;
  bet2: string;
  /** The totals shown, by seat, where the round came to a showdown. */
  totals?: Record<number, number>;
  /** The pot the round's winner took (said by the dealer, or the sum of what was put in). */
  pot: number;
  /** Everyone's chips after the round, by seat; 0 for someone out. */
  chips: number[];
}

/**
 * The show's 24 rounds. Where the captions and the sum of the bets differ
 * (round 17: "ten" said, 18 put in) the sum is here: the last pot, 176, comes
 * out only with it.
 */
export const SHOW_ROUNDS: ShowRound[] = [
  { first: 1, limit: 8, bet1: "1b3 2f 3f 4c 5b10 1b40 4f 5b44 1c", hits: "1h 5s 1h 1h 1h 1s", bet2: "", totals: { 1: 19, 5: 8 }, pot: 96, chips: [0, 39, 43, 40, 99] },
  { first: 2, limit: 9, bet1: "2b2 3c 4b30 5f 2f 3f", hits: "", bet2: "", pot: 38, chips: [0, 36, 40, 47, 98] },
  { first: 3, limit: 11, bet1: "3b1 4f 5c 2c", hits: "3h 5h 2h 3s 5s 2h 2h 2h 2s", bet2: "3b6 5c 2f", totals: { 3: 14, 5: 10 }, pot: 19, chips: [0, 34, 32, 46, 109] },
  { first: 4, limit: 9, bet1: "4f 5b5 2f 3f", hits: "", bet2: "", pot: 9, chips: [0, 33, 31, 45, 112] },
  { first: 5, limit: 9, bet1: "5b1 2c 3c 4c", hits: "5h 2h 3h 4h 5h 2h 3s 4s 5h 2s 5h 5s", bet2: "5f 2f 3b1 4b10 3c", totals: { 3: 8, 4: 8 }, pot: 28, chips: [0, 31, 33, 47, 110] },
  { first: 2, limit: 11, bet1: "2b5 3f 4c 5f", hits: "2s 4h 4h 4h 4s", bet2: "2b25 4f", pot: 39, chips: [0, 39, 32, 41, 109] },
  { first: 3, limit: 12, bet1: "3f 4b5 5c 2f", hits: "4h 5h 4s 5h 5s", bet2: "4b15 5c", totals: { 4: 15, 5: 11 }, pot: 44, chips: [0, 38, 31, 20, 132] },
  { first: 4, limit: 10, bet1: "4b1 5c 2f 3b6 4f 5c", hits: "5h 3h 5h 3s 5h 5h 5h 5h 5h 5h 5s", bet2: "5f", pot: 17, chips: [0, 37, 41, 18, 125] },
  { first: 5, limit: 5, bet1: "5b4 2f 3b12 4f 5c", hits: "5h 3s 5h 5h 5h 5s", bet2: "5b5 3b17 5f", pot: 50, chips: [0, 36, 61, 17, 107] },
  { first: 2, limit: 12, bet1: "2b1 3c 4f 5b6 2c 3c", hits: "2h 3h 5h 2h 3s 5h 2s 5h 5h 5h 5s", bet2: "2b29 3c 5f", totals: { 2: 10, 3: 12 }, pot: 80, chips: [0, 0, 105, 16, 100] },
  { first: 3, limit: 10, bet1: "3b1 4c 5f", hits: "3h 4h 3h 4h 3h 4h 3h 4s 3h 3h 3s", bet2: "3f", pot: 8, chips: [0, 0, 102, 21, 98] },
  { first: 4, limit: 8, bet1: "4f 5b10 3f", hits: "", bet2: "", pot: 16, chips: [0, 0, 100, 19, 102] },
  { first: 5, limit: 5, bet1: "5b1 3f 4f", hits: "", bet2: "", pot: 7, chips: [0, 0, 98, 17, 106] },
  { first: 3, limit: 12, bet1: "3f 4f", hits: "", bet2: "", pot: 6, chips: [0, 0, 96, 15, 110] },
  { first: 4, limit: 12, bet1: "4b5 5b13 3f 4c", hits: "4h 5s 4h 4h 4s", bet2: "", totals: { 4: 24, 5: 12 }, pot: 32, chips: [0, 0, 94, 0, 127] },
  { first: 5, limit: 5, bet1: "5b2 3f", hits: "", bet2: "", pot: 6, chips: [0, 0, 92, 0, 129] },
  { first: 3, limit: 10, bet1: "3b4 5c", hits: "3h 5h 3h 5h 3s 5h 5h 5s", bet2: "3b6 5f", pot: 18, chips: [0, 0, 98, 0, 123] },
  { first: 5, limit: 9, bet1: "5b6 3f", hits: "", bet2: "", pot: 10, chips: [0, 0, 96, 0, 125] },
  { first: 3, limit: 8, bet1: "3b5 5c", hits: "3s 5h 5s", bet2: "3b1 5b5 3f", pot: 20, chips: [0, 0, 88, 0, 133] },
  { first: 5, limit: 9, bet1: "5f", hits: "", bet2: "", pot: 4, chips: [0, 0, 90, 0, 131] },
  { first: 5, firstAsShown: true, limit: 12, bet1: "5b1 3b10 5c", hits: "5h 3h 5h 3h 5h 3s 5h 5h 5h 5s", bet2: "5b6 3c", totals: { 3: 11, 5: 11 }, pot: 38, chips: [0, 0, 71, 0, 150] },
  { first: 3, limit: 7, bet1: "3b1 5f", hits: "", bet2: "", pot: 7, chips: [0, 0, 74, 0, 147] },
  { first: 5, limit: 9, bet1: "5b1 3b10 5c", hits: "5h 3h 5s 3s", bet2: "5b1 3b15 5f", pot: 42, chips: [0, 0, 88, 0, 133] },
  { first: 3, limit: 9, bet1: "3b1 5b9 3b21 5c", hits: "3s 5s", bet2: "3b5 5b64 3c", totals: { 3: 8, 5: 9 }, pot: 176, chips: [0, 0, 0, 0, 221] },
];

/**
 * The hands of the showdowns the wiki's tables have cards for, by round and
 * seat: the three dealt, then the additional cards in the order taken.
 */
export const SHOW_HANDS: Record<number, Record<number, number[]>> = {
  1: { 1: [-1, 3, 1, 6, 2, 3, 5], 5: [-1, 5, 4] },
  3: { 3: [1, 3, 3, 7], 5: [-1, 5, 3, 3] },
  5: { 3: [5, 1, 1, 1], 4: [2, -1, 3, 4] },
  7: { 4: [4, 5, 4, 2], 5: [5, -1, 5, -1, 3] },
  10: { 2: [1, 3, 3, 2, 1], 3: [6, 5, -1, 2] },
};
/** Who the wiki's tables name the winner of each of those: both, where the round was tied. */
export const SHOW_HANDS_WON: Record<number, number[]> = { 1: [5], 3: [5], 5: [3, 4], 7: [5], 10: [3] };

/** The rounds the basic bet was two chips from, and three. */
export const SHOW_BASIC_BET = { 11: 2, 21: 3 };
/** Who was out after which round: the order they are placed in, last first. */
export const SHOW_OUT = [
  { seat: 1, round: 1 },
  { seat: 2, round: 10 },
  { seat: 4, round: 15 },
  { seat: 3, round: 24 },
];
