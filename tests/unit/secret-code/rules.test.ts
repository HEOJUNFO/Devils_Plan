import { describe, expect, it } from "vitest";
import { randomSource } from "../../../src/shared/game/rng";
import configJson from "../../../src/shared/games/secret-code/config.json";
import {
  abandon,
  answersTo,
  applyAction,
  applyTimeout,
  awaited,
  closeIfLeft,
  codesOf,
  createGame,
  dealCards,
  deadline,
  holds,
  isValidConfig,
  letterOf,
  makeRound,
  numberOf,
  parseAction,
  placesOf,
  ranksOf,
  shiftClock,
  viewFor,
  type Card,
  type CodeConfig,
  type CodeState,
  type Condition,
} from "../../../src/shared/games/secret-code/rules";
import { CARDS, CODE_LENGTH, ROUNDS, SHOW_KINDS, SHOW_PLAYERS, SHOW_ROUNDS } from "./documented";

const config: CodeConfig = configJson;
const T0 = 1_000_000;
const ROUND_MS = config.roundSeconds * 1000;
const SHOW_MS = config.showSeconds * 1000;

const codeOf = (letters: string): number[] => [...letters].map((letter) => letter.charCodeAt(0) - 65);

function game(players: number[] = [0, 1], seed = 7): CodeState {
  const created = createGame({ players, now: T0, seed }, config);
  if (!created.ok) throw new Error(created.reason);
  return created.state;
}

/** `state` after `player` answered `code`, which the game must take. */
function answered(state: CodeState, player: number, code: number[], now = T0 + 1000): CodeState {
  const result = applyAction(state, player, { type: "answer", code }, now, config);
  if (!result.ok) throw new Error(result.reason);
  return result.state;
}

/** A code that is not the round's. */
const wrongFor = (state: CodeState): number[] => (state.code.join() === "0,1,2,3" ? [0, 1, 2, 4] : [0, 1, 2, 3]);

/** `state` with the clock run to its next deadline. */
const due = (state: CodeState): CodeState => applyTimeout(state, deadline(state) as number, config);

describe("the cards of 비밀 코드", () => {
  it("are the show's 26, a letter from A to Z and a number each, and a code is four of them", () => {
    expect(config.letters).toBe(CARDS);
    expect(config.codeLength).toBe(CODE_LENGTH);
    expect(config.rounds).toBe(ROUNDS);
    expect([letterOf(0), numberOf(0), letterOf(25), numberOf(25)]).toEqual(["A", 1, "Z", 26]);
    expect(isValidConfig(config)).toBe(true);
  });

  it("are dealt colours and suits by chance, as many of each as the config says, no two as often as each other", () => {
    const cards = dealCards(config, randomSource(11).next);
    expect(cards).toHaveLength(26);
    const count = (of: "color" | "suit", kind: number): number => cards.filter((card) => card[of] === kind).length;
    expect([0, 1, 2, 3].map((kind) => count("color", kind))).toEqual([9, 7, 6, 4]);
    expect([0, 1, 2, 3].map((kind) => count("suit", kind))).toEqual([9, 7, 6, 4]);
    expect(ranksOf(cards, "color")).toEqual([1, 2, 3, 4]);
    expect(dealCards(config, randomSource(11).next)).toEqual(cards);
    expect(dealCards(config, randomSource(12).next)).not.toEqual(cards);
  });

  it("cannot be dealt with two colours as often as each other, or not all of them", () => {
    expect(isValidConfig({ ...config, colors: [8, 8, 6, 4] })).toBe(false);
    expect(isValidConfig({ ...config, suits: [9, 7, 6, 3] })).toBe(false);
    expect(isValidConfig({ ...config, codeLength: 3 })).toBe(false);
  });

  it("make 14,950 codes of four, each in the order of the alphabet", () => {
    const all = codesOf(26);
    expect(all).toHaveLength(14950);
    expect(all[0]).toEqual([0, 1, 2, 3]);
    expect(all.every((code) => code[0] < code[1] && code[1] < code[2] && code[2] < code[3])).toBe(true);
  });
});

describe("a condition", () => {
  // colours and suits by hand: A to I the first colour, J to P the second, Q to V the third, W to Z the fourth; suits go round
  const cards: Card[] = Array.from({ length: 26 }, (_, card) => ({ color: card < 9 ? 0 : card < 16 ? 1 : card < 22 ? 2 : 3, suit: card % 4 }));

  it("about numbers is met by the show's answer of each round, with a letter's number its place in the alphabet", () => {
    for (const round of SHOW_ROUNDS) {
      for (const condition of round.numbers) expect(holds(condition, codeOf(round.answer), cards)).toBe(true);
    }
    // and not by a code next to it
    expect(holds(SHOW_ROUNDS[0].numbers[0], codeOf("AOQW"), cards)).toBe(false);
    expect(holds(SHOW_ROUNDS[0].numbers[1], codeOf("AOQW"), cards)).toBe(false);
    expect(holds(SHOW_ROUNDS[1].numbers[1], codeOf("CNPW"), cards)).toBe(false);
    expect(holds(SHOW_ROUNDS[1].numbers[2], codeOf("ABCD"), cards)).toBe(false);
    expect(holds(SHOW_ROUNDS[2].numbers[0], codeOf("CLMZ"), cards)).toBe(false);
  });

  it("counts the different colours and suits of the four cards", () => {
    const [colors, suits] = [SHOW_KINDS[0], SHOW_KINDS[1]];
    // A and B are of the first colour, J and K of the second
    expect(holds(colors, codeOf("ABJK"), cards)).toBe(true);
    expect(holds(colors, codeOf("ABJW"), cards)).toBe(false);
    // A, E and I have one suit, B another, C a third
    expect(holds(suits, codeOf("ABCE"), cards)).toBe(true);
    expect(holds(suits, codeOf("ABCD"), cards)).toBe(false);
  });

  it("holds the suit or colour of the card with the nth lowest number against how often it is among all 26", () => {
    // suits of these cards: 7, 7, 6, 6 of them, so two share a rank; colours 9, 7, 6, 4
    expect(ranksOf(cards, "color")).toEqual([1, 2, 3, 4]);
    const least = SHOW_KINDS[3];
    // the third card of a code has the colour the fewest cards have only if it is W to Z
    expect(holds(least, codeOf("ABWZ"), cards)).toBe(true);
    expect(holds(least, codeOf("ABCZ"), cards)).toBe(false);
    const most: Condition = { kind: "common", of: "color", nth: 4, rank: 1 };
    expect(holds(most, codeOf("ABCD"), cards)).toBe(true);
    expect(holds(most, codeOf("ABCS"), cards)).toBe(false);
  });
});

describe("a round's conditions", () => {
  it("are met by one code and no other, whatever the seed", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const source = randomSource(seed * 7919);
      const cards = dealCards(config, source.next);
      const made = makeRound(cards, config, source.next);
      expect(answersTo(made.conditions, cards)).toEqual([made.code]);
    }
  });

  it("begin, as the show's, with the sum and the numbers of colours and suits, and are four to six", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const source = randomSource(seed * 104729);
      const cards = dealCards(config, source.next);
      const { conditions } = makeRound(cards, config, source.next);
      expect(conditions.slice(0, 3).map((condition) => condition.kind)).toEqual(["sum", "colors", "suits"]);
      expect(conditions.length).toBeGreaterThanOrEqual(config.minConditions);
      expect(conditions.length).toBeLessThanOrEqual(config.maxConditions);
    }
  });

  it("are of the kinds the show's were", () => {
    const kinds = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const source = randomSource(seed * 31);
      const cards = dealCards(config, source.next);
      for (const condition of makeRound(cards, config, source.next).conditions) kinds.add(condition.kind);
    }
    expect([...kinds].sort()).toEqual(["colors", "common", "difference", "ends", "product", "suits", "sum"]);
  });
});

describe("starting 비밀 코드", () => {
  it("takes two players or more, up to six", () => {
    expect(createGame({ players: [0], now: T0, seed: 1 }, config)).toEqual({ ok: false, reason: "too-few" });
    expect(createGame({ players: [0, 1, 2, 3, 4, 5, 6], now: T0, seed: 1 }, config)).toEqual({ ok: false, reason: "too-many" });
    expect(createGame({ players: [0, 0], now: T0, seed: 1 }, config)).toEqual({ ok: false, reason: "bad-players" });
  });

  it("has the show's three rounds for up to four players, and one fewer than the players for more", () => {
    expect(game([0, 1]).rounds).toBe(3);
    expect(game(Array.from({ length: SHOW_PLAYERS }, (_, n) => n)).rounds).toBe(ROUNDS);
    expect(game([0, 1, 2, 3, 4, 5]).rounds).toBe(5);
  });

  it("begins with the first round: cards, conditions one code meets, and the round's time running", () => {
    const state = game();
    expect([state.phase, state.round]).toEqual(["round", 1]);
    expect(state.history).toEqual([{ type: "round", round: 1 }]);
    expect(answersTo(state.conditions, state.cards)).toEqual([state.code]);
    expect(deadline(state)).toBe(T0 + ROUND_MS);
    expect(awaited(state)).toEqual([0, 1]);
    expect(game([0, 1], 7)).toEqual(state);
    expect(game([0, 1], 8).cards).not.toEqual(state.cards);
  });
});

describe("the buzzer of 비밀 코드", () => {
  it("makes the player who gives the code safe at once, shows the code, and ends the round", () => {
    const state = game([0, 1, 2]);
    const next = answered(state, 1, state.code, T0 + 30_000);
    expect(next.passed).toEqual([1]);
    expect(next.seats[1].safe).toBe(1);
    expect(next.phase).toBe("show");
    expect(next.history.at(-1)).toEqual({ type: "passed", player: 1, place: 1, round: 1, code: state.code });
    expect(deadline(next)).toBe(T0 + 30_000 + SHOW_MS);
    expect(viewFor(next, 0).code).toEqual(state.code);
  });

  it("takes the four cards in whatever order they were picked", () => {
    const state = game([0, 1, 2]);
    expect(answered(state, 0, [...state.code].reverse()).passed).toEqual([0]);
  });

  it("locks a player who answers wrong out of the round, and tells everyone the answer that was wrong", () => {
    const state = game([0, 1, 2]);
    const wrong = wrongFor(state);
    const next = answered(state, 0, wrong);
    expect(next.phase).toBe("round");
    expect(next.seats[0]).toMatchObject({ wrong: true, misses: 1, safe: null });
    expect(next.history.at(-1)).toEqual({ type: "wrong", player: 0, code: wrong });
    expect(awaited(next)).toEqual([1, 2]);
    expect(applyAction(next, 0, { type: "answer", code: state.code }, T0 + 2000, config)).toEqual({ ok: false, reason: "locked" });
  });

  it("refuses what is no code of four different cards, and nothing while a code is shown", () => {
    const state = game([0, 1, 2]);
    expect(applyAction(state, 0, { type: "answer", code: [0, 1, 2] }, T0, config)).toEqual({ ok: false, reason: "bad-code" });
    expect(applyAction(state, 0, { type: "answer", code: [0, 1, 2, 2] }, T0, config)).toEqual({ ok: false, reason: "bad-code" });
    expect(applyAction(state, 0, { type: "answer", code: [0, 1, 2, 26] }, T0, config)).toEqual({ ok: false, reason: "bad-code" });
    expect(applyAction(state, 5, { type: "answer", code: state.code }, T0, config)).toEqual({ ok: false, reason: "not-playing" });
    const shown = answered(state, 1, state.code);
    expect(applyAction(shown, 0, { type: "answer", code: state.code }, T0 + 2000, config)).toEqual({ ok: false, reason: "not-now" });
    expect(applyAction(shown, 1, { type: "answer", code: state.code }, T0 + 2000, config)).toEqual({ ok: false, reason: "already-passed" });
  });

  it("reads what a player sent, and nothing else", () => {
    expect(parseAction({ type: "answer", code: [3, 1, 2, 0] })).toEqual({ type: "answer", code: [3, 1, 2, 0] });
    expect(parseAction({ type: "answer", code: [0, 1, 2, "3"] })).toBeNull();
    expect(parseAction({ type: "answer", code: "ABCD" })).toBeNull();
    expect(parseAction({ type: "answer", code: Array.from({ length: 9 }, (_, n) => n) })).toBeNull();
    expect(parseAction({ type: "buzz" })).toBeNull();
    expect(parseAction(null)).toBeNull();
  });
});

describe("a round of 비밀 코드", () => {
  it("is over with nobody safe when everyone still in it has answered wrong", () => {
    let state = game([0, 1, 2]);
    const code = state.code;
    state = answered(state, 0, wrongFor(state));
    state = answered(state, 1, wrongFor(state));
    expect(state.phase).toBe("round");
    state = answered(state, 2, wrongFor(state), T0 + 9000);
    expect(state.phase).toBe("show");
    expect(state.history.at(-1)).toEqual({ type: "nobody", round: 1, why: "locked", code });
    expect(state.passed).toEqual([]);
  });

  it("is over with nobody safe when its time is up", () => {
    const state = game([0, 1, 2]);
    expect(applyTimeout(state, T0 + ROUND_MS - 1, config)).toBe(state);
    const over = applyTimeout(state, T0 + ROUND_MS, config);
    expect(over.phase).toBe("show");
    expect(over.history.at(-1)).toEqual({ type: "nobody", round: 1, why: "time", code: state.code });
  });

  it("gives way to the next once its code has been shown: new conditions, another code to find, nobody locked out, the safe out of it", () => {
    const first = game([0, 1, 2]);
    let state = answered(first, 2, wrongFor(first));
    state = answered(state, 0, first.code, T0 + 5000);
    state = due(state);
    expect([state.phase, state.round]).toEqual(["round", 2]);
    expect(state.history.at(-1)).toEqual({ type: "round", round: 2 });
    expect(state.conditions).not.toEqual(first.conditions);
    expect(answersTo(state.conditions, state.cards)).toEqual([state.code]);
    expect(state.cards).toEqual(first.cards);
    expect(state.seats.map((seat) => seat.wrong)).toEqual([false, false, false]);
    expect(state.seats[2].misses).toBe(1);
    expect(awaited(state)).toEqual([1, 2]);
    expect(deadline(state)).toBe(T0 + 5000 + SHOW_MS + ROUND_MS);
    expect(applyAction(state, 0, { type: "answer", code: state.code }, T0 + 60_000, config)).toEqual({ ok: false, reason: "already-passed" });
  });
});

describe("the end of 비밀 코드", () => {
  it("comes after the last round, as in the show, where three of four were safe and the fourth was out", () => {
    let state = game(Array.from({ length: SHOW_PLAYERS }, (_, n) => n));
    for (let round = 1; round <= ROUNDS; round++) {
      expect([state.phase, state.round]).toEqual(["round", round]);
      state = due(answered(state, round - 1, state.code, (deadline(state) as number) - 1000));
    }
    expect([state.phase, state.ended]).toEqual(["ended", "played"]);
    expect(placesOf(state)).toEqual([
      { player: 0, place: 1 },
      { player: 1, place: 2 },
      { player: 2, place: 3 },
      { player: 3, place: 4 },
    ]);
    expect(deadline(state)).toBeNull();
  });

  it("comes as soon as one player is left who is not safe", () => {
    const first = game([0, 1]);
    const state = due(answered(first, 1, first.code));
    expect([state.phase, state.ended, state.round]).toEqual(["ended", "played", 1]);
    expect(placesOf(state)).toEqual([
      { player: 1, place: 1 },
      { player: 0, place: 2 },
    ]);
    expect(applyAction(state, 0, { type: "answer", code: first.code }, T0 + 99_000, config)).toEqual({ ok: false, reason: "game-over" });
  });

  it("puts everyone who was never right together after those who were, and everyone first where nobody was", () => {
    let state = game([0, 1, 2]);
    state = due(answered(state, 2, state.code));
    for (let round = 2; round <= 3; round++) state = due(due(state));
    expect(state.ended).toBe("played");
    expect(placesOf(state)).toEqual([
      { player: 2, place: 1 },
      { player: 0, place: 2 },
      { player: 1, place: 2 },
    ]);
    let nobody = game([0, 1]);
    for (let round = 1; round <= 3; round++) nobody = due(due(nobody));
    expect(placesOf(nobody)).toEqual([
      { player: 0, place: 1 },
      { player: 1, place: 1 },
    ]);
  });

  it("goes on without a player who left while two are in the room, and is cut short with one", () => {
    const three = closeIfLeft(game([0, 1, 2]), (player) => player !== 2, T0 + 1000, config);
    expect(three.phase).toBe("round");
    expect(three.history.at(-1)).toEqual({ type: "left", player: 2 });
    expect(awaited(three)).toEqual([0, 1]);
    const one = closeIfLeft(three, (player) => player === 0, T0 + 2000, config);
    expect(one.ended).toBe("left");
    expect(placesOf(one)).toBeNull();
    const same = game();
    expect(closeIfLeft(same, () => true, T0, config)).toBe(same);
  });

  it("ends the round when the only player who could still answer leaves", () => {
    let state = game([0, 1, 2]);
    state = answered(state, 0, wrongFor(state));
    state = answered(state, 1, wrongFor(state));
    state = closeIfLeft(state, (player) => player !== 2, T0 + 3000, config);
    expect(state.phase).toBe("show");
    expect(state.history.at(-1)).toMatchObject({ type: "nobody", why: "locked" });
  });

  it("can be given up where it stands", () => {
    expect(abandon(game()).ended).toBe("abandoned");
    expect(placesOf(abandon(game()))).toBeNull();
  });
});

describe("what a player of 비밀 코드 sees", () => {
  it("has the cards and the conditions, and the code only once the round is over", () => {
    const state = game([0, 1, 2]);
    for (const viewer of [0, 1, null]) {
      const view = viewFor(state, viewer);
      expect(view.code).toBeNull();
      expect(view.cards).toEqual(state.cards);
      expect(view.conditions).toEqual(state.conditions);
      expect(JSON.stringify(view)).not.toContain(JSON.stringify(state.code));
    }
    expect(viewFor(state, null).you).toBeNull();
    expect(viewFor(applyTimeout(state, T0 + ROUND_MS, config), 0).code).toEqual(state.code);
  });
});

describe("a clock that stood still", () => {
  it("moves the round's end on with it", () => {
    const state = game();
    const moved = shiftClock(state, 30_000);
    expect(deadline(moved)).toBe(T0 + ROUND_MS + 30_000);
    expect(moved.roundAt).toBe(T0 + 30_000);
    expect(shiftClock(state, 0)).toBe(state);
  });
});
