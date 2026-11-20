import { describe, expect, it } from "vitest";
import shipped from "../../../src/shared/games/piggy-bank/config.json";
import {
  applyAction,
  applyTimeout,
  createGame,
  isValidConfig,
  parseAction,
  piecesOf,
  resetNeeds,
  standingsOf,
  viewFor,
  withThere,
  type Colour,
  type PiggyAction,
  type PiggyConfig,
  type PiggyState,
} from "../../../src/shared/games/piggy-bank/rules";

const config: PiggyConfig = shipped;
const T0 = 1_800_000_000_000;

/** A game of players 1 to `count`, in that order, player 1 first. */
function game(count = 4, overrides: Partial<PiggyConfig> = {}): PiggyState {
  const players = Array.from({ length: count }, (_, n) => n + 1);
  const created = createGame({ players, seed: 1, now: T0, order: players }, { ...config, ...overrides });
  if (!created.ok) throw new Error(`fixture refused: ${created.reason}`);
  return created.state;
}

/** `state` after `player` did `action`; a refusal fails the test. */
function act(state: PiggyState, player: number, action: PiggyAction, rules: PiggyConfig = config): PiggyState {
  const result = applyAction(state, player, action, T0, rules);
  if (!result.ok) throw new Error(`refused: ${result.reason}`);
  return result.state;
}

const refusal = (state: PiggyState, player: number, action: PiggyAction): string | null => {
  const result = applyAction(state, player, action, T0, config);
  return result.ok ? null : result.reason;
};

/** The phase's time runs out. */
const lapse = (state: PiggyState, rules: PiggyConfig = config): PiggyState => applyTimeout(state, state.until, rules);

/** Everyone but whoever was asked says they declare no suspicion. */
function trust(state: PiggyState): PiggyState {
  let next = state;
  for (const player of state.players) if (player !== state.question?.player && next.phase === "suspect") next = act(next, player, { type: "pass" });
  return next;
}

/** A turn in which nobody declares a suspicion: `black` and `white` go in, the bank goes to `to`, who answers `count`. */
function turn(state: PiggyState, black: number, white: number, to: number, count: number): PiggyState {
  return trust(act(act(state, state.turn, { type: "put", black, white, to }), to, { type: "answer", count }));
}

const bank = (state: PiggyState, id: number) => state.banks.find((each) => each.id === id);
const shelf = (state: PiggyState, player: number) => state.shelves.find((each) => each.player === player)!;
const scores = (state: PiggyState): number[] => state.shelves.map((each) => each.score);
/** A game with these points, by player. */
const scored = (state: PiggyState, points: number[]): PiggyState => ({ ...state, shelves: state.shelves.map((each, at) => ({ ...each, score: points[at] })) });

/**
 * The show's own match (the third prison match), as its dealer and its four
 * players said it aloud, from viewers' subtitle files of the episode
 * (design/games/piggy-bank.md says from where). Who played is left out: a
 * player is the number of the bank they sat down to, and player 1 was first.
 * Each turn: who put, into which bank, how many black and white, to whom,
 * the colour asked, and what was answered. The ninth answer was wrong and
 * player 2 declared the suspicion; the match was stopped after the
 * fourteenth.
 */
const SHOW: [player: number, bank: number, black: number, white: number, to: number, colour: Colour, answer: number][] = [
  [1, 1, 3, 2, 4, "black", 4],
  [4, 4, 1, 3, 2, "white", 4],
  [2, 2, 2, 3, 4, "black", 3],
  [4, 1, 2, 2, 3, "white", 5],
  [3, 3, 2, 2, 2, "black", 3],
  [2, 4, 1, 4, 4, "white", 8],
  [4, 2, 3, 1, 2, "black", 6],
  [2, 3, 1, 1, 1, "white", 4],
  [1, 5, 4, 1, 4, "black", 8],
  [4, 4, 2, 3, 3, "white", 11],
  [3, 1, 2, 2, 4, "black", 8],
  [4, 6, 3, 1, 1, "white", 2],
  [1, 3, 3, 1, 4, "black", 7],
  [4, 1, 0, 4, 3, "white", 11],
];
/** The turn that was answered wrong, counted from 0, and who declared the suspicion. */
const SHOW_WRONG = 8;
const SHOW_SUSPECT = 2;

describe("the show's match", () => {
  it("goes as the dealer called it: each turn the bank named is on the bottom shelf of whoever puts, the colour asked turns about, and every answer but the ninth is what the bank holds", () => {
    let state = game(4);

    SHOW.forEach(([player, id, black, white, to, colour, answer], at) => {
      expect([at, state.phase, state.turn, shelf(state, state.turn).bottom]).toEqual([at, "put", player, id]);
      state = act(act(state, player, { type: "put", black, white, to }), to, { type: "answer", count: answer });
      expect(state.question).toMatchObject({ player: to, bank: id, colour, count: answer });
      const held = bank(state, id)![colour];
      if (at !== SHOW_WRONG) {
        expect(held).toBe(answer);
        state = trust(state);
        return;
      }
      expect(held).toBe(5);
      state = lapse(act(state, SHOW_SUSPECT, { type: "suspect" }));
      // the fifth bank is out of the game, and whoever answered has the sixth
      expect(state.banks.map((each) => each.id).sort()).toEqual([1, 2, 3, 4, 6]);
      expect(shelf(state, to)).toMatchObject({ bottom: 4, top: 6 });
    });

    // as the match stood when it was stopped
    expect(scores(state)).toEqual([0, 1, 0, -1]);
    expect(state.phase).toBe("put");
  });
});

describe("the start", () => {
  it("gives each player a bank along the order with one coin of each colour, and the first player one more on the top shelf", () => {
    const created = createGame({ players: [7, 3, 5], seed: 1, now: T0, order: [5, 7, 3] }, config);
    if (!created.ok) throw new Error("refused");
    const state = created.state;

    expect(state.banks).toEqual([1, 2, 3, 4].map((id) => ({ id, black: 1, white: 1 })));
    expect(state.shelves.map((each) => [each.player, each.bottom, each.top])).toEqual([[3, 3, null], [5, 1, 4], [7, 2, null]]);
    expect([state.phase, state.turn, state.ask, state.until]).toEqual(["put", 5, "black", T0 + config.putSeconds * 1000]);
  });

  it("draws the order from the seed: the same seed the same order, and over seeds every player is first", () => {
    const first = (seed: number) => {
      const created = createGame({ players: [0, 1, 2, 3], seed, now: T0 }, config);
      if (!created.ok) throw new Error("refused");
      return created.state.order;
    };

    expect(first(5)).toEqual(first(5));
    expect(new Set(Array.from({ length: 40 }, (_, seed) => first(seed)[0])).size).toBe(4);
  });

  it("is refused for fewer or more players than the game takes, for a player named twice, and for numbers that make no game", () => {
    const start = (players: number[], rules = config) => createGame({ players, seed: 1, now: T0 }, rules);

    expect(start([0, 1])).toEqual({ ok: false, reason: "too-few" });
    expect(start([0, 1, 2, 3, 4, 5, 6])).toEqual({ ok: false, reason: "too-many" });
    expect(start([0, 1, 1])).toEqual({ ok: false, reason: "bad-players" });
    expect(start([0, 1, 2], { ...config, putMin: 0 })).toEqual({ ok: false, reason: "bad-config" });
    expect(isValidConfig(config)).toBe(true);
    expect(isValidConfig({ ...config, putMax: 0 })).toBe(false);
    expect(isValidConfig({ ...config, autoBlack: 6 })).toBe(false);
  });
});

describe("putting coins in", () => {
  it("adds them to the bank on the bottom shelf, passes it to the top shelf of whoever is named, and brings the putter's other bank down", () => {
    const state = act(game(), 1, { type: "put", black: 3, white: 2, to: 4 });

    expect(bank(state, 1)).toEqual({ id: 1, black: 4, white: 3 });
    expect(shelf(state, 1)).toMatchObject({ bottom: 5, top: null });
    expect(shelf(state, 4)).toMatchObject({ bottom: 4, top: 1 });
    expect(state.said).toEqual({ player: 1, bank: 1, black: 3, white: 2, to: 4 });
    expect([state.phase, state.turn, state.until]).toEqual(["answer", 4, T0 + config.answerSeconds * 1000]);
  });

  it("takes one to five coins, of one colour or both", () => {
    const put = (black: number, white: number) => refusal(game(), 1, { type: "put", black, white, to: 2 });

    expect([put(0, 0), put(3, 3), put(6, 0)]).toEqual(["bad-coins", "bad-coins", "bad-coins"]);
    expect([put(0, 1), put(5, 0), put(2, 3)]).toEqual([null, null, null]);
  });

  it("is refused for anyone whose turn it is not, for a bank passed to oneself or to nobody, and while a question is open", () => {
    const state = game();

    expect(refusal(state, 2, { type: "put", black: 1, white: 0, to: 3 })).toBe("not-your-turn");
    expect(refusal(state, 1, { type: "put", black: 1, white: 0, to: 1 })).toBe("bad-receiver");
    expect(refusal(state, 1, { type: "put", black: 1, white: 0, to: 9 })).toBe("bad-receiver");
    expect(refusal(state, 9, { type: "put", black: 1, white: 0, to: 1 })).toBe("not-playing");
    expect(refusal(act(state, 1, { type: "put", black: 1, white: 0, to: 2 }), 2, { type: "put", black: 1, white: 0, to: 3 })).toBe("not-your-turn");
  });

  it("is done by the room when the time runs out: one black coin, to whoever comes next in the order", () => {
    const state = lapse(game());

    expect(bank(state, 1)).toEqual({ id: 1, black: 1 + config.autoBlack, white: 1 });
    expect(state.question).toMatchObject({ player: 2, from: 1, bank: 1 });
    expect(state.history.at(-1)).toEqual({ type: "put", player: 1, bank: 1, to: 2, auto: true });
  });
});

describe("the question", () => {
  it("asks about black first and turns about with every bank passed, whoever is asked and whatever came of the last", () => {
    let state = game();
    const asked: Colour[] = [];
    for (let at = 0; at < 5; at++) {
      const to = state.players.find((player) => player !== state.turn)!;
      state = act(state, state.turn, { type: "put", black: 1, white: 0, to });
      asked.push(state.question!.colour);
      state = act(state, to, { type: "answer", count: 0 });
      // every other question is closed by a suspicion
      state = at % 2 === 0 ? trust(state) : lapse(act(state, state.players.find((player) => player !== to)!, { type: "suspect" }));
    }

    expect(asked).toEqual(["black", "white", "black", "white", "black"]);
    expect(state.questions).toBe(5);
  });

  it("is answered by whoever was passed the bank and nobody else, with a number no greater than the most an answer may be", () => {
    const state = act(game(), 1, { type: "put", black: 1, white: 0, to: 3 });

    expect(refusal(state, 1, { type: "answer", count: 2 })).toBe("not-your-turn");
    expect(refusal(state, 3, { type: "answer", count: config.countMost + 1 })).toBe("bad-action");
    expect(act(state, 3, { type: "answer", count: 2 })).toMatchObject({ phase: "suspect", until: T0 + config.suspectSeconds * 1000, question: { count: 2, answered: true } });
  });

  it("stands unanswered when the time runs out, and a suspicion declared against that holds", () => {
    const silent = lapse(act(game(), 1, { type: "put", black: 1, white: 0, to: 3 }));

    expect(silent).toMatchObject({ phase: "suspect", question: { count: null, answered: false } });
    expect(silent.history.at(-1)).toMatchObject({ type: "answered", player: 3, silent: true });
    expect(act(silent, 2, { type: "suspect" }).opened).toMatchObject({ right: true, loser: 3, count: null });
  });

  it("is closed when everyone else has said they declare no suspicion, or when the time for one runs out: whoever answered puts next, into their own bottom bank", () => {
    const asked = act(act(game(), 1, { type: "put", black: 1, white: 0, to: 3 }), 3, { type: "answer", count: 9 });
    const two = act(act(asked, 1, { type: "pass" }), 2, { type: "pass" });

    expect(two.phase).toBe("suspect");
    for (const closed of [act(two, 4, { type: "pass" }), lapse(asked)]) {
      expect([closed.phase, closed.turn, closed.said, closed.question]).toEqual(["put", 3, null, null]);
      expect(shelf(closed, 3)).toMatchObject({ bottom: 3, top: 1 });
      expect(closed.history.at(-1)).toEqual({ type: "trusted", player: 3 });
      expect(scores(closed)).toEqual([0, 0, 0, 0]);
    }
  });
});

describe("a suspicion", () => {
  /** Player 1 has put two black coins into bank 1 and passed it to player 3, who answered `count` to "how many black". */
  const answered = (count: number): PiggyState => act(act(game(), 1, { type: "put", black: 2, white: 0, to: 3 }), 3, { type: "answer", count });

  it("that holds gains whoever declared it a point and costs whoever answered one; the bank is opened and leaves the game", () => {
    const state = act(answered(2), 4, { type: "suspect" });

    expect(state.opened).toEqual({ bank: 1, black: 3, white: 1, by: 4, player: 3, colour: "black", count: 2, right: true, loser: 3 });
    expect(scores(state)).toEqual([0, 0, -1, 1]);
    expect(bank(state, 1)).toBeUndefined();
    expect([state.phase, state.until]).toEqual(["opened", T0 + config.openSeconds * 1000]);
  });

  it("that fails costs whoever declared it a point and whoever answered nothing", () => {
    const state = act(answered(3), 4, { type: "suspect" });

    expect(state.opened).toMatchObject({ right: false, loser: 4 });
    expect(scores(state)).toEqual([0, 0, 0, -1]);
  });

  it("gives whoever lost the point a new bank with the next number and one coin of each colour, and they put next into the bank they had", () => {
    const held = lapse(act(answered(2), 4, { type: "suspect" }));
    const failed = lapse(act(answered(3), 4, { type: "suspect" }));

    expect([held.phase, held.turn, held.opened, held.said]).toEqual(["put", 3, null, null]);
    expect(shelf(held, 3)).toMatchObject({ bottom: 3, top: 6 });
    expect(bank(held, 6)).toEqual({ id: 6, black: 1, white: 1 });
    expect(held.history.at(-1)).toEqual({ type: "issued", player: 3, bank: 6 });
    // a failed one: whoever answered is left with their own bank, and whoever declared it has two
    expect([failed.turn, shelf(failed, 3).top, shelf(failed, 4).top]).toEqual([4, null, 6]);
    expect(failed.nextBank).toBe(7);
  });

  it("is the first one declared: nothing can be declared against an opened bank, by whoever answered, by someone who said they declare none, or outside its time", () => {
    const state = answered(2);

    expect(refusal(state, 3, { type: "suspect" })).toBe("own-answer");
    expect(refusal(state, 3, { type: "pass" })).toBe("own-answer");
    expect(refusal(act(state, 2, { type: "pass" }), 2, { type: "suspect" })).toBe("passed");
    expect(refusal(act(state, 2, { type: "pass" }), 2, { type: "pass" })).toBe("passed");
    expect(refusal(act(state, 4, { type: "suspect" }), 2, { type: "suspect" })).toBe("not-suspecting");
    expect(refusal(game(), 2, { type: "suspect" })).toBe("not-suspecting");
    expect(refusal(game(), 2, { type: "pass" })).toBe("not-suspecting");
  });
});

describe("a reset", () => {
  /** Players 1, 2 and 3 of four have asked for it during player 1's first turn. */
  const settled = (): PiggyState => [1, 2, 3].reduce((state, player) => act(state, player, { type: "reset" }), game());

  it("is settled the moment all but one have asked for it, and whoever did not may then declare a challenge", () => {
    const two = act(act(game(), 1, { type: "reset" }), 2, { type: "reset" });
    const state = act(two, 3, { type: "reset" });

    expect(resetNeeds(game(), config)).toBe(3);
    expect(resetNeeds(game(6), config)).toBe(5);
    expect(resetNeeds(game(3), config)).toBe(2);
    expect([two.phase, two.shelves.map((each) => each.reset)]).toEqual(["put", [true, true, false, false]]);
    expect([state.phase, state.until]).toEqual(["call", T0 + config.callSeconds * 1000]);
    expect(state.history.slice(-2)).toEqual([{ type: "reset-asked", player: 3 }, { type: "reset" }]);
  });

  it("can be asked for once by each player, while banks go round and not while one lies open", () => {
    const opened = act(act(act(game(), 1, { type: "put", black: 1, white: 0, to: 2 }), 2, { type: "answer", count: 0 }), 3, { type: "suspect" });

    expect(refusal(act(game(), 1, { type: "reset" }), 1, { type: "reset" })).toBe("reset-asked");
    expect(refusal(opened, 1, { type: "reset" })).toBe("no-reset");
    expect(refusal(settled(), 4, { type: "reset" })).toBe("no-reset");
  });

  it("takes every bank away and hands out new ones from whoever was to put next, with the points and the colour asked as they stood", () => {
    // player 1 passed to 3, who answered and now has two banks: three then ask for the reset
    let state = act(act(game(), 1, { type: "put", black: 5, white: 0, to: 3 }), 3, { type: "answer", count: 6 });
    state = scored(state, [2, 0, -1, 0]);
    state = [1, 2, 4].reduce((next, player) => act(next, player, { type: "reset" }), state);
    expect([state.phase, state.question, state.said]).toEqual(["call", null, null]);

    state = act(state, 3, { type: "pass" });

    expect(state.banks).toEqual([1, 2, 3, 4, 5].map((id) => ({ id, black: 1, white: 1 })));
    expect(state.shelves.map((each) => [each.player, each.bottom, each.top, each.reset])).toEqual([[1, 3, null, false], [2, 4, null, false], [3, 1, 5, false], [4, 2, null, false]]);
    expect([state.phase, state.turn, state.ask, state.nextBank]).toEqual(["put", 3, "white", 6]);
    expect(scores(state)).toEqual([2, 0, -1, 0]);
    expect(state.history.at(-1)).toEqual({ type: "dealt", first: 3 });
  });

  it("is done when the time for a challenge runs out with none declared", () => {
    expect(lapse(settled())).toMatchObject({ phase: "put", turn: 1 });
  });
});

describe("a challenge", () => {
  /** Player 1 put 2 black and 1 white into bank 1 and passed it to 2; then all but player 4 asked for a reset. */
  function called(): PiggyState {
    const state = turn(game(), 2, 1, 2, 3);
    return [1, 2, 3].reduce((next, player) => act(next, player, { type: "reset" }), state);
  }
  const all = (first: { black: number; white: number }) => [{ id: 1, ...first }, ...[2, 3, 4, 5].map((id) => ({ id, black: 1, white: 1 }))];

  it("is declared by whoever did not ask for the reset, who then names both colours of every bank in play", () => {
    const state = act(called(), 4, { type: "challenge" });

    expect(refusal(called(), 1, { type: "challenge" })).toBe("no-challenge");
    expect(refusal(game(), 4, { type: "challenge" })).toBe("no-challenge");
    expect([state.phase, state.challenge, state.until]).toEqual(["challenge", { player: 4, result: null }, T0 + config.challengeSeconds * 1000]);
    expect(refusal(state, 1, { type: "name", banks: all({ black: 3, white: 2 }) })).toBe("not-your-turn");
    expect(refusal(state, 4, { type: "name", banks: all({ black: 3, white: 2 }).slice(1) })).toBe("bad-banks");
    expect(refusal(state, 4, { type: "name", banks: [...all({ black: 3, white: 2 }).slice(1), { id: 2, black: 1, white: 1 }] })).toBe("bad-banks");
  });

  it("gains three points with every bank named right, costs two with one coin wrong or nothing named in time, and the reset follows either way", () => {
    const state = act(called(), 4, { type: "challenge" });
    const right = act(state, 4, { type: "name", banks: all({ black: 3, white: 2 }) });
    const wrong = act(state, 4, { type: "name", banks: all({ black: 3, white: 3 }) });
    const late = lapse(state);

    expect([right.phase, right.challenge?.result?.right, scores(right)]).toEqual(["challenged", true, [0, 0, 0, config.challengeGain]]);
    expect(right.challenge?.result?.banks[0]).toEqual({ id: 1, black: 3, white: 2, saidBlack: 3, saidWhite: 2 });
    expect([wrong.challenge?.result?.right, scores(wrong)]).toEqual([false, [0, 0, 0, -config.challengeLoss]]);
    expect([late.challenge?.result?.right, late.challenge?.result?.banks[0].saidBlack, scores(late)]).toEqual([false, null, [0, 0, 0, -config.challengeLoss]]);
    for (const shown of [right, wrong, late]) {
      const dealt = lapse(shown);
      expect([dealt.phase, dealt.turn, dealt.challenge, dealt.banks.length]).toEqual(["put", 2, null, 5]);
      expect(bank(dealt, 1)).toEqual({ id: 1, black: 1, white: 1 });
    }
  });
});

describe("the end", () => {
  /** A suspicion by player 1 that holds against player 3, in a game with these points before it. */
  function after(points: number[], rules: PiggyConfig = config): PiggyState {
    const asked = act(act(scored(game(), points), 1, { type: "put", black: 1, white: 0, to: 3 }), 3, { type: "answer", count: 9 });
    return lapse(act(asked, 1, { type: "suspect" }, rules), rules);
  }

  it("comes when someone has five points and one player alone is last", () => {
    const state = after([4, 1, 0, 0]);

    expect(scores(state)).toEqual([5, 1, -1, 0]);
    expect(state.phase).toBe("ended");
    expect(state.history.at(-1)).toEqual({ type: "ended", reason: "target" });
    expect(standingsOf(state).map((each) => [each.player, each.place])).toEqual([[1, 1], [2, 2], [4, 3], [3, 4]]);
  });

  it("does not come while two are level in last place, nor before anyone has five points", () => {
    expect(after([4, 1, 0, -1])).toMatchObject({ phase: "put", turn: 3 });
    expect(after([3, 1, 0, 0]).phase).toBe("put");
    // where the rules are set to end at the points alone, it does
    expect(after([4, 1, 0, -1], { ...config, soleLast: false }).phase).toBe("ended");
  });

  it("pays first place the show's three pieces, shared out evenly with what does not divide lost, and nothing while the game is played or when it was cut short", () => {
    const over = (points: number[]): PiggyState => {
      const state = scored(game(), points);
      return { ...state, phase: "ended", history: [...state.history, { type: "ended", reason: "target" }] };
    };

    expect(config.prize).toBe(3);
    expect(piecesOf(over([5, 1, 0, -1]), config)?.map((each) => each.pieces)).toEqual([3, 0, 0, 0]);
    expect(piecesOf(over([5, 5, 0, -1]), config)?.map((each) => each.pieces)).toEqual([1, 1, 0, 0]);
    expect(piecesOf(scored(game(), [5, 1, 0, -1]), config)).toBeNull();
    expect(piecesOf({ ...over([5, 1, 0, -1]), history: [{ type: "ended", reason: "left" }] }, config)).toBeNull();
  });
});

describe("someone who has left the room", () => {
  const without = (state: PiggyState, ...left: number[]): PiggyState => withThere(state, (player) => !left.includes(player), T0, config);

  it("is not passed a bank, is put in for at once, and is asked nothing: whoever comes after them goes on", () => {
    const state = without(game(), 2);
    const turnGone = without(game(), 1);
    const asked = without(act(game(), 1, { type: "put", black: 1, white: 0, to: 3 }), 3);

    expect(without(state, 2)).toBe(state);
    expect(refusal(state, 1, { type: "put", black: 1, white: 0, to: 2 })).toBe("bad-receiver");
    expect(lapse(state).question).toMatchObject({ player: 3 });
    expect(turnGone).toMatchObject({ phase: "answer", question: { player: 2, from: 1 } });
    // the bank went to 3, who is gone: no question, and the room puts in for them and passes on to 4
    expect(asked).toMatchObject({ phase: "answer", question: { player: 4, from: 3, colour: "white" } });
    expect(scores(asked)).toEqual([0, 0, 0, 0]);
  });

  it("is not waited for when a suspicion is passed over, and no longer counts towards a reset", () => {
    const asked = act(act(game(), 1, { type: "put", black: 1, white: 0, to: 3 }), 3, { type: "answer", count: 2 });
    const passed = act(act(asked, 1, { type: "pass" }), 2, { type: "pass" });
    const two = act(act(game(), 1, { type: "reset" }), 2, { type: "reset" });

    expect(without(passed, 4)).toMatchObject({ phase: "put", turn: 3 });
    expect(without(two, 4).phase).toBe("call");
    // nobody is left who did not ask: the banks are handed out at once
    expect(without(act(two, 3, { type: "reset" }), 4)).toMatchObject({ phase: "put", turn: 1, questions: 0 });
  });

  it("ends the game when fewer than two are left", () => {
    const state = without(game(3), 1, 2);

    expect(state.phase).toBe("ended");
    expect(state.history.at(-1)).toEqual({ type: "ended", reason: "left" });
  });
});

describe("what is sent", () => {
  it("never says what a bank holds, nor in its events what was put in or answered: only what is said while its question is open, and an opened bank", () => {
    const put = act(game(), 1, { type: "put", black: 3, white: 2, to: 4 });
    const asked = act(put, 4, { type: "answer", count: 4 });
    const closed = trust(asked);
    const view = viewFor(closed, 2, config);

    expect(viewFor(put, 4, config)).toMatchObject({ you: 4, said: { black: 3, white: 2 }, question: { count: null } });
    expect(viewFor(asked, null, config)).toMatchObject({ you: null, question: { count: 4 } });
    expect(view.banks).toEqual([1, 2, 3, 4, 5]);
    expect([view.said, view.question]).toEqual([null, null]);
    expect(JSON.stringify(view)).not.toMatch(/"black":|"white":|"count":/);
    expect(viewFor(act(asked, 2, { type: "suspect" }), 9, config)).toMatchObject({ you: null, opened: { bank: 1, black: 4, white: 3 } });
  });

  it("is read off the wire strictly: whole numbers of nought or more, and nothing else", () => {
    expect(parseAction({ type: "put", black: 1, white: 2, to: 3, more: 1 })).toEqual({ type: "put", black: 1, white: 2, to: 3 });
    expect(parseAction({ type: "answer", count: 0 })).toEqual({ type: "answer", count: 0 });
    expect(parseAction({ type: "name", banks: [{ id: 1, black: 2, white: 3 }] })).toEqual({ type: "name", banks: [{ id: 1, black: 2, white: 3 }] });
    for (const type of ["suspect", "pass", "reset", "challenge"]) expect(parseAction({ type })).toEqual({ type });
    for (const bad of [null, 3, {}, { type: "put", black: -1, white: 1, to: 2 }, { type: "put", black: 1.5, white: 1, to: 2 }, { type: "answer" }, { type: "answer", count: "4" }, { type: "name", banks: [{ id: 1 }] }, { type: "name" }, { type: "open" }]) {
      expect(parseAction(bad)).toBeNull();
    }
  });
});
