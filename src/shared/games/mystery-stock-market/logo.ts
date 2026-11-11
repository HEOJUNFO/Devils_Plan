/**
 * 알트엔터's path and the exchange's emblem.
 *
 * The show's rule for 알트엔터 is that its chart is the game's own logo:
 * nothing the players do moves it, and whoever sees that the logo is a chart
 * knows where the price goes. The show's logo is not used here, and neither
 * is its path, which is known only in part. (gap) A game here draws a path
 * of its own from its seed and wears it as its emblem: the rule is the
 * show's sentence, and the emblem differs from game to game, so that it has
 * to be read each time.
 *
 * The path is the room's to keep: what is sent is the emblem, the path's
 * shape on a scale of a few heights, with no price in it.
 *
 * Design: design/games/mystery-stock-market.md.
 */
import { randomInt, randomSource, seedFrom } from "../../game/rng";

/** The numbers a path is drawn with. Part of `config.json`; all of them (gap). */
export interface LogoConfig {
  /** The fewest and the most times the path turns from rising to falling or back. */
  turnsFrom: number;
  turnsTo: number;
  /** The fewest rounds it goes one way before it turns. */
  legRounds: number;
  /** The least and the most a price on the path is, in won. */
  low: number;
  high: number;
  /** Each time it goes one way the price is multiplied, or divided, by a number between these two. */
  swingFrom: number;
  swingTo: number;
  /** Prices on the path are whole multiples of this many won. */
  step: number;
  /** How many heights the emblem tells apart. */
  levels: number;
}

/**
 * The path of a game, drawn with `random` (each call a number from 0 up to
 * 1): the price 알트엔터 opens at and its price after each of `rounds`
 * rounds. It goes up and down in turn, a few rounds each way, by steps that
 * are not all alike; the first round of each way always moves.
 */
export function pathWith(random: () => number, rounds: number, startPrice: number, config: LogoConfig): number[] {
  const stepped = (price: number): number => Math.min(config.high, Math.max(config.low, Math.round(price / config.step) * config.step));
  // as many turns as there is room for, each way lasting its fewest rounds at the least
  const room = Math.max(0, Math.floor(rounds / config.legRounds) - 1);
  const turns = Math.min(room, config.turnsFrom + randomInt(random, config.turnsTo - config.turnsFrom + 1));
  const lengths = Array.from({ length: turns + 1 }, () => config.legRounds);
  for (let spare = rounds - lengths.length * config.legRounds; spare > 0; spare--) lengths[randomInt(random, lengths.length)] += 1;

  const path = [startPrice];
  let up = random() < 0.5;
  for (const length of lengths) {
    const from = path[path.length - 1];
    const swing = config.swingFrom + random() * (config.swingTo - config.swingFrom);
    const to = stepped(up ? from * swing : from / swing);
    // how far along its way the price is after each round: by uneven steps
    const weights = Array.from({ length }, () => 0.4 + random());
    const whole = weights.reduce((sum, weight) => sum + weight, 0);
    let gone = 0;
    let last = from;
    for (let n = 0; n < length; n++) {
      gone += weights[n];
      let price = n === length - 1 ? to : stepped(from * (to / from) ** (gone / whole));
      // never back the way it came, and never past where it is going
      price = up ? Math.min(to, Math.max(price, last)) : Math.max(to, Math.min(price, last));
      // the first round of a way moves, so that where the path turns is plain
      if (n === 0 && price === from && to !== from) price = from + (up ? config.step : -config.step);
      path.push(price);
      last = price;
    }
    up = !up;
  }
  return path;
}

/** The path of a game, drawn from `seed` alone. */
export function pathOf(seed: number, rounds: number, startPrice: number, config: LogoConfig): number[] {
  return pathWith(randomSource(seedFrom(seed)).next, rounds, startPrice, config);
}

/**
 * The emblem of a path: for each of its prices a height from 0 to
 * `levels - 1`, on the path's own scale from its lowest price to its
 * highest. Paths of the same shape have the same emblem whatever their
 * prices are.
 */
export function emblemOf(path: readonly number[], levels: number): number[] {
  const low = Math.min(...path);
  const high = Math.max(...path);
  if (high === low) return path.map(() => 0);
  return path.map((price) => Math.round(((price - low) * (levels - 1)) / (high - low)));
}
