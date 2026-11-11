import { describe, expect, it } from "vitest";
import {
  ACE,
  DECK_SIZE,
  HAND_KINDS,
  cardOf,
  compareHands,
  fullDeck,
  handOf,
  isCard,
  rankOf,
  suitOf,
  type Card,
  type Hand,
  type HandKind,
} from "../../../src/shared/games/memory-poker/cards";
import { DOCUMENTED_ROUNDS, cardsOf, cellOf, type DocumentedPlayer, type DocumentedRound } from "./documented";

const SUIT_SIGNS = ["♠", "♥", "♦", "♣"];
const RANK_NAMES: Record<string, number> = { A: 14, K: 13, Q: 12, J: 11 };

/** The cards written as "A♠ 10♥ 7♣": a rank and a suit sign each. */
function cards(text: string): Card[] {
  return text.split(" ").map((word) => {
    const suit = SUIT_SIGNS.indexOf(word.slice(-1));
    const name = word.slice(0, -1);
    const rank = RANK_NAMES[name] ?? Number(name);
    if (suit < 0 || !Number.isInteger(rank) || rank < 2 || rank > ACE) throw new Error(`not a card: ${word}`);
    return cardOf(rank, suit);
  });
}

/** The hand of five cards written out. */
function hand(text: string): Hand {
  return handOf(cards(text));
}

/** One hand of each kind, the lowest kind first. */
const ONE_OF_EACH: [HandKind, string][] = [
  ["high", "A♠ Q♦ 6♠ 5♣ 3♦"],
  ["pair", "6♥ 6♠ 8♠ 5♠ 3♠"],
  ["two-pair", "5♠ 5♣ 3♠ 3♦ 6♠"],
  ["triple", "Q♥ Q♠ Q♦ J♠ 10♣"],
  ["straight", "7♠ 6♠ 5♣ 4♦ 3♦"],
  ["flush", "9♠ 8♠ 6♠ 5♠ 3♠"],
  ["full-house", "A♠ A♦ A♣ K♥ K♣"],
  ["four", "A♠ A♦ A♥ A♣ K♥"],
  ["straight-flush", "9♠ 8♠ 7♠ 6♠ 5♠"],
];

/** The hand a documented player made: their two cards and the three shared ones. */
function documentedHand(round: DocumentedRound, player: DocumentedPlayer): Hand {
  const board = cardsOf(round.board.join(""));
  return handOf([...player.picks.map((letter) => board[cellOf(letter)]), ...cardsOf(round.shared)]);
}

describe("기억 포커: the cards", () => {
  it("has fifty-two different cards, thirteen ranks in each of four suits", () => {
    const deck = fullDeck();

    expect(deck).toHaveLength(DECK_SIZE);
    expect(new Set(deck).size).toBe(DECK_SIZE);
    expect(new Set(deck.map((card) => `${rankOf(card)}/${suitOf(card)}`)).size).toBe(DECK_SIZE);
    expect([...new Set(deck.map(rankOf))].sort((a, b) => a - b)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    expect([...new Set(deck.map(suitOf))].sort()).toEqual([0, 1, 2, 3]);
  });

  it("makes a card of a rank and a suit, and reads both back", () => {
    for (const card of fullDeck()) expect(cardOf(rankOf(card), suitOf(card))).toBe(card);
    expect(rankOf(cards("A♣")[0])).toBe(ACE);
    expect(suitOf(cards("A♣")[0])).toBe(3);
  });

  it.each([-1, DECK_SIZE, 1.5, "7", null, undefined])("does not take %s for a card", (value) => {
    expect(isCard(value)).toBe(false);
  });

  it("takes every number of the deck for a card", () => {
    expect(fullDeck().every(isCard)).toBe(true);
  });
});

describe("기억 포커: weighing a hand", () => {
  it.each(ONE_OF_EACH)("knows a %s", (kind, text) => {
    expect(hand(text).kind).toBe(kind);
  });

  it("ranks the kinds in poker's order, each above the one before", () => {
    expect(ONE_OF_EACH.map(([kind]) => kind)).toEqual([...HAND_KINDS]);
    for (let i = 1; i < ONE_OF_EACH.length; i++) {
      expect(compareHands(hand(ONE_OF_EACH[i][1]), hand(ONE_OF_EACH[i - 1][1]))).toBeGreaterThan(0);
      expect(compareHands(hand(ONE_OF_EACH[i - 1][1]), hand(ONE_OF_EACH[i][1]))).toBeLessThan(0);
    }
  });

  it("names a hand by the rank of its largest set, the higher pair of two, or its top card", () => {
    expect(hand("K♥ K♣ A♠ A♦ A♣").ranks).toEqual([14, 13]);
    expect(hand("3♠ 3♦ 5♠ 5♣ 6♠").ranks).toEqual([5, 3, 6]);
    expect(hand("6♥ 6♠ 8♠ 5♦ 3♠").ranks).toEqual([6, 8, 5, 3]);
    expect(hand("3♦ A♠ Q♦ 6♠ 5♣").ranks).toEqual([14, 12, 6, 5, 3]);
    expect(hand("7♥ 7♦ 7♣ 8♠ J♠").ranks).toEqual([7, 11, 8]);
    expect(hand("A♠ A♦ A♥ A♣ K♥").ranks).toEqual([14, 13]);
  });

  it("takes the cards in any order", () => {
    expect(hand("K♣ A♠ K♥ A♦ A♣")).toEqual(hand("A♠ A♦ A♣ K♥ K♣"));
  });

  it("runs a straight up to the ace, and lets the ace stand below the two", () => {
    expect(hand("10♠ J♦ Q♣ K♥ A♠")).toEqual({ kind: "straight", ranks: [14] });
    expect(hand("A♠ 2♦ 3♣ 4♥ 5♠")).toEqual({ kind: "straight", ranks: [5] });
    expect(compareHands(hand("2♦ 3♣ 4♥ 5♠ 6♠"), hand("A♠ 2♦ 3♣ 4♥ 5♠"))).toBeGreaterThan(0);
  });

  it("does not run a straight round the corner", () => {
    expect(hand("Q♠ K♦ A♣ 2♥ 3♠").kind).toBe("high");
    expect(hand("J♠ Q♦ K♣ A♥ 2♠").kind).toBe("high");
  });

  it("knows a straight flush from a straight and from a flush, the low one too", () => {
    expect(hand("A♠ 2♠ 3♠ 4♠ 5♠")).toEqual({ kind: "straight-flush", ranks: [5] });
    expect(hand("9♠ 8♠ 7♠ 6♠ 5♥").kind).toBe("straight");
    expect(hand("9♠ 8♠ 7♠ 6♠ 4♠").kind).toBe("flush");
  });

  it("needs all five of a suit for a flush", () => {
    expect(hand("9♠ 8♠ 6♠ 5♠ 3♥").kind).toBe("high");
  });

  it("throws at anything but five cards", () => {
    expect(() => handOf(cards("A♠ K♠ Q♠ J♠"))).toThrow(RangeError);
    expect(() => handOf(cards("A♠ K♠ Q♠ J♠ 10♠ 9♠"))).toThrow(RangeError);
  });
});

describe("기억 포커: comparing two hands of one kind", () => {
  it.each([
    ["the higher pair", "9♠ 9♦ 4♣ 3♥ 2♠", "8♠ 8♦ A♣ K♥ Q♠"],
    ["the higher card beside an equal pair", "9♠ 9♦ A♣ 3♥ 2♠", "9♥ 9♣ K♣ Q♥ J♠"],
    ["the last card beside an equal pair", "9♠ 9♦ A♣ K♥ 3♠", "9♥ 9♣ A♦ K♣ 2♠"],
    ["the higher of the upper pairs", "J♠ J♦ 2♣ 2♥ 3♠", "10♠ 10♦ 9♣ 9♥ A♠"],
    ["the higher of the lower pairs", "J♠ J♦ 8♣ 8♥ 3♠", "J♥ J♣ 7♣ 7♥ A♠"],
    ["the card beside two equal pairs", "J♠ J♦ 8♣ 8♥ 4♠", "J♥ J♣ 8♠ 8♦ 3♠"],
    ["the higher three", "8♠ 8♦ 8♣ 3♥ 2♠", "7♠ 7♦ 7♣ A♥ K♠"],
    ["the higher three of a full house", "8♠ 8♦ 8♣ 2♥ 2♠", "7♠ 7♦ 7♣ A♥ A♠"],
    ["the higher pair of a full house on equal threes", "8♠ 8♦ 8♣ 3♥ 3♠", "8♥ 8♦ 8♣ 2♥ 2♠"],
    ["the higher four", "8♠ 8♦ 8♣ 8♥ 2♠", "7♠ 7♦ 7♣ 7♥ A♠"],
    ["the higher top of a straight", "8♠ 7♦ 6♣ 5♥ 4♠", "7♠ 6♦ 5♣ 4♥ 3♠"],
    ["a flush's second card on equal tops", "A♠ K♠ 6♠ 5♠ 3♠", "A♥ Q♥ J♥ 10♥ 8♥"],
    ["a flush's last card", "A♠ K♠ 6♠ 5♠ 3♠", "A♥ K♥ 6♥ 5♥ 2♥"],
    ["the top card of nothing", "A♠ 7♦ 6♣ 5♥ 3♠", "K♠ Q♦ J♣ 10♥ 8♠"],
    ["the last card of nothing", "A♠ 7♦ 6♣ 5♥ 3♠", "A♦ 7♣ 6♥ 5♠ 2♠"],
  ])("decides by %s", (_what, higher, lower) => {
    expect(compareHands(hand(higher), hand(lower))).toBeGreaterThan(0);
    expect(compareHands(hand(lower), hand(higher))).toBeLessThan(0);
  });

  it("decides the show's own example by the remaining card: a pair of fours with a king over one with a five", () => {
    // the show's rule screen: 2 4 4 7 5 loses to 2 4 4 7 K, and both hold the four of spades
    expect(compareHands(hand("2♦ 4♠ 4♥ 7♣ K♦"), hand("2♣ 4♠ 4♦ 7♥ 5♠"))).toBeGreaterThan(0);
    expect(hand("2♦ 4♠ 4♥ 7♣ K♦")).toEqual({ kind: "pair", ranks: [4, 13, 7, 2] });
  });

  it("holds two hands of the same ranks equal, whatever their suits", () => {
    expect(compareHands(hand("Q♥ Q♠ Q♦ J♠ 10♣"), hand("Q♣ Q♠ Q♦ J♥ 10♦"))).toBe(0);
    expect(compareHands(hand("A♠ K♠ 6♠ 5♠ 3♠"), hand("A♥ K♥ 6♥ 5♥ 3♥"))).toBe(0);
  });
});

describe("기억 포커: the rounds the document lists", () => {
  it.each(DOCUMENTED_ROUNDS)("round $round: each player's two cards and the three shared make the hand the document names", (round) => {
    for (const player of [round.first, round.second]) {
      const made = documentedHand(round, player);

      expect({ kind: made.kind, rank: made.ranks[0] }, player.said).toEqual({ kind: player.kind, rank: player.rank });
    }
  });

  it("has boards of sixteen cards and three shared cards", () => {
    for (const round of DOCUMENTED_ROUNDS) {
      expect(cardsOf(round.board.join(""))).toHaveLength(16);
      expect(cardsOf(round.shared)).toHaveLength(3);
    }
  });

  it("puts the two hands of each round in the order their names give: a tie, then second, first, first, second", () => {
    // by the document's own names: Q트리플 = Q트리플, 포카드 > 풀하우스, 투페어 > 하이, 트리플 > 투페어, 투페어 > 원페어
    const higher = DOCUMENTED_ROUNDS.map((round) => Math.sign(compareHands(documentedHand(round, round.first), documentedHand(round, round.second))));

    expect(higher).toEqual([0, -1, 1, 1, -1]);
  });
});
