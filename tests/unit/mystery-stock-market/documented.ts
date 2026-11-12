/**
 * The exchange of the show's own match of this game (episodes 4 and 5), as far as it is on record:
 * for each of its first twenty rounds what the seven price rules go by, and the prices the show
 * put on its screens. Rebuilt from the dealer's and the players' words in viewers' subtitle files
 * and from viewers' screen captures, and not checked against the release itself
 * (design/games/mystery-stock-market.md says from where, and what of it is a reading). Written by
 * a script, so that no number is copied by hand.
 *
 * The players' own orders are not on record, so this is the exchange and not the match: what each
 * rule needs of a round is given as it came out (which way, how many held), not who traded what.
 * Who played is left out.
 *
 * What is a reading rather than something shown or said:
 * - 후자전자 was hidden by secrets from round 5 to round 17; which way it went in those rounds is
 *   filled in (`FILLED_LATTER_ROUNDS`) with the first filling under which every shown price comes
 *   out. 6 fillings do; all of them agree on rounds 5, 6, 8, 9, 10, 14, 15.
 * - 방어제철's holdings after rounds 13, 14, 15, 16, 17, 18 are estimates read off a chart.
 * - 알트엔터's path is exact after rounds 0, 8, 13, 14, 15, 18, 19, 20 and read off charts to within 100 won elsewhere.
 * - The secret of round 15 on 후자전자 was not shown being used: it is inferred from the monitor.
 *
 * The wiki's tables of the same match (`wiki.ts`, twenty-three rounds) were laid beside this on
 * 2026-11-12 (`wiki.test.ts`): all 27 prices below are the same, and 알트엔터's path differs by
 * 100 won after rounds 3 and 5, where the wiki has 9,500 and 8,000. This file is left as it was read.
 */
import type { StockId } from "../../../src/shared/games/mystery-stock-market/prices";

/** What one round came to, as far as the price rules go. */
export interface DocumentedRound {
  /** How many shares of 방어제철 the players held between them when the round ended. */
  steelHeld: number;
  /** Whether more of 코요테크 was bought in the round than of 후자전자. */
  coyoBoughtMore: boolean;
  /** Whether the holdings of 후자전자 were within the range in which it rises. */
  latterWithin: boolean;
  /** Whether a secret kept 후자전자 off the monitor at the start of the next round. */
  latterHidden: boolean;
  /** Where 알트엔터 stood after the round. */
  alt: number;
}

/** The rounds in which a secret was used on 후자전자. */
export const SECRETS_ON_LATTER = [4, 6, 8, 10, 12, 14, 15];

/** The first twenty rounds, the first of them first. */
export const EXCHANGE: DocumentedRound[] = [
  { steelHeld: 5, coyoBoughtMore: true, latterWithin: false, latterHidden: false, alt: 10000 },
  { steelHeld: 5, coyoBoughtMore: true, latterWithin: false, latterHidden: false, alt: 9900 },
  { steelHeld: 10, coyoBoughtMore: false, latterWithin: true, latterHidden: false, alt: 9600 },
  { steelHeld: 0, coyoBoughtMore: false, latterWithin: false, latterHidden: true, alt: 8900 },
  { steelHeld: 0, coyoBoughtMore: true, latterWithin: false, latterHidden: true, alt: 8100 },
  { steelHeld: 0, coyoBoughtMore: true, latterWithin: false, latterHidden: true, alt: 8500 },
  { steelHeld: 0, coyoBoughtMore: false, latterWithin: false, latterHidden: true, alt: 8600 },
  { steelHeld: 0, coyoBoughtMore: false, latterWithin: true, latterHidden: true, alt: 6200 },
  { steelHeld: 0, coyoBoughtMore: false, latterWithin: false, latterHidden: true, alt: 4300 },
  { steelHeld: 0, coyoBoughtMore: false, latterWithin: true, latterHidden: true, alt: 6000 },
  { steelHeld: 2, coyoBoughtMore: false, latterWithin: false, latterHidden: true, alt: 5500 },
  { steelHeld: 2, coyoBoughtMore: false, latterWithin: false, latterHidden: true, alt: 4600 },
  { steelHeld: 6, coyoBoughtMore: true, latterWithin: false, latterHidden: true, alt: 3200 },
  { steelHeld: 9, coyoBoughtMore: true, latterWithin: false, latterHidden: true, alt: 5000 },
  { steelHeld: 3, coyoBoughtMore: false, latterWithin: false, latterHidden: true, alt: 3700 },
  { steelHeld: 10, coyoBoughtMore: false, latterWithin: false, latterHidden: true, alt: 2400 },
  { steelHeld: 35, coyoBoughtMore: true, latterWithin: true, latterHidden: false, alt: 1300 },
  { steelHeld: 30, coyoBoughtMore: true, latterWithin: false, latterHidden: false, alt: 1000 },
  { steelHeld: 30, coyoBoughtMore: true, latterWithin: false, latterHidden: false, alt: 2400 },
  { steelHeld: 4, coyoBoughtMore: false, latterWithin: false, latterHidden: false, alt: 4800 },
];

/** The prices the show put on screen, by stock: after which round, and the price. */
export const SHOWN: Record<StockId, Record<number, number>> = {
  finance: { 8: 5904, 20: 2055 },
  build: { 1: 9000, 9: 4734, 10: 4260, 14: 2794, 20: 2708 },
  steel: { 1: 9000, 20: 9200 },
  alt: { 8: 6200, 13: 3200, 14: 5000, 15: 3700, 18: 1000, 20: 4800 },
  open: { 1: 9000, 5: 8938, 6: 10099, 8: 12894, 14: 26842, 15: 30331, 20: 30274 },
  coyo: { 1: 11400, 14: 12800, 20: 14900 },
  latter: { 1: 9000, 20: 100 },
};

/** The rounds in which 후자전자's way is filled in rather than on record. */
export const FILLED_LATTER_ROUNDS = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
