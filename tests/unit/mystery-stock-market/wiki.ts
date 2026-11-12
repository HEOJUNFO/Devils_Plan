/**
 * The show's own match of this game as the wiki has it: the table of each round from the second
 * to the twenty-fourth, which is what the monitor showed as that round began. So table n is where
 * the exchange stood after round n - 1: each stock's price, how many shares the players held
 * between them, and how many were bought and sold in that round. `null` is a cell the wiki gives
 * as "???": a secret kept that stock off the monitor.
 *
 * Copied by a script from the wiki's page as it read on 2026-11-12, so that no number is copied
 * by hand, and not checked against the release itself. Who played is left out.
 */
import type { StockId } from "../../../src/shared/games/mystery-stock-market/prices";

/** One stock's row of a table. */
export interface WikiRow {
  price: number | null;
  held: number | null;
  bought: number | null;
  sold: number | null;
}

/** The tables, that of round 2 first. */
export const WIKI_TABLES: Record<StockId, WikiRow>[] = [
  // ROUND 2: after round 1
  {
    finance: { price: 10000, held: 7, bought: 7, sold: 0 },
    build: { price: 9000, held: 2, bought: 2, sold: 0 },
    steel: { price: 9000, held: 5, bought: 5, sold: 0 },
    alt: { price: 10000, held: 0, bought: 5, sold: 5 },
    open: { price: 9000, held: 8, bought: 8, sold: 0 },
    coyo: { price: 11400, held: 1, bought: 11, sold: 10 },
    latter: { price: 9000, held: 4, bought: 6, sold: 2 },
  },
  // ROUND 3: after round 2
  {
    finance: { price: 9000, held: 11, bought: 4, sold: 0 },
    build: { price: 8100, held: 2, bought: 0, sold: 0 },
    steel: { price: 9000, held: 5, bought: 1, sold: 1 },
    alt: { price: 9900, held: 1, bought: 1, sold: 0 },
    open: { price: 8000, held: 3, bought: 0, sold: 5 },
    coyo: { price: 12800, held: 22, bought: 123, sold: 102 },
    latter: { price: 8000, held: 6, bought: 2, sold: 0 },
  },
  // ROUND 4: after round 3
  {
    finance: { price: 8100, held: 3, bought: 0, sold: 8 },
    build: { price: 7290, held: 0, bought: 0, sold: 2 },
    steel: { price: 8000, held: 10, bought: 6, sold: 1 },
    alt: { price: 9500, held: 0, bought: 0, sold: 1 },
    open: { price: 7000, held: 1, bought: 0, sold: 2 },
    coyo: { price: 12100, held: 30, bought: 271, sold: 265 },
    latter: { price: 9500, held: 15, bought: 447, sold: 438 },
  },
  // ROUND 5: after round 4
  {
    finance: { price: 7290, held: 3, bought: 8, sold: 8 },
    build: { price: 8019, held: 0, bought: 0, sold: 0 },
    steel: { price: 10000, held: 0, bought: 0, sold: 10 },
    alt: { price: 8900, held: 0, bought: 8, sold: 8 },
    open: { price: 7910, held: 1, bought: 8, sold: 8 },
    coyo: { price: 11400, held: 8, bought: 4, sold: 26 },
    latter: { price: null, held: null, bought: null, sold: null },
  },
  // ROUND 6: after round 5
  {
    finance: { price: 6561, held: 4, bought: 1, sold: 0 },
    build: { price: 7217, held: 0, bought: 0, sold: 0 },
    steel: { price: 10000, held: 0, bought: 0, sold: 0 },
    alt: { price: 8000, held: 0, bought: 0, sold: 0 },
    open: { price: 8938, held: 1, bought: 0, sold: 0 },
    coyo: { price: 12800, held: 52, bought: 704, sold: 660 },
    latter: { price: null, held: null, bought: null, sold: null },
  },
  // ROUND 7: after round 6
  {
    finance: { price: 5904, held: 3, bought: 0, sold: 1 },
    build: { price: 6495, held: 0, bought: 0, sold: 0 },
    steel: { price: 10000, held: 0, bought: 0, sold: 0 },
    alt: { price: 8500, held: 0, bought: 0, sold: 0 },
    open: { price: 10099, held: 20, bought: 38, sold: 19 },
    coyo: { price: 14200, held: 46, bought: 1025, sold: 1031 },
    latter: { price: null, held: null, bought: null, sold: null },
  },
  // ROUND 8: after round 7
  {
    finance: { price: 5904, held: 3, bought: 0, sold: 0 },
    build: { price: 5845, held: 0, bought: 0, sold: 0 },
    steel: { price: 10000, held: 0, bought: 0, sold: 0 },
    alt: { price: 8600, held: 0, bought: 0, sold: 0 },
    open: { price: 11411, held: 64, bought: 44, sold: 0 },
    coyo: { price: 13500, held: 0, bought: 0, sold: 46 },
    latter: { price: null, held: null, bought: null, sold: null },
  },
  // ROUND 9: after round 8
  {
    finance: { price: 5904, held: 3, bought: 0, sold: 0 },
    build: { price: 5260, held: 0, bought: 0, sold: 0 },
    steel: { price: 10000, held: 0, bought: 1, sold: 1 },
    alt: { price: 6200, held: 0, bought: 0, sold: 0 },
    open: { price: 12894, held: 107, bought: 70, sold: 27 },
    coyo: { price: 12800, held: 0, bought: 0, sold: 0 },
    latter: { price: null, held: null, bought: null, sold: null },
  },
  // ROUND 10: after round 9
  {
    finance: { price: 5904, held: 0, bought: 0, sold: 3 },
    build: { price: 4734, held: 0, bought: 0, sold: 0 },
    steel: { price: 10000, held: 0, bought: 0, sold: 0 },
    alt: { price: 4300, held: 0, bought: 0, sold: 0 },
    open: { price: 14570, held: 108, bought: 7, sold: 6 },
    coyo: { price: 12100, held: 0, bought: 0, sold: 0 },
    latter: { price: null, held: null, bought: null, sold: null },
  },
  // ROUND 11: after round 10
  {
    finance: { price: 5313, held: 0, bought: 0, sold: 0 },
    build: { price: 4260, held: 0, bought: 0, sold: 0 },
    steel: { price: 10000, held: 0, bought: 0, sold: 0 },
    alt: { price: 6000, held: 0, bought: 12, sold: 12 },
    open: { price: 16464, held: 92, bought: 15, sold: 31 },
    coyo: { price: 11400, held: 0, bought: 0, sold: 0 },
    latter: { price: null, held: null, bought: null, sold: null },
  },
  // ROUND 12: after round 11
  {
    finance: { price: 5313, held: 0, bought: 0, sold: 0 },
    build: { price: 3834, held: 0, bought: 0, sold: 0 },
    steel: { price: 9600, held: 2, bought: 17, sold: 15 },
    alt: { price: 5500, held: 0, bought: 0, sold: 0 },
    open: { price: 18604, held: 109, bought: 19, sold: 2 },
    coyo: { price: 10700, held: 0, bought: 0, sold: 0 },
    latter: { price: null, held: null, bought: null, sold: null },
  },
  // ROUND 13: after round 12
  {
    finance: { price: 4781, held: 0, bought: 0, sold: 0 },
    build: { price: 3450, held: 0, bought: 0, sold: 0 },
    steel: { price: 9600, held: 2, bought: 1, sold: 1 },
    alt: { price: 4600, held: 0, bought: 0, sold: 0 },
    open: { price: 21022, held: 109, bought: 59, sold: 59 },
    coyo: { price: 10000, held: 0, bought: 0, sold: 0 },
    latter: { price: null, held: null, bought: null, sold: null },
  },
  // ROUND 14: after round 13
  {
    finance: { price: 4302, held: 0, bought: 0, sold: 0 },
    build: { price: 3105, held: 0, bought: 2, sold: 2 },
    steel: { price: null, held: null, bought: null, sold: null },
    alt: { price: 3200, held: 0, bought: 1, sold: 1 },
    open: { price: 23754, held: 47, bought: 26, sold: 88 },
    coyo: { price: 11400, held: 128, bought: 3150, sold: 3022 },
    latter: { price: null, held: null, bought: null, sold: null },
  },
  // ROUND 15: after round 14
  {
    finance: { price: null, held: null, bought: null, sold: null },
    build: { price: 2794, held: 0, bought: 0, sold: 0 },
    steel: { price: null, held: null, bought: null, sold: null },
    alt: { price: 5000, held: 336, bought: 336, sold: 0 },
    open: { price: 26842, held: 13, bought: 13, sold: 47 },
    coyo: { price: 12800, held: 0, bought: 14, sold: 142 },
    latter: { price: null, held: null, bought: null, sold: null },
  },
  // ROUND 16: after round 15
  {
    finance: { price: null, held: null, bought: null, sold: null },
    build: { price: 3073, held: 0, bought: 0, sold: 0 },
    steel: { price: 9400, held: 3, bought: 3, sold: 7 },
    alt: { price: 3700, held: 0, bought: 96, sold: 434 },
    open: { price: 30331, held: 113, bought: 106, sold: 6 },
    coyo: { price: 12100, held: 1, bought: 1, sold: 0 },
    latter: { price: null, held: null, bought: null, sold: null },
  },
  // ROUND 17: after round 16
  {
    finance: { price: 3134, held: 0, bought: 0, sold: 3 },
    build: { price: 2765, held: 0, bought: 361, sold: 361 },
    steel: { price: 8000, held: 10, bought: 12, sold: 5 },
    alt: { price: 2400, held: 0, bought: 0, sold: 0 },
    open: { price: 34274, held: 109, bought: 69, sold: 73 },
    coyo: { price: 11400, held: 2, bought: 16, sold: 15 },
    latter: { price: null, held: null, bought: null, sold: null },
  },
  // ROUND 18: after round 17
  {
    finance: { price: 2820, held: 0, bought: 0, sold: 0 },
    build: { price: 2488, held: 74, bought: 75, sold: 1 },
    steel: { price: 3000, held: 35, bought: 26, sold: 1 },
    alt: { price: 1300, held: 0, bought: 0, sold: 0 },
    open: { price: 33274, held: 26, bought: 0, sold: 83 },
    coyo: { price: 12800, held: 192, bought: 10298, sold: 10108 },
    latter: { price: 3000, held: 45, bought: 46, sold: 3 },
  },
  // ROUND 19: after round 18
  {
    finance: { price: 2538, held: 0, bought: 0, sold: 0 },
    build: { price: 2736, held: 66, bought: 0, sold: 8 },
    steel: { price: 4000, held: 30, bought: 76, sold: 81 },
    alt: { price: 1000, held: 2302, bought: 2538, sold: 236 },
    open: { price: 32274, held: 0, bought: 0, sold: 26 },
    coyo: { price: 14200, held: 55, bought: 1312, sold: 1449 },
    latter: { price: 2000, held: 0, bought: 2, sold: 47 },
  },
  // ROUND 20: after round 19
  {
    finance: { price: 2284, held: 0, bought: 0, sold: 0 },
    build: { price: 2462, held: 66, bought: 0, sold: 0 },
    steel: { price: 4000, held: 30, bought: 0, sold: 0 },
    alt: { price: 2400, held: 3241, bought: 939, sold: 0 },
    open: { price: 31274, held: 0, bought: 0, sold: 0 },
    coyo: { price: 15600, held: 0, bought: 20, sold: 75 },
    latter: { price: 1000, held: 0, bought: 0, sold: 0 },
  },
  // ROUND 21: after round 20
  {
    finance: { price: 2055, held: 0, bought: 0, sold: 0 },
    build: { price: 2708, held: 66, bought: 0, sold: 66 },
    steel: { price: 9200, held: 4, bought: 0, sold: 26 },
    alt: { price: 4800, held: 3201, bought: 0, sold: 40 },
    open: { price: 30274, held: 0, bought: 0, sold: 0 },
    coyo: { price: 14900, held: 0, bought: 0, sold: 0 },
    latter: { price: 100, held: 197, bought: 441, sold: 244 },
  },
  // ROUND 22: after round 21
  {
    finance: { price: 1849, held: 8, bought: 8, sold: 0 },
    build: { price: 2437, held: 9, bought: 9, sold: 0 },
    steel: { price: 8000, held: 10, bought: 9, sold: 3 },
    alt: { price: 3300, held: 0, bought: 0, sold: 3201 },
    open: { price: 34209, held: 400, bought: 400, sold: 0 },
    coyo: { price: 14200, held: 155, bought: 2353, sold: 2198 },
    latter: { price: null, held: null, bought: null, sold: null },
  },
  // ROUND 23: after round 22
  {
    finance: { price: 1664, held: 8, bought: 0, sold: 0 },
    build: { price: 2193, held: 0, bought: 0, sold: 9 },
    steel: { price: 7200, held: 14, bought: 0, sold: 0 },
    alt: { price: 2800, held: 0, bought: 0, sold: 0 },
    open: { price: 38656, held: 463, bought: 113, sold: 50 },
    coyo: { price: 13500, held: 10, bought: 10, sold: 155 },
    latter: { price: null, held: null, bought: null, sold: null },
  },
  // ROUND 24: after round 23
  {
    finance: { price: 1497, held: 8, bought: 0, sold: 0 },
    build: { price: 1973, held: 0, bought: 2105, sold: 2105 },
    steel: { price: 2800, held: 36, bought: 23, sold: 1 },
    alt: { price: 2400, held: 0, bought: 0, sold: 0 },
    open: { price: 37656, held: 25, bought: 0, sold: 438 },
    coyo: { price: 12800, held: 0, bought: 990, sold: 1000 },
    latter: { price: 100, held: 72, bought: 461800, sold: 461861 },
  },
];
