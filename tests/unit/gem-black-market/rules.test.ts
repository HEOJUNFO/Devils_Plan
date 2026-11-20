import { describe, expect, it } from "vitest";
import shipped from "../../../src/shared/games/gem-black-market/config.json";
import {
  applyAction,
  applyTimeout,
  createGame,
  deckFor,
  finalsOf,
  isValidConfig,
  parseAction,
  piecesOf,
  standingsOf,
  turnOf,
  viewFor,
  withThere,
  type Card,
  type GemAction,
  type GemConfig,
  type GemState,
  type Kind,
  type Target,
} from "../../../src/shared/games/gem-black-market/rules";

const config = shipped as GemConfig;
const T0 = 1_800_000_000_000;

const card = (kind: Kind, value: number): Card => ({ kind, value });
const D = (value: number): Card => card("diamond", value);
const G = (value: number): Card => card("gold", value);
const S = (value: number): Card => card("silver", value);
const C = (value: number): Card => card("copper", value);
const B = (value: number): Card => card("bomb", value);
const toPlayer = (player: number): Target => ({ to: "player", player });
const toBuyer = (slot: number): Target => ({ to: "buyer", slot });
const TRASH: Target = { to: "trash" };

/** `state` after `player` did `action`; a refusal fails the test. */
function act(state: GemState, player: number, action: GemAction, rules: GemConfig = config): GemState {
  const result = applyAction(state, player, action, T0, rules);
  if (!result.ok) throw new Error(`refused: ${result.reason} (player ${player}, ${JSON.stringify(action)})`);
  return result.state;
}

const refusal = (state: GemState, player: number, action: GemAction): string | null => {
  const result = applyAction(state, player, action, T0, config);
  return result.ok ? null : result.reason;
};

/** The phase's time runs out. */
const lapse = (state: GemState, rules: GemConfig = config): GemState => applyTimeout(state, state.until, rules);

/** Everyone says they are done looking. */
const allReady = (state: GemState): GemState => state.players.reduce((next, player) => (next.phase === state.phase && next.step === state.step ? act(next, player, { type: "ready" }) : next), state);

/** Whoever's turn it is exchanges with `target` and is done looking at what they got. */
function swap(state: GemState, target: Target): GemState {
  const player = turnOf(state)!;
  return act(act(state, player, { type: "exchange", with: target }), player, { type: "ready" });
}

const hand = (state: GemState, player: number): Card => state.hands.find((each) => each.player === player)!.card;
const points = (state: GemState): number[] => state.tallies.map((each) => each.points);

/**
 * A deck that deals `hands` to players 1.. in order when player `first` is
 * first, then `buyers` and `trash`: the cards in the order they are dealt.
 */
function deckOf(hands: Card[], first: number, buyers: Card[], trash: Card): Card[] {
  const n = hands.length;
  return [...Array.from({ length: n }, (_, at) => hands[(first - 1 + at) % n]), ...buyers, trash];
}

/** A game of players 1 to `count` in that order, with `first` made first by the only bid, and these cards for its first round. */
function game(count: number, first: number, hands?: Card[], buyers?: Card[], trash?: Card): GemState {
  const players = Array.from({ length: count }, (_, n) => n + 1);
  const cards = deckFor(count, config);
  const round = hands === undefined ? cards : deckOf(hands, first, buyers!, trash!);
  const created = createGame({ players, seed: 1, now: T0, order: players, ring: players, decks: [round, cards, cards] }, config);
  if (!created.ok) throw new Error(`fixture refused: ${created.reason}`);
  let state = created.state;
  for (const player of players) state = act(state, player, { type: "bid", pieces: player === first ? 1 : 0 });
  return state;
}

/**
 * The first round of the show's own match (the third main match), from the
 * document's table of it (design/games/gem-black-market.md says where the
 * document is at odds with itself, and how it is read here). Who played is
 * left out: a player is their number in the order drawn. Player 8 was
 * first.
 */
const SHOW_HANDS = [B(-4), S(3), C(1), D(6), C(1), B(-6), G(4), S(4), C(2)];
const SHOW_BUYERS = [D(5), C(2), G(5)];
const SHOW_TRASH = S(2);
/** The eighteen exchanges, in the order they were made: with whom each player exchanged. */
const SHOW_EXCHANGES: [player: number, target: Target][] = [
  [8, toBuyer(0)], [9, toPlayer(1)], [1, toPlayer(9)], [2, toBuyer(1)], [3, toPlayer(1)], [4, toPlayer(3)], [5, toBuyer(2)], [6, toPlayer(3)], [7, toBuyer(1)],
  [7, toPlayer(5)], [6, toPlayer(4)], [5, TRASH], [4, toPlayer(2)], [3, toPlayer(4)], [2, toPlayer(4)], [1, TRASH], [9, TRASH], [8, toBuyer(2)],
];
/** The ring of secret buddies: each player along it is the buddy of the one after, and the last of the first. */
const SHOW_RING = [1, 8, 3, 6, 2, 5, 4, 9, 7];
/** Everyone's points after the third round, by player, and the final points the show gave. */
const SHOW_TOTALS = [21, -12, 6, 11, 13, 10, 9, 5, 15];
const SHOW_FINALS = [189, -120, 30, 143, -156, 60, 135, 105, 165];

describe("the show's match", () => {
  it("plays its first round as the table has it: eighteen exchanges in order and then in reverse, the cards everyone ends with, and the points", () => {
    let state = allReady(game(9, 8, SHOW_HANDS, SHOW_BUYERS, SHOW_TRASH));
    expect(state.sequence).toEqual([8, 9, 1, 2, 3, 4, 5, 6, 7, 7, 6, 5, 4, 3, 2, 1, 9, 8]);

    for (const [player, target] of SHOW_EXCHANGES) {
      expect(turnOf(state)).toBe(player);
      state = swap(state, target);
    }

    expect(state.phase).toBe("reveal");
    expect(state.buyers).toEqual([S(4), G(4), D(5)]);
    expect(state.trash).toEqual(C(2));
    expect(state.players.map((player) => hand(state, player))).toEqual([S(3), B(-6), C(2), D(6), S(2), B(-4), G(5), C(1), C(1)]);
    // three points each time a bomb was taken: from player 1 twice, from 3 once, from 4 twice, from 9 once
    expect(state.shown?.lines.map((line) => line.taken)).toEqual([6, 0, 3, 6, 0, 0, 0, 0, 3]);
    expect(points(state)).toEqual([9, -6, 3, 12, 2, -4, 5, 0, 3]);
    // points with a diamond: a piece; and the -6 names the next first player
    expect(state.shown?.lines.map((line) => line.pieces)).toEqual([0, 0, 0, 1, 0, 0, 0, 0, 0]);
    expect(state.shown?.next).toBe(2);
  });

  it("ends as its last table has it: everyone's points times their secret buddy's", () => {
    const created = createGame({ players: SHOW_RING.map((_, n) => n + 1), seed: 1, now: T0, ring: SHOW_RING }, config);
    if (!created.ok) throw new Error("refused");
    const state = { ...created.state, tallies: created.state.tallies.map((tally, at) => ({ ...tally, points: SHOW_TOTALS[at] })) };

    const finals = [...finalsOf(state, config)].sort((a, b) => a.player - b.player);

    expect(finals.map((line) => line.final)).toEqual(SHOW_FINALS);
    expect(finals.map((line) => line.buddy)).toEqual([7, 6, 8, 5, 2, 3, 9, 1, 4]);
    expect(finals.map((line) => line.place)).toEqual([1, 8, 7, 3, 9, 6, 4, 5, 2]);
    // the show's reward: a piece from one point, two from ten
    expect(finals.map((line) => line.reward)).toEqual([2, 0, 2, 2, 0, 2, 2, 2, 2]);
  });
});

describe("the cards", () => {
  it("are the show's thirteen for nine players, and one fewer for each player fewer: the coppers first, then the lowest silver", () => {
    const names = (count: number): string => deckFor(count, config).map((each) => `${each.kind[0]}${each.value}`).join(" ");

    expect(names(9)).toBe("d5 d6 g4 g5 s2 s3 s4 c1 c1 c2 c2 b-6 b-4");
    expect(names(8)).toBe("d5 d6 g4 g5 s2 s3 s4 c1 c2 c2 b-6 b-4");
    expect(names(5)).toBe("d5 d6 g4 g5 s2 s3 s4 b-6 b-4");
    expect(names(4)).toBe("d5 d6 g4 g5 s3 s4 b-6 b-4");
    for (let count = config.minPlayers; count <= config.maxPlayers; count++) expect(deckFor(count, config)).toHaveLength(count + config.buyers + 1);
  });

  it("are dealt one to each player from the first, then to the buyers' slots, then to the trash, and afresh every round", () => {
    const state = game(4, 3, [D(5), D(6), G(4), G(5)], [S(3), S(4), B(-6)], B(-4));

    expect(state.players.map((player) => hand(state, player))).toEqual([D(5), D(6), G(4), G(5)]);
    expect([state.buyers, state.trash]).toEqual([[S(3), S(4), B(-6)], B(-4)]);
    expect([state.phase, state.round, state.first, state.until]).toEqual(["look", 1, 3, T0 + config.lookSeconds * 1000]);
    expect(state.history.at(-1)).toEqual({ type: "dealt", round: 1, first: 3 });
  });

  it("are drawn from numbers nobody could have guessed: the same numbers the same game, other numbers another, and every round its own shuffle", () => {
    const made = (chance: number[]) => {
      const created = createGame({ players: [0, 1, 2, 3, 4], seed: 3, now: T0, chance }, config);
      if (!created.ok) throw new Error("refused");
      return created.state;
    };
    const words = (salt: number): number[] => Array.from({ length: 256 }, (_, n) => Math.imul(n + salt, 2654435761) >>> 0);
    const one = made(words(1));

    expect(made(words(1))).toEqual(one);
    expect(JSON.stringify(made(words(2)).decks)).not.toBe(JSON.stringify(one.decks));
    expect(JSON.stringify(one.decks[0])).not.toBe(JSON.stringify(one.decks[1]));
    for (const deck of one.decks) expect([...deck].sort((a, b) => a.value - b.value || a.kind.localeCompare(b.kind))).toEqual([...deckFor(5, config)].sort((a, b) => a.value - b.value || a.kind.localeCompare(b.kind)));
    // the buddies are one ring through everyone
    const seen = new Set<number>();
    for (let at = 0, player = 0; at < 5; at++) {
      seen.add(player);
      player = one.buddyOf.find((each) => each.player === player)!.of;
    }
    expect(seen.size).toBe(5);
  });

  it("make no game for fewer or more players than there are cards for, nor from numbers that do not add up", () => {
    const start = (count: number, rules = config) => createGame({ players: Array.from({ length: count }, (_, n) => n), seed: 1, now: T0 }, rules);

    expect(start(3)).toEqual({ ok: false, reason: "too-few" });
    expect(start(10)).toEqual({ ok: false, reason: "too-many" });
    expect(start(5, { ...config, buyers: 4 })).toEqual({ ok: false, reason: "bad-config" });
    expect(isValidConfig(config)).toBe(true);
    expect(isValidConfig({ ...config, dropOrder: [7, 7, 9, 10, 4] })).toBe(false);
    expect(isValidConfig({ ...config, deck: [...config.deck.slice(1), { kind: "bomb", value: 2 }] })).toBe(false);
  });
});

describe("the auction", () => {
  const fresh = (count = 4): GemState => {
    const players = Array.from({ length: count }, (_, n) => n + 1);
    const created = createGame({ players, seed: 1, now: T0, order: players, ring: players }, config);
    if (!created.ok) throw new Error("refused");
    return created.state;
  };
  const bids = (state: GemState, pieces: number[]): GemState => state.auction!.bidders.reduce((next, player, at) => (next.auction === null ? next : act(next, player, { type: "bid", pieces: pieces[at] })), state);

  it("makes whoever bid the most pieces first: they pay what they bid, and nobody else pays", () => {
    const state = bids(fresh(), [1, 3, 0, 2]);

    expect([state.phase, state.first]).toEqual(["look", 2]);
    expect(state.tallies.map((each) => each.pieces)).toEqual([3, 0, 3, 3]);
    expect(state.history[0]).toEqual({ type: "auction", first: 2, paid: 3, again: false, drawn: false });
    expect(state.sequence).toEqual([2, 3, 4, 1, 1, 4, 3, 2]);
  });

  it("is bid in secret, once, with pieces one has: a bid may be nothing", () => {
    const state = act(fresh(), 1, { type: "bid", pieces: 2 });

    expect(refusal(state, 1, { type: "bid", pieces: 1 })).toBe("bid-made");
    expect(refusal(state, 2, { type: "bid", pieces: config.startPieces + 1 })).toBe("too-many-pieces");
    expect(viewFor(state, 2, config).auction).toEqual({ bidders: [1, 2, 3, 4], made: [1], mine: null, again: false });
    expect(viewFor(state, 1, config).auction?.mine).toBe(2);
    expect(JSON.stringify(viewFor(state, 2, config))).not.toContain('"bid"');
    expect(refusal(bids(fresh(), [0, 0, 0, 1]), 1, { type: "bid", pieces: 0 })).toBe("not-bidding");
  });

  it("is bid again by those level at the top, and by nobody else; level again, a lot drawn before the game decides", () => {
    const again = bids(fresh(), [2, 0, 2, 1]);

    expect(again.auction).toEqual({ bidders: [1, 3], bids: [{ player: 1, bid: null }, { player: 3, bid: null }], again: true });
    expect(again.tallies.map((each) => each.pieces)).toEqual([3, 3, 3, 3]);
    expect(refusal(again, 2, { type: "bid", pieces: 1 })).toBe("not-bidding");
    const settled = bids(again, [1, 3]);
    expect([settled.first, settled.history[0]]).toEqual([3, { type: "auction", first: 3, paid: 3, again: true, drawn: false }]);
    const drawn = bids(again, [3, 3]);
    expect(drawn.history[0]).toEqual({ type: "auction", first: drawn.lots.find((player) => [1, 3].includes(player)), paid: 3, again: true, drawn: true });
    expect(drawn.tallies.map((each) => each.pieces).sort()).toEqual([0, 3, 3, 3]);
  });

  it("is settled with what was bid when its time runs out: someone not heard from bids nothing", () => {
    const state = lapse(act(fresh(), 4, { type: "bid", pieces: 1 }));

    expect([state.phase, state.first, state.tallies.map((each) => each.pieces)]).toEqual(["look", 4, [3, 3, 3, 2]]);
    expect(lapse(lapse(fresh())).phase).toBe("look");
  });
});

describe("an exchange", () => {
  /** Four players, player 1 first: 1 holds gold 4, 2 the -6, 3 diamond 5, 4 silver 3; the buyers have gold 5, silver 4 and the -4; the trash, diamond 6. */
  const table = (): GemState => allReady(game(4, 1, [G(4), B(-6), D(5), S(3)], [G(5), S(4), B(-4)], D(6)));

  it("is made in the order from the first player and then in reverse, by whoever's turn it is and nobody else", () => {
    const state = table();

    expect([state.phase, turnOf(state), state.until]).toEqual(["exchange", 1, T0 + config.turnSeconds * 1000]);
    expect(refusal(state, 2, { type: "exchange", with: TRASH })).toBe("not-your-turn");
    let next = state;
    const turns: number[] = [];
    while (next.phase === "exchange") {
      turns.push(turnOf(next)!);
      next = swap(next, toPlayer(turnOf(next) === 1 ? 2 : 1));
    }
    expect(turns).toEqual([1, 2, 3, 4, 4, 3, 2, 1]);
    expect(next.phase).toBe("reveal");
  });

  it("swaps the two cards, with a player, a buyers' slot or the trash, and whoever made it is shown the card they got", () => {
    const withSlot = act(table(), 1, { type: "exchange", with: toBuyer(1) });
    const withTrash = act(table(), 1, { type: "exchange", with: TRASH });
    const withPlayer = act(table(), 1, { type: "exchange", with: toPlayer(3) });

    expect([hand(withSlot, 1), withSlot.buyers[1]]).toEqual([S(4), G(4)]);
    expect([hand(withTrash, 1), withTrash.trash]).toEqual([D(6), G(4)]);
    expect([hand(withPlayer, 1), hand(withPlayer, 3)]).toEqual([D(5), G(4)]);
    expect([withPlayer.phase, turnOf(withPlayer), withPlayer.until]).toEqual(["seen", 1, T0 + config.seenSeconds * 1000]);
    expect(withPlayer.history.at(-1)).toEqual({ type: "exchange", round: 1, player: 1, with: toPlayer(3), auto: false });
    expect(viewFor(withPlayer, 1, config).mine).toEqual(D(5));
    expect(refusal(withPlayer, 2, { type: "ready" })).toBe("not-your-turn");
    expect(turnOf(lapse(withPlayer))).toBe(2);
  });

  it("is refused with oneself, with someone who is not playing, and with a slot there is not", () => {
    const state = table();

    expect(refusal(state, 1, { type: "exchange", with: toPlayer(1) })).toBe("bad-target");
    expect(refusal(state, 1, { type: "exchange", with: toPlayer(7) })).toBe("bad-target");
    expect(refusal(state, 1, { type: "exchange", with: toBuyer(3) })).toBe("bad-target");
  });

  it("of a bomb is with a player's card only; a bomb in a slot may be taken by anyone", () => {
    const bombsTurn = swap(table(), toPlayer(3));

    expect(turnOf(bombsTurn)).toBe(2);
    expect(refusal(bombsTurn, 2, { type: "exchange", with: TRASH })).toBe("bomb-to-player");
    expect(refusal(bombsTurn, 2, { type: "exchange", with: toBuyer(0) })).toBe("bomb-to-player");
    expect(refusal(bombsTurn, 2, { type: "exchange", with: toPlayer(4) })).toBeNull();
    expect(hand(act(table(), 1, { type: "exchange", with: toBuyer(2) }), 1)).toEqual(B(-4));
  });

  it("gives three points at once to a player whose bomb another takes, and nothing to a player who passes their own bomb on", () => {
    const taken = act(table(), 1, { type: "exchange", with: toPlayer(2) });
    const passed = act(swap(table(), toPlayer(3)), 2, { type: "exchange", with: toPlayer(4) });

    expect(points(taken)).toEqual([0, config.bombTaken, 0, 0]);
    expect([hand(taken, 1), hand(taken, 2)]).toEqual([B(-6), G(4)]);
    expect(points(passed)).toEqual([0, 0, 0, 0]);
    expect(hand(passed, 4)).toEqual(B(-6));
  });

  it("is made by the room when the time runs out: a bomb with whoever comes next, any other card with the trash", () => {
    const plain = lapse(table());
    const bomb = lapse(swap(table(), toPlayer(3)));

    expect(plain.history.at(-1)).toEqual({ type: "exchange", round: 1, player: 1, with: TRASH, auto: true });
    expect([hand(plain, 1), plain.trash]).toEqual([D(6), G(4)]);
    expect(bomb.history.at(-1)).toEqual({ type: "exchange", round: 1, player: 2, with: toPlayer(3), auto: true });
    expect(points(bomb)).toEqual([0, 0, 0, 0]);
  });
});

describe("a look for a piece", () => {
  const dealt = (): GemState => game(4, 1, [G(4), B(-6), D(5), S(3)], [G(5), S(4), B(-4)], D(6));

  it("shows one card of the buyers' slots or the trash to whoever paid, once a game: after the deal by anyone, then on one's own turn before exchanging", () => {
    const state = act(dealt(), 3, { type: "peek", at: toBuyer(2) });
    const exchanging = allReady(state);

    expect(state.tallies.map((each) => [each.pieces, each.peeks])).toEqual([[2, 0], [3, 0], [2, 1], [3, 0]]);
    expect(viewFor(state, 3, config).peeked).toEqual([{ at: toBuyer(2), card: B(-4) }]);
    expect(viewFor(state, 2, config).peeked).toEqual([]);
    expect(state.history.at(-1)).toEqual({ type: "peek", round: 1, player: 3, at: toBuyer(2) });
    expect(refusal(state, 3, { type: "peek", at: TRASH })).toBe("peek-used");
    // put away once the exchanges begin; another's turn is not one's own
    expect(viewFor(exchanging, 3, config).peeked).toEqual([]);
    expect(refusal(exchanging, 2, { type: "peek", at: TRASH })).toBe("no-peek");
    expect(viewFor(act(exchanging, 1, { type: "peek", at: TRASH }), 1, config).peeked).toEqual([{ at: TRASH, card: D(6) }]);
    expect(refusal(act(exchanging, 1, { type: "exchange", with: TRASH }), 1, { type: "peek", at: toBuyer(0) })).toBe("no-peek");
  });

  it("is kept for each of two players who look after the same deal, costs a piece one has, and is never of a player's card", () => {
    const two = act(act(dealt(), 3, { type: "peek", at: TRASH }), 2, { type: "peek", at: toBuyer(0) });
    const broke = { ...dealt(), tallies: dealt().tallies.map((each) => ({ ...each, pieces: 0 })) };

    expect(viewFor(two, 3, config).peeked).toEqual([{ at: TRASH, card: D(6) }]);
    expect(viewFor(two, 2, config).peeked).toEqual([{ at: toBuyer(0), card: G(5) }]);
    expect(refusal(broke, 3, { type: "peek", at: TRASH })).toBe("no-pieces");
    expect(parseAction({ type: "peek", at: { to: "player", player: 1 } })).toBeNull();
    expect(refusal(dealt(), 3, { type: "peek", at: toBuyer(5) })).toBe("bad-target");
  });
});

describe("a round's count", () => {
  /** A round of four in which nothing changes hands for good: each exchanges with player 1 or 2 and back. */
  function counted(hands: Card[], buyers: Card[], trash: Card, first = 1): GemState {
    let state = allReady(game(4, first, hands, buyers, trash));
    while (state.phase !== "reveal") state = lapse(lapse(state));
    return state;
  }

  it("gives a gem its number for every gem of its kind in the buyers' slots, and takes a bomb's number off", () => {
    // the room's own exchanges: everyone's card goes to the trash and round, so the hands are set to what is counted
    const base = allReady(game(4, 1, [S(3), G(4), B(-4), D(6)], [S(4), S(2), G(5)], B(-6)));
    const last = { ...base, turnAt: base.sequence.length - 1 };

    const state = act(act(last, turnOf(last)!, { type: "exchange", with: toPlayer(2) }), 1, { type: "ready" });

    // player 1 now holds gold 4 and player 2 silver 3: two silvers in the slots, one gold
    expect(state.shown?.lines.map((line) => [line.card, line.points])).toEqual([[G(4), 4], [S(3), 6], [B(-4), -4], [D(6), 0]]);
    expect(points(state)).toEqual([4, 6, -4, 0]);
    expect(state.shown).toMatchObject({ round: 1, buyers: [S(4), S(2), G(5)], trash: B(-6) });
    expect([state.phase, state.until]).toEqual(["reveal", T0 + config.revealSeconds * 1000]);
  });

  it("gives a piece for points made with a diamond, and none for a diamond that made no points", () => {
    /** The last exchange of a round: player 1 takes player 2's gold and leaves them the diamond 6. */
    const lastTurn = (buyers: Card[]): GemState => {
      const base = allReady(game(4, 1, [G(4), D(6), S(3), S(4)], buyers, B(-4)));
      const last = { ...base, turnAt: base.sequence.length - 1 };
      return act(act(last, 1, { type: "exchange", with: toPlayer(2) }), 1, { type: "ready" });
    };

    const scored = lastTurn([D(5), G(5), B(-6)]);
    const unscored = lastTurn([G(5), C(2), B(-6)]);

    expect(scored.shown?.lines.map((line) => [line.points, line.pieces])).toEqual([[6, 1], [4, 0], [0, 0], [0, 0]]);
    // (player 1 paid a piece to be first)
    expect(scored.tallies.map((each) => each.pieces)).toEqual([config.startPieces - 1 + config.diamondPieces, config.startPieces, config.startPieces, config.startPieces]);
    expect(unscored.shown?.lines.map((line) => [line.points, line.pieces])).toEqual([[0, 0], [4, 0], [0, 0], [0, 0]]);
  });

  it("makes whoever holds the -6 first in the next round, else whoever holds the -4, else the same player again", () => {
    const next = (hands: Card[], buyers: Card[], trash: Card): [number | null, number | null] => {
      const state = counted(hands, buyers, trash, 3);
      const six = state.hands.find((each) => each.card.value === -6)?.player ?? null;
      const four = state.hands.find((each) => each.card.value === -4)?.player ?? null;
      return [state.shown!.next, six ?? four ?? 3];
    };

    const both = next([B(-6), B(-4), S(3), S(4)], [D(5), D(6), G(4)], G(5));
    const none = next([D(5), D(6), S(3), S(4)], [B(-6), G(5), G(4)], B(-4));
    expect(both[0]).toBe(both[1]);
    expect(none[0]).toBe(none[1]);
    // only the -4 is held: its holder is next, whoever that came to be
    const base = allReady(game(4, 3, [S(3), G(4), B(-4), D(6)], [S(4), B(-6), G(5)], S(2)));
    const last = { ...base, turnAt: base.sequence.length - 1 };
    const shown = act(act(last, 3, { type: "exchange", with: toPlayer(2) }), 3, { type: "ready" });
    expect([hand(shown, 2), shown.shown?.next]).toEqual([B(-4), 2]);
  });

  it("keeps the first player where both bombs lie on the table, whoever is first in the order", () => {
    // player 3 is first and makes the round's last exchange, with a player: no bomb leaves the table
    const base = allReady(game(4, 3, [S(3), G(4), D(5), D(6)], [S(4), B(-6), G(5)], B(-4)));
    const last = { ...base, turnAt: base.sequence.length - 1 };

    const shown = act(act(last, 3, { type: "exchange", with: toPlayer(2) }), 3, { type: "ready" });

    expect(shown.hands.some((each) => each.card.kind === "bomb")).toBe(false);
    expect([shown.order[0], shown.shown?.next]).toEqual([1, 3]);
  });

  it("tells the points only then: what a bomb taken gave is in no view while the round is played", () => {
    const state = act(allReady(game(4, 1, [G(4), B(-6), D(5), S(3)], [G(5), S(4), B(-4)], D(6))), 1, { type: "exchange", with: toPlayer(2) });

    expect(points(state)).toEqual([0, 3, 0, 0]);
    for (const viewer of [1, 2, null]) {
      const view = viewFor(state, viewer, config);
      expect(view.standings.map((each) => each.points)).toEqual([0, 0, 0, 0]);
      expect(JSON.stringify(view)).not.toContain('"taken"');
    }
  });

  it("is followed by the next round, dealt from its own cards with the new first player, when everyone is ready or the time runs out; and by the end after the last", () => {
    let state = allReady(game(4, 1, [S(3), G(4), B(-4), D(6)], [S(4), S(2), G(5)], B(-6)));
    while (state.phase !== "reveal") state = lapse(lapse(state));
    const next = state.shown!.next;

    const second = allReady(state);

    expect([second.phase, second.round, second.first, second.shown]).toEqual(["look", 2, next, null]);
    expect(lapse(state)).toMatchObject({ phase: "look", round: 2 });
    let last = second;
    while (last.phase !== "ended") last = lapse(last);
    expect(last.history.at(-1)).toEqual({ type: "ended", reason: "rounds" });
    expect(last.history.filter((event) => event.type === "shown")).toHaveLength(config.rounds);
    expect(last.finals).toHaveLength(4);
  });
});

describe("what a player is sent", () => {
  const dealt = (): GemState => game(4, 1, [G(4), B(-6), D(5), S(3)], [G(5), S(4), B(-4)], D(6));
  /** Every card a view names, as text. */
  const cardsIn = (view: object): string[] => JSON.stringify(view).match(/\{"kind":"[a-z]+","value":-?\d+\}/g) ?? [];

  it("has their own card after the deal and on their own turn, and no card of anyone else's nor of the slots", () => {
    const looking = dealt();
    const exchanging = allReady(looking);

    for (const player of looking.players) expect(cardsIn(viewFor(looking, player, config))).toEqual([JSON.stringify(hand(looking, player))]);
    expect(cardsIn(viewFor(looking, null, config))).toEqual([]);
    // the exchanges have begun: only whoever's turn it is may look
    expect(cardsIn(viewFor(exchanging, 1, config))).toEqual([JSON.stringify(G(4))]);
    for (const player of [2, 3, 4, null]) expect(cardsIn(viewFor(exchanging, player, config))).toEqual([]);
    expect(viewFor(exchanging, 1, config)).toMatchObject({ mine: G(4), bomb: false, turn: 1 });
    expect(viewFor(swap(exchanging, toPlayer(3)), 2, config)).toMatchObject({ mine: B(-6), bomb: true });
  });

  it("does not tell a player what card they were left with when theirs was taken, until their own turn", () => {
    const state = act(allReady(dealt()), 1, { type: "exchange", with: toPlayer(3) });

    expect(viewFor(state, 3, config).mine).toBeNull();
    expect(cardsIn(viewFor(state, 3, config))).toEqual([]);
    expect(cardsIn(viewFor(state, 1, config))).toEqual([JSON.stringify(D(5))]);
  });

  it("tells each player whose secret buddy they are and nothing more of the ring, and no watcher anything, until the game is over", () => {
    const state = dealt();

    expect(state.players.map((player) => viewFor(state, player, config).buddyOf)).toEqual([2, 3, 4, 1]);
    expect(viewFor(state, null, config).buddyOf).toBeNull();
    for (const player of [...state.players, null]) expect(viewFor(state, player, config).finals).toBeNull();
    let over = state;
    while (over.phase !== "ended") over = lapse(over);
    expect(viewFor(over, null, config).finals?.map((line) => [line.player, line.buddy]).sort()).toEqual([[1, 4], [2, 1], [3, 2], [4, 3]]);
  });

  it("is read off the wire strictly", () => {
    expect(parseAction({ type: "bid", pieces: 2, more: 1 })).toEqual({ type: "bid", pieces: 2 });
    expect(parseAction({ type: "ready" })).toEqual({ type: "ready" });
    expect(parseAction({ type: "exchange", with: { to: "player", player: 3 } })).toEqual({ type: "exchange", with: toPlayer(3) });
    expect(parseAction({ type: "exchange", with: { to: "buyer", slot: 0, x: 1 } })).toEqual({ type: "exchange", with: toBuyer(0) });
    expect(parseAction({ type: "peek", at: { to: "trash" } })).toEqual({ type: "peek", at: TRASH });
    for (const bad of [null, 1, {}, { type: "bid" }, { type: "bid", pieces: -1 }, { type: "bid", pieces: 1.5 }, { type: "exchange" }, { type: "exchange", with: { to: "buyer" } }, { type: "exchange", with: { to: "deck" } }, { type: "look" }]) {
      expect(parseAction(bad)).toBeNull();
    }
  });
});

describe("the end", () => {
  /** A game of four whose players have these points; each is the secret buddy of the next, and the last of the first. */
  const withPoints = (pointsOf: number[]): GemState => {
    const state = game(4, 1);
    return { ...state, tallies: state.tallies.map((tally, at) => ({ ...tally, points: pointsOf[at] })) };
  };

  it("rewards final points of one or more with a piece and of ten or more with two, and nothing below one", () => {
    const rewards = (pointsOf: number[]): [number, number][] => [...finalsOf(withPoints(pointsOf), config)].sort((a, b) => a.player - b.player).map((line) => [line.final, line.reward]);

    // player 1's buddy is player 4, 2's is 1, 3's is 2, 4's is 3
    expect(rewards([2, 5, 1, 0])).toEqual([[0, 0], [10, 2], [5, 1], [0, 0]]);
    expect(rewards([1, 1, 9, -1])).toEqual([[-1, 0], [1, 1], [9, 1], [-9, 0]]);
    expect(rewards([-3, -4, 1, 11])).toEqual([[-33, 0], [12, 2], [-4, 0], [11, 2]]);
  });

  it("pays a player the pieces they have more than they started with on top of the reward, and takes nothing for those they spent", () => {
    let state = withPoints([2, 5, 1, 0]);
    while (state.phase !== "ended") state = lapse(state);
    const more = { ...state, tallies: state.tallies.map((tally) => ({ ...tally, pieces: config.startPieces + (tally.player === 2 ? 2 : tally.player === 3 ? -2 : 0) })) };
    const rewardOf = (player: number): number => more.finals!.find((line) => line.player === player)!.reward;

    const paid = new Map(piecesOf(more, config)!.map((line) => [line.player, line.pieces]));

    expect([paid.get(1), paid.get(2), paid.get(3), paid.get(4)]).toEqual([rewardOf(1), rewardOf(2) + 2, rewardOf(3), rewardOf(4)]);
  });

  it("ranks by final points, pays the show's reward and what a player has more than they started with, and nothing for a game cut short", () => {
    let state = game(4, 1);
    while (state.phase !== "ended") state = lapse(state);
    const finals = state.finals!;

    expect(standingsOf(state).map((each) => [each.player, each.points, each.place])).toEqual(finals.map((line) => [line.player, line.final, line.place]));
    for (const line of finals) {
      const own = state.tallies.find((each) => each.player === line.player)!;
      expect(line.final).toBe(own.points * state.tallies.find((each) => each.player === line.buddy)!.points);
      expect(piecesOf(state, config)?.find((each) => each.player === line.player)?.pieces).toBe(line.reward + Math.max(0, own.pieces - config.startPieces));
    }
    expect(piecesOf(game(4, 1), config)).toBeNull();
    const cut = withThere(game(4, 1), (player) => player === 1, T0, config);
    expect(cut.history.at(-1)).toEqual({ type: "ended", reason: "left" });
    expect([cut.finals, piecesOf(cut, config)]).toEqual([null, null]);
  });
});

describe("someone who has left the room", () => {
  const without = (state: GemState, ...left: number[]): GemState => withThere(state, (player) => !left.includes(player), T0, config);
  const dealt = (): GemState => game(4, 1, [G(4), B(-6), D(5), S(3)], [G(5), S(4), B(-4)], D(6));

  it("is not waited for: the room exchanges for them at once, and their word is not needed to go on", () => {
    const state = without(allReady(dealt()), 1);
    const looking = without(act(act(dealt(), 2, { type: "ready" }), 3, { type: "ready" }), 4);

    expect(without(state, 1)).toBe(state);
    expect([turnOf(state), state.history.at(-1)]).toEqual([2, { type: "exchange", round: 1, player: 1, with: TRASH, auto: true }]);
    expect(refusal(state, 2, { type: "exchange", with: toPlayer(1) })).toBe("bad-target");
    expect(looking.phase).toBe("look");
    expect(act(looking, 1, { type: "ready" }).phase).toBe("exchange");
  });

  it("bids nothing in an auction, which is settled once everyone else has bid", () => {
    const players = [1, 2, 3, 4];
    const created = createGame({ players, seed: 1, now: T0, order: players, ring: players }, config);
    if (!created.ok) throw new Error("refused");
    const state = [1, 2, 3].reduce((next, player) => act(next, player, { type: "bid", pieces: player }), created.state);

    expect(state.phase).toBe("auction");
    expect(without(state, 4)).toMatchObject({ phase: "look", first: 3 });
  });
});
