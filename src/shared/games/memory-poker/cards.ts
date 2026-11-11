/**
 * Playing cards and poker hands, as 기억 포커 (Memory Poker) uses them.
 * Pure functions over plain numbers: nothing here reads the clock, draws a
 * random number or stores anything.
 *
 * Design: design/games/memory-poker.md. The show plays with one deck of
 * fifty-two, no jokers, and ranks hands as poker does: its own chart lists
 * the nine kinds in poker's order, the higher ranks decide between two hands
 * of one kind, then the remaining cards, and suits are not compared. The
 * document gives, round by round, which hand each player's two cards made
 * with the three shared cards; the tests check each of those rounds against
 * what is worked out here.
 */

/**
 * A card: a whole number from 0 to 51, `suit * 13 + (rank - 2)`. Suits come
 * in the order of the document's legend (♠ ♥ ♦ ♣); ranks run from 2 to 14,
 * the ace being 14.
 */
export type Card = number;

/** How many cards a deck has. */
export const DECK_SIZE = 52;
/** How many ranks a suit has. */
export const RANKS_IN_SUIT = 13;
/** The lowest rank, and the ace's. */
export const LOWEST_RANK = 2;
export const ACE = 14;
/** How many cards make a hand. */
export const HAND_SIZE = 5;

/** The suits, in the order of the document's legend. */
export const SUITS = ["spades", "hearts", "diamonds", "clubs"] as const;
export type Suit = (typeof SUITS)[number];

/** Whether `value` is a card. */
export function isCard(value: unknown): value is Card {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < DECK_SIZE;
}

/** The card of `rank` (2 … 14) in suit number `suit` (0 … 3). */
export function cardOf(rank: number, suit: number): Card {
  return suit * RANKS_IN_SUIT + (rank - LOWEST_RANK);
}

/** The rank of `card`: 2 … 14, the ace being 14. */
export function rankOf(card: Card): number {
  return (card % RANKS_IN_SUIT) + LOWEST_RANK;
}

/** The number of the suit of `card`: its place in {@link SUITS}. */
export function suitOf(card: Card): number {
  return Math.floor(card / RANKS_IN_SUIT);
}

/** Every card of the deck, in order. */
export function fullDeck(): Card[] {
  return Array.from({ length: DECK_SIZE }, (_, card) => card);
}

/**
 * The kinds of hand, the lowest first: a kind's place here is its worth.
 * The show's chart, from the top: 스트레이트 플러시, 포카드, 풀하우스, 플러시,
 * 스트레이트, 트리플, 투페어, 원페어, 하이카드.
 */
export const HAND_KINDS = ["high", "pair", "two-pair", "triple", "straight", "flush", "full-house", "four", "straight-flush"] as const;
export type HandKind = (typeof HAND_KINDS)[number];

/** A hand of five cards, weighed. */
export interface Hand {
  kind: HandKind;
  /**
   * The ranks that decide between two hands of one kind, the weightiest
   * first. The first is the rank the document names a hand by ("Q트리플",
   * "5 투페어", "A 하이"): the rank of the largest set, the higher pair of
   * two, or the top card.
   */
  ranks: number[];
}

/** The rank a straight of these five different ranks (highest first) runs up to, or 0 when they are no straight. */
function straightTop(ranks: readonly number[]): number {
  if (ranks[0] - ranks[4] === HAND_SIZE - 1) return ranks[0];
  // the ace may stand below the two: A 2 3 4 5 is a straight up to the five
  if (ranks[0] === ACE && ranks[1] === 5 && ranks[4] === LOWEST_RANK) return 5;
  return 0;
}

/**
 * Weighs five cards. Suits rank alike: two hands of the same kind and the
 * same ranks are equal, whatever their suits.
 */
export function handOf(cards: readonly Card[]): Hand {
  if (cards.length !== HAND_SIZE) throw new RangeError(`a hand is ${HAND_SIZE} cards, not ${cards.length}`);
  const ranks = cards.map(rankOf).sort((a, b) => b - a);
  const counts = new Map<number, number>();
  for (const rank of ranks) counts.set(rank, (counts.get(rank) ?? 0) + 1);
  // the sets, the largest first; of two as large, the higher rank first
  const sets = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const bySet = sets.map(([rank]) => rank);
  const shape = sets.map(([, count]) => count).join("");
  const flush = cards.every((card) => suitOf(card) === suitOf(cards[0]));
  const top = sets.length === HAND_SIZE ? straightTop(ranks) : 0;

  if (top > 0 && flush) return { kind: "straight-flush", ranks: [top] };
  if (shape === "41") return { kind: "four", ranks: bySet };
  if (shape === "32") return { kind: "full-house", ranks: bySet };
  if (flush) return { kind: "flush", ranks };
  if (top > 0) return { kind: "straight", ranks: [top] };
  if (shape === "311") return { kind: "triple", ranks: bySet };
  if (shape === "221") return { kind: "two-pair", ranks: bySet };
  if (shape === "2111") return { kind: "pair", ranks: bySet };
  return { kind: "high", ranks };
}

/** Which of two hands is the higher: above 0 when `a` is, below when `b` is, 0 when they are equal. */
export function compareHands(a: Hand, b: Hand): number {
  const kinds = HAND_KINDS.indexOf(a.kind) - HAND_KINDS.indexOf(b.kind);
  if (kinds !== 0) return kinds;
  for (let i = 0; i < Math.min(a.ranks.length, b.ranks.length); i++) {
    if (a.ranks[i] !== b.ranks[i]) return a.ranks[i] - b.ranks[i];
  }
  return 0;
}
