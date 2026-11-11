import { describe, expect, it } from "vitest";
import { DECK_SIZE, isCard } from "../../../src/shared/games/memory-poker/cards";
import shipped from "../../../src/shared/games/memory-poker/config.json";
import {
  abandon,
  applyAction,
  applyTimeout,
  closeIfLeft,
  createGame,
  deadline,
  groupsFor,
  isValidConfig,
  parseAction,
  shiftClock,
  showIfChosen,
  standingsOf,
  viewFor,
  type PokerConfig,
  type PokerState,
  type Tally,
} from "../../../src/shared/games/memory-poker/rules";
import { DOCUMENTED_ROUNDS, cardsOf, cellOf, type DocumentedRound } from "./documented";

const config: PokerConfig = shipped;

/** The time the fixtures start at, in ms since the epoch. */
const T0 = 1_800_000_000_000;
const MEMORISE_MS = config.memoriseSeconds * 1000;
const CHOOSE_MS = config.chooseSeconds * 1000;
const REVEAL_MS = config.revealSeconds * 1000;
/** How many cells the board has, and how many a choice is. */
const CELLS = config.rows * config.cols;
const PICKS = config.picks;
/** How many seeds a property of every deal is tried on. */
const SEEDS = 200;
/** The most players a room holds (games.json). */
const FULL_ROOM = 16;

/** The documented rounds by their number. */
const TIED_ROUND = DOCUMENTED_ROUNDS[0];
const FOUR_BEATS_FULL_HOUSE = DOCUMENTED_ROUNDS[1];
const TRIPLE_BEATS_TWO_PAIR = DOCUMENTED_ROUNDS[3];

/** A game of `count` players, numbered from nought, started at `T0`. */
function game(count: number, seed = 7): PokerState {
  const created = createGame({ players: Array.from({ length: count }, (_, n) => n), seed, now: T0 }, config);
  if (!created.ok) throw new Error(`fixture game refused: ${created.reason}`);
  return created.state;
}

/** The game one step of its clock on: at the moment the phase it is in ends. */
function step(state: PokerState): PokerState {
  return applyTimeout(state, state.until, config);
}

/** A game of `count` players with the board just turned over. */
function turned(count: number, seed = 7): PokerState {
  return step(game(count, seed));
}

/** `player` picks `cells`; the test expects it to be taken. */
function pick(state: PokerState, player: number, cells: number[]): PokerState {
  const result = applyAction(state, player, { type: "pick", cells }, config);
  if (!result.ok) throw new Error(`fixture pick refused: ${result.reason}`);
  return result.state;
}

/** `player` picks `cells` and makes the choice final. */
function choose(state: PokerState, player: number, cells: number[]): PokerState {
  const result = applyAction(pick(state, player, cells), player, { type: "lock" }, config);
  if (!result.ok) throw new Error(`fixture lock refused: ${result.reason}`);
  return result.state;
}

/** The same game with the board and the shared cards of a documented round in place of its own. */
function dealt(state: PokerState, round: DocumentedRound): PokerState {
  return { ...state, board: cardsOf(round.board.join("")), shared: cardsOf(round.shared) };
}

/** The cells a documented player chose. */
function cellsOf(letters: readonly string[]): number[] {
  return letters.map(cellOf);
}

/** Everyone still holds a place in the room. */
const everyone = (): boolean => true;

/** Every pair of players that meets in `groups`, as "low-high". */
function meetings(groups: number[][]): string[] {
  return groups.flatMap((group) => group.flatMap((a, i) => group.slice(i + 1).map((b) => `${a}-${b}`)));
}

const range = (count: number): number[] => Array.from({ length: count }, (_, n) => n);

describe("기억 포커: the numbers of the game", () => {
  it("ships numbers a game can be made with: the document's board, shared cards and choice", () => {
    expect(isValidConfig(config)).toBe(true);
    expect([config.rows, config.cols, config.shared, config.picks, config.rounds]).toEqual([4, 4, 3, 2, 5]);
  });

  it.each<[string, Partial<PokerConfig>]>([
    ["no round", { rounds: 0 }],
    ["a hand of four cards", { picks: 1 }],
    ["a hand of six cards", { shared: 4 }],
    ["a board with no row", { rows: 0 }],
    ["a board smaller than a choice", { rows: 1, cols: 1 }],
    ["more cards than a deck has", { rows: 10, cols: 5 }],
    ["no time to learn the board", { memoriseSeconds: 0 }],
    ["no time to choose", { chooseSeconds: 0 }],
    ["a result shown for less than no time", { revealSeconds: -1 }],
    ["half a round", { rounds: 2.5 }],
  ])("refuses %s", (_what, change) => {
    expect(isValidConfig({ ...config, ...change })).toBe(false);
  });
});

describe("기억 포커: who plays whom", () => {
  it("sets two players against each other every round", () => {
    expect(range(config.rounds).map((n) => groupsFor([1, 0], n + 1))).toEqual(range(config.rounds).map(() => [[0, 1]]));
  });

  it("has four players meet each of the others once in three rounds, then begin again", () => {
    const order = [2, 0, 3, 1];

    const three = [1, 2, 3].map((round) => groupsFor(order, round));

    expect(three.every((groups) => groups.length === 2 && groups.every((group) => group.length === 2))).toBe(true);
    expect(three.flatMap(meetings).sort()).toEqual(["0-1", "0-2", "0-3", "1-2", "1-3", "2-3"]);
    expect(groupsFor(order, 4)).toEqual(groupsFor(order, 1));
  });

  it("has a full room meet in pairs, nobody meeting the same player twice in fifteen rounds", () => {
    const order = range(FULL_ROOM).reverse();

    const rounds = range(FULL_ROOM - 1).map((n) => groupsFor(order, n + 1));
    const met = rounds.flatMap(meetings);

    expect(rounds.every((groups) => groups.length === FULL_ROOM / 2 && groups.every((group) => group.length === 2))).toBe(true);
    expect(new Set(met).size).toBe(met.length);
    expect(met).toHaveLength((FULL_ROOM * (FULL_ROOM - 1)) / 2);
  });

  it("sets three players against each other, all three in one group", () => {
    expect(groupsFor([2, 0, 1], 1)).toEqual([[0, 1, 2]]);
    expect(groupsFor([2, 0, 1], 2)).toEqual([[0, 1, 2]]);
  });

  it.each([5, 7, 15])("leaves nobody out of a round of %i players: one group of three, the rest in pairs", (count) => {
    for (let round = 1; round <= config.rounds; round++) {
      const groups = groupsFor(range(count), round);

      expect(groups.flat().sort((a, b) => a - b)).toEqual(range(count));
      expect(groups.map((group) => group.length).sort()).toEqual([...Array.from({ length: (count - 3) / 2 }, () => 2), 3]);
    }
  });

  it("puts the one left over in another group from round to round", () => {
    const trios = [1, 2, 3].map((round) => groupsFor(range(5), round).find((group) => group.length === 3));

    expect(new Set(trios.map((trio) => trio?.join(","))).size).toBeGreaterThan(1);
  });

  it("lists each group, and the groups, in the order of the players' numbers", () => {
    for (let round = 1; round <= config.rounds; round++) {
      const groups = groupsFor([5, 3, 8, 1, 6, 2, 7], round);

      expect(groups.every((group) => group.every((player, i) => i === 0 || group[i - 1] < player))).toBe(true);
      expect(groups.every((group, i) => i === 0 || groups[i - 1][0] < group[0])).toBe(true);
    }
  });
});

describe("기억 포커: starting", () => {
  it("deals a board and shared cards off one deck, and lays the board open to be learned", () => {
    const state = game(4);

    expect(state.phase).toBe("memorise");
    expect(state.round).toBe(1);
    expect(state.board).toHaveLength(CELLS);
    expect(state.shared).toHaveLength(config.shared);
    expect([...state.board, ...state.shared].every(isCard)).toBe(true);
    expect(new Set([...state.board, ...state.shared]).size).toBe(CELLS + config.shared);
    expect(state.until).toBe(T0 + MEMORISE_MS);
    expect(deadline(state)).toBe(T0 + MEMORISE_MS);
    expect(state.history).toEqual([{ type: "dealt", round: 1 }]);
  });

  it("sets every player against someone, with nothing chosen yet and nothing won", () => {
    const state = game(5);

    expect(state.groups.flat().sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
    expect(state.choices).toEqual(range(5).map((player) => ({ player, cells: [], locked: false })));
    expect(state.tallies).toEqual(range(5).map((player) => ({ player, wins: 0, ties: 0, losses: 0 })));
    expect(state.shown).toBeNull();
  });

  it("deals the same game from the same seed, and another from another", () => {
    expect(game(4, 11)).toEqual(game(4, 11));
    expect(game(4, 11).board).not.toEqual(game(4, 12).board);
  });

  it("never deals a card twice, whatever the seed", () => {
    for (let seed = 0; seed < SEEDS; seed++) {
      const state = game(2, seed);

      expect(new Set([...state.board, ...state.shared]).size, `seed ${seed}`).toBe(CELLS + config.shared);
    }
  });

  it("deals every card of the deck somewhere, over many games", () => {
    const seen = new Set<number>();
    for (let seed = 0; seed < SEEDS; seed++) for (const card of game(2, seed).board) seen.add(card);

    expect(seen.size).toBe(DECK_SIZE);
  });

  it.each([
    ["one player alone", [0], "too-few"],
    ["nobody", [], "too-few"],
    ["two players with one number", [0, 0], "bad-players"],
    ["a player numbered below nought", [-1, 0], "bad-players"],
    ["a player with half a number", [0, 1.5], "bad-players"],
  ])("refuses %s", (_what, players, reason) => {
    expect(createGame({ players, seed: 1, now: T0 }, config)).toEqual({ ok: false, reason });
  });

  it("refuses numbers that cannot be played", () => {
    expect(createGame({ players: [0, 1], seed: 1, now: T0 }, { ...config, picks: 3 })).toEqual({ ok: false, reason: "bad-config" });
  });
});

describe("기억 포커: the clock", () => {
  it("changes nothing before the board's time is up", () => {
    const state = game(2);

    expect(applyTimeout(state, T0 + MEMORISE_MS - 1, config)).toBe(state);
  });

  it("turns the board over when its time is up, and gives the players their time to choose from then", () => {
    const late = T0 + MEMORISE_MS + 700;

    const state = applyTimeout(game(2), late, config);

    expect(state.phase).toBe("choose");
    expect(state.until).toBe(late + CHOOSE_MS);
    expect(state.history.at(-1)).toEqual({ type: "turned", round: 1 });
  });

  it("shows the round when the time to choose is up", () => {
    const choosing = turned(2);

    const state = applyTimeout(choosing, choosing.until, config);

    expect(state.phase).toBe("reveal");
    expect(state.until).toBe(choosing.until + REVEAL_MS);
    expect(state.shown?.hands.map((hand) => hand.player)).toEqual([0, 1]);
    expect(state.history.at(-1)).toMatchObject({ type: "shown", round: 1 });
  });

  it("deals the next round once a round has been shown", () => {
    const shown = step(turned(2));

    const state = applyTimeout(shown, shown.until, config);

    expect(state.phase).toBe("memorise");
    expect(state.round).toBe(2);
    expect(state.until).toBe(shown.until + MEMORISE_MS);
    expect(state.board).not.toEqual(shown.board);
    expect(new Set([...state.board, ...state.shared]).size).toBe(CELLS + config.shared);
    expect(state.choices.every((choice) => choice.cells.length === 0 && !choice.locked)).toBe(true);
    expect(state.shown).toBeNull();
    expect(state.history.at(-1)).toEqual({ type: "dealt", round: 2 });
  });

  it("deals the same cards round after round, whatever the players chose or had chosen for them", () => {
    const idle = step(step(turned(2)));
    const busy = step(step(choose(pick(turned(2), 0, [5]), 1, [0, 1])));

    expect([idle.round, busy.round]).toEqual([2, 2]);
    expect(busy.board).toEqual(idle.board);
    expect(busy.shared).toEqual(idle.shared);
  });

  it("is over after its last round, each player having played every round", () => {
    let state = game(5);
    for (let steps = 0; steps < config.rounds * 3; steps++) state = step(state);

    expect(state.phase).toBe("ended");
    expect(state.round).toBe(config.rounds);
    expect(state.history.at(-1)).toEqual({ type: "ended", reason: "rounds" });
    expect(state.tallies.map((tally) => tally.wins + tally.ties + tally.losses)).toEqual(range(5).map(() => config.rounds));
    expect(deadline(state)).toBeNull();
    expect(step(state)).toBe(state);
  });

  it("is not over while its last round is still being shown", () => {
    let state = game(2);
    for (let steps = 0; steps < config.rounds * 3 - 1; steps++) state = step(state);

    expect(state.phase).toBe("reveal");
    expect(state.round).toBe(config.rounds);
  });

  it("moves its clock on by the time it stood still", () => {
    const state = game(2);

    expect(shiftClock(state, 5000).until).toBe(state.until + 5000);
    expect(shiftClock(state, 0)).toBe(state);
    expect(shiftClock(abandon(state), 5000).until).toBe(state.until);
  });
});

describe("기억 포커: choosing", () => {
  it("takes the cells a player picks, and puts a new pick in place of the old", () => {
    const first = pick(turned(2), 0, [3, 9]);
    const again = pick(first, 0, [9, 12]);
    const fewer = pick(again, 0, [12]);

    expect(first.choices[0]).toEqual({ player: 0, cells: [3, 9], locked: false });
    expect(again.choices[0].cells).toEqual([9, 12]);
    expect(fewer.choices[0].cells).toEqual([12]);
    expect(pick(fewer, 0, []).choices[0].cells).toEqual([]);
  });

  it("tells nobody of a pick, and everybody that a choice is final", () => {
    const picked = pick(turned(2), 0, [3, 9]);
    const final = choose(turned(2), 0, [3, 9]);

    expect(picked.history).toEqual(turned(2).history);
    expect(final.choices[0]).toEqual({ player: 0, cells: [3, 9], locked: true });
    expect(final.history.at(-1)).toEqual({ type: "locked", round: 1, player: 0 });
  });

  it("lets two players choose the same cells, as both did in the document's first round", () => {
    const cells = cellsOf(TIED_ROUND.first.picks);

    const state = choose(choose(turned(2), 0, cells), 1, cells);

    expect(state.choices.map((choice) => choice.cells)).toEqual([cells, cells]);
  });

  it("leaves the game it was given as it was", () => {
    const state = turned(2);
    const before = structuredClone(state);

    choose(state, 0, [3, 9]);

    expect(state).toEqual(before);
  });

  it.each([
    ["a cell the board does not have", { type: "pick", cells: [CELLS] }, "bad-action"],
    ["more cells than a choice is", { type: "pick", cells: [0, 1, 2] }, "bad-action"],
    ["one cell twice", { type: "pick", cells: [4, 4] }, "bad-action"],
    ["a cell below nought", { type: "pick", cells: [-1, 2] }, "bad-action"],
    ["something that is no move", { type: "peek" }, "bad-action"],
    ["a final choice of nothing", { type: "lock" }, "not-chosen"],
  ])("refuses %s", (_what, action, reason) => {
    expect(applyAction(turned(2), 0, action as never, config)).toEqual({ ok: false, reason });
  });

  it("refuses to make one cell a final choice", () => {
    expect(applyAction(pick(turned(2), 0, [5]), 0, { type: "lock" }, config)).toEqual({ ok: false, reason: "not-chosen" });
  });

  it("lets a final choice stand: no other pick, no second word", () => {
    const final = choose(turned(2), 0, [3, 9]);

    expect(applyAction(final, 0, { type: "pick", cells: [1, 2] }, config)).toEqual({ ok: false, reason: "locked" });
    expect(applyAction(final, 0, { type: "lock" }, config)).toEqual({ ok: false, reason: "locked" });
  });

  it("takes no choice while the board lies open, nor once the round is shown", () => {
    const open = game(2);
    const shown = step(turned(2));

    expect(applyAction(open, 0, { type: "pick", cells: [3, 9] }, config)).toEqual({ ok: false, reason: "not-choosing" });
    expect(applyAction(shown, 0, { type: "pick", cells: [3, 9] }, config)).toEqual({ ok: false, reason: "not-choosing" });
  });

  it("takes nothing from someone who is not playing, and nothing once the game is over", () => {
    expect(applyAction(turned(2), 7, { type: "pick", cells: [3, 9] }, config)).toEqual({ ok: false, reason: "not-playing" });
    expect(applyAction(abandon(turned(2)), 0, { type: "pick", cells: [3, 9] }, config)).toEqual({ ok: false, reason: "game-over" });
  });

  it.each([null, 7, "pick", { type: "pick" }, { type: "pick", cells: "3,9" }, { type: "pick", cells: [3.5] }, { cells: [1, 2] }])(
    "reads %j off the wire as nothing",
    (raw) => {
      expect(parseAction(raw)).toBeNull();
    },
  );

  it("reads a pick and a final word off the wire", () => {
    expect(parseAction({ type: "pick", cells: [3, 9], more: true })).toEqual({ type: "pick", cells: [3, 9] });
    expect(parseAction({ type: "lock" })).toEqual({ type: "lock" });
  });
});

describe("기억 포커: showing a round", () => {
  it("shows the round at once when every player has made their choice final", () => {
    const now = T0 + MEMORISE_MS + 4000;
    const chosen = choose(choose(turned(2), 0, [3, 9]), 1, [0, 1]);

    const state = showIfChosen(chosen, everyone, now, config);

    expect(state.phase).toBe("reveal");
    expect(state.until).toBe(now + REVEAL_MS);
    expect(state.shown?.hands.map((hand) => [hand.player, hand.cells, hand.forced])).toEqual([
      [0, [3, 9], 0],
      [1, [0, 1], 0],
    ]);
  });

  it("waits while someone who is there has not made their choice final", () => {
    const one = choose(turned(2), 0, [3, 9]);
    const picking = pick(one, 1, [0, 1]);

    expect(showIfChosen(one, everyone, T0 + MEMORISE_MS + 4000, config)).toBe(one);
    expect(showIfChosen(picking, everyone, T0 + MEMORISE_MS + 4000, config)).toBe(picking);
  });

  it("does not wait for someone who has gone", () => {
    const one = choose(turned(3), 0, [3, 9]);
    const two = choose(one, 2, [4, 5]);

    const state = showIfChosen(two, (player) => player !== 1, T0 + MEMORISE_MS + 4000, config);

    expect(state.phase).toBe("reveal");
    expect(state.shown?.hands.find((hand) => hand.player === 1)?.forced).toBe(PICKS);
  });

  it("shows nothing before the board is turned over, nor twice", () => {
    const open = game(2);
    const shown = step(turned(2));

    expect(showIfChosen(open, () => false, T0, config)).toBe(open);
    expect(showIfChosen(shown, () => false, T0, config)).toBe(shown);
  });

  it("weighs each player's two cards with the shared ones: four aces over a full house, as in the document's second round", () => {
    const round = FOUR_BEATS_FULL_HOUSE;
    const state = dealt(turned(2), round);

    const shown = step(choose(choose(state, 0, cellsOf(round.first.picks)), 1, cellsOf(round.second.picks)));

    expect(shown.shown?.hands.map((hand) => [hand.hand.kind, hand.hand.ranks[0]])).toEqual([
      [round.first.kind, round.first.rank],
      [round.second.kind, round.second.rank],
    ]);
    expect(shown.shown?.outcomes).toEqual([{ players: [0, 1], best: [1], winner: 1 }]);
    expect(shown.tallies).toEqual([
      { player: 0, wins: 0, ties: 0, losses: 1 },
      { player: 1, wins: 1, ties: 0, losses: 0 },
    ]);
  });

  it("gives a round to neither of two equal hands, as in the document's first round", () => {
    const round = TIED_ROUND;
    const state = dealt(turned(2), round);

    const shown = step(choose(choose(state, 0, cellsOf(round.first.picks)), 1, cellsOf(round.second.picks)));

    expect(shown.shown?.outcomes).toEqual([{ players: [0, 1], best: [0, 1], winner: null }]);
    expect(shown.tallies).toEqual([
      { player: 0, wins: 0, ties: 1, losses: 0 },
      { player: 1, wins: 0, ties: 1, losses: 0 },
    ]);
  });

  it("gives a round of three to the one best hand", () => {
    const round = TRIPLE_BEATS_TWO_PAIR;
    const state = dealt(turned(3), round);
    // the document's two hands, and a third of nothing: 2♦ and 3♥ beside 7♥ 8♠ J♠
    const nothing = cellsOf(["C", "K"]);

    const shown = step(choose(choose(choose(state, 0, cellsOf(round.first.picks)), 1, cellsOf(round.second.picks)), 2, nothing));

    expect(shown.shown?.outcomes).toEqual([{ players: [0, 1, 2], best: [0], winner: 0 }]);
    expect(shown.tallies.map((tally) => [tally.wins, tally.ties, tally.losses])).toEqual([
      [1, 0, 0],
      [0, 0, 1],
      [0, 0, 1],
    ]);
  });

  it("gives a round of three to nobody when its two best hands are equal, and the third has lost", () => {
    const round = TRIPLE_BEATS_TWO_PAIR;
    const state = dealt(turned(3), round);
    // three sevens twice over: 7♦ 7♣, and 7♠ 7♦
    const sevens = cellsOf(["A", "I"]);

    const shown = step(choose(choose(choose(state, 0, cellsOf(round.first.picks)), 1, cellsOf(round.second.picks)), 2, sevens));

    expect(shown.shown?.outcomes).toEqual([{ players: [0, 1, 2], best: [0, 2], winner: null }]);
    expect(shown.tallies.map((tally) => [tally.wins, tally.ties, tally.losses])).toEqual([
      [0, 1, 0],
      [0, 0, 1],
      [0, 1, 0],
    ]);
  });

  it("chooses for a player what they did not choose in time: cells of the board, none of them twice", () => {
    for (let seed = 0; seed < SEEDS; seed++) {
      const state = step(pick(turned(2, seed), 0, [5]));
      const [kept, none] = state.shown?.hands ?? [];

      expect([kept.cells[0], kept.forced, none.forced], `seed ${seed}`).toEqual([5, PICKS - 1, PICKS]);
      for (const hand of [kept, none]) {
        expect(hand.cells).toHaveLength(PICKS);
        expect(new Set(hand.cells).size).toBe(PICKS);
        expect(hand.cells.every((cell) => Number.isInteger(cell) && cell >= 0 && cell < CELLS)).toBe(true);
      }
    }
  });

  it("keeps what a player had picked, final or not, when the time is up", () => {
    const state = step(pick(turned(2), 0, [3, 9]));

    expect(state.shown?.hands[0]).toMatchObject({ player: 0, cells: [3, 9], forced: 0 });
  });

  it("does not always choose the same cells for those who chose nothing", () => {
    const forced = new Set(range(SEEDS).map((seed) => step(turned(2, seed)).shown?.hands[0].cells.join(",")));

    expect(forced.size).toBeGreaterThan(CELLS);
  });
});

describe("기억 포커: players who go", () => {
  it("goes on while two of its players are there", () => {
    const state = turned(3);

    expect(closeIfLeft(state, everyone)).toBe(state);
    expect(closeIfLeft(state, (player) => player !== 1)).toBe(state);
  });

  it("is over when fewer than two are left to play it", () => {
    const state = closeIfLeft(turned(3), (player) => player === 2);

    expect(state.phase).toBe("ended");
    expect(state.history.at(-1)).toEqual({ type: "ended", reason: "left" });
    expect(closeIfLeft(state, () => false)).toBe(state);
  });

  it("is ended where it stands when nobody is left to go on with it", () => {
    const state = abandon(turned(2));

    expect(state.phase).toBe("ended");
    expect(state.history.at(-1)).toEqual({ type: "ended", reason: "abandoned" });
    expect(abandon(state)).toBe(state);
  });
});

describe("기억 포커: what a player is sent", () => {
  it("shows the board while it lies open, and keeps the shared cards back until it is turned over", () => {
    const state = game(2);

    const view = viewFor(state, 0, config);

    expect(view.board).toEqual(state.board);
    expect(view.shared).toBeNull();
    expect(view).toMatchObject({ phase: "memorise", round: 1, rounds: config.rounds, you: 0, groups: [[0, 1]], locked: [], shown: null });
  });

  it("lays the shared cards open from the start where the numbers of the game say so", () => {
    const state = game(2);

    expect(viewFor(state, 0, { ...config, sharedFromStart: true }).shared).toEqual(state.shared);
  });

  it("sends no card of the board while it is turned over, to a player or to someone watching", () => {
    const state = turned(2);

    for (const viewer of [0, 1, null]) {
      const view = viewFor(state, viewer, config);

      expect(view.board).toBeNull();
      expect(view.shared).toEqual(state.shared);
      expect(JSON.stringify(view)).not.toContain(JSON.stringify(state.board));
    }
  });

  it("sends a player their own cells and nobody else's, and who has made a final choice", () => {
    const state = pick(choose(turned(3), 0, [3, 9]), 1, [4]);

    const mine = viewFor(state, 0, config);
    const theirs = viewFor(state, 1, config);
    const watching = viewFor(state, null, config);

    expect(mine.mine).toEqual({ cells: [3, 9], locked: true });
    expect(theirs.mine).toEqual({ cells: [4], locked: false });
    expect(watching.you).toBeNull();
    expect(watching.mine).toBeNull();
    expect([mine.locked, theirs.locked, watching.locked]).toEqual([[0], [0], [0]]);
    // the one place a cell is named is the viewer's own choice
    expect(JSON.stringify(theirs).split('"cells"')).toHaveLength(2);
    expect(JSON.stringify(watching)).not.toContain('"cells"');
  });

  it("takes someone who is not a player of the game for someone watching", () => {
    expect(viewFor(turned(2), 7, config)).toMatchObject({ you: null, mine: null });
  });

  it("shows the board again, every player's cells and hands, and who won, once the round is shown", () => {
    const state = step(choose(choose(turned(2), 0, [3, 9]), 1, [0, 1]));

    const view = viewFor(state, 1, config);

    expect(view.phase).toBe("reveal");
    expect(view.board).toEqual(state.board);
    expect(view.shown).toEqual(state.shown);
    expect(view.shown?.hands.map((hand) => hand.cells)).toEqual([
      [3, 9],
      [0, 1],
    ]);
    expect(view.standings.map((standing) => standing.wins + standing.ties + standing.losses)).toEqual([1, 1]);
  });

  it("is a copy: changing what was sent changes nothing of the game", () => {
    const state = step(turned(2));
    const before = structuredClone(state);

    const view = viewFor(state, 0, config);
    view.board?.reverse();
    view.shared?.reverse();
    view.groups[0].reverse();
    view.shown?.hands[0].cells.reverse();
    view.shown?.hands[0].hand.ranks.reverse();
    view.shown?.outcomes[0].best.push(9);
    view.history.pop();

    expect(state).toEqual(before);
  });
});

describe("기억 포커: where everyone stands", () => {
  /** A game whose players have these wins, ties and losses. */
  function standing(tallies: [number, number, number][]): PokerState {
    const state = game(tallies.length);
    return { ...state, tallies: tallies.map(([wins, ties, losses], player): Tally => ({ player, wins, ties, losses })) };
  }

  it("puts the most wins first", () => {
    const places = standingsOf(standing([[1, 0, 4], [4, 0, 1], [3, 0, 2]]));

    expect(places.map((each) => [each.player, each.place])).toEqual([[1, 1], [2, 2], [0, 3]]);
  });

  it("puts the fewer losses first among those with as many wins", () => {
    const places = standingsOf(standing([[2, 0, 3], [2, 2, 1], [2, 1, 2]]));

    expect(places.map((each) => [each.player, each.place])).toEqual([[1, 1], [2, 2], [0, 3]]);
  });

  it("has players with as many wins and losses share a place, and the next take the place after them", () => {
    const places = standingsOf(standing([[3, 0, 2], [3, 0, 2], [1, 0, 4], [5, 0, 0]]));

    expect(places.map((each) => [each.player, each.place])).toEqual([[3, 1], [0, 2], [1, 2], [2, 4]]);
  });

  it("has everyone first before a round is played", () => {
    expect(standingsOf(game(3)).map((each) => each.place)).toEqual([1, 1, 1]);
  });
});
