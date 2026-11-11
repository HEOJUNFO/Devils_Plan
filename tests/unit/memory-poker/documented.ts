/**
 * The rounds of 기억 포커 as the document lists them (the season's day-1 document, section 3.2.6
 * "미니게임4", as it stood on 2026-11-11 15:00 KST). Written by a script from the document's own
 * tables, so that no card is copied by hand: the board of sixteen cards row by row (cells A to P),
 * the three shared cards, the two cells each of the two players chose, and the hand the document
 * says each made. Cards are the Unicode playing card signs the document uses. Who played is left
 * out: the players are "first" and "second", in the document's order.
 *
 * The first round is kept as the document has it, with the queen of spades both at cell M and among
 * the shared cards, which one deck cannot give: the document's result (three queens) counts both.
 */
import { cardOf, type Card, type HandKind } from "../../../src/shared/games/memory-poker/cards";

/** The first playing card sign of each suit's row in Unicode, less one: U+1F0A0, and sixteen further for each suit. */
const FIRST_SIGN = 0x1f0a0;
/** The rank a sign's last four bits stand for: 1 is the ace, 11 the jack, 13 the queen, 14 the king (12 is the knight, which no deck here has). */
const RANK_OF_SIGN: Record<number, number> = { 1: 14, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, 11: 11, 13: 12, 14: 13 };

/** The cards a string of playing card signs stands for. */
export function cardsOf(signs: string): Card[] {
  return [...signs].map((sign) => {
    const offset = (sign.codePointAt(0) ?? 0) - FIRST_SIGN;
    const rank = RANK_OF_SIGN[offset % 16];
    if (offset < 0 || offset >= 64 || rank === undefined) throw new Error(`not a playing card sign: ${sign}`);
    return cardOf(rank, Math.floor(offset / 16));
  });
}

/** The number of the cell a letter of the document's board stands for: A is 0, P is 15. */
export function cellOf(letter: string): number {
  return letter.charCodeAt(0) - "A".charCodeAt(0);
}

/** What the document says of one player in one round. */
export interface DocumentedPlayer {
  /** The two cells chosen, as the document's letters. */
  picks: [string, string];
  /** The hand the document names: its kind, and the rank it is named by. */
  kind: HandKind;
  rank: number;
  /** The document's own words for it. */
  said: string;
}

/** One round of the document. */
export interface DocumentedRound {
  round: number;
  /** The board's four rows, top first. */
  board: [string, string, string, string];
  shared: string;
  first: DocumentedPlayer;
  second: DocumentedPlayer;
}

export const DOCUMENTED_ROUNDS: DocumentedRound[] = [
  {
    round: 1,
    board: ["🂪🂺🃊🃗", "🃛🂽🃂🃑", "🂤🂵🃆🃒", "🂭🂹🃁🃓"],
    shared: "🃚🂫🂭",
    first: { picks: ["F", "M"], kind: "triple", rank: 12, said: "Q트리플" },
    second: { picks: ["F", "M"], kind: "triple", rank: 12, said: "Q트리플" },
  },
  {
    round: 2,
    board: ["🂱🃓🃋🃞", "🃛🃍🃑🂴", "🃉🂧🂳🂨", "🂥🂲🃒🃊"],
    shared: "🂡🃁🂾",
    first: { picks: ["D", "G"], kind: "full-house", rank: 14, said: "A 풀하우스" },
    second: { picks: ["A", "G"], kind: "four", rank: 14, said: "A 포카드" },
  },
  {
    round: 3,
    board: ["🃒🃉🂥🂻", "🂣🂱🃞🃄", "🂶🂧🃍🃚", "🂢🃋🂵🃘"],
    shared: "🃕🃃🂦",
    first: { picks: ["C", "E"], kind: "two-pair", rank: 5, said: "5 투페어" },
    second: { picks: ["F", "K"], kind: "high", rank: 14, said: "A 하이" },
  },
  {
    round: 4,
    board: ["🂧🃝🃂🂸", "🂺🂡🃔🃋", "🃇🂮🂳🃗", "🃘🂵🂪🃍"],
    shared: "🂷🂨🂫",
    first: { picks: ["I", "L"], kind: "triple", rank: 7, said: "7트리플" },
    second: { picks: ["H", "I"], kind: "two-pair", rank: 11, said: "J 투페어" },
  },
  {
    round: 5,
    board: ["🂩🂶🃘🃅", "🃇🂢🂺🃑", "🃝🃎🂣🂷", "🂴🃙🂧🃂"],
    shared: "🂦🂥🂨",
    first: { picks: ["B", "K"], kind: "pair", rank: 6, said: "6 원페어" },
    second: { picks: ["C", "D"], kind: "two-pair", rank: 8, said: "8 투페어" },
  },
];
