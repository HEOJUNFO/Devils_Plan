import { describe, expect, it } from "vitest";
import configJson from "../../../src/shared/games/equation-traffic-light/config.json";
import {
  SYMBOLS as ALPHABET,
  abandon,
  applyAction,
  applyTimeout,
  awaited,
  checkAnswer,
  checkEquation,
  closeIfLeft,
  cluesOf,
  createGame,
  deadline,
  isValidConfig,
  parseAction,
  placesOf,
  shiftClock,
  shown,
  valueOf,
  viewFor,
  type EqConfig,
  type EqState,
} from "../../../src/shared/games/equation-traffic-light/rules";
import { CELLS, CREATE_SECONDS, GUESS_SECONDS, SHOW_EQUATIONS, SHOW_FIRST_ANSWERS, SYMBOLS, WIKI_CLUE_EXAMPLES } from "./documented";

const config: EqConfig = configJson;
const T0 = 1_000_000;
const CREATE_MS = CREATE_SECONDS * 1000;
const GUESS_MS = GUESS_SECONDS * 1000;
const [A, B] = SHOW_EQUATIONS;

function game(over: { chance?: number[] } = {}): EqState {
  const created = createGame({ players: [0, 1], seed: 3, now: T0, chance: over.chance }, config);
  if (!created.ok) throw new Error(created.reason);
  return created.state;
}

function did(state: EqState, player: number, action: unknown, now = T0): EqState {
  const parsed = parseAction(action);
  if (parsed === null) throw new Error("not an action");
  const result = applyAction(state, player, parsed, now, config);
  if (!result.ok) throw new Error(`${result.reason}: ${JSON.stringify(action)}`);
  return result.state;
}

const refusal = (state: EqState, player: number, action: unknown, now = T0): string | null => {
  const parsed = parseAction(action);
  if (parsed === null) return "unparsed";
  const result = applyAction(state, player, parsed, now, config);
  return result.ok ? null : result.reason;
};

/** A game in which player 0 has created the show's first equation and player 1 its second. */
const begun = (now = T0): EqState => did(did(game(), 0, { type: "create", equation: A }, now), 1, { type: "create", equation: B }, now);

/** `state` after both answered in the turn being played. */
const answered = (state: EqState, first: string, second: string, now = T0): EqState => did(did(state, 0, { type: "answer", cells: first }, now), 1, { type: "answer", cells: second }, now);

describe("the numbers of 수식 신호등", () => {
  it("are the show's, with half its time: nine cells, two and a half minutes for the equation and for an answer, ten numbers and six symbols", () => {
    expect(isValidConfig(config)).toBe(true);
    expect([config.cells, config.createSeconds, config.guessSeconds]).toEqual([CELLS, CREATE_SECONDS, GUESS_SECONDS]);
    expect(ALPHABET).toBe(SYMBOLS);
  });

  it("has equations for the room to give that are all equations the rules allow, each different", () => {
    expect(config.stock.length).toBeGreaterThanOrEqual(20);
    expect(new Set(config.stock).size).toBe(config.stock.length);
    for (const equation of config.stock) expect([equation, checkEquation(equation, config)]).toEqual([equation, null]);
    // not the show's own
    for (const equation of SHOW_EQUATIONS) expect(config.stock).not.toContain(equation);
  });

  it("refuses a config a game cannot be played with", () => {
    expect(isValidConfig({ ...config, cells: 2 })).toBe(false);
    expect(isValidConfig({ ...config, createSeconds: 0 })).toBe(false);
    expect(isValidConfig({ ...config, guessSeconds: 0 })).toBe(false);
    expect(isValidConfig({ ...config, idleTurns: 0 })).toBe(false);
    expect(isValidConfig({ ...config, stock: [] })).toBe(false);
    expect(isValidConfig({ ...config, stock: ["1+1=3+0×1"] })).toBe(false);
  });
});

describe("an equation of 수식 신호등", () => {
  const check = (equation: string): string | null => checkEquation(equation, config);

  it("is taken when it is one of the show's: an exponent of 0, a 0 standing alone, a number used three times", () => {
    for (const equation of SHOW_EQUATIONS) expect(check(equation)).toBeNull();
  });

  it("must fill the nine cells with the numbers and the six symbols", () => {
    expect(check("1+1=2")).toBe("wrong-length");
    expect(check("12+34=0046")).toBe("wrong-length");
    expect(check("12+34=4a6")).toBe("bad-symbol");
    expect(check("12*34=408")).toBe("bad-symbol");
    expect(check("(1+2)×3=9")).toBe("bad-symbol");
  });

  it("may not have two symbols next to each other, nor begin or end with one", () => {
    expect(check("12+-3=009")).toBe("symbols-together");
    expect(check("2^=5+15+4")).toBe("symbols-together");
    expect(check("-12+50=38")).toBe("symbol-at-edge");
    expect(check("12+50=38+")).toBe("symbol-at-edge");
    expect(check("=12+50-62")).toBe("symbol-at-edge");
  });

  it("has one equals symbol or more, every side of one value, with an expression allowed on any side", () => {
    expect(check("12+34+567")).toBe("no-equals");
    expect(check("1+1=2=1+1")).toBeNull();
    expect(check("2+2=4=2^2")).toBeNull();
    expect(check("1=1=1=1=1")).toBeNull();
    expect(check("1+1=2=1+2")).toBe("not-true");
    expect(check("3=1+2=2+2")).toBe("not-true");
    expect(check("6÷0=6=6÷1")).toBe("no-value");
    expect(check("47=2^5+15")).toBeNull();
    expect(check("2×6=3×4+0")).toBeNull();
  });

  it("may not write a number with a leading zero, though 0 alone is a number", () => {
    expect(check("12+34=046")).toBe("leading-zero");
    expect(check("05+07=012")).toBe("leading-zero");
    expect(check("10-00=010")).toBe("leading-zero");
    expect(check("10+0×5=10")).toBeNull();
  });

  it("must be true", () => {
    expect(check("12+34=147")).toBe("not-true");
    expect(check("2^5+15=48")).toBe("not-true");
  });

  it("does the exponent first, then multiplication and division from the left, then addition and subtraction", () => {
    // 2 × 9, not 6 squared
    expect(check("2×3^2=6×3")).toBeNull();
    expect(check("4×3^2=6^2")).toBeNull();
    expect(check("2×3^2=6^2")).toBe("not-true");
    expect(check("9-2×3+1=4")).toBeNull();
    // (8 ÷ 4) × 3, not 8 ÷ 12; (8 - 4) - 3, not 8 - 1
    expect(check("8÷4×3=2×3")).toBeNull();
    expect(check("8-4-3=1^9")).toBeNull();
    // an exponent of an exponent, from the right: 2^(3^2) is 512, not 64
    expect(check("2^3^2=512")).toBeNull();
    expect(check("2^3^2=8^2")).toBe("not-true");
  });

  it("divides exactly: a fraction on the way is fine, and a fraction can equal a fraction", () => {
    expect(check("13÷2×4=26")).toBeNull();
    expect(check("1÷3=3÷9+0")).toBeNull();
    expect(check("7÷2=3+0×1")).toBe("not-true");
    // a half is not a third
    expect(check("1÷2=1÷3+0")).toBe("not-true");
    expect(shown(valueOf("13÷2", config.maxDigits)!)).toBe("13/2");
    expect(shown(valueOf("12÷4×3", config.maxDigits)!)).toBe("9");
    expect(shown(valueOf("3-10", config.maxDigits)!)).toBe("-7");
    expect(shown(valueOf("1-9÷6", config.maxDigits)!)).toBe("-1/2");
  });

  it("may pass below zero on the way, and on both sides", () => {
    expect(check("11-15+9=5")).toBeNull();
    expect(check("1-9=12-20")).toBeNull();
  });

  it("has no value when it divides by nothing, raises 0 to the power of 0, or is too large to work out", () => {
    expect(check("5÷0=5÷0+0")).toBe("no-value");
    expect(check("0^0=1+0×9")).toBe("no-value");
    expect(check("9^9^9=9^9")).toBe("no-value");
    expect(check("9^99=9^99")).toBeNull();
    expect(check("0^5+1^0=1")).toBeNull();
    expect(valueOf("9^999", config.maxDigits)).toBeNull();
    expect(valueOf("1^9999999", config.maxDigits)).toEqual({ n: 1n, d: 1n });
    expect(valueOf("12+", config.maxDigits)).toBeNull();
    expect(valueOf("", config.maxDigits)).toBeNull();
  });
});

describe("the colour clues of 수식 신호등", () => {
  it("are green for the right position, yellow for another position, red for what is not in the equation", () => {
    expect(cluesOf("2^5+15=47", "2^5+15=47")).toBe("ggggggggg");
    expect(cluesOf("2^5+15=47", "47=15+5^2")).toBe("yyyyyyyyy");
    expect(cluesOf("2^5+15=47", "9×8-36÷06")).toBe("rrrrrrrrr");
  });

  it("are those of the show's first answers, neither of which is an equation", () => {
    for (const { secret, answer, clues } of SHOW_FIRST_ANSWERS) {
      expect(checkAnswer(answer, config)).toBeNull();
      expect(checkEquation(answer, config)).not.toBeNull();
      expect(cluesOf(secret, answer)).toBe(clues);
    }
  });

  it("are those of the wiki's two examples of a number the answer has too often", () => {
    for (const { secret, answer, clues } of WIKI_CLUE_EXAMPLES) {
      expect(checkEquation(secret, config)).toBeNull();
      expect(cluesOf(secret, answer)).toBe(clues);
    }
  });

  it("mark only as many of a repeated number or symbol as the equation has, the rest red", () => {
    // one 4 in the equation: the one in its position is green, the others red; two 5s, both green
    expect(cluesOf("2^5+15=47", "444444444")).toBe("rrrrrrrgr");
    expect(cluesOf("2^5+15=47", "555555555")).toBe("rrgrrgrrr");
    // three 9s, two 1s, one equals symbol
    expect(cluesOf("91×9^0=91", "99999=111")).toBe("gyrgryyrg");
    // one 4, out of position twice: the first from the left is yellow
    expect(cluesOf("2^5+15=47", "44^5+15=7")).toBe("yryyyyyyg");
  });

  it("are for an answer of nine cells of the numbers and symbols, whatever it says", () => {
    expect(checkAnswer("+++++++++", config)).toBeNull();
    expect(checkAnswer("12345678", config)).toBe("wrong-length");
    expect(checkAnswer("12345678a", config)).toBe("bad-symbol");
  });
});

describe("creating the equations", () => {
  it("is for two players, who have two and a half minutes", () => {
    const start = (players: number[]) => createGame({ players, seed: 1, now: T0 }, config);
    expect(start([0])).toEqual({ ok: false, reason: "too-few" });
    expect(start([0, 1, 2])).toEqual({ ok: false, reason: "too-many" });
    expect(start([2, 2])).toEqual({ ok: false, reason: "bad-players" });
    expect(createGame({ players: [0, 1], seed: 1, now: T0 }, { ...config, cells: 2 })).toEqual({ ok: false, reason: "bad-config" });

    const state = game();
    expect([state.phase, state.round, state.turn, state.until]).toEqual(["create", 1, 0, T0 + CREATE_MS]);
    expect(awaited(state)).toEqual([0, 1]);
  });

  it("keeps an equation from the opponent, who is told only that it is in", () => {
    const state = did(game(), 0, { type: "create", equation: A });

    expect(viewFor(state, 0).mine).toEqual({ equation: A, answer: null });
    for (const other of [1, null]) {
      const view = viewFor(state, other);
      expect(view.ready).toEqual([0]);
      expect(view.secrets).toBeNull();
      expect(JSON.stringify(view)).not.toContain(A);
    }
    expect(viewFor(state, 1).mine).toEqual({ equation: null, answer: null });
    expect(viewFor(state, null).mine).toBeNull();
    expect(awaited(state)).toEqual([1]);
  });

  it("refuses what is no equation, and takes another until the opponent's is in", () => {
    const state = did(game(), 0, { type: "create", equation: A });
    expect(refusal(state, 1, { type: "create", equation: "2^5+15=48" })).toBe("not-true");
    expect(refusal(state, 1, { type: "create", equation: "12+-3=009" })).toBe("symbols-together");
    expect(refusal(state, 5, { type: "create", equation: A })).toBe("not-playing");
    expect(refusal(state, 0, { type: "answer", cells: A })).toBe("not-guessing");

    const again = did(state, 0, { type: "create", equation: "45+67=112" });
    expect(again.secrets[0].equation).toBe("45+67=112");
    expect(again.events).toBe(state.events);
  });

  it("begins the first turn as soon as both are in, with two and a half minutes for an answer", () => {
    const state = begun(T0 + 9000);
    expect([state.phase, state.turn, state.until]).toEqual(["guess", 1, T0 + 9000 + GUESS_MS]);
    expect(refusal(state, 0, { type: "create", equation: A })).toBe("not-creating");
    expect(awaited(state)).toEqual([0, 1]);
  });

  it("is done by the room for whoever has none in after two and a half minutes: one of its own equations, said to both", () => {
    const one = did(game({ chance: [12345, 67890] }), 0, { type: "create", equation: A });
    expect(applyTimeout(one, T0 + CREATE_MS - 1, config)).toBe(one);

    const late = applyTimeout(one, T0 + CREATE_MS, config);

    expect(late.phase).toBe("guess");
    expect(late.secrets[0]).toEqual({ player: 0, equation: A, forced: false });
    expect(config.stock).toContain(late.secrets[1].equation);
    expect(late.secrets[1].forced).toBe(true);
    expect(late.history.slice(-2)).toEqual([
      { type: "created", player: 0, forced: false },
      { type: "created", player: 1, forced: true },
    ]);
    // the player it was done for is shown what they were given
    expect(viewFor(late, 1).mine?.equation).toBe(late.secrets[1].equation);
    expect(JSON.stringify(viewFor(late, 0))).not.toContain(late.secrets[1].equation as string);
  });

  it("gives equations nobody could work out from the game's seed", () => {
    const given = new Set<string>();
    for (let word = 1; word <= 60; word++) {
      const late = applyTimeout(game({ chance: [word * 7919, word * 104729] }), T0 + CREATE_MS, config);
      given.add(late.secrets[0].equation as string);
      given.add(late.secrets[1].equation as string);
    }
    expect(given.size).toBeGreaterThan(10);
  });
});

describe("a turn of 수식 신호등", () => {
  it("keeps an answer unseen until both are in, and takes no second one", () => {
    const one = did(begun(), 0, { type: "answer", cells: "0×+-÷12^3" });

    expect(one.phase).toBe("guess");
    expect(viewFor(one, 0).mine?.answer).toBe("0×+-÷12^3");
    for (const other of [1, null]) {
      const view = viewFor(one, other);
      expect(view.ready).toEqual([0]);
      expect(view.rows).toEqual([]);
      expect(JSON.stringify(view)).not.toContain("0×+-÷12^3");
    }
    expect(refusal(one, 0, { type: "answer", cells: "123456789" })).toBe("already-answered");
    expect(refusal(one, 1, { type: "answer", cells: "1234" })).toBe("wrong-length");
    expect(awaited(one)).toEqual([1]);
  });

  it("shows both answers with their clues once both are in, to everyone, and begins the next turn", () => {
    const state = answered(begun(), "0×+-÷12^3", "34=5×6+78", T0 + 4000);

    expect([state.phase, state.turn, state.until]).toEqual(["guess", 2, T0 + 4000 + GUESS_MS]);
    for (const viewer of [0, 1, null]) {
      expect(viewFor(state, viewer).rows).toEqual([
        {
          turn: 1,
          answers: [
            { player: 0, cells: "0×+-÷12^3", clues: "rryrryyyr" },
            { player: 1, cells: "34=5×6+78", clues: "rryryrrrr" },
          ],
        },
      ]);
    }
    expect(viewFor(state, 0).mine).toEqual({ equation: A, answer: null });
    expect(state.history.at(-1)).toEqual({ type: "clues", turn: 1, solved: [], missed: [] });
    // still nobody is sent the other's equation
    expect(JSON.stringify(viewFor(state, 0))).not.toContain(B);
    expect(JSON.stringify(viewFor(state, 1))).not.toContain(A);
  });

  it("gives no clues to whoever has no answer in after two and a half minutes, and shows the other's all the same", () => {
    const one = did(begun(), 1, { type: "answer", cells: "34=5×6+78" });
    expect(applyTimeout(one, T0 + GUESS_MS - 1, config)).toBe(one);

    const late = applyTimeout(one, T0 + GUESS_MS, config);

    expect(late.rows[0].answers).toEqual([
      { player: 0, cells: null, clues: null },
      { player: 1, cells: "34=5×6+78", clues: "rryryrrrr" },
    ]);
    expect(late.history.at(-1)).toEqual({ type: "clues", turn: 1, solved: [], missed: [0] });
    expect([late.turn, late.until]).toEqual([2, T0 + 2 * GUESS_MS]);
  });

  it("is won by whoever answers with the opponent's equation, and then both equations are shown", () => {
    const state = answered(answered(begun(), "0×+-÷12^3", "34=5×6+78"), B, "91×9^1=91", T0 + 7000);

    expect([state.phase, state.ended, state.winner, state.until]).toEqual(["ended", "played", 0, null]);
    expect(state.rows[1].answers[0]).toEqual({ player: 0, cells: B, clues: "ggggggggg" });
    expect(placesOf(state)).toEqual([
      { player: 0, place: 1 },
      { player: 1, place: 2 },
    ]);
    expect(viewFor(state, null).secrets).toEqual([
      { player: 0, equation: A },
      { player: 1, equation: B },
    ]);
    expect(state.history.slice(-2)).toEqual([
      { type: "clues", turn: 2, solved: [0], missed: [] },
      { type: "ended", reason: "played" },
    ]);
    expect(refusal(state, 1, { type: "answer", cells: A })).toBe("game-over");
    expect(deadline(state)).toBeNull();
  });

  it("is played again from new equations when both answer right on the same turn", () => {
    const state = answered(begun(), B, A, T0 + 5000);

    expect([state.phase, state.round, state.turn, state.winner, state.ended]).toEqual(["create", 2, 0, null, null]);
    expect(state.until).toBe(T0 + 5000 + CREATE_MS);
    expect(state.secrets.map((each) => each.equation)).toEqual([null, null]);
    expect(state.rows).toEqual([]);
    expect(state.history.slice(-2)).toEqual([
      { type: "clues", turn: 1, solved: [0, 1], missed: [] },
      { type: "round", round: 2 },
    ]);
    expect(placesOf(state)).toBeNull();
  });

  it("is given up when nobody has answered for three turns running", () => {
    let state = begun();
    for (let turn = 1; turn <= 2; turn++) state = applyTimeout(state, deadline(state) as number, config);
    expect(state.phase).toBe("guess");
    // an answer from either puts the count back
    state = did(state, 0, { type: "answer", cells: "123456789" }, deadline(state) as number - 1);
    for (let turn = 1; turn <= 3; turn++) {
      expect(state.phase).toBe("guess");
      state = applyTimeout(state, deadline(state) as number, config);
    }
    expect([state.phase, state.ended]).toEqual(["guess", null]);
    state = applyTimeout(state, deadline(state) as number, config);

    expect([state.phase, state.ended, state.winner]).toEqual(["ended", "stalled", null]);
    expect(placesOf(state)).toBeNull();
    expect(viewFor(state, null).secrets).toHaveLength(2);
  });

  it("keeps the latest turns only, so that a game that goes on does not grow without end", () => {
    let state = begun();
    for (let turn = 1; turn <= 60; turn++) state = answered(state, "123456789", "987654321");
    expect(state.turn).toBe(61);
    expect(state.rows.length).toBeLessThanOrEqual(40);
    expect(state.rows.at(-1)?.turn).toBe(60);
    expect(state.history.length).toBeLessThanOrEqual(24);
  });
});

describe("a game of 수식 신호등 whose players are not there", () => {
  it("ends when one of its two has left the room, and when it is given up", () => {
    const state = begun();
    expect(closeIfLeft(state, () => true)).toBe(state);

    const left = closeIfLeft(state, (player) => player === 1);
    expect([left.phase, left.ended, left.until]).toEqual(["ended", "left", null]);
    expect(placesOf(left)).toBeNull();

    const given = abandon(state);
    expect([given.phase, given.ended]).toEqual(["ended", "abandoned"]);
    expect(abandon(given)).toBe(given);
  });

  it("moves its clock on by the time it stood still", () => {
    const state = game();
    expect(shiftClock(state, 4000).until).toBe(T0 + 4000 + CREATE_MS);
    expect(shiftClock(state, 0)).toBe(state);
  });
});

describe("what a player of 수식 신호등 can send", () => {
  it("is an equation, or an answer", () => {
    expect(parseAction({ type: "create", equation: A })).toEqual({ type: "create", equation: A });
    expect(parseAction({ type: "answer", cells: "0×+-÷12^3" })).toEqual({ type: "answer", cells: "0×+-÷12^3" });
    for (const raw of [null, 3, {}, { type: "create" }, { type: "create", equation: 912 }, { type: "create", equation: "1".repeat(80) }, { type: "answer" }, { type: "answer", cells: ["1"] }, { type: "pass" }]) expect(parseAction(raw)).toBeNull();
  });
});
