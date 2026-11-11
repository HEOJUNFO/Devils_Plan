import { describe, expect, it } from "vitest";
import shipped from "../../../src/shared/games/under-thirteen/config.json";
import {
  abandon,
  applyAction,
  applyTimeout,
  askedOf,
  chipSet,
  closeIfLeft,
  createGame,
  deadline,
  isValidConfig,
  moveOn,
  orderOf,
  parseAction,
  roundsOf,
  shiftClock,
  standingsOf,
  sumOf,
  turnOf,
  viewFor,
  type Chip,
  type Penalty,
  type Stand,
  type Submission,
  type UnderConfig,
  type UnderState,
} from "../../../src/shared/games/under-thirteen/rules";
import { MATCH, TOTALS } from "./documented";

const config: UnderConfig = shipped;

/** The time the fixtures start at, in ms since the epoch. */
const T0 = 1_800_000_000_000;
const SUBMIT_MS = config.submitSeconds * 1000;
const CHIPS_MS = config.chipsSeconds * 1000;
const TURN_MS = config.turnSeconds * 1000;
/** How long a rock nobody is asked about waits to be placed. */
const PLACE_MS = config.placeSeconds * 1000;
const PAUSE_MS = config.pauseSeconds * 1000;
const LIMIT = config.limit;
/** How many rounds one set of cards lasts, and how many the game. */
const PER_SET = config.cards.length;
const ROUNDS = PER_SET * config.sets;
/** How many seeds a property of every game is tried on. */
const SEEDS = 100;

/** What a player puts in: a card and a chip. */
type Pick = [card: number, chip: Chip];

/** A game of `count` players, numbered from nought, started at `T0`, with player `first` holding the marker. */
function game(count: number, first = 0, seed = 7): UnderState {
  const created = createGame({ players: Array.from({ length: count }, (_, n) => n), seed, now: T0 }, config);
  if (!created.ok) throw new Error(`fixture game refused: ${created.reason}`);
  return { ...created.state, first };
}

/** Everyone still holds a place in the room. */
const everyone = (): boolean => true;

/** `player` puts in `pick`; the test expects it to be taken. */
function submit(state: UnderState, player: number, pick: Pick, now = T0 + 1000): UnderState {
  const result = applyAction(state, player, { type: "submit", card: pick[0], chip: pick[1] }, now, config);
  if (!result.ok) throw new Error(`fixture submission refused: ${result.reason}`);
  return result.state;
}

/** Everyone puts in what `picks` says, in player order, and the chips are shown. */
function allIn(state: UnderState, picks: Pick[], now = T0 + 1000): UnderState {
  const submitted = picks.reduce((next, pick, player) => submit(next, player, pick, now), state);
  return moveOn(submitted, everyone, now, config);
}

/** The same, with the cards shown too: the first rock is about to be placed. */
function placing(state: UnderState, picks: Pick[]): UnderState {
  const chips = allIn(state, picks);
  return applyTimeout(chips, chips.until, config);
}

/** `player` has their rock placed, half a second before the game would go on without them; the test expects it to be taken. */
function place(state: UnderState, player: number, stand?: Stand, now = state.until - 500): UnderState {
  const result = applyAction(state, player, stand === undefined ? { type: "place" } : { type: "place", stand }, now, config);
  if (!result.ok) throw new Error(`fixture placing refused: ${result.reason}`);
  return result.state;
}

/** `player` passes, half a second before their time is up; the test expects it to be taken. */
function pass(state: UnderState, player: number): UnderState {
  const result = applyAction(state, player, { type: "pass" }, state.until - 500, config);
  if (!result.ok) throw new Error(`fixture pass refused: ${result.reason}`);
  return result.state;
}

/** The game one step of its clock on: at the moment the phase or turn it is in ends. */
function step(state: UnderState): UnderState {
  return applyTimeout(state, state.until, config);
}

/** The game with these rocks on its stands. */
function standing(state: UnderState, stands: Partial<Record<Stand, number[]>>): UnderState {
  return { ...state, stands: { red: [], green: [], blue: [], ...stands } };
}

/** What four players put in for most fixtures: a rainbow chip, two fives, a three. */
const FOUR: Pick[] = [
  [3, "red"],
  [5, "green"],
  [5, "blue"],
  [1, "rainbow"],
];

const range = (count: number): number[] => Array.from({ length: count }, (_, n) => n);

describe("무거운 13: the numbers of the game", () => {
  it("ships the show's numbers: thirteen, cards 0 to 6, two chips of each colour and a rainbow one, two sets, three minutes", () => {
    expect(isValidConfig(config)).toBe(true);
    expect(config.limit).toBe(13);
    expect(config.cards).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(chipSet(config)).toEqual(["red", "red", "green", "green", "blue", "blue", "rainbow"]);
    expect(roundsOf(config)).toEqual({ perSet: 7, total: 14 });
    expect(config.submitSeconds).toBe(180);
  });

  it.each<[string, Partial<UnderConfig>]>([
    ["more cards than chips", { cards: [0, 1, 2, 3, 4, 5, 6, 7] }],
    ["more chips than cards", { rainbowChips: 2 }],
    ["a rock that clears a stand by itself", { limit: 6 }],
    ["no card at all", { cards: [], chipsOfEach: 0, rainbowChips: 0 }],
    ["a card below nought", { cards: [-1, 1, 2, 3, 4, 5, 6] }],
    ["no set", { sets: 0 }],
    ["no time to put anything in", { submitSeconds: 0 }],
    ["no time for a turn", { turnSeconds: 0 }],
    ["half a second before a rock nobody is asked about", { placeSeconds: 0.5 }],
    ["less than no time before it", { placeSeconds: -1 }],
    ["half a limit", { limit: 12.5 }],
  ])("refuses %s", (_what, change) => {
    expect(isValidConfig({ ...config, ...change })).toBe(false);
  });
});

describe("무거운 13: starting", () => {
  it("gives every player the whole set, leaves the stands bare, and opens the first round", () => {
    const state = game(4);

    expect(state.phase).toBe("submit");
    expect(state.round).toBe(1);
    expect(state.hands).toEqual(range(4).map((player) => ({ player, cards: [0, 1, 2, 3, 4, 5, 6], chips: chipSet(config) })));
    expect(state.stands).toEqual({ red: [], green: [], blue: [] });
    expect(state.penalties).toEqual(range(4).map((player) => ({ player, points: 0, last: 0 })));
    expect(state.until).toBe(T0 + SUBMIT_MS);
    expect(deadline(state)).toBe(T0 + SUBMIT_MS);
  });

  it("gives the first-player marker to one of the players, by the seed, and over many games to each of them", () => {
    const firsts = range(SEEDS).map((seed) => {
      const created = createGame({ players: [0, 1, 2, 3], seed, now: T0 }, config);
      if (!created.ok) throw new Error(created.reason);
      expect(created.state.history).toEqual([{ type: "round", round: 1, first: created.state.first }]);
      return created.state.first;
    });

    expect([...new Set(firsts)].sort()).toEqual([0, 1, 2, 3]);
    expect(createGame({ players: [0, 1, 2, 3], seed: 5, now: T0 }, config)).toEqual(createGame({ players: [0, 1, 2, 3], seed: 5, now: T0 }, config));
  });

  it.each([
    ["one player alone", [0], "too-few"],
    ["nobody", [], "too-few"],
    ["two players with one number", [0, 0], "bad-players"],
    ["a player numbered below nought", [-1, 0], "bad-players"],
  ])("refuses %s", (_what, players, reason) => {
    expect(createGame({ players, seed: 1, now: T0 }, config)).toEqual({ ok: false, reason });
  });

  it("refuses numbers that cannot be played", () => {
    expect(createGame({ players: [0, 1], seed: 1, now: T0 }, { ...config, rainbowChips: 3 })).toEqual({ ok: false, reason: "bad-config" });
  });
});

describe("무거운 13: putting in a card and a chip", () => {
  it("takes the card and the chip out of the player's hand, and keeps them from everyone until they are shown", () => {
    const state = submit(game(3), 1, [5, "green"]);

    expect(state.hands[1]).toEqual({ player: 1, cards: [0, 1, 2, 3, 4, 6], chips: ["red", "red", "green", "blue", "blue", "rainbow"] });
    expect(state.submissions).toEqual([{ player: 1, card: 5, chip: "green", forced: false }]);
    expect(state.phase).toBe("submit");
    expect(state.history).toEqual(game(3).history);
  });

  it("leaves the game it was given as it was", () => {
    const state = game(3);
    const before = structuredClone(state);

    submit(state, 1, [5, "green"]);

    expect(state).toEqual(before);
  });

  it("takes one from each player a round, and it stands", () => {
    const state = submit(game(3), 1, [5, "green"]);

    expect(applyAction(state, 1, { type: "submit", card: 4, chip: "red" }, T0 + 2000, config)).toEqual({ ok: false, reason: "already-submitted" });
  });

  it.each([
    ["a card the player does not hold", { type: "submit", card: 7, chip: "red" }, "not-held"],
    ["a chip that is no chip", { type: "submit", card: 3, chip: "purple" }, "bad-action"],
    ["a card with no chip", { type: "submit", card: 3 }, "bad-action"],
    ["something that is no move", { type: "peek" }, "bad-action"],
    ["a rock placed before the cards are shown", { type: "place" }, "not-placing"],
    ["a pass before the cards are shown", { type: "pass" }, "not-placing"],
  ])("refuses %s", (_what, action, reason) => {
    expect(applyAction(game(3), 0, action as never, T0 + 1000, config)).toEqual({ ok: false, reason });
  });

  it("refuses a card or a chip already used in an earlier round", () => {
    let state = placing(game(2), [
      [5, "green"],
      [2, "red"],
    ]);
    state = place(place(state, 0), 1);
    state = step(state);

    expect(state.round).toBe(2);
    expect(applyAction(state, 0, { type: "submit", card: 5, chip: "red" }, state.until - 1000, config)).toEqual({ ok: false, reason: "not-held" });
    expect(applyAction(state, 1, { type: "submit", card: 3, chip: "red" }, state.until - 1000, config).ok).toBe(true);
    expect(applyAction(submit(submit(state, 1, [3, "red"], state.until - 1000), 0, [4, "green"], state.until - 1000), 1, { type: "submit", card: 4, chip: "red" }, state.until - 1000, config)).toEqual({
      ok: false,
      reason: "already-submitted",
    });
  });

  it("refuses a chip of a colour the player has used up, and takes nothing from their hand", () => {
    // two rounds on red: both of player 0's red chips are gone
    let state = game(2);
    for (const [mine, theirs] of [
      [5, 2],
      [4, 1],
    ]) {
      state = placing(state, [
        [mine, "red"],
        [theirs, "green"],
      ]);
      for (let turn = turnOf(state); turn !== null; turn = turnOf(state)) state = place(state, turn);
      state = step(state);
    }
    const before = structuredClone(state.hands[0]);

    expect(state.round).toBe(3);
    expect(before.chips).toEqual(["green", "green", "blue", "blue", "rainbow"]);
    expect(applyAction(state, 0, { type: "submit", card: 3, chip: "red" }, state.until - 1000, config)).toEqual({ ok: false, reason: "not-held" });
    expect(state.hands[0]).toEqual(before);
  });

  it("takes no card once everything is in: not while the chips are shown, nor while rocks are placed", () => {
    const chips = allIn(game(4, 1), FOUR);
    const rocks = step(chips);

    expect(rocks.phase).toBe("place");
    for (const state of [chips, rocks]) {
      expect(applyAction(state, 0, { type: "submit", card: 6, chip: "green" }, state.until - 500, config)).toEqual({ ok: false, reason: "not-submitting" });
    }
  });

  it("takes nothing from someone who is not playing, and nothing once the game is over", () => {
    expect(applyAction(game(3), 7, { type: "submit", card: 3, chip: "red" }, T0 + 1000, config)).toEqual({ ok: false, reason: "not-playing" });
    expect(applyAction(abandon(game(3)), 0, { type: "submit", card: 3, chip: "red" }, T0 + 1000, config)).toEqual({ ok: false, reason: "game-over" });
  });

  it("waits while someone who is there has not put theirs in", () => {
    const state = submit(submit(game(3), 0, [3, "red"]), 1, [5, "green"]);

    expect(moveOn(state, everyone, T0 + 2000, config)).toBe(state);
  });

  it("shows the chips, and not yet the cards, as soon as everyone has put theirs in", () => {
    const now = T0 + 5000;

    const state = allIn(game(4), FOUR, now);

    expect(state.phase).toBe("chips");
    expect(state.until).toBe(now + CHIPS_MS);
    expect(state.history.at(-1)).toEqual({
      type: "chips",
      round: 1,
      chips: [
        { player: 0, chip: "red" },
        { player: 1, chip: "green" },
        { player: 2, chip: "blue" },
        { player: 3, chip: "rainbow" },
      ],
    });
  });

  it("puts in for those who have gone, by chance from what they hold, and does not wait for them", () => {
    const cards = new Set<number>();
    const chips = new Set<Chip>();
    for (let seed = 0; seed < SEEDS; seed++) {
      const state = moveOn(submit(game(3, 0, seed), 0, [3, "red"]), (player) => player === 0, T0 + 2000, config);
      const theirs = state.submissions.filter((each) => each.forced);

      expect(state.phase, `seed ${seed}`).toBe("chips");
      expect(theirs.map((each) => each.player)).toEqual([1, 2]);
      for (const each of theirs) {
        expect(config.cards).toContain(each.card);
        expect(chipSet(config)).toContain(each.chip);
        expect(state.hands[each.player].cards).toHaveLength(PER_SET - 1);
        expect(state.hands[each.player].cards).not.toContain(each.card);
        expect(state.hands[each.player].chips).toHaveLength(PER_SET - 1);
      }
      cards.add(theirs[0].card);
      chips.add(theirs[0].chip);
    }
    // by chance: over the games, every card and every kind of chip is put in for player 1 at some time
    expect([...cards].sort((a, b) => a - b)).toEqual(config.cards);
    expect(chips.size).toBe(4);
  });

  it("puts in for everyone who has not when the three minutes are up", () => {
    const state = step(submit(game(3), 0, [3, "red"]));

    expect(state.phase).toBe("chips");
    expect(state.until).toBe(T0 + SUBMIT_MS + CHIPS_MS);
    expect(state.submissions.map((each) => [each.player, each.forced])).toEqual([
      [0, false],
      [1, true],
      [2, true],
    ]);
  });

  it("changes nothing before the time is up", () => {
    const state = game(3);

    expect(applyTimeout(state, T0 + SUBMIT_MS - 1, config)).toBe(state);
  });

  it.each([null, 7, "submit", { type: "submit", card: "3", chip: "red" }, { type: "place", stand: "purple" }, { card: 3, chip: "red" }])(
    "reads %j off the wire as nothing",
    (raw) => {
      expect(parseAction(raw)).toBeNull();
    },
  );

  it("reads a submission, a placing and a pass off the wire", () => {
    expect(parseAction({ type: "submit", card: 3, chip: "rainbow", more: true })).toEqual({ type: "submit", card: 3, chip: "rainbow" });
    expect(parseAction({ type: "place" })).toEqual({ type: "place" });
    expect(parseAction({ type: "place", stand: "blue" })).toEqual({ type: "place", stand: "blue" });
    expect(parseAction({ type: "pass" })).toEqual({ type: "pass" });
  });
});

describe("무거운 13: the order of placing", () => {
  /** What players 0, 1, 2 … put in, as submissions. */
  function submissions(picks: Pick[]): Submission[] {
    return picks.map(([card, chip], player) => ({ player, card, chip, forced: false }));
  }

  it("places the higher card first", () => {
    expect(orderOf([0, 1, 2], 0, submissions([[1, "red"], [6, "red"], [4, "blue"]]))).toEqual([1, 2, 0]);
  });

  it("places a rainbow chip before any card, however high", () => {
    expect(orderOf([0, 1, 2], 0, submissions([[6, "red"], [0, "rainbow"], [5, "blue"]]))).toEqual([1, 0, 2]);
  });

  it("takes players with the same card clockwise from the first player, who comes before the others", () => {
    const same = submissions([[4, "red"], [4, "green"], [4, "blue"], [4, "red"]]);

    expect(orderOf([0, 1, 2, 3], 0, same)).toEqual([0, 1, 2, 3]);
    expect(orderOf([0, 1, 2, 3], 2, same)).toEqual([2, 3, 0, 1]);
  });

  it("places the higher card first among several rainbow chips too, whoever holds the marker", () => {
    const picks = submissions([[0, "rainbow"], [5, "red"], [6, "rainbow"], [2, "rainbow"]]);

    // the marker is with player 3, whose rainbow two still comes after player 2's rainbow six
    expect(orderOf([0, 1, 2, 3], 3, picks)).toEqual([2, 3, 0, 1]);
  });

  it("takes rainbow chips with the same card clockwise from the first player", () => {
    const picks = submissions([[4, "rainbow"], [6, "red"], [4, "rainbow"], [4, "rainbow"]]);

    expect(orderOf([0, 1, 2, 3], 2, picks)).toEqual([2, 3, 0, 1]);
    expect(orderOf([0, 1, 2, 3], 3, picks)).toEqual([3, 0, 2, 1]);
  });

  it("gives the first rock its whole time from when the cards were shown, however late that was", () => {
    const chips = allIn(game(4, 1), FOUR);

    const state = applyTimeout(chips, chips.until + 3000, config);

    expect(state.phase).toBe("place");
    expect(state.until).toBe(chips.until + 3000 + TURN_MS);
  });

  it("starts from the first player's seat when they are not among those level", () => {
    const picks = submissions([[2, "red"], [6, "green"], [2, "blue"], [2, "red"]]);

    // the marker is with player 1, whose six goes first; the twos follow clockwise from that seat
    expect(orderOf([0, 1, 2, 3], 1, picks)).toEqual([1, 2, 3, 0]);
  });

  it("shows the cards when the chips have been seen, with the order worked out and the first rock to be placed", () => {
    const chips = allIn({ ...game(4), first: 1 }, FOUR);

    const state = applyTimeout(chips, chips.until, config);

    expect(state.phase).toBe("place");
    expect(state.order).toEqual([3, 1, 2, 0]);
    expect(state.queue).toEqual([3, 1, 2, 0]);
    expect(turnOf(state)).toBe(3);
    expect(state.until).toBe(chips.until + TURN_MS);
    expect(state.history.at(-1)).toEqual({
      type: "cards",
      round: 1,
      cards: [
        { player: 0, card: 3 },
        { player: 1, card: 5 },
        { player: 2, card: 5 },
        { player: 3, card: 1 },
      ],
      order: [3, 1, 2, 0],
    });
  });
});

describe("무거운 13: placing a rock", () => {
  it("places a rock on the stand of its chip, whatever stand is asked for, and moves to the next player", () => {
    const state = place(place(placing(game(4, 1), FOUR), 3, "red"), 1, "blue");

    expect(state.stands).toEqual({ red: [1], green: [5], blue: [] });
    expect(state.placements).toEqual([
      { player: 3, stand: "red", weight: 1, sum: 1, cleared: 0, passed: false, forced: false },
      { player: 1, stand: "green", weight: 5, sum: 5, cleared: 0, passed: false, forced: false },
    ]);
    expect(turnOf(state)).toBe(2);
    expect(state.history.at(-1)).toMatchObject({ type: "placed", round: 1, player: 1, stand: "green", weight: 5 });
  });

  it("gives each player their whole time for their own turn", () => {
    const first = placing(game(4, 1), FOUR);
    const at = first.until - 3000;

    const state = place(first, 3, "red", at);

    expect(state.until).toBe(at + TURN_MS);
  });

  it("makes whoever put in the rainbow chip say which stand", () => {
    const state = placing(game(4, 1), FOUR);

    expect(applyAction(state, 3, { type: "place" }, state.until - 1000, config)).toEqual({ ok: false, reason: "choose-stand" });
    expect(place(state, 3, "blue").stands.blue).toEqual([1]);
  });

  it("takes a rock only from the player whose rock it is", () => {
    const state = placing(game(4, 1), FOUR);

    expect(applyAction(state, 1, { type: "place" }, state.until - 1000, config)).toEqual({ ok: false, reason: "not-your-turn" });
    expect(applyAction(state, 1, { type: "pass" }, state.until - 1000, config)).toEqual({ ok: false, reason: "not-your-turn" });
  });

  it("leaves a stand alone below thirteen", () => {
    const state = place(standing(placing(game(4, 1), FOUR), { red: [6, 5] }), 3, "red");

    expect(state.stands.red).toEqual([6, 5, 1]);
    expect(sumOf(state.stands.red)).toBe(LIMIT - 1);
    expect(state.placements[0]).toMatchObject({ sum: LIMIT - 1, cleared: 0 });
    expect(state.penalties[3]).toEqual({ player: 3, points: 0, last: 0 });
  });

  it("clears a stand that comes to exactly thirteen: its rocks go, the one just placed stays, and its player takes a point for each rock taken", () => {
    const state = place(standing(placing(game(4, 1), FOUR), { red: [6, 4, 2] }), 3, "red");

    expect(state.stands.red).toEqual([1]);
    expect(state.placements[0]).toEqual({ player: 3, stand: "red", weight: 1, sum: LIMIT, cleared: 3, passed: false, forced: false });
    expect(state.penalties[3]).toEqual({ player: 3, points: 3, last: 1 });
    expect(state.taken).toBe(1);
  });

  it("clears a stand that goes over thirteen, and counts a rock of no weight among those taken", () => {
    const before = place(standing(placing(game(4, 1), FOUR), { green: [6, 0, 4, 0] }), 3, "red");

    const state = place(before, 1);

    expect(state.stands.green).toEqual([5]);
    expect(state.placements[1]).toMatchObject({ sum: 15, cleared: 4 });
    expect(state.penalties[1]).toEqual({ player: 1, points: 4, last: 1 });
  });

  it("clears only the stand the rock went on", () => {
    const state = place(standing(placing(game(4, 1), FOUR), { red: [6, 6], green: [6, 6], blue: [6] }), 3, "red");

    expect(state.stands).toEqual({ red: [1], green: [6, 6], blue: [6] });
  });

  it("remembers which penalty was the latest", () => {
    let state = standing(placing(game(4, 1), FOUR), { red: [6, 6], green: [6, 4] });
    state = place(place(state, 3, "red"), 1);

    expect(state.penalties.map((each) => [each.points, each.last])).toEqual([
      [0, 0],
      [2, 2],
      [0, 0],
      [2, 1],
    ]);
  });

  it("ends the round when every rock is placed, and shows its end for a while", () => {
    let state = placing(game(4, 1), FOUR);
    state = place(place(place(state, 3, "red"), 1), 2);
    const at = state.until - 2000;

    const over = place(state, 0, undefined, at);

    expect(over.phase).toBe("pause");
    expect(over.until).toBe(at + PAUSE_MS);
    expect(turnOf(over)).toBeNull();
    expect(over.placements.map((each) => each.player)).toEqual([3, 1, 2, 0]);
  });

  it("asks the last in the order nothing: their rock is placed after a moment, and not as one that came late", () => {
    const third = place(place(placing(game(4, 1), FOUR), 3, "red"), 1);
    const at = third.until - 3000;

    const last = place(third, 2, undefined, at);

    expect(turnOf(last)).toBe(0);
    expect(askedOf(last)).toBe("nothing");
    expect(last.until).toBe(at + PLACE_MS);
    expect(applyTimeout(last, last.until - 1, config)).toBe(last);

    const over = step(last);

    expect(over.phase).toBe("pause");
    expect(over.placements[3]).toEqual({ player: 0, stand: "red", weight: 3, sum: 4, cleared: 0, passed: false, forced: false });
    expect(over.until).toBe(last.until + PAUSE_MS);
  });

  it("takes a rock nobody is asked about from its own player too, without the wait", () => {
    const last = place(place(place(placing(game(4, 1), FOUR), 3, "red"), 1), 2);

    const over = place(last, 0, "blue", last.until - 1500);

    expect(over.phase).toBe("pause");
    expect(over.placements[3]).toMatchObject({ player: 0, stand: "red", forced: false });
  });

  it("places the rock for a player whose time is up: without passing, and a rainbow chip on the stand with the least on it", () => {
    const state = standing(placing(game(4, 1), FOUR), { red: [4], green: [2], blue: [3] });

    const one = step(state);
    const two = step(one);

    expect(one.placements[0]).toEqual({ player: 3, stand: "green", weight: 1, sum: 3, cleared: 0, passed: false, forced: true });
    expect(one.until).toBe(state.until + TURN_MS);
    expect(two.placements[1]).toMatchObject({ player: 1, stand: "green", forced: true, passed: false });
    expect(two.passed).toEqual([]);
  });

  it("takes the first named of the stands with the least on them", () => {
    const state = step(standing(placing(game(4, 1), FOUR), { red: [2], green: [1, 1], blue: [3] }));

    expect(state.placements[0].stand).toBe("red");
  });

  it("places at once the rocks of players who have gone, one after the other", () => {
    const state = placing(game(4, 1), FOUR);

    const moved = moveOn(state, (player) => player === 2 || player === 0, state.until - 1000, config);
    const all = moveOn(state, () => false, state.until - 1000, config);

    expect(moved.placements.map((each) => [each.player, each.forced])).toEqual([
      [3, true],
      [1, true],
    ]);
    expect(turnOf(moved)).toBe(2);
    expect(moveOn(moved, (player) => player === 2 || player === 0, state.until - 1000, config)).toBe(moved);
    expect(all.phase).toBe("pause");
    // the last in the order was never asked anything: theirs is not a rock that came late
    expect(all.placements.map((each) => [each.player, each.forced])).toEqual([
      [3, true],
      [1, true],
      [2, true],
      [0, false],
    ]);
  });
});

describe("무거운 13: what is asked of whoever's rock it is", () => {
  it("asks everyone in the order but the last whether to place it or pass", () => {
    const first = placing(game(4, 1), FOUR);
    const second = place(first, 3, "red");
    const third = place(second, 1);
    const last = place(third, 2);

    expect([first, second, third, last].map(askedOf)).toEqual(["place-or-pass", "place-or-pass", "place-or-pass", "nothing"]);
  });

  it("asks nobody anything while no rock is to be placed", () => {
    const chips = allIn(game(4, 1), FOUR);
    const over = place(place(place(place(step(chips), 3, "red"), 1), 2), 0);

    expect(askedOf(game(2))).toBeNull();
    expect(askedOf(chips)).toBeNull();
    expect(over.phase).toBe("pause");
    expect(askedOf(over)).toBeNull();
  });

  it("asks the last in the order which stand when theirs is the rainbow chip, and gives them a turn's time for it", () => {
    const first = placing(game(2), [
      [2, "rainbow"],
      [5, "rainbow"],
    ]);
    const at = first.until - 4000;

    const last = place(first, 1, "green", at);

    expect(first.order).toEqual([1, 0]);
    expect(askedOf(first)).toBe("place-or-pass");
    expect(turnOf(last)).toBe(0);
    expect(askedOf(last)).toBe("stand");
    expect(last.until).toBe(at + TURN_MS);
    expect(applyAction(last, 0, { type: "pass" }, last.until - 500, config)).toEqual({ ok: false, reason: "cannot-pass" });
    expect(applyAction(last, 0, { type: "place" }, last.until - 500, config)).toEqual({ ok: false, reason: "choose-stand" });
    expect(place(last, 0, "blue").stands).toEqual({ red: [], green: [5], blue: [2] });
  });

  it("lets only the first of two players pass: the other is the last in the order", () => {
    const first = placing(game(2), [
      [5, "green"],
      [2, "red"],
    ]);

    const passed = pass(first, 0);

    expect(askedOf(passed)).toBe("nothing");
    expect(applyAction(passed, 1, { type: "pass" }, passed.until - 500, config)).toEqual({ ok: false, reason: "cannot-pass" });
    expect(step(step(passed)).placements.map((each) => [each.player, each.passed, each.forced])).toEqual([
      [1, false, false],
      [0, true, false],
    ]);
  });
});

describe("무거운 13: passing", () => {
  it("puts the rock of a player who passes after everyone else's, with nothing more asked of them", () => {
    const passed = pass(place(placing(game(4, 1), FOUR), 3, "red"), 1);

    expect(passed.queue).toEqual([2, 0]);
    expect(passed.passed).toEqual([1]);
    expect(turnOf(passed)).toBe(2);
    expect(passed.history.at(-1)).toEqual({ type: "passed", round: 1, player: 1 });

    // player 2 places; player 0, the last in the order, is placed by the room; then the rock passed comes up
    const last = place(passed, 2);
    const back = step(last);

    expect(back.phase).toBe("place");
    expect(turnOf(back)).toBe(1);
    expect(askedOf(back)).toBe("nothing");
    expect(back.until).toBe(last.until + PLACE_MS);

    const over = step(back);

    expect(over.phase).toBe("pause");
    expect(over.stands).toEqual({ red: [1, 3], green: [5], blue: [5] });
    expect(over.placements.map((each) => [each.player, each.passed, each.forced])).toEqual([
      [3, false, false],
      [2, false, false],
      [0, false, false],
      [1, true, false],
    ]);
  });

  it("places the rocks of several who passed in the reverse of the order they passed: the first to pass last", () => {
    let state = pass(pass(pass(placing(game(4, 1), FOUR), 3), 1), 2);
    const turns: (number | null)[] = [];

    expect(state.passed).toEqual([3, 1, 2]);

    // the last in the order, then those who passed, the latest of them first: none of these is asked anything
    for (let n = 0; n < 3; n++) {
      turns.push(turnOf(state));
      expect(askedOf(state)).toBe("nothing");
      state = step(state);
    }

    expect(turns).toEqual([0, 2, 1]);
    expect(turnOf(state)).toBe(3);
    expect(place(state, 3, "red").placements.map((each) => each.player)).toEqual([0, 2, 1, 3]);
  });

  it("lets everyone pass but the last in the order, who places at once", () => {
    const state = pass(pass(pass(placing(game(4, 1), FOUR), 3), 1), 2);

    expect(turnOf(state)).toBe(0);
    expect(askedOf(state)).toBe("nothing");
    expect(applyAction(state, 0, { type: "pass" }, state.until - 500, config)).toEqual({ ok: false, reason: "cannot-pass" });
  });

  it("lets a player pass once a round: a rock that comes up again is not passed again", () => {
    const back = step(place(pass(place(placing(game(4, 1), FOUR), 3, "red"), 1), 2));

    expect(turnOf(back)).toBe(1);
    expect(applyAction(back, 1, { type: "pass" }, back.until - 500, config)).toEqual({ ok: false, reason: "cannot-pass" });
  });

  it("gives whoever comes after a pass their whole time", () => {
    const state = placing(game(4, 1), FOUR);
    const result = applyAction(state, 3, { type: "pass" }, state.until - 5000, config);

    expect(result.ok && result.state.until).toBe(state.until - 5000 + TURN_MS);
  });

  it("gives a moment and no more when a pass leaves only the last in the order", () => {
    const state = place(place(placing(game(4, 1), FOUR), 3, "red"), 1);
    const at = state.until - 5000;

    const result = applyAction(state, 2, { type: "pass" }, at, config);

    expect(result.ok && turnOf(result.state)).toBe(0);
    expect(result.ok && result.state.until).toBe(at + PLACE_MS);
  });

  it("asks someone who passed with the rainbow chip which stand, and nothing else", () => {
    const third = place(place(pass(placing(game(4, 1), FOUR), 3), 1), 2);

    const back = step(third);

    expect(turnOf(back)).toBe(3);
    expect(askedOf(back)).toBe("stand");
    expect(back.until).toBe(third.until + TURN_MS);
    expect(applyAction(back, 3, { type: "place" }, back.until - 500, config)).toEqual({ ok: false, reason: "choose-stand" });
    expect(applyAction(back, 3, { type: "pass" }, back.until - 500, config)).toEqual({ ok: false, reason: "cannot-pass" });
    expect(place(back, 3, "blue").placements.at(-1)).toEqual({ player: 3, stand: "blue", weight: 1, sum: 6, cleared: 0, passed: true, forced: false });
    // not answered in time: it goes on the stand with the least on it, the red one with its three
    expect(step(back).placements.at(-1)).toEqual({ player: 3, stand: "red", weight: 1, sum: 4, cleared: 0, passed: true, forced: true });
  });
});

describe("무거운 13: from round to round", () => {
  /** A round of two players played out: both rocks placed, its end still shown. */
  function played(state: UnderState, picks: [Pick, Pick]): UnderState {
    let next = placing(state, picks);
    for (let turn = turnOf(next); turn !== null; turn = turnOf(next)) {
      const chip = next.submissions.find((each) => each.player === turn)?.chip;
      next = place(next, turn, chip === "rainbow" ? "red" : undefined);
    }
    return next;
  }

  it("opens the next round when a round's end has been shown, with what each player has left", () => {
    const over = played(game(2), [
      [5, "green"],
      [2, "red"],
    ]);

    const state = applyTimeout(over, over.until, config);

    expect(state.phase).toBe("submit");
    expect(state.round).toBe(2);
    expect(state.until).toBe(over.until + SUBMIT_MS);
    expect(state.hands[0]).toEqual({ player: 0, cards: [0, 1, 2, 3, 4, 6], chips: ["red", "red", "green", "blue", "blue", "rainbow"] });
    expect(state.submissions).toEqual([]);
    expect(state.placements).toEqual([]);
    expect(state.stands).toEqual({ red: [2], green: [5], blue: [] });
    expect(state.history.at(-1)).toEqual({ type: "round", round: 2, first: 0 });
  });

  it("gives the marker to whoever last took a penalty in the round", () => {
    const over = played(standing(game(2), { green: [6, 6], red: [6, 6] }), [
      [5, "green"],
      [2, "red"],
    ]);

    expect(over.placements.map((each) => [each.player, each.cleared])).toEqual([
      [0, 2],
      [1, 2],
    ]);
    expect(step(over).first).toBe(1);
  });

  it("leaves the marker where it was when nobody took a penalty", () => {
    const over = played(game(2, 1), [
      [5, "green"],
      [2, "red"],
    ]);

    expect(step(over).first).toBe(1);
  });

  it("deals the same set again after the seventh round, and leaves the stands as they are", () => {
    let state = game(2);
    for (let round = 1; round <= PER_SET; round++) {
      // each player's cards in turn, on a chip each still holds: the rainbow last
      const chips: Chip[] = ["red", "red", "green", "green", "blue", "blue", "rainbow"];
      state = played(state, [
        [round - 1, chips[round - 1]],
        [PER_SET - round, chips[round - 1]],
      ]);
      if (round < PER_SET) state = step(state);
    }
    const stands = structuredClone(state.stands);

    expect(state.hands.map((hand) => [hand.cards, hand.chips])).toEqual([
      [[], []],
      [[], []],
    ]);

    state = step(state);

    expect(state.round).toBe(PER_SET + 1);
    expect(state.hands).toEqual(range(2).map((player) => ({ player, cards: [0, 1, 2, 3, 4, 5, 6], chips: chipSet(config) })));
    expect(state.stands).toEqual(stands);
    expect(state.history.at(-1)).toEqual({ type: "dealt", round: PER_SET + 1 });
  });

  it("is over after fourteen rounds, every card and chip of both sets used, when nobody does anything", () => {
    let state = game(3);
    let steps = 0;
    while (state.phase !== "ended" && steps++ < 500) state = step(state);

    expect(state.phase).toBe("ended");
    expect(state.round).toBe(ROUNDS);
    expect(state.history.at(-1)).toEqual({ type: "ended", reason: "rounds" });
    expect(state.hands.every((hand) => hand.cards.length === 0 && hand.chips.length === 0)).toBe(true);
    expect(deadline(state)).toBeNull();
    expect(step(state)).toBe(state);
  });

  it("takes as many rocks off the stands, over a whole game, as it gives penalty points", () => {
    for (let seed = 0; seed < 20; seed++) {
      let state = game(4, 0, seed);
      let steps = 0;
      while (state.phase !== "ended" && steps++ < 800) state = step(state);
      const placed = ROUNDS * 4;
      const left = sumOf([state.stands.red.length, state.stands.green.length, state.stands.blue.length]);

      expect(sumOf(state.penalties.map((each) => each.points)), `seed ${seed}`).toBe(placed - left);
      expect(Math.max(sumOf(state.stands.red), sumOf(state.stands.green), sumOf(state.stands.blue))).toBeLessThan(LIMIT);
    }
  });

  it("keeps of the past what happened in this round and the one before", () => {
    let state = game(2);
    const chips: Chip[] = ["red", "green", "blue"];
    for (let round = 1; round <= 3; round++) {
      state = played(state, [
        [round, chips[round - 1]],
        [round + 3, chips[round % 3]],
      ]);
      state = step(state);
    }

    const rounds = state.history.filter((event) => event.type === "round").map((event) => (event.type === "round" ? event.round : 0));

    expect(state.round).toBe(4);
    expect(rounds).toEqual([3, 4]);
  });
});

describe("무거운 13: players who go, and the clock", () => {
  it("goes on while two of its players are there, and is over with fewer", () => {
    const state = game(3);

    expect(closeIfLeft(state, (player) => player !== 1)).toBe(state);
    expect(closeIfLeft(state, (player) => player === 2).history.at(-1)).toEqual({ type: "ended", reason: "left" });
    expect(closeIfLeft(state, (player) => player === 2).phase).toBe("ended");
  });

  it("is ended where it stands when nobody is left to go on with it", () => {
    const state = abandon(game(2));

    expect(state.phase).toBe("ended");
    expect(state.history.at(-1)).toEqual({ type: "ended", reason: "abandoned" });
    expect(abandon(state)).toBe(state);
  });

  it("moves its clock on by the time it stood still", () => {
    const state = game(2);

    expect(shiftClock(state, 5000).until).toBe(state.until + 5000);
    expect(shiftClock(state, 0)).toBe(state);
    expect(shiftClock(abandon(state), 5000).until).toBe(state.until);
  });
});

describe("무거운 13: where everyone stands", () => {
  /** A game whose players have these points, last taken at these moments. */
  function penalised(penalties: [points: number, last: number][]): UnderState {
    return { ...game(penalties.length), penalties: penalties.map(([points, last], player): Penalty => ({ player, points, last })) };
  }

  it("puts the fewest penalty points first", () => {
    expect(standingsOf(penalised([[5, 3], [0, 0], [2, 1]])).map((each) => [each.player, each.place])).toEqual([[1, 1], [2, 2], [0, 3]]);
  });

  it("puts whoever took a penalty more recently lower among those with as many points", () => {
    expect(standingsOf(penalised([[4, 9], [4, 2], [4, 5]])).map((each) => [each.player, each.place])).toEqual([[1, 1], [2, 2], [0, 3]]);
  });

  it("has those who never took a penalty share first place", () => {
    expect(standingsOf(penalised([[0, 0], [3, 1], [0, 0]])).map((each) => [each.player, each.place])).toEqual([[0, 1], [2, 1], [1, 3]]);
  });
});

describe("무거운 13: what a player is sent", () => {
  it("sends a player their own hand and what they put in, and of the others only that they have", () => {
    const state = submit(submit(game(3), 0, [3, "red"]), 1, [5, "green"]);

    const mine = viewFor(state, 0, config);
    const theirs = viewFor(state, 2, config);
    const watching = viewFor(state, null, config);

    expect(mine.hand).toEqual({ cards: [0, 1, 2, 4, 5, 6], chips: ["red", "green", "green", "blue", "blue", "rainbow"] });
    expect(mine.mine).toEqual({ card: 3, chip: "red" });
    expect(theirs.mine).toBeNull();
    expect(theirs.hand?.cards).toHaveLength(PER_SET);
    for (const view of [mine, theirs, watching]) {
      expect(view.submitted).toEqual([0, 1]);
      expect(view.chips).toBeNull();
      expect(view.cards).toBeNull();
    }
    expect(watching).toMatchObject({ you: null, hand: null, mine: null });
    // nothing that anyone put in is anywhere in what the others are sent: no card and no chip is named but in a hand
    for (const view of [theirs, watching]) {
      expect(JSON.stringify(view)).not.toContain('"card"');
      expect(JSON.stringify(view)).not.toContain('"chip"');
    }
  });

  it("sends everyone the chips when they are shown, and the cards only after", () => {
    const chips = allIn(game(4, 1), FOUR);
    const cards = step(chips);

    expect(viewFor(chips, 0, config).chips).toEqual(FOUR.map(([, chip], player) => ({ player, chip })));
    expect(viewFor(chips, 0, config).cards).toBeNull();
    expect(viewFor(chips, null, config).cards).toBeNull();
    expect(JSON.stringify(viewFor(chips, 2, config))).not.toContain('"cards":[{');
    expect(viewFor(cards, null, config).cards).toEqual(FOUR.map(([card], player) => ({ player, card })));
  });

  it("says whose rock is to be placed, who has passed and what is on the stands", () => {
    const state = place(pass(placing(game(4, 1), FOUR), 3), 1);

    const view = viewFor(state, 2, config);

    expect(view).toMatchObject({ phase: "place", round: 1, rounds: ROUNDS, perSet: PER_SET, you: 2, first: 1, limit: LIMIT, turn: 2, asked: "place-or-pass" });
    expect(view.players).toEqual([0, 1, 2, 3]);
    expect(view.order).toEqual([3, 1, 2, 0]);
    expect(view.queue).toEqual([2, 0]);
    expect(view.passed).toEqual([3]);
    expect(view.stands).toEqual({ red: [], green: [5], blue: [] });
    expect(view.placements).toHaveLength(1);
    expect(view.standings.map((each) => each.place)).toEqual([1, 1, 1, 1]);
    expect(viewFor(step(place(state, 2)), 2, config)).toMatchObject({ turn: 3, asked: "stand" });
    expect(viewFor(game(4), 2, config)).toMatchObject({ turn: null, asked: null });
  });

  it("takes someone who is not a player of the game for someone watching", () => {
    expect(viewFor(game(2), 7, config)).toMatchObject({ you: null, hand: null, mine: null });
  });

  it("is a copy: changing what was sent changes nothing of the game", () => {
    const state = place(placing(game(4, 1), FOUR), 3, "red");
    const before = structuredClone(state);

    const view = viewFor(state, 0, config);
    view.stands.red.push(9);
    view.hand?.cards.pop();
    view.order.reverse();
    view.queue.pop();
    view.placements[0].cleared = 9;
    view.players.pop();
    view.history.pop();
    view.standings[0].points = 9;

    expect(state).toEqual(before);
  });
});

describe("무거운 13: the show's own match", () => {
  /** What one round came to. */
  interface Played {
    first: number;
    order: number[];
    passes: number[];
    penalties: [player: number, points: number][];
  }

  /**
   * The match played through these rules as its players played it: everyone
   * puts in what they put in, passes where they passed if the rules ask them,
   * and names the stand they named; a rock nobody is asked about is left to
   * the game's clock.
   */
  function replayed(): { rounds: Played[]; state: UnderState } {
    let state = game(MATCH[0].picks.length, MATCH[0].first);
    const rounds: Played[] = [];
    for (const round of MATCH) {
      const first = state.first;
      state = placing(
        state,
        round.picks.map(([card, chip]): Pick => [card, chip]),
      );
      const order = [...state.order];
      const passes: number[] = [];
      for (let turn = turnOf(state); turn !== null; turn = turnOf(state)) {
        const asked = askedOf(state);
        if (asked === "nothing") state = step(state);
        else if (asked === "place-or-pass" && round.passes.includes(turn)) {
          passes.push(turn);
          state = pass(state, turn);
        } else state = place(state, turn, round.picks[turn][2]);
      }
      const penalties = state.placements.filter((each) => each.cleared > 0).map((each): [number, number] => [each.player, each.cleared]);
      rounds.push({ first, order, passes, penalties });
      state = step(state);
    }
    return { rounds, state };
  }

  it("is a whole match: fourteen rounds of seven players, each using every card and chip of a set once", () => {
    const players = MATCH[0].picks.length;

    expect(MATCH).toHaveLength(ROUNDS);
    expect(players).toBe(7);
    for (const set of [MATCH.slice(0, PER_SET), MATCH.slice(PER_SET)]) {
      for (const player of range(players)) {
        expect(set.map((round) => round.picks[player][0]).sort((a, b) => a - b)).toEqual(config.cards);
        expect(set.map((round) => round.picks[player][1]).sort()).toEqual([...chipSet(config)].sort());
      }
    }
  });

  it("is called in the dealer's order, round after round: rainbow chips first, the higher card first, ties clockwise from the marker", () => {
    expect(replayed().rounds.map((round) => round.order)).toEqual(MATCH.map((round) => round.order));
  });

  it("takes every pass its players made: none of them was the last in the order", () => {
    expect(replayed().rounds.map((round) => round.passes)).toEqual(MATCH.map((round) => round.passes));
  });

  it("gives the penalties the dealer gave, to the same players in the same order", () => {
    expect(replayed().rounds.map((round) => round.penalties)).toEqual(MATCH.map((round) => round.penalties));
  });

  it("hands the marker on as the show did: to whoever last took a penalty, and to nobody after the round without one", () => {
    const rounds = replayed().rounds;
    const none = MATCH.findIndex((round) => round.penalties.length === 0);

    expect(rounds.map((round) => round.first)).toEqual(MATCH.map((round) => round.first));
    expect(none).toBeGreaterThan(0);
    expect(rounds[none + 1].first).toBe(rounds[none].first);
  });

  it("comes to the show's penalty points for every player, and is over", () => {
    const state = replayed().state;

    expect(state.phase).toBe("ended");
    expect(state.penalties.map((each) => each.points)).toEqual(TOTALS);
  });

  it("ranks its players by the rule: the fewest points first, and of the two with eleven the one penalised later the lower", () => {
    const standings = standingsOf(replayed().state);

    expect(standings.map((each) => each.player)).toEqual([5, 1, 6, 4, 3, 2, 0]);
    expect(standings.map((each) => each.place)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(standings.filter((each) => each.points === 11).map((each) => each.player)).toEqual([6, 4]);
  });
});
