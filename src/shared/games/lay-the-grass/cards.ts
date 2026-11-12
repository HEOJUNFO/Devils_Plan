/**
 * The cards of 잔디 깔기's either-or choices: what each of a card's two
 * options does ({@link Effect}), the document's own four cards, and cards
 * drawn afresh for a game.
 *
 * Design: design/games/lay-the-grass.md. The document has one card for each
 * of the choices 5 to 8, the same in every game, and "정보" at choice 5 buys
 * a look at the three to come. Whoever has played once knows them, and 정보
 * buys nothing. (gap) So a game draws its own cards for choices 6 to 8
 * unless its room asks for the show's: for each of the three, two of the
 * kinds of option that choice may have, each with numbers of its own. Half
 * of those kinds are the document's (공격, 방어, 상생, 견제, 가로수, 맨홀);
 * the other half (보험, 선점, 화합, 이웃, 바위, 꽃밭) are this project's and
 * no part of the show. The user asked for this on 2026-11-12, with the
 * show's cards kept for a room to choose.
 *
 * Nothing here reads the clock or `Math.random`.
 */
import { randomInt, randomSource, seedFrom } from "../../game/rng";

/**
 * One of the either-or choices of the main match that go with this
 * mini-game, by the number the document gives it. Every player makes each of
 * them, all at once, and nobody is shown another's choice until all are in.
 *
 * - 5, before the tiles are picked: 점수 (points at once) or 정보 (a look at the cards of choices 6 to 8).
 * - 6, once the tiles are picked: what becomes of the player's own tile (the document: 공격 or 방어).
 * - 7: how the player stands to the others (the document: 상생 or 견제).
 * - 8: what the player puts on the park (the document: 가로수 or 맨홀).
 */
export type ChoiceNo = 5 | 6 | 7 | 8;

/** The two options of a choice, as the document numbers them. */
export type Option = 1 | 2;

/** Every choice the document has for this mini-game, in the order they are made. */
export const CHOICES: readonly ChoiceNo[] = [5, 6, 7, 8];

/**
 * What an option of a card does. The numbers are those of one game: where
 * the document counts players ("9명 이하", of its sixteen), a game with
 * fewer has the same share of its own ({@link atMostFor}, {@link atLeastFor}).
 */
export type Effect =
  /** 점수: points at once. */
  | { kind: "score"; points: number }
  /** 정보: a look at the cards of the choices to come. */
  | { kind: "info" }
  /** 공격: a tile laid earns its number `times` over; one not laid costs `loss` points. */
  | { kind: "attack"; times: number; loss: number }
  /** 방어: up to `cells` cells may be cut off the tile as it is laid. */
  | { kind: "defend"; cells: number }
  /** 보험 (this project's): a tile not laid still earns `points`. */
  | { kind: "insure"; points: number }
  /** 선점 (this project's): the tile is laid before those of everyone who did not take this. */
  | { kind: "first" }
  /** 상생: two play as a pair and share `perSide` points for every side their two tiles share. */
  | { kind: "pair"; perSide: number }
  /** 견제: `bonus` points when `atMost` players or fewer lay their tile. */
  | { kind: "check"; atMost: number; bonus: number }
  /** 화합 (this project's): `bonus` points when `atLeast` players or more lay their tile. */
  | { kind: "harmony"; atLeast: number; bonus: number }
  /** 이웃 (this project's): `points` for every other tile that shares a side with the player's own. */
  | { kind: "neighbour"; points: number }
  /** 가로수: `count` trees are put on the park; only a holed cell of a tile may lie over one. */
  | { kind: "tree"; count: number }
  /** 맨홀: a manhole for each of `values` is put on the park; a tile laid over one earns, or loses, that many points. */
  | { kind: "manhole"; values: number[] }
  /** 바위 (this project's): `count` rocks are put on the park; no cell of a tile may lie over one. */
  | { kind: "rock"; count: number }
  /** 꽃밭 (this project's): a flower bed for each of `values` is put on the park; a tile laid over one earns that many points. */
  | { kind: "flower"; values: number[] };

/** The name an effect goes by in the values and on the wire. */
export type EffectKind = Effect["kind"];

/** Every kind of effect there is. */
export const KINDS: readonly EffectKind[] = [
  "score",
  "info",
  "attack",
  "defend",
  "insure",
  "first",
  "pair",
  "check",
  "harmony",
  "neighbour",
  "tree",
  "manhole",
  "rock",
  "flower",
];

/** The effect of kind `K`. */
export type EffectOf<K extends EffectKind> = Extract<Effect, { kind: K }>;

/** The card of one choice: its two options, in the order they are numbered. */
export interface Card {
  which: ChoiceNo;
  options: [Effect, Effect];
}

/** An option as the values write it: a kind and that kind's numbers. Read with {@link effectFrom}. */
export interface EffectSpec {
  kind: string;
  points?: number;
  times?: number;
  loss?: number;
  cells?: number;
  perSide?: number;
  /** Players, of `outOf`. */
  atMost?: number;
  atLeast?: number;
  bonus?: number;
  count?: number;
  values?: number[];
}

/** What a game's cards are made from. The `cards` part of `config.json`. */
export interface CardsConfig {
  /** How many players the document's game has: where a card counts players, it counts them of this many (the document: 16). */
  outOf: number;
  /** The document's card for each choice, by the choice's number: its two options in the document's order. */
  show: Record<string, EffectSpec[]>;
  /** (gap) The kinds of option a card drawn for choice 6, 7 or 8 may have, by the choice's number: two of them are on a card. */
  slots: Record<string, string[]>;
  /** (gap) What a drawn option of each kind may be, by the kind: one of these is taken. */
  draw: Record<string, EffectSpec[]>;
  /**
   * Which of a card's two options the room takes for a player who does not
   * choose in time, or is not there: the one whose kind stands earlier here.
   * Those with nothing to lose come first. Not in the document.
   */
  forAbsent: string[];
}

/** The most cells 방어 may cut off a tile: every cut is tried when the room looks for room for a tile, and it tries no more than pairs. */
export const MOST_CUT = 2;
/** The most things an option may put on the park: each has a time of its own. */
export const MOST_MARKS = 4;

/** Which cards a game is played with: drawn afresh for it, or the show's own. The first is what a room starts with. */
export const DECKS = ["fresh", "show"] as const;
export type Deck = (typeof DECKS)[number];

/** Whether `value` names a deck. */
export function isDeck(value: unknown): value is Deck {
  return typeof value === "string" && (DECKS as readonly string[]).includes(value);
}

const isWhole = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);
const isCount = (value: unknown, least = 0, most = Infinity): value is number => isWhole(value) && value >= least && value <= most;

/** With how many players or fewer laying their tile a card pays, in a game of `players`, where the document says `atMost` of `outOf`: the same share, rounded down, and never none. */
export function atMostFor(players: number, atMost: number, outOf: number): number {
  return Math.max(1, Math.floor((players * atMost) / outOf));
}

/** With how many players or more laying their tile a card pays, in a game of `players`, for `atLeast` of `outOf`: the same share, rounded up, and never more than everyone. */
export function atLeastFor(players: number, atLeast: number, outOf: number): number {
  return Math.min(players, Math.max(1, Math.ceil((players * atLeast) / outOf)));
}

/**
 * The effect `spec` writes, for a game of `players`: its numbers as they
 * are, and its counts of players as that game's share of `outOf`. `null`
 * for anything that is not an effect.
 */
export function effectFrom(spec: EffectSpec | undefined, players: number, outOf: number): Effect | null {
  if (typeof spec !== "object" || spec === null) return null;
  const values = (positive: boolean): number[] | null =>
    Array.isArray(spec.values) && spec.values.length >= 1 && spec.values.length <= MOST_MARKS && spec.values.every((value) => isWhole(value) && value !== 0 && (!positive || value > 0))
      ? [...spec.values]
      : null;
  switch (spec.kind) {
    case "score":
      return isCount(spec.points) ? { kind: "score", points: spec.points } : null;
    case "info":
      return { kind: "info" };
    case "attack":
      return isCount(spec.times, 1) && isCount(spec.loss) ? { kind: "attack", times: spec.times, loss: spec.loss } : null;
    case "defend":
      return isCount(spec.cells, 1, MOST_CUT) ? { kind: "defend", cells: spec.cells } : null;
    case "insure":
      return isCount(spec.points) ? { kind: "insure", points: spec.points } : null;
    case "first":
      return { kind: "first" };
    case "pair":
      return isCount(spec.perSide) ? { kind: "pair", perSide: spec.perSide } : null;
    case "check":
      return isCount(spec.atMost, 0, outOf) && isCount(spec.bonus) ? { kind: "check", atMost: atMostFor(players, spec.atMost, outOf), bonus: spec.bonus } : null;
    case "harmony":
      return isCount(spec.atLeast, 1, outOf) && isCount(spec.bonus) ? { kind: "harmony", atLeast: atLeastFor(players, spec.atLeast, outOf), bonus: spec.bonus } : null;
    case "neighbour":
      return isCount(spec.points) ? { kind: "neighbour", points: spec.points } : null;
    case "tree":
      return isCount(spec.count, 1, MOST_MARKS) ? { kind: "tree", count: spec.count } : null;
    case "rock":
      return isCount(spec.count, 1, MOST_MARKS) ? { kind: "rock", count: spec.count } : null;
    case "manhole": {
      const all = values(false);
      return all === null ? null : { kind: "manhole", values: all };
    }
    case "flower": {
      const all = values(true);
      return all === null ? null : { kind: "flower", values: all };
    }
    default:
      return null;
  }
}

/** The choices of `choices` that a card is drawn for: every one but the first the document has, whose card is always the document's. */
function drawn(choices: readonly number[]): ChoiceNo[] {
  return CHOICES.filter((which) => which !== CHOICES[0] && choices.includes(which));
}

/**
 * Whether a game with `choices` can have its cards from `cards`: the
 * document's card for each choice, two options to it; and for each choice a
 * card is drawn for, two kinds or more to draw from, each with something to
 * be, no kind in two choices (a player then never holds one kind twice), and
 * every kind given a place among those the room takes for someone absent.
 */
export function isValidCards(cards: CardsConfig | undefined, choices: readonly number[]): boolean {
  if (typeof cards !== "object" || cards === null || !isCount(cards.outOf, 1)) return false;
  const reads = (spec: EffectSpec | undefined, kind?: string): boolean => effectFrom(spec, cards.outOf, cards.outOf) !== null && (kind === undefined || spec?.kind === kind);
  if (!Array.isArray(cards.forAbsent) || !KINDS.every((kind) => cards.forAbsent.includes(kind))) return false;
  for (const which of CHOICES) {
    if (!choices.includes(which)) continue;
    const card = cards.show?.[`${which}`];
    if (!Array.isArray(card) || card.length !== 2 || !card.every((spec) => reads(spec))) return false;
  }
  const seen = new Set<string>();
  for (const which of drawn(choices)) {
    const kinds = cards.slots?.[`${which}`];
    if (!Array.isArray(kinds) || kinds.length < 2) return false;
    for (const kind of kinds) {
      if (seen.has(kind)) return false;
      seen.add(kind);
      const all = cards.draw?.[kind];
      if (!Array.isArray(all) || all.length === 0 || !all.every((spec) => reads(spec, kind))) return false;
    }
  }
  return true;
}

/** The document's card for choice `which`, in a game of `players`; `null` where the values have none that reads. */
function showCard(which: ChoiceNo, players: number, cards: CardsConfig): Card | null {
  const specs = cards.show[`${which}`] ?? [];
  const one = effectFrom(specs[0], players, cards.outOf);
  const other = effectFrom(specs[1], players, cards.outOf);
  return one === null || other === null ? null : { which, options: [one, other] };
}

/** The document's cards for `choices`, in a game of `players`, in the order the choices are made. */
export function showCards(choices: readonly number[], players: number, cards: CardsConfig): Card[] {
  return CHOICES.filter((which) => choices.includes(which))
    .map((which) => showCard(which, players, cards))
    .filter((card): card is Card => card !== null);
}

/**
 * Cards for `choices` drawn with `random` (each call a number from 0 up to
 * 1), in a game of `players`. The first choice's card is the document's:
 * it is the one that sells the look at the others. Each of the rest has two
 * different kinds of those its choice may have, either of them first, and
 * each kind is one of what the values let it be.
 */
export function drawCards(random: () => number, choices: readonly number[], players: number, cards: CardsConfig): Card[] {
  const pick = <T>(from: readonly T[]): T => from[randomInt(random, from.length)];
  const deck: Card[] = [];
  for (const which of CHOICES) {
    if (!choices.includes(which)) continue;
    const kinds = [...(cards.slots[`${which}`] ?? [])];
    if (which === CHOICES[0] || kinds.length < 2) {
      const card = showCard(which, players, cards);
      if (card !== null) deck.push(card);
      continue;
    }
    const first = kinds.splice(randomInt(random, kinds.length), 1)[0];
    const second = pick(kinds);
    const one = effectFrom(pick(cards.draw[first] ?? []), players, cards.outOf);
    const other = effectFrom(pick(cards.draw[second] ?? []), players, cards.outOf);
    if (one !== null && other !== null) deck.push({ which, options: [one, other] });
  }
  return deck;
}

/** The cards of a game played with `deck`: the show's, or cards drawn with `random`. */
export function cardsFor(deck: Deck, random: () => number, choices: readonly number[], players: number, cards: CardsConfig): Card[] {
  return deck === "show" ? showCards(choices, players, cards) : drawCards(random, choices, players, cards);
}

/** What sets the sequence a seed gives for the cards apart from the one the park is drawn from. */
const CARDS_SEQUENCE = 0x51c0ffee;

/**
 * The numbers `seed` gives to draw cards with, where a game has none that
 * nobody could have guessed (`chanceOf` in `game/rng.ts`): a sequence of
 * their own, not the one the park is drawn from.
 */
export function cardNumbers(seed: number): () => number {
  return randomSource(seedFrom(seedFrom(seed) ^ CARDS_SEQUENCE)).next;
}

/** Which option of `card` the room takes for a player who does not choose: the one whose kind stands earlier in `forAbsent`, the first when neither does. */
export function forAbsent(card: Card, cards: CardsConfig): Option {
  const place = (effect: Effect): number => {
    const at = cards.forAbsent.indexOf(effect.kind);
    return at < 0 ? cards.forAbsent.length : at;
  };
  return place(card.options[1]) < place(card.options[0]) ? 2 : 1;
}

/** A copy of `card` that shares nothing with it. */
export function copyCard(card: Card): Card {
  const copy = (effect: Effect): Effect => (effect.kind === "manhole" || effect.kind === "flower" ? { ...effect, values: [...effect.values] } : { ...effect });
  return { which: card.which, options: [copy(card.options[0]), copy(card.options[1])] };
}

/**
 * The effect of `kind` that `player` holds: an option of that kind on one of
 * `cards`, which they chose (`choices`). `null` when they hold none. Asked
 * of a game it counts a choice still being made; asked of what a player is
 * sent, only the choices everyone has been shown.
 */
export function effectIn<K extends EffectKind>(
  cards: readonly Card[],
  choices: readonly { player: number; which: ChoiceNo; option: Option }[],
  player: number | null,
  kind: K,
): EffectOf<K> | null {
  for (const chosen of choices) {
    if (chosen.player !== player) continue;
    const effect = cards.find((card) => card.which === chosen.which)?.options[chosen.option - 1];
    if (effect?.kind === kind) return effect as EffectOf<K>;
  }
  return null;
}

/**
 * What a player's tile itself brings them in a park: its `number` when it
 * was `laid`, as many times over as their 공격 says; when it had nowhere to
 * go, what their 공격 takes, else what their 보험 gives, else nothing. The
 * manholes under a tile and the bonuses of other cards are counted apart.
 */
export function tileWorth(number: number, laid: boolean, attack: EffectOf<"attack"> | null, insure: EffectOf<"insure"> | null): number {
  if (laid) return number * (attack?.times ?? 1);
  return attack !== null ? -attack.loss : (insure?.points ?? 0);
}
