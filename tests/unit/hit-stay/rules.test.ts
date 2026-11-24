import { describe, expect, it } from "vitest";
import configJson from "../../../src/shared/games/hit-stay/config.json";
import {
  abandon,
  applyAction,
  applyTimeout,
  awaited,
  basicBetOf,
  createGame,
  deadline,
  deckSize,
  inRound,
  isValidConfig,
  judge,
  mostOf,
  moveOn,
  parseAction,
  placesOf,
  shiftClock,
  split,
  totalOf,
  viewFor,
  type HitConfig,
  type HitState,
} from "../../../src/shared/games/hit-stay/rules";
import { BASIC_BET, BASIC_BET_EVERY, CARDS, DEALT, DECK, LIMITS, SHOW_BASIC_BET, SHOW_CHIPS, SHOW_OUT, SHOW_ROUNDS, START_CHIPS } from "./documented";

const config: HitConfig = configJson;
const T0 = 1_000_000;

function game(players: number[], over: { order?: number[]; turnSeconds?: number; chance?: number[]; seed?: number } = {}): HitState {
  const created = createGame({ players, seed: over.seed ?? 3, now: T0, turnSeconds: over.turnSeconds ?? 0, chance: over.chance, order: over.order ?? players }, config);
  if (!created.ok) throw new Error(created.reason);
  return created.state;
}

function did(state: HitState, player: number, action: unknown, now = T0): HitState {
  const parsed = parseAction(action);
  if (parsed === null) throw new Error("not an action");
  const result = applyAction(state, player, parsed, now, config);
  if (!result.ok) throw new Error(`${result.reason}: player ${player} ${JSON.stringify(action)}`);
  return result.state;
}

const refusal = (state: HitState, player: number, action: unknown): string | null => {
  const parsed = parseAction(action);
  if (parsed === null) return "unparsed";
  const result = applyAction(state, player, parsed, T0, config);
  return result.ok ? null : result.reason;
};

/** A copy of `state` that a test may put cards into. */
const copy = (state: HitState): HitState => JSON.parse(JSON.stringify(state)) as HitState;

/** `state` with everyone's first card revealed: the first round of betting. */
function revealed(state: HitState): HitState {
  let next = state;
  for (const hand of state.hands) next = did(next, hand.player, { type: "reveal", card: 0 });
  return next;
}

/** Three cards that add up to `sum`. */
function three(sum: number): number[] {
  const cards: number[] = [];
  let left = sum;
  for (let more = 2; more >= 0; more--) {
    const card = Math.min(7, Math.max(-1, left + more));
    cards.push(card);
    left -= card;
  }
  if (left !== 0) throw new Error(`no three cards add up to ${sum}`);
  return cards;
}

/** Plays `<player><what>` steps (`documented.ts`). */
function played(state: HitState, steps: string): HitState {
  let next = state;
  for (const step of steps.split(" ").filter((each) => each !== "")) {
    const player = Number(step[0]);
    const what = step[1];
    const action = what === "b" ? { type: "bet", to: Number(step.slice(2)) } : { type: { c: "call", f: "fold", h: "hit", s: "stay" }[what] };
    next = did(next, player, action);
  }
  return next;
}

const chipsBySeat = (state: HitState, seats: number[]): number[] => seats.map((seat) => state.chips.find((each) => each.player === seat)?.chips ?? -1);

describe("the numbers of HIT, STAY", () => {
  it("are the show's: 35 cards, three dealt, 30 chips, a basic bet of one, a die of five through 12", () => {
    expect(isValidConfig(config)).toBe(true);
    expect(config.deck).toEqual(DECK);
    expect(deckSize(config)).toBe(CARDS);
    expect([config.dealt, config.startChips, config.basicBet, config.basicBetEvery]).toEqual([DEALT, START_CHIPS, BASIC_BET, BASIC_BET_EVERY]);
    expect([config.limitLowest, config.limitHighest]).toEqual([LIMITS[0], LIMITS.at(-1)]);
  });

  it("raise the basic bet by one chip after every tenth round", () => {
    expect([1, 10, 11, 20, 21, 30, 31].map((round) => basicBetOf(round, config))).toEqual([1, 1, 2, 2, 3, 3, 4]);
    for (const [round, bet] of Object.entries(SHOW_BASIC_BET)) expect(basicBetOf(Number(round), config)).toBe(bet);
  });

  it("refuse a config a game cannot be played with", () => {
    expect(isValidConfig({ ...config, deck: [] })).toBe(false);
    expect(isValidConfig({ ...config, deck: [[1, 14]] })).toBe(false);
    expect(isValidConfig({ ...config, dealt: 0 })).toBe(false);
    expect(isValidConfig({ ...config, startChips: 0 })).toBe(false);
    expect(isValidConfig({ ...config, basicBetEvery: 0 })).toBe(false);
    expect(isValidConfig({ ...config, limitHighest: 4 })).toBe(false);
    expect(isValidConfig({ ...config, revealSeconds: 0 })).toBe(false);
  });
});

describe("a showdown of HIT, STAY", () => {
  const hand = (player: number, total: number, cards = 3) => ({ player, total, cards });

  it("is won by the total closest to the limit that is not over it", () => {
    expect(judge([hand(1, 7), hand(2, 9), hand(3, 8)], 9)).toEqual({ winners: [2], how: "closest" });
    expect(judge([hand(1, 7), hand(2, 10), hand(3, 8)], 9)).toEqual({ winners: [3], how: "closest" });
    // a negative total is within the limit, and the farthest from it
    expect(judge([hand(1, -3), hand(2, 13)], 12)).toEqual({ winners: [1], how: "closest" });
  });

  it("goes to whoever has more cards when totals are the same", () => {
    expect(judge([hand(1, 11, 5), hand(2, 11, 9)], 12)).toEqual({ winners: [2], how: "more-cards" });
    expect(judge([hand(1, 11, 5), hand(2, 11, 9), hand(3, 12, 3)], 12)).toEqual({ winners: [3], how: "closest" });
  });

  it("is tied when total and cards are both the same, or everyone is over the limit", () => {
    expect(judge([hand(1, 8, 4), hand(2, 8, 4), hand(3, 5, 6)], 9)).toEqual({ winners: [1, 2], how: "tied" });
    expect(judge([hand(1, 13, 4), hand(2, 20, 7)], 12)).toEqual({ winners: [1, 2], how: "all-over" });
  });

  it("splits a tied pot evenly, what is left over going round from the first player", () => {
    expect(split(28, [3, 4], [5, 2, 3, 4])).toEqual([
      { player: 3, chips: 14 },
      { player: 4, chips: 14 },
    ]);
    expect(split(11, [1, 2, 4], [2, 3, 4, 1])).toEqual([
      { player: 2, chips: 4 },
      { player: 4, chips: 4 },
      { player: 1, chips: 3 },
    ]);
    expect(split(9, [7], [7, 8])).toEqual([{ player: 7, chips: 9 }]);
  });
});

describe("a round of HIT, STAY", () => {
  it("is for two to five players, whose seats are drawn", () => {
    const start = (players: number[]) => createGame({ players, seed: 1, now: T0, turnSeconds: 0 }, config);
    expect(start([0])).toEqual({ ok: false, reason: "too-few" });
    expect(start([0, 1, 2, 3, 4, 5])).toEqual({ ok: false, reason: "too-many" });
    expect(start([1, 1])).toEqual({ ok: false, reason: "bad-players" });
    expect(createGame({ players: [0, 1], seed: 1, now: T0, turnSeconds: 0, order: [0, 2] }, config)).toEqual({ ok: false, reason: "bad-players" });
    expect(createGame({ players: [0, 1], seed: 1, now: T0, turnSeconds: 0 }, { ...config, dealt: 0 })).toEqual({ ok: false, reason: "bad-config" });

    const orders = new Set<string>();
    for (let word = 1; word <= 40; word++) {
      const created = start([0, 1, 2, 3, 4]);
      const drawn = createGame({ players: [0, 1, 2, 3, 4], seed: 1, now: T0, turnSeconds: 0, chance: [word * 7919, word * 104729] }, config);
      if (!created.ok || !drawn.ok) throw new Error("not started");
      expect([...drawn.state.players].sort()).toEqual([0, 1, 2, 3, 4]);
      expect(drawn.state.first).toBe(drawn.state.players[0]);
      orders.add(drawn.state.players.join());
    }
    expect(orders.size).toBeGreaterThan(10);
  });

  it("begins with the basic bet, a limit of five through 12, and three cards face down for each of 35", () => {
    const limits = new Set<number>();
    for (let word = 1; word <= 80; word++) limits.add(game([0, 1, 2], { chance: [word * 7919, word * 104729] }).limit);
    expect([...limits].sort((a, b) => a - b)).toEqual(LIMITS);

    const state = game([0, 1, 2, 3]);
    expect([state.round, state.phase, state.first, state.basic, state.pot]).toEqual([1, "reveal", 0, 1, 4]);
    expect(state.chips.map((each) => each.chips)).toEqual([29, 29, 29, 29]);
    expect(state.hands.map((hand) => hand.cards.length)).toEqual([3, 3, 3, 3]);
    expect(state.deck).toHaveLength(CARDS - 12);
    const all = [...state.deck, ...state.hands.flatMap((hand) => hand.cards)].sort((a, b) => a - b);
    expect(all).toEqual(DECK.flatMap(([value, copies]) => Array.from({ length: copies }, () => value)).sort((a, b) => a - b));
    expect(state.until).toBe(T0 + config.revealSeconds * 1000);
    expect(awaited(state)).toEqual([0, 1, 2, 3]);
  });

  it("sends a player's face-down cards to that player alone, and shows the chosen cards only once everyone has chosen", () => {
    const state = copy(game([0, 1, 2]));
    state.hands[0].cards = [7, 6, 6];
    state.hands[1].cards = [5, 5, 5];
    state.hands[2].cards = [4, 4, 4];
    const one = did(state, 0, { type: "reveal", card: 1 });

    expect(viewFor(one, 0).mine).toEqual({ cards: [7, 6, 6], revealed: 1 });
    for (const other of [1, 2, null]) {
      const view = viewFor(one, other);
      expect(view.hands[0]).toMatchObject({ revealed: null, chosen: true, hidden: 3 });
      expect(JSON.stringify(view)).not.toContain("[7,6,6]");
      expect(JSON.stringify(view)).not.toContain("deck");
      expect(JSON.stringify(view)).not.toContain("secret");
    }
    expect(refusal(one, 0, { type: "reveal", card: 2 })).toBe("already-revealed");
    expect(refusal(one, 1, { type: "reveal", card: 3 })).toBe("bad-card");
    expect(refusal(one, 1, { type: "fold" })).toBe("not-betting");
    expect(refusal(one, 9, { type: "reveal", card: 0 })).toBe("not-playing");

    const all = did(did(one, 1, { type: "reveal", card: 0 }), 2, { type: "reveal", card: 2 });
    expect(all.phase).toBe("bet");
    expect(viewFor(all, null).hands.map((hand) => [hand.revealed, hand.hidden])).toEqual([
      [6, 2],
      [5, 2],
      [4, 2],
    ]);
    expect(viewFor(all, null).mine).toBeNull();
    expect(all.history.at(-1)).toEqual({ type: "revealed", forced: [] });
  });

  it("has a first round of betting from the first player: a bet of a chip or more or a fold, then call, raise or fold, until everyone's chips are the same", () => {
    const state = revealed(game([0, 1, 2]));
    expect([state.phase, state.betting, state.turn]).toEqual(["bet", 1, 0]);
    expect(refusal(state, 1, { type: "bet", to: 1 })).toBe("not-your-turn");
    expect(refusal(state, 0, { type: "call" })).toBe("nothing-to-call");
    expect(refusal(state, 0, { type: "bet", to: 0 })).toBe("bet-too-low");
    expect(refusal(state, 0, { type: "hit" })).toBe("not-hitting");

    const bet = did(state, 0, { type: "bet", to: 3 });
    expect([bet.turn, bet.pot, viewFor(bet, null).high]).toEqual([1, 6, 3]);
    expect(refusal(bet, 1, { type: "bet", to: 3 })).toBe("bet-too-low");
    const raised = did(did(bet, 1, { type: "call" }), 2, { type: "bet", to: 5 });
    // back to the two who have less in than the raise
    expect(raised.turn).toBe(0);
    const over = did(did(raised, 0, { type: "call" }), 1, { type: "fold" });

    expect([over.phase, over.turn, over.pot]).toEqual(["hit", 0, 3 + 5 + 3 + 5]);
    expect(inRound(over)).toEqual([0, 2]);
    expect(over.chips.map((each) => each.chips)).toEqual([24, 26, 24]);
    expect(over.history.slice(-5).map((event) => event.type)).toEqual(["bet", "call", "bet", "call", "fold"]);
  });

  it("lets nobody put in more than the player still in the round with the fewest chips has", () => {
    const state = copy(revealed(game([0, 1, 2])));
    // the three began the round with 12, 30 and 8 chips
    [12, 30, 8].forEach((chips, at) => {
      state.chips[at].chips = chips - 1;
      state.hands[at].start = chips;
    });
    expect(mostOf(state)).toBe(7);
    expect(refusal(state, 0, { type: "bet", to: 8 })).toBe("bet-over-most");
    const bet = did(state, 0, { type: "bet", to: 2 });
    // once the player with the fewest has folded, the next fewest counts
    const folded = did(did(bet, 1, { type: "call" }), 2, { type: "fold" });
    expect(folded.phase).toBe("hit");
    const second = did(did(folded, 0, { type: "stay" }), 1, { type: "stay" });
    expect([second.phase, second.betting, second.turn, mostOf(second)]).toEqual(["bet", 2, 0, 9]);
    const allIn = did(second, 0, { type: "bet", to: 9 });
    expect(allIn.history.at(-1)).toEqual({ type: "bet", player: 0, to: 9, raise: false, allIn: true });
    expect(allIn.chips[0].chips).toBe(0);
    expect(refusal(allIn, 1, { type: "bet", to: 10 })).toBe("bet-over-most");
  });

  it("gives the pot to the last player in when everyone else has folded, with no card shown", () => {
    const state = revealed(game([0, 1, 2]));
    const taken = did(did(state, 0, { type: "fold" }), 1, { type: "fold" });

    expect([taken.phase, taken.turn]).toEqual(["show", null]);
    expect(taken.outcome).toEqual({ round: 1, limit: state.limit, pot: 3, how: "fold", hands: [], shares: [{ player: 2, chips: 3 }], out: [] });
    expect(taken.chips.map((each) => each.chips)).toEqual([29, 29, 32]);
    expect(taken.until).toBe(T0 + config.takeSeconds * 1000);
    for (const viewer of [0, 1, null]) expect(JSON.stringify(viewFor(taken, viewer).hands[2])).not.toContain(JSON.stringify(taken.hands[2].cards));
  });

  it("deals additional cards face up, one at a time from the first player, to whoever has not stayed, until everyone has", () => {
    const state = copy(did(did(did(revealed(game([0, 1, 2])), 0, { type: "bet", to: 1 }), 1, { type: "call" }), 2, { type: "call" }));
    state.deck.push(3, -1, 2, 5);
    expect([state.phase, state.turn]).toEqual(["hit", 0]);
    expect(refusal(state, 1, { type: "hit" })).toBe("not-your-turn");
    expect(refusal(state, 0, { type: "call" })).toBe("not-betting");

    const a = did(state, 0, { type: "hit" });
    expect([a.turn, a.hands[0].extra]).toEqual([1, [5]]);
    expect(a.history.at(-1)).toEqual({ type: "hit", player: 0, card: 5 });
    expect(viewFor(a, 2).hands[0].extra).toEqual([5]);
    const b = did(did(a, 1, { type: "stay" }), 2, { type: "hit" });
    // the one who stayed is not asked again
    expect([b.turn, b.hands[2].extra]).toEqual([0, [2]]);
    const c = did(did(b, 0, { type: "stay" }), 2, { type: "hit" });
    // alone, until they stay
    expect([c.turn, c.hands[2].extra]).toEqual([2, [2, -1]]);
    const d = did(c, 2, { type: "stay" });
    expect([d.phase, d.betting, d.turn]).toEqual(["bet", 2, 0]);
    expect(d.hands.every((hand) => hand.bet === 0 && !hand.acted)).toBe(true);
  });

  it("ends the additional cards when no card is left", () => {
    const state = copy(did(did(revealed(game([0, 1])), 0, { type: "bet", to: 1 }), 1, { type: "call" }));
    state.deck = [1, -1];
    const last = did(did(state, 0, { type: "hit" }), 1, { type: "hit" });
    expect([last.phase, last.betting, last.deck]).toEqual(["bet", 2, []]);
    expect(viewFor(last, null).left).toBe(0);
  });

  it("shows the hands of those still in after the second round of betting, and gives the pot to the winner", () => {
    const state = copy(revealed(game([0, 1, 2])));
    state.limit = 9;
    state.hands[0].cards = [3, 3, 2];
    state.hands[1].cards = [7, 6, 6];
    state.hands[2].cards = [4, 4, 2];
    const first = played(state, "0b2 1c 2c 0s 1s 2s");
    const shown = played(first, "0b3 1c 2f");

    expect(shown.phase).toBe("show");
    expect(shown.outcome).toEqual({
      round: 1,
      limit: 9,
      pot: 3 + 6 + 6,
      how: "closest",
      hands: [
        { player: 0, cards: [3, 3, 2], total: 8 },
        { player: 1, cards: [7, 6, 6], total: 19 },
      ],
      shares: [{ player: 0, chips: 15 }],
      out: [],
    });
    expect(shown.chips.map((each) => each.chips)).toEqual([30 - 6 + 15, 24, 27]);
    expect(shown.until).toBe(T0 + config.showSeconds * 1000);
    // whoever folded shows nothing
    expect(JSON.stringify(viewFor(shown, 0))).not.toContain("[4,4,2]");
    expect(shown.history.at(-1)).toEqual({ type: "won", round: 1, how: "closest", winners: [0], pot: 15 });
  });

  it("has no second round of betting once someone is all in, and none at all when the basic bet takes someone's last chips", () => {
    const state = copy(revealed(game([0, 1])));
    state.chips[1].chips = 4;
    state.hands[1].start = 5;
    state.limit = 12;
    state.hands[0].cards = [1, 1, 1];
    state.hands[1].cards = [2, 2, 2];
    const allIn = played(state, "0b4 1c");
    expect(allIn.history.at(-1)).toEqual({ type: "call", player: 1, allIn: true });
    const over = played(allIn, "0s 1s");
    expect([over.phase, over.outcome?.how, over.outcome?.pot]).toEqual(["show", "closest", 10]);
    expect(over.chips.map((each) => each.chips)).toEqual([25, 10]);

    // the next round: the basic bet is 1, and a player with one chip is all in with it
    const next = copy(applyTimeout(over, deadline(over) as number, config));
    expect([next.round, next.first, next.phase]).toEqual([2, 1, "reveal"]);
    next.chips[0].chips = 0;
    next.hands[0].start = 1;
    const dealt = revealed(next);
    expect([dealt.phase, dealt.turn]).toEqual(["hit", 1]);
    const ended = played(dealt, "1s 0s");
    expect(["show", "ended"]).toContain(ended.phase);
    expect(ended.outcome?.round).toBe(2);
  });

  it("lowers the basic bet to what the player with the fewest chips has", () => {
    let state = copy(game([0, 1]));
    for (let round = 1; round <= 10; round++) {
      state = copy(played(revealed(state), `${state.first}f`));
      state = copy(applyTimeout(state, deadline(state) as number, config));
    }
    expect([state.round, state.basic]).toEqual([11, 2]);
    // back a round, with one chip for one of the two
    const short = copy(played(revealed(state), `${state.first}f`));
    short.chips[0].chips = 1;
    const next = applyTimeout(short, deadline(short) as number, config);
    expect([next.round, next.basic, next.pot]).toEqual([12, 1, 2]);
    expect(next.chips[0].chips).toBe(0);
  });

  it("moves the first player one seat to the left each round, past the seats of those who are out", () => {
    let state = copy(game([0, 1, 2, 3], { order: [2, 0, 3, 1] }));
    expect(state.first).toBe(2);
    state.out.push({ player: 0, round: 1 });
    state.hands = state.hands.filter((hand) => hand.player !== 0);
    const firsts: number[] = [];
    for (let round = 1; round <= 5; round++) {
      firsts.push(state.first);
      state = copy(played(revealed(state), `${inRound(state)[0]}f ${inRound(state)[1]}f`));
      state = copy(applyTimeout(state, deadline(state) as number, config));
    }
    expect(firsts).toEqual([2, 3, 1, 2, 3]);
    expect(state.hands.map((hand) => hand.player).sort()).toEqual([1, 2, 3]);
  });

  it("puts out whoever has no chips left, and is won by the last player in", () => {
    const state = copy(revealed(game([0, 1, 2], { order: [0, 1, 2] })));
    state.limit = 10;
    state.hands[0].cards = [4, 3, 3];
    state.hands[1].cards = [4, 3, 2];
    state.hands[2].cards = [1, 1, 1];
    const shown = played(state, "0b29 1c 2c 0s 1s 2s");

    expect([shown.phase, shown.ended]).toEqual(["ended", "played"]);
    expect(shown.out).toEqual([
      { player: 1, round: 1 },
      { player: 2, round: 1 },
    ]);
    expect(placesOf(shown)).toEqual([
      { player: 0, place: 1 },
      { player: 1, place: 2 },
      { player: 2, place: 2 },
    ]);
    expect(shown.history.slice(-4).map((event) => event.type)).toEqual(["won", "out", "out", "ended"]);
    expect(deadline(shown)).toBeNull();
    expect(refusal(shown, 0, { type: "hit" })).toBe("game-over");
    expect(viewFor(shown, null).outcome?.hands).toHaveLength(3);
  });
});

describe("the places of HIT, STAY", () => {
  it("are the order of going out, last out second; two out in the same round share a place, and the next is two below", () => {
    const out = [
      { player: 3, round: 1 },
      { player: 1, round: 3 },
      { player: 2, round: 3 },
    ];
    expect(placesOf({ phase: "ended", ended: "played", players: [0, 1, 2, 3], out })).toEqual([
      { player: 0, place: 1 },
      { player: 1, place: 2 },
      { player: 2, place: 2 },
      { player: 3, place: 4 },
    ]);
    expect(placesOf({ phase: "show", ended: null, players: [0, 1, 2, 3], out })).toBeNull();
    expect(placesOf({ phase: "ended", ended: "left", players: [0, 1, 2, 3], out })).toBeNull();
  });
});

describe("the show's game of HIT, STAY, played again", () => {
  const SEATS = [1, 2, 3, 4, 5];

  it("comes to the pot and the chips of every one of its 24 rounds, and to its order of going out", () => {
    let state = copy(game(SEATS, { order: SEATS }));
    // the show's chips in place of the 30 each: the basic bet of the first round is already out of them
    state.chips = SEATS.map((seat, at) => ({ player: seat, chips: SHOW_CHIPS[at] - 1 }));
    for (const hand of state.hands) hand.start = SHOW_CHIPS[hand.player - 1];

    SHOW_ROUNDS.forEach((round, at) => {
      const number = at + 1;
      expect([number, state.round, state.phase]).toEqual([number, number, "reveal"]);
      expect([number, state.basic]).toEqual([number, basicBetOf(number, config)]);
      if (round.firstAsShown === true) state.first = round.first;
      expect([number, state.first]).toEqual([number, round.first]);
      // the limit rolled, and hands that come to the totals shown: the cards themselves are not in the captions
      state.limit = round.limit;
      state.deck = Array.from({ length: 20 }, () => 1);
      for (const [seat, total] of Object.entries(round.totals ?? {})) {
        const hits = round.hits.split(" ").filter((step) => step === `${seat}h`).length;
        (state.hands.find((hand) => hand.player === Number(seat)) as HitState["hands"][number]).cards = three(total - hits);
      }
      state = played(revealed(state), `${round.bet1} ${round.hits} ${round.bet2}`);

      expect([number, state.outcome?.round, state.outcome?.pot]).toEqual([number, number, round.pot]);
      expect([number, ...chipsBySeat(state, SEATS)]).toEqual([number, ...round.chips]);
      expect(totalOf(chipsBySeat(state, SEATS))).toBe(totalOf(SHOW_CHIPS));
      if (round.totals !== undefined) expect(Object.fromEntries((state.outcome?.hands ?? []).map((hand) => [hand.player, hand.total]))).toEqual(round.totals);
      if (number < SHOW_ROUNDS.length) state = copy(applyTimeout(state, deadline(state) as number, config));
    });

    expect([state.phase, state.ended]).toEqual(["ended", "played"]);
    expect(state.out).toEqual(SHOW_OUT.map(({ seat, round }) => ({ player: seat, round })));
    expect(placesOf(state)).toEqual([
      { player: 5, place: 1 },
      { player: 3, place: 2 },
      { player: 4, place: 3 },
      { player: 2, place: 4 },
      { player: 1, place: 5 },
    ]);
  });

  it("had a tied round split evenly, and a round of equal totals won with more cards", () => {
    // (the two rounds of the game above, by their own outcomes)
    let state = copy(game(SEATS, { order: SEATS }));
    state.chips = SEATS.map((seat, at) => ({ player: seat, chips: SHOW_CHIPS[at] - 1 }));
    for (const hand of state.hands) hand.start = SHOW_CHIPS[hand.player - 1];
    const outcomes: (HitState["outcome"] | null)[] = [];
    SHOW_ROUNDS.forEach((round, at) => {
      if (round.firstAsShown === true) state.first = round.first;
      state.limit = round.limit;
      state.deck = Array.from({ length: 20 }, () => 1);
      for (const [seat, total] of Object.entries(round.totals ?? {})) {
        const hits = round.hits.split(" ").filter((step) => step === `${seat}h`).length;
        (state.hands.find((hand) => hand.player === Number(seat)) as HitState["hands"][number]).cards = three(total - hits);
      }
      state = played(revealed(state), `${round.bet1} ${round.hits} ${round.bet2}`);
      outcomes.push(state.outcome);
      if (at + 1 < SHOW_ROUNDS.length) state = copy(applyTimeout(state, deadline(state) as number, config));
    });

    expect(outcomes[4]).toMatchObject({ how: "tied", shares: [{ player: 3, chips: 14 }, { player: 4, chips: 14 }] });
    expect(outcomes[20]).toMatchObject({ how: "more-cards", shares: [{ player: 5, chips: 38 }] });
    expect(outcomes[20]?.hands.map((hand) => [hand.player, hand.cards.length])).toEqual([
      [5, 9],
      [3, 5],
    ]);
    // all in: the first round and the fifteenth went from the cards straight to the showdown
    expect(outcomes[0]).toMatchObject({ how: "closest", pot: 96, out: [1] });
    expect(outcomes[14]).toMatchObject({ how: "closest", pot: 32, out: [4] });
    // everyone else folded: no hand was shown
    expect(outcomes[13]).toMatchObject({ how: "fold", hands: [], shares: [{ player: 5, chips: 6 }] });
  });
});

describe("the clock of HIT, STAY", () => {
  it("reveals a card by chance for whoever has chosen none in time, and says for whom", () => {
    const state = did(game([0, 1, 2]), 1, { type: "reveal", card: 2 });
    expect(applyTimeout(state, T0 + config.revealSeconds * 1000 - 1, config)).toBe(state);

    const late = applyTimeout(state, T0 + config.revealSeconds * 1000, config);

    expect(late.phase).toBe("bet");
    expect(late.hands.map((hand) => hand.revealed !== null)).toEqual([true, true, true]);
    expect(late.hands[1].revealed).toBe(2);
    expect(late.history.at(-1)).toEqual({ type: "revealed", forced: [0, 2] });
  });

  it("gives a turn the room's own limit, or none: a bet not made in time is a fold, a card not asked for a stay", () => {
    const free = revealed(game([0, 1]));
    expect(deadline(free)).toBeNull();

    const state = revealed(game([0, 1, 2], { turnSeconds: 20 }));
    expect(deadline(state)).toBe(T0 + 20_000);
    const folded = applyTimeout(state, T0 + 20_000, config);
    expect(folded.history.at(-1)).toEqual({ type: "fold", player: 0, forced: true });
    expect([folded.turn, deadline(folded)]).toEqual([1, T0 + 40_000]);

    const hits = played(folded, "1b1 2c");
    expect([hits.phase, hits.turn]).toEqual(["hit", 1]);
    const stayed = applyTimeout(hits, deadline(hits) as number, config);
    expect(stayed.history.at(-1)).toEqual({ type: "stay", player: 1, forced: true });
    expect(stayed.turn).toBe(2);
  });

  it("begins the next round once an outcome has been on show", () => {
    const taken = played(revealed(game([0, 1, 2])), "0f 1f");
    expect(applyTimeout(taken, (deadline(taken) as number) - 1, config)).toBe(taken);

    const next = applyTimeout(taken, deadline(taken) as number, config);

    expect([next.round, next.phase, next.first, next.pot]).toEqual([2, "reveal", 1, 3]);
    expect(next.chips.map((each) => each.chips)).toEqual([28, 28, 31]);
    expect(next.hands.every((hand) => hand.cards.length === 3 && hand.extra.length === 0 && !hand.folded && hand.revealed === null)).toBe(true);
    expect(next.deck).toHaveLength(CARDS - 9);
    // the last outcome stays to be read
    expect(next.outcome?.round).toBe(1);
    expect(next.history.at(-1)).toMatchObject({ type: "round", round: 2, first: 1, basic: 1 });
  });

  it("shuffles anew every round, by numbers nobody could work out from what they are shown", () => {
    const decks = new Set<string>();
    let state = game([0, 1], { chance: [11, 22] });
    for (let round = 1; round <= 6; round++) {
      decks.add(state.deck.join());
      state = played(revealed(state), `${state.first}f`);
      state = applyTimeout(state, deadline(state) as number, config);
    }
    expect(decks.size).toBe(6);
    // the same game with another second number is another game from the first card
    expect(game([0, 1], { chance: [11, 23] }).deck.join()).not.toBe(game([0, 1], { chance: [11, 22] }).deck.join());
    expect(game([0, 1], { chance: [12, 22] }).deck.join()).not.toBe(game([0, 1], { chance: [11, 22] }).deck.join());
  });

  it("moves on by the time it stood still", () => {
    const state = game([0, 1]);
    expect(shiftClock(state, 4000).until).toBe((state.until as number) + 4000);
    expect(shiftClock(state, 0)).toBe(state);
    const free = revealed(state);
    expect(shiftClock(free, 4000).until).toBeNull();
  });
});

describe("a game of HIT, STAY whose players are not there", () => {
  it("does at once what the clock would for a player who has left: a card revealed, a fold, a stay", () => {
    const state = game([0, 1, 2]);
    expect(moveOn(state, () => true, T0, config)).toBe(state);

    const gone = moveOn(state, (player) => player !== 0, T0 + 500, config);
    expect(gone.hands[0].revealed).not.toBeNull();
    expect(gone.phase).toBe("reveal");
    const begun = did(did(gone, 1, { type: "reveal", card: 0 }), 2, { type: "reveal", card: 0 });
    // their turn to bet comes first: they have folded before anyone is asked
    const moved = moveOn(begun, (player) => player !== 0, T0 + 900, config);
    expect(moved.history.at(-1)).toEqual({ type: "fold", player: 0, forced: true });
    expect([moved.phase, moved.turn]).toEqual(["bet", 1]);
  });

  it("ends when fewer than two of those still in it are in the room, and when it is given up", () => {
    const state = game([0, 1, 2]);
    const left = moveOn(state, (player) => player === 2, T0, config);
    expect([left.phase, left.ended, left.until]).toEqual(["ended", "left", null]);
    expect(placesOf(left)).toBeNull();

    const given = abandon(state);
    expect([given.phase, given.ended]).toEqual(["ended", "abandoned"]);
    expect(abandon(given)).toBe(given);
  });
});

describe("what a player of HIT, STAY can send", () => {
  it("is a card to reveal, a bet, a call, a fold, a hit or a stay", () => {
    expect(parseAction({ type: "reveal", card: 1 })).toEqual({ type: "reveal", card: 1 });
    expect(parseAction({ type: "bet", to: 7 })).toEqual({ type: "bet", to: 7 });
    for (const type of ["call", "fold", "hit", "stay"]) expect(parseAction({ type })).toEqual({ type });
    for (const raw of [null, 3, {}, { type: "reveal" }, { type: "reveal", card: "1" }, { type: "bet" }, { type: "bet", to: 1.5 }, { type: "check" }]) expect(parseAction(raw)).toBeNull();
  });
});
