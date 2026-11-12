import { describe, expect, it } from "vitest";
import { chanceOf, randomSource } from "../../../src/shared/game/rng";
import {
  CHOICES,
  DECKS,
  KINDS,
  atLeastFor,
  atMostFor,
  cardNumbers,
  drawCards,
  effectFrom,
  effectIn,
  forAbsent,
  isDeck,
  isValidCards,
  showCards,
  type Card,
  type CardsConfig,
  type Deck,
  type Effect,
} from "../../../src/shared/games/lay-the-grass/cards";
import shipped from "../../../src/shared/games/lay-the-grass/config.json";
import {
  applyAction,
  applyTimeout,
  awaited,
  cardsOf,
  createGame,
  deadline,
  effectOf,
  fits,
  hasWay,
  isValidConfig,
  layOrderOf,
  moveFor,
  viewFor,
  type GrassAction,
  type GrassConfig,
  type GrassState,
  type Option,
  type ScoreLine,
} from "../../../src/shared/games/lay-the-grass/rules";

/** The game as shipped: one park, with the four either-or choices. */
const CONFIG: GrassConfig = shipped;
const CARDS: CardsConfig = shipped.cards;

/** An arbitrary moment the tests call the start of the game, in ms. */
const START = 2_000_000;
const MARK_MS = CONFIG.markSeconds * 1000;

/** A park with room for everything: six cells by six. */
const FIELD = ["######", "######", "######", "######", "######", "######"];

/** The kinds a card drawn for choice 6, 7 or 8 may have. */
const DRAWN_KINDS = Object.values(CARDS.slots).flat();

/** Numbers of 32 bits such as a room gives a game, made up for a test: the same for the same `n`. */
function words(n: number): number[] {
  const source = randomSource(n * 7919 + 1);
  return Array.from({ length: 64 }, () => Math.floor(source.next() * 4294967296));
}

/** A game of players 0..count-1 started at START. */
function game(count: number, start: { seed?: number; deck?: Deck; chance?: number[] } = {}, config: GrassConfig = CONFIG): GrassState {
  const created = createGame({ players: Array.from({ length: count }, (_, id) => id), seed: start.seed ?? 7, now: START, deck: start.deck, chance: start.chance }, config);
  if (!created.ok) throw new Error(`fixture game refused: ${created.reason}`);
  return created.state;
}

/** Cards of the test's own for the choices 6, 7 and 8. */
type Dealt = Partial<Record<6 | 7 | 8, [Effect, Effect]>>;

/**
 * Cards for the choices a test is not about: options that give nothing and
 * take nothing, so that what the test is about is all there is to count.
 */
const QUIET: Required<Dealt> = {
  6: [
    { kind: "insure", points: 0 },
    { kind: "defend", cells: 1 },
  ],
  7: [
    { kind: "neighbour", points: 0 },
    { kind: "pair", perSide: 0 },
  ],
  8: [
    { kind: "tree", count: 1 },
    { kind: "rock", count: 1 },
  ],
};

/** The same game with `cards` for its choices 6 to 8, the quiet ones where the test gives none. */
function dealt(state: GrassState, cards: Dealt = {}): GrassState {
  const deck: Card[] = [cardsOf(state)[0], ...([6, 7, 8] as const).map((which) => ({ which, options: cards[which] ?? QUIET[which] }))];
  return { ...state, decks: [deck] };
}

/** Applies an action that the test expects to be accepted. */
function act(state: GrassState, player: number, action: GrassAction, now = START + 1000): GrassState {
  const result = applyAction(state, player, action, now, CONFIG);
  if (!result.ok) throw new Error(`fixture action refused: ${result.reason} (${action.type} by ${player} in ${state.phase})`);
  return result.state;
}

/** Why `action` by `player` is refused; the test expects it to be. */
function refusal(state: GrassState, player: number, action: GrassAction, now = START + 1000): string {
  const result = applyAction(state, player, action, now, CONFIG);
  if (result.ok) throw new Error("fixture: the action was taken");
  return result.reason;
}

/** Everyone still to choose chooses what `option` gives them. */
function chooseAll(state: GrassState, option: Option | ((player: number) => Option)): GrassState {
  let next = state;
  for (const player of awaited(state)) next = act(next, player, { type: "choose", option: typeof option === "function" ? option(player) : option });
  return next;
}

/** Everyone picks in turn what `tile` gives them. */
function pickAll(state: GrassState, tile: number | ((player: number) => number)): GrassState {
  let next = state;
  while (next.phase === "pick" && next.turn !== null) {
    const player = next.turn.player;
    next = act(next, player, { type: "pick", tile: typeof tile === "function" ? tile(player) : tile });
  }
  return next;
}

/** Whoever is to put something on the park puts nothing, each in turn, until the laying begins. */
function skipMarks(state: GrassState): GrassState {
  let next = state;
  while (next.phase === "manholes" || next.phase === "trees") next = moveFor(next, START + 5000, CONFIG);
  return next;
}

interface Setup {
  cards?: Dealt;
  five?: Option | ((player: number) => Option);
  six?: Option | ((player: number) => Option);
  seven?: Option | ((player: number) => Option);
  eight?: Option | ((player: number) => Option);
  tile?: number | ((player: number) => number);
  park?: string[];
}

/** A game of `count` played up to the end of choice 8, the first option taken wherever the test does not say. */
function upToMarks(count: number, setup: Setup = {}): GrassState {
  let state: GrassState = { ...dealt(game(count), setup.cards), park: { rows: setup.park ?? FIELD } };
  // 정보 unless the test wants points: nobody starts ahead
  state = chooseAll(state, setup.five ?? 2);
  state = pickAll(state, setup.tile ?? 13);
  state = chooseAll(state, setup.six ?? 1);
  state = chooseAll(state, setup.seven ?? 1);
  return chooseAll(state, setup.eight ?? 1);
}

/** The same, with nothing put on the park: the laying is on. */
function upToLaying(count: number, setup: Setup = {}): GrassState {
  return skipMarks(upToMarks(count, setup));
}

/** The room lays every tile that is still to be laid, each in the first place it fits. */
function layAll(state: GrassState): GrassState {
  let next = state;
  while (next.phase === "place") next = moveFor(next, START + 9000, CONFIG);
  return next;
}

/** The player on turn; an error when it is nobody's. */
function onTurn(state: GrassState): number {
  if (state.turn === null) throw new Error(`fixture: nobody is on turn in ${state.phase}`);
  return state.turn.player;
}

/** What `player` was given for the park just closed. */
function lineOf(state: GrassState, player: number): ScoreLine {
  const event = [...state.history].reverse().find((each) => each.type === "score");
  const line = event?.type === "score" ? event.lines.find((each) => each.player === player) : undefined;
  if (line === undefined) throw new Error("fixture: no points were counted");
  return line;
}

describe("잔디 깔기: the cards the values give", () => {
  it("takes the cards the game ships with", () => {
    expect(isValidCards(CARDS, CONFIG.choices)).toBe(true);
    expect(isValidConfig(CONFIG)).toBe(true);
    expect(DECKS).toEqual(["fresh", "show"]);
    expect(isDeck("show")).toBe(true);
    expect(isDeck("other")).toBe(false);
    expect(isDeck(undefined)).toBe(false);
  });

  it("has the document's four cards, with the document's numbers, for its sixteen players", () => {
    expect(showCards(CHOICES, 16, CARDS)).toEqual([
      { which: 5, options: [{ kind: "score", points: 5 }, { kind: "info" }] },
      { which: 6, options: [{ kind: "attack", times: 2, loss: 4 }, { kind: "defend", cells: 2 }] },
      { which: 7, options: [{ kind: "pair", perSide: 1 }, { kind: "check", atMost: 9, bonus: 5 }] },
      { which: 8, options: [{ kind: "tree", count: 1 }, { kind: "manhole", values: [1, -1] }] },
    ]);
  });

  it("has only the cards of the choices a game is played with", () => {
    expect(showCards([6, 8], 16, CARDS).map((card) => card.which)).toEqual([6, 8]);
    expect(showCards([], 16, CARDS)).toEqual([]);
  });

  it("keeps the document's share of the players for a smaller game", () => {
    // 견제's nine of sixteen, rounded down and never none
    expect([16, 12, 8, 6, 5, 4, 3, 2].map((players) => atMostFor(players, 9, 16))).toEqual([9, 6, 4, 3, 2, 2, 1, 1]);
    // as many or more: rounded up, and never more than everyone
    expect([16, 12, 8, 6, 5, 4, 3, 2].map((players) => atLeastFor(players, 9, 16))).toEqual([9, 7, 5, 4, 3, 3, 2, 2]);
    expect(atLeastFor(2, 16, 16)).toBe(2);
    expect(showCards(CHOICES, 4, CARDS)[2].options[1]).toEqual({ kind: "check", atMost: 2, bonus: 5 });
  });

  it("reads an option off the values, and nothing that is not one", () => {
    expect(effectFrom({ kind: "attack", times: 3, loss: 8 }, 4, 16)).toEqual({ kind: "attack", times: 3, loss: 8 });
    expect(effectFrom({ kind: "harmony", atLeast: 10, bonus: 5 }, 4, 16)).toEqual({ kind: "harmony", atLeast: 3, bonus: 5 });
    expect(effectFrom({ kind: "first" }, 4, 16)).toEqual({ kind: "first" });
    expect(effectFrom({ kind: "flower", values: [2] }, 4, 16)).toEqual({ kind: "flower", values: [2] });
    expect(effectFrom({ kind: "luck" }, 4, 16)).toBeNull();
    expect(effectFrom(undefined, 4, 16)).toBeNull();
    expect(effectFrom({ kind: "attack", times: 0, loss: 4 }, 4, 16)).toBeNull();
    expect(effectFrom({ kind: "attack", times: 2 }, 4, 16)).toBeNull();
    // every cut is tried when the room looks for room for a tile: no more than two cells
    expect(effectFrom({ kind: "defend", cells: 3 }, 4, 16)).toBeNull();
    expect(effectFrom({ kind: "defend", cells: 0 }, 4, 16)).toBeNull();
    expect(effectFrom({ kind: "check", atMost: 17, bonus: 5 }, 4, 16)).toBeNull();
    expect(effectFrom({ kind: "tree", count: 0 }, 4, 16)).toBeNull();
    expect(effectFrom({ kind: "manhole", values: [] }, 4, 16)).toBeNull();
    expect(effectFrom({ kind: "manhole", values: [1, 0] }, 4, 16)).toBeNull();
    // a flower bed only gives
    expect(effectFrom({ kind: "flower", values: [-2] }, 4, 16)).toBeNull();
    expect(effectFrom({ kind: "insure", points: 1.5 }, 4, 16)).toBeNull();
  });

  it("refuses values a game could not have its cards from", () => {
    const without = (kind: string): string[] => CARDS.forAbsent.filter((each) => each !== kind);

    expect(isValidCards(undefined, CONFIG.choices)).toBe(false);
    expect(isValidCards({ ...CARDS, outOf: 0 }, CONFIG.choices)).toBe(false);
    // a card of the document's with one option, or with an option that is none
    expect(isValidCards({ ...CARDS, show: { ...CARDS.show, "6": [{ kind: "attack", times: 2, loss: 4 }] } }, CONFIG.choices)).toBe(false);
    expect(isValidCards({ ...CARDS, show: { ...CARDS.show, "7": [{ kind: "pair", perSide: 1 }, { kind: "luck" }] } }, CONFIG.choices)).toBe(false);
    // one kind to draw from is no card; a kind with nothing to be; a kind in two choices
    expect(isValidCards({ ...CARDS, slots: { ...CARDS.slots, "6": ["attack"] } }, CONFIG.choices)).toBe(false);
    expect(isValidCards({ ...CARDS, draw: { ...CARDS.draw, first: [] } }, CONFIG.choices)).toBe(false);
    expect(isValidCards({ ...CARDS, slots: { ...CARDS.slots, "7": ["pair", "attack"] } }, CONFIG.choices)).toBe(false);
    // what a kind may be has to be of that kind
    expect(isValidCards({ ...CARDS, draw: { ...CARDS.draw, rock: [{ kind: "tree", count: 1 }] } }, CONFIG.choices)).toBe(false);
    // every kind has a place among those taken for someone absent
    expect(isValidCards({ ...CARDS, forAbsent: without("rock") }, CONFIG.choices)).toBe(false);
    expect(isValidConfig({ ...CONFIG, cards: { ...CARDS, forAbsent: without("attack") } })).toBe(false);
    // a choice that is not played needs no card
    expect(isValidCards({ ...CARDS, slots: { "6": CARDS.slots["6"] }, show: { "6": CARDS.show["6"] } }, [6])).toBe(true);
  });

  it("finds the option a player holds by its kind, among the cards they chose from", () => {
    const cards = showCards(CHOICES, 4, CARDS);
    const choices = [
      { player: 1, which: 6 as const, option: 1 as const },
      { player: 2, which: 6 as const, option: 2 as const },
    ];

    expect(effectIn(cards, choices, 1, "attack")).toEqual({ kind: "attack", times: 2, loss: 4 });
    expect(effectIn(cards, choices, 1, "defend")).toBeNull();
    expect(effectIn(cards, choices, 2, "defend")).toEqual({ kind: "defend", cells: 2 });
    expect(effectIn(cards, choices, 3, "attack")).toBeNull();
    expect(effectIn(cards, choices, null, "attack")).toBeNull();
    expect(effectIn([], choices, 1, "attack")).toBeNull();
  });
});

describe("잔디 깔기: cards drawn for a game", () => {
  it("leaves the first card the document's, and draws two different kinds for each of the others from those its choice may have", () => {
    for (let n = 1; n <= 200; n++) {
      const deck = drawCards(randomSource(n * 104729).next, CONFIG.choices, 6, CARDS);

      expect(deck.map((card) => card.which)).toEqual([5, 6, 7, 8]);
      expect(deck[0]).toEqual(showCards(CHOICES, 6, CARDS)[0]);
      for (const card of deck.slice(1)) {
        const kinds = card.options.map((effect) => effect.kind);
        expect(kinds[0]).not.toBe(kinds[1]);
        for (const kind of kinds) expect(CARDS.slots[`${card.which}`]).toContain(kind);
      }
    }
  });

  it("leaves the first card the document's even where the values name kinds to draw for its choice", () => {
    const cards = { ...CARDS, slots: { ...CARDS.slots, "5": ["attack", "defend"] } };

    for (let n = 1; n <= 20; n++) expect(drawCards(randomSource(n).next, CONFIG.choices, 6, cards)[0]).toEqual(showCards(CHOICES, 6, CARDS)[0]);
  });

  it("gives each drawn option numbers the values allow for its kind, as a game of that many players has them", () => {
    for (let n = 1; n <= 200; n++) {
      for (const card of drawCards(randomSource(n * 104729).next, CONFIG.choices, 6, CARDS).slice(1)) {
        for (const effect of card.options) {
          const allowed = CARDS.draw[effect.kind].map((spec) => effectFrom(spec, 6, CARDS.outOf));
          expect(allowed).toContainEqual(effect);
        }
      }
    }
  });

  it("draws the same cards from the same numbers, and others from others", () => {
    const decks = [1, 2, 3, 4, 5, 6].map((n) => JSON.stringify(drawCards(randomSource(n).next, CONFIG.choices, 6, CARDS)));

    expect(JSON.stringify(drawCards(randomSource(1).next, CONFIG.choices, 6, CARDS))).toBe(decks[0]);
    expect(new Set(decks).size).toBeGreaterThan(3);
  });

  it("draws every kind in either place, every pairing and everything a kind may be, over many games", () => {
    const first = new Set<string>();
    const second = new Set<string>();
    const pairings = new Set<string>();
    const made = new Set<string>();
    for (let n = 1; n <= 600; n++) {
      for (const card of drawCards(randomSource(n * 104729).next, CONFIG.choices, 6, CARDS).slice(1)) {
        first.add(card.options[0].kind);
        second.add(card.options[1].kind);
        pairings.add(card.options.map((effect) => effect.kind).sort().join("+"));
        for (const effect of card.options) made.add(JSON.stringify(effect));
      }
    }
    const possible = DRAWN_KINDS.flatMap((kind) => CARDS.draw[kind].map((spec) => JSON.stringify(effectFrom(spec, 6, CARDS.outOf))));

    expect([...first].sort()).toEqual([...DRAWN_KINDS].sort());
    expect([...second].sort()).toEqual([...DRAWN_KINDS].sort());
    // four kinds to a choice: six pairings of them, three choices
    expect(pairings.size).toBe(18);
    expect([...made].sort()).toEqual([...new Set(possible)].sort());
  });

  it("has a card for every kind of option there is, the document's and this project's", () => {
    const onShow = Object.values(CARDS.show).flat().map((spec) => spec.kind);

    expect([...new Set([...onShow, ...DRAWN_KINDS])].sort()).toEqual([...KINDS].sort());
  });

  it("takes for a player who is not there the option that stands earlier in the values: of the document's cards, the ones it took before", () => {
    const show = showCards(CHOICES, 16, CARDS);

    // 점수, 방어, 견제, 가로수: those with nothing to lose
    expect(show.map((card) => forAbsent(card, CARDS))).toEqual([1, 2, 2, 1]);
    expect(forAbsent({ which: 6, options: [{ kind: "attack", times: 2, loss: 4 }, { kind: "insure", points: 2 }] }, CARDS)).toBe(2);
    expect(forAbsent({ which: 6, options: [{ kind: "insure", points: 2 }, { kind: "attack", times: 2, loss: 4 }] }, CARDS)).toBe(1);
    expect(forAbsent({ which: 7, options: [{ kind: "pair", perSide: 1 }, { kind: "neighbour", points: 1 }] }, CARDS)).toBe(2);
    expect(forAbsent({ which: 8, options: [{ kind: "flower", values: [2] }, { kind: "manhole", values: [1, -1] }] }, CARDS)).toBe(1);
  });
});

describe("잔디 깔기: a game and its cards", () => {
  it("plays the document's cards when it is asked for the show's, and when it is not said which", () => {
    const show = showCards(CHOICES, 4, CARDS);

    expect(cardsOf(game(4, { deck: "show", chance: words(1) }))).toEqual(show);
    expect(cardsOf(game(4))).toEqual(show);
  });

  it("tells everyone which cards it is played with", () => {
    expect(viewFor(game(3, { deck: "fresh", chance: words(1) }), null, CONFIG).deck).toBe("fresh");
    expect(viewFor(game(3, { deck: "show" }), 0, CONFIG).deck).toBe("show");
    expect(viewFor(game(3), 0, CONFIG).deck).toBe("show");
  });

  it("is a game of version 3, with the cards of its one park in it", () => {
    const state = game(3, { deck: "fresh", chance: words(1) });

    expect(state.version).toBe(3);
    expect(state.decks).toHaveLength(1);
    expect(cardsOf(state)).toBe(state.decks[0]);
  });

  it("draws its cards from the numbers the room gives it, whatever its seed, and its park from the seed", () => {
    const one = game(4, { deck: "fresh", seed: 1, chance: words(5) });
    const otherSeed = game(4, { deck: "fresh", seed: 2, chance: words(5) });
    const otherChance = game(4, { deck: "fresh", seed: 1, chance: words(6) });

    expect(cardsOf(one)).toEqual(drawCards(chanceOf(words(5))(() => 0), CONFIG.choices, 4, CARDS));
    expect(cardsOf(otherSeed)).toEqual(cardsOf(one));
    expect(cardsOf(otherChance)).not.toEqual(cardsOf(one));
    expect(otherChance.park).toEqual(one.park);
    expect(otherChance.players).toEqual(one.players);
  });

  it("draws them from the seed where it has no such numbers, by a sequence that is not the park's", () => {
    const state = game(4, { deck: "fresh", seed: 3 });

    expect(cardsOf(state)).toEqual(drawCards(cardNumbers(3), CONFIG.choices, 4, CARDS));
    expect(cardsOf(game(4, { deck: "fresh", seed: 3 }))).toEqual(cardsOf(state));
    // the park and the lot are as they are with the show's cards: the cards take nothing from their sequence
    expect(state.park).toEqual(game(4, { deck: "show", seed: 3 }).park);
    expect(state.players).toEqual(game(4, { deck: "show", seed: 3 }).players);
  });

  it("draws cards for every park of a game of several, and plays each park with its own", () => {
    const config = { ...CONFIG, rounds: 2 };
    let state = game(2, { deck: "fresh", chance: words(9) }, config);
    const [first, second] = state.decks;
    // the room plays the first park through for everyone
    for (let step = 0; state.round === 1 && state.phase !== "ended"; step++) {
      expect(step).toBeLessThan(200);
      state = applyTimeout(state, deadline(state, config)!, config);
    }

    expect(state.decks).toHaveLength(2);
    expect(second).not.toEqual(first);
    expect(state.round).toBe(2);
    expect(cardsOf(state)).toEqual(second);
  });
});

describe("잔디 깔기: who is sent which card", () => {
  /** Whether what is sent as `view` says anything of a kind that only a card drawn for choices 6 to 8 has. */
  const tellsOf = (view: unknown): string[] => DRAWN_KINDS.filter((kind) => JSON.stringify(view).includes(`"${kind}"`));

  it("sends everyone the card of the choice that is up, and no card to come", () => {
    const state = game(3, { deck: "fresh", chance: words(1) });

    for (const viewer of [0, 1, 2, null]) {
      const view = viewFor(state, viewer, CONFIG);
      expect(view.cards).toEqual([cardsOf(state)[0]]);
      expect(view.preview).toEqual([]);
      expect(tellsOf(view)).toEqual([]);
    }
  });

  it("sends a 정보 player the cards to come once choice 5 is shown, and nobody else", () => {
    const state = chooseAll(game(3, { deck: "fresh", chance: words(1) }), (player) => (player === 1 ? 2 : 1));

    const informed = viewFor(state, 1, CONFIG);
    expect(informed.preview).toEqual([6, 7, 8]);
    expect(informed.cards).toEqual(cardsOf(state));
    for (const viewer of [0, 2, null]) {
      const view = viewFor(state, viewer, CONFIG);
      expect(view.cards.map((card) => card.which)).toEqual([5]);
      expect(view.preview).toEqual([]);
      expect(tellsOf(view)).toEqual([]);
    }
  });

  it("sends nobody a card to come while choice 5 is still being made", () => {
    const state = act(game(3, { deck: "fresh", chance: words(1) }), 1, { type: "choose", option: 2 });

    const view = viewFor(state, 1, CONFIG);
    expect(view.cards.map((card) => card.which)).toEqual([5]);
    expect(view.preview).toEqual([]);
    expect(tellsOf(view)).toEqual([]);
  });

  it("sends everyone a card once its choice comes up, and it is then no look ahead", () => {
    const picked = pickAll(chooseAll(game(3, { deck: "fresh", chance: words(1) }), (player) => (player === 1 ? 2 : 1)), 9);
    const seventh = chooseAll(picked, 1);

    expect(picked.choosing?.which).toBe(6);
    expect(viewFor(picked, 0, CONFIG).cards).toEqual(cardsOf(picked).slice(0, 2));
    expect(viewFor(picked, null, CONFIG).cards).toEqual(cardsOf(picked).slice(0, 2));
    expect(viewFor(picked, 1, CONFIG).cards).toEqual(cardsOf(picked));
    expect(viewFor(picked, 1, CONFIG).preview).toEqual([7, 8]);
    expect(viewFor(seventh, 0, CONFIG).cards).toEqual(cardsOf(seventh).slice(0, 3));
    expect(viewFor(seventh, 1, CONFIG).preview).toEqual([8]);
  });

  it("says with a choice everyone has made which card it was made of", () => {
    const state = chooseAll(pickAll(chooseAll(game(2, { deck: "fresh", chance: words(1) }), 1), 9), 1);

    const event = state.history.filter((each) => each.type === "choice").at(-1);
    expect(event).toMatchObject({ type: "choice", which: 6, card: cardsOf(state)[1] });
  });

  it("sends what it sends as a copy: nothing done to it changes the game's own cards", () => {
    const state = chooseAll(game(2, { deck: "fresh", chance: words(1) }), 2);
    const before = JSON.stringify(state);

    const view = viewFor(state, 0, CONFIG);
    view.cards[1].options[0] = { kind: "first" };
    view.cards.pop();

    expect(JSON.stringify(state)).toBe(before);
  });

  it("never sends the cards of a park still to come", () => {
    const config = { ...CONFIG, rounds: 2 };
    const state = chooseAll(game(2, { deck: "fresh", chance: words(9) }, config), 2);

    expect(viewFor(state, 0, config).cards).toEqual(state.decks[0]);
    expect(JSON.stringify(viewFor(state, 0, config))).not.toContain("decks");
  });
});

describe("잔디 깔기: the options that are this project's own", () => {
  it("still gives a 보험 player whose tile was not laid the card's points, and one whose tile was laid no more than its number", () => {
    // room for one tile of nine cells and no more
    const cards: Dealt = { 6: [{ kind: "insure", points: 3 }, { kind: "attack", times: 2, loss: 4 }] };
    let state = upToLaying(2, { cards, six: 1, tile: 13, park: ["###", "###", "###"] });
    const first = onTurn(state);
    const second = state.players.map((player) => player.id).find((id) => id !== first)!;
    state = act(state, first, { type: "lay", row: 0, col: 0, turns: 0 });

    expect(state.failed).toEqual([second]);
    expect(lineOf(state, first)).toMatchObject({ laid: true, tile: 13, total: 13 });
    expect(lineOf(state, second)).toMatchObject({ laid: false, tile: 3, total: 3 });
    expect(state.players.find((player) => player.id === second)?.score).toBe(3);
  });

  it("lays the tiles of 선점 players before the others, whatever their numbers", () => {
    const cards: Dealt = { 6: [{ kind: "first" }, { kind: "defend", cells: 1 }] };
    const tiles = [13, 3, 9];
    const picked = pickAll(chooseAll(dealt(game(3), cards), 2), (player) => tiles[player]);

    const one = chooseAll(picked, (player) => (player === 0 ? 1 : 2));
    const two = chooseAll(picked, (player) => (player === 1 ? 2 : 1));

    expect(picked.layOrder).toEqual([1, 2, 0]);
    expect(one.layOrder).toEqual([0, 1, 2]);
    // among those who took it the lower number is still first
    expect(two.layOrder).toEqual([2, 0, 1]);
    expect(effectOf(one, 0, "first")).toEqual({ kind: "first" });
    expect(effectOf(one, 1, "first")).toBeNull();
  });

  it("orders the laying by 선점, then the number, then the priority", () => {
    const players = [
      { id: 7, score: 0 },
      { id: 2, score: 0 },
      { id: 4, score: 0 },
      { id: 1, score: 0 },
    ];
    const picks = [
      { player: 7, tile: 9 },
      { player: 2, tile: 13 },
      { player: 4, tile: 3 },
      { player: 1, tile: 9 },
    ];

    expect(layOrderOf(players, picks)).toEqual([4, 7, 1, 2]);
    expect(layOrderOf(players, picks, [2, 1])).toEqual([1, 2, 4, 7]);
    expect(layOrderOf(players, picks, [7, 2, 4, 1])).toEqual([4, 7, 1, 2]);
  });

  it("has the 선점 players put their things on the park first as well, and gives them the first turn to lay", () => {
    const cards: Dealt = { 6: [{ kind: "first" }, { kind: "defend", cells: 1 }], 8: [{ kind: "manhole", values: [1, -1] }, { kind: "flower", values: [2] }] };
    const tiles = [13, 3, 9];
    const state = upToMarks(3, { cards, six: (player) => (player === 0 ? 1 : 2), tile: (player) => tiles[player] });

    expect(state.phase).toBe("manholes");
    expect(onTurn(state)).toBe(0);
    expect(onTurn(skipMarks(state))).toBe(0);
  });

  it("gives 화합 its points when enough players lay their tile, and nothing when fewer do", () => {
    const cards: Dealt = { 7: [{ kind: "harmony", atLeast: 3, bonus: 4 }, { kind: "check", atMost: 2, bonus: 5 }] };
    const seven = (player: number): Option => (player < 2 ? 1 : 2);
    // tile 9 is two cells wide and five high: room for four of them side by side
    const all = layAll(upToLaying(4, { cards, seven, tile: 9, park: ["########", "########", "########", "########", "########"] }));
    // room for two tiles of nine cells
    const few = layAll(upToLaying(4, { cards, seven, tile: 13, park: ["######", "######", "######"] }));

    expect(all.placed).toHaveLength(4);
    expect([0, 1, 2, 3].map((player) => lineOf(all, player).harmony)).toEqual([4, 4, 0, 0]);
    expect([0, 1, 2, 3].map((player) => lineOf(all, player).check)).toEqual([0, 0, 0, 0]);
    expect(few.placed).toHaveLength(2);
    expect([0, 1, 2, 3].map((player) => lineOf(few, player).harmony)).toEqual([0, 0, 0, 0]);
    expect([0, 1, 2, 3].map((player) => lineOf(few, player).check)).toEqual([0, 0, 5, 5]);
  });

  it("gives 화합 its points to a player whose own tile was not laid, as 견제 does: the card counts tiles, not whose", () => {
    const cards: Dealt = { 7: [{ kind: "harmony", atLeast: 1, bonus: 4 }, { kind: "pair", perSide: 0 }] };
    let state = upToLaying(2, { cards, seven: 1, tile: 13, park: ["###", "###", "###"] });
    state = act(state, onTurn(state), { type: "lay", row: 0, col: 0, turns: 0 });

    expect(state.failed).toHaveLength(1);
    expect(lineOf(state, state.failed[0])).toMatchObject({ laid: false, harmony: 4, total: 4 });
  });

  it("gives 이웃 its points for every other tile that shares a side with the player's own", () => {
    const cards: Dealt = { 7: [{ kind: "neighbour", points: 2 }, { kind: "pair", perSide: 0 }] };
    let state = upToLaying(3, { cards, seven: (player) => (player === 2 ? 2 : 1), tile: 13, park: ["#########", "#########", "#########"] });
    const [a, b, c] = state.layOrder;
    // side by side, the first in the middle
    state = act(state, a, { type: "lay", row: 0, col: 3, turns: 0 });
    state = act(state, b, { type: "lay", row: 0, col: 0, turns: 0 });
    state = act(state, c, { type: "lay", row: 0, col: 6, turns: 0 });

    const points = (player: number): number => lineOf(state, player).neighbours;
    const expected = (player: number, touching: number): number => (player === 2 ? 0 : touching * 2);
    expect(points(a)).toBe(expected(a, 2));
    expect(points(b)).toBe(expected(b, 1));
    expect(points(c)).toBe(expected(c, 1));
    expect(lineOf(state, a).total).toBe(13 + expected(a, 2));
  });

  it("counts a tile that meets the player's own only at a corner as no neighbour, and gives nothing for a tile not laid", () => {
    const cards: Dealt = { 7: [{ kind: "neighbour", points: 2 }, { kind: "pair", perSide: 0 }] };
    let corners = upToLaying(2, { cards, seven: 1, tile: 13 });
    const [first, second] = corners.layOrder;
    corners = act(corners, first, { type: "lay", row: 0, col: 0, turns: 0 });
    corners = act(corners, second, { type: "lay", row: 3, col: 3, turns: 0 });
    let alone = upToLaying(2, { cards, seven: 1, tile: 13, park: ["###", "###", "###"] });
    alone = act(alone, onTurn(alone), { type: "lay", row: 0, col: 0, turns: 0 });

    expect(lineOf(corners, first).neighbours + lineOf(corners, second).neighbours).toBe(0);
    expect(lineOf(alone, 0).neighbours + lineOf(alone, 1).neighbours).toBe(0);
  });

  it("lets no cell of a tile lie over a rock, not even a holed one", () => {
    const park = { rows: ["###", "###", "###"] };
    const middle = { row: 1, col: 1 };

    // tile 13 has a hole in every cell but the one with its number
    expect(fits(park, [], 13, 0, 0, 0, { trees: [middle] })).toBe(true);
    expect(fits(park, [], 13, 0, 0, 0, { trees: [{ ...middle, rock: true }] })).toBe(false);
    expect(hasWay(park, [], 13, { trees: [middle] })).toBe(true);
    expect(hasWay(park, [], 13, { trees: [{ ...middle, rock: true }] })).toBe(false);
  });

  it("has the 바위 players put their rocks on the park when the trees are put, and fails a tile they leave no room for", () => {
    const cards: Dealt = { 8: [{ kind: "rock", count: 1 }, { kind: "tree", count: 1 }] };
    let state = upToMarks(2, { cards, eight: 1, tile: 13, park: ["###", "###", "###", "...", "###", "###", "###"] });
    const first = onTurn(state);
    const begun = state.phase;
    state = act(state, first, { type: "tree", row: 1, col: 1 });
    const second = onTurn(state);
    const taken = refusal(state, second, { type: "tree", row: 1, col: 1 });
    state = act(state, second, { type: "tree", row: 5, col: 1 });

    // nobody has a manhole or a flower bed to put: the park goes straight on to what stands in the way
    expect(begun).toBe("trees");
    expect(taken).toBe("bad-cell");
    expect(state.trees).toEqual([
      { row: 1, col: 1, by: first, rock: true },
      { row: 5, col: 1, by: second, rock: true },
    ]);
    expect(state.history.filter((event) => event.type === "tree")).toEqual([
      { type: "tree", round: 1, player: first, row: 1, col: 1, rock: true },
      { type: "tree", round: 1, player: second, row: 5, col: 1, rock: true },
    ]);
    expect(state.phase).toBe("ended");
    expect(state.failed.sort()).toEqual([0, 1]);
  });

  it("says a rock was not put when its player is out of time", () => {
    const cards: Dealt = { 8: [{ kind: "rock", count: 1 }, { kind: "tree", count: 1 }] };
    const state = upToMarks(2, { cards, eight: 1 });
    const first = onTurn(state);

    const over = applyTimeout(state, deadline(state, CONFIG)!, CONFIG);

    expect(over.history.at(-1)).toEqual({ type: "skip", round: 1, player: first, what: "rock", left: 1 });
    expect(over.trees).toEqual([]);
  });

  it("has a 꽃밭 player put a flower bed on the park with the manholes, and gives its points to the tile laid over it", () => {
    const cards: Dealt = { 8: [{ kind: "flower", values: [3] }, { kind: "manhole", values: [1, -1] }] };
    let state = upToMarks(2, { cards, eight: (player) => (player === 0 ? 1 : 2), tile: 13 });
    const begun = state.phase;
    // player 0 has one flower bed to put, player 1 a +1 and a -1: each where the test wants it, whoever is first
    const spots: Record<number, { row: number; col: number }[]> = { 0: [{ row: 0, col: 0 }], 1: [{ row: 1, col: 1 }, { row: 5, col: 5 }] };
    for (let step = 0; state.phase === "manholes"; step++) {
      expect(step).toBeLessThan(4);
      const player = onTurn(state);
      state = act(state, player, { type: "manhole", ...spots[player].shift()! });
    }
    const [one, other] = state.layOrder;
    const laying = state.phase;
    state = act(state, one, { type: "lay", row: 0, col: 0, turns: 0 });
    state = act(state, other, { type: "lay", row: 3, col: 3, turns: 0 });

    expect(begun).toBe("manholes");
    // nobody has a tree or a rock to put: the laying follows
    expect(laying).toBe("place");
    expect(state.manholes).toContainEqual({ row: 0, col: 0, value: 3, by: 0, flower: true });
    expect(state.manholes).toContainEqual({ row: 1, col: 1, value: 1, by: 1 });
    expect(state.history).toContainEqual({ type: "manhole", round: 1, player: 0, row: 0, col: 0, value: 3, flower: true });
    expect(lineOf(state, one)).toMatchObject({ flowers: 3, manholes: 1, total: 17 });
    expect(lineOf(state, other)).toMatchObject({ flowers: 0, manholes: -1, total: 12 });
  });

  it("puts no flower bed on a manhole, nor a manhole on a flower bed, and says a flower bed was not put when its player is out of time", () => {
    const cards: Dealt = { 8: [{ kind: "flower", values: [3] }, { kind: "manhole", values: [1, -1] }] };
    const state = upToMarks(2, { cards, eight: (player) => (player === 0 ? 1 : 2), tile: (player) => (player === 0 ? 3 : 13) });
    const put = act(state, 0, { type: "manhole", row: 2, col: 2 });

    const over = applyTimeout(state, deadline(state, CONFIG)!, CONFIG);

    // tile 3 is laid first, so its player marks first
    expect(onTurn(state)).toBe(0);
    expect(refusal(put, 1, { type: "manhole", row: 2, col: 2 })).toBe("bad-cell");
    expect(over.history.at(-1)).toEqual({ type: "skip", round: 1, player: 0, what: "flower", left: 1 });
  });
});

describe("잔디 깔기: the document's options with other numbers", () => {
  it("gives 공격 the tile's number as many times over as the card says, and takes what the card says", () => {
    const cards: Dealt = { 6: [{ kind: "attack", times: 3, loss: 8 }, { kind: "defend", cells: 1 }] };
    const laid = layAll(upToLaying(2, { cards, six: 1, tile: 9 }));
    let failed = upToLaying(2, { cards, six: 1, tile: 13, park: ["###", "###", "###"] });
    failed = act(failed, onTurn(failed), { type: "lay", row: 0, col: 0, turns: 0 });

    expect(lineOf(laid, 0)).toMatchObject({ laid: true, tile: 27, total: 27 });
    expect(lineOf(failed, failed.failed[0])).toMatchObject({ laid: false, tile: -8, total: -8 });
  });

  it("lets a 방어 player cut no more cells than the card says", () => {
    const cards: Dealt = { 6: [{ kind: "defend", cells: 1 }, { kind: "insure", points: 0 }] };
    const state = upToLaying(2, { cards, six: 1, tile: 13, park: ["####", "####", "####", "####"] });
    const player = onTurn(state);

    expect(refusal(state, player, { type: "lay", row: 0, col: 0, turns: 0, cut: [{ row: 2, col: 0 }, { row: 2, col: 1 }] })).toBe("bad-cut");
    expect(act(state, player, { type: "lay", row: 0, col: 0, turns: 0, cut: [{ row: 2, col: 0 }] }).placed[0].cut).toEqual([{ row: 2, col: 0 }]);
  });

  it("fails a 방어 player whose tile would only fit with more cut off it than the card allows", () => {
    // tile 13 less the two right cells of its bottom row
    const park = ["###", "###", "#.."];
    const two: Dealt = { 6: [{ kind: "defend", cells: 2 }, { kind: "insure", points: 0 }] };
    const one: Dealt = { 6: [{ kind: "defend", cells: 1 }, { kind: "insure", points: 0 }] };

    const roomy = upToLaying(2, { cards: two, six: 1, tile: 13, park });
    const tight = upToLaying(2, { cards: one, six: 1, tile: 13, park });

    expect(roomy.phase).toBe("place");
    expect(roomy.failed).toEqual([]);
    expect(tight.phase).toBe("ended");
    expect(tight.failed.sort()).toEqual([0, 1]);
  });

  it("gives a pair as many points for each side their tiles share as the card says", () => {
    const cards: Dealt = { 7: [{ kind: "pair", perSide: 2 }, { kind: "neighbour", points: 0 }] };
    let state = upToLaying(2, { cards, seven: 1, tile: 13 });
    const [first, second] = state.layOrder;
    state = act(state, first, { type: "lay", row: 0, col: 0, turns: 0 });
    // side by side: three sides shared, six points between the two
    state = act(state, second, { type: "lay", row: 0, col: 3, turns: 0 });

    expect(lineOf(state, first)).toMatchObject({ pair: 3, total: 16 });
    expect(lineOf(state, second)).toMatchObject({ pair: 3, total: 16 });
  });

  it("gives 견제 the card's points with the card's number of players or fewer", () => {
    const cards: Dealt = { 7: [{ kind: "check", atMost: 1, bonus: 6 }, { kind: "neighbour", points: 0 }] };
    // room for two tiles of nine cells, and for one
    const two = layAll(upToLaying(4, { cards, seven: 1, tile: 13, park: ["######", "######", "######"] }));
    const one = layAll(upToLaying(4, { cards, seven: 1, tile: 13, park: ["###", "###", "###"] }));

    expect(two.placed).toHaveLength(2);
    expect([0, 1, 2, 3].map((player) => lineOf(two, player).check)).toEqual([0, 0, 0, 0]);
    expect(one.placed).toHaveLength(1);
    expect([0, 1, 2, 3].map((player) => lineOf(one, player).check)).toEqual([6, 6, 6, 6]);
  });

  it("has a 가로수 player put as many trees as the card says, each in a time of its own", () => {
    const cards: Dealt = { 8: [{ kind: "tree", count: 2 }, { kind: "rock", count: 1 }] };
    const state = upToMarks(2, { cards, eight: 1 });
    const first = onTurn(state);

    const one = act(state, first, { type: "tree", row: 0, col: 0 }, START + 2000);
    const two = act(one, first, { type: "tree", row: 0, col: 1 }, START + 3000);
    const over = applyTimeout(one, START + 2000 + MARK_MS, CONFIG);

    expect(one.turn).toEqual({ player: first, since: START + 2000 });
    expect(two.trees).toEqual([
      { row: 0, col: 0, by: first },
      { row: 0, col: 1, by: first },
    ]);
    expect(onTurn(two)).not.toBe(first);
    expect(applyTimeout(one, START + 2000 + MARK_MS - 1, CONFIG)).toBe(one);
    expect(over.history.at(-1)).toEqual({ type: "skip", round: 1, player: first, what: "tree", left: 1 });
  });

  it("has a 맨홀 player put the manholes the card names, in its order, and counts each for what it says", () => {
    const cards: Dealt = { 8: [{ kind: "manhole", values: [2, -2] }, { kind: "tree", count: 1 }] };
    let state = upToMarks(2, { cards, eight: 1, tile: 13 });
    const first = onTurn(state);
    state = act(state, first, { type: "manhole", row: 0, col: 0 });
    state = act(state, first, { type: "manhole", row: 5, col: 5 });
    state = skipMarks(state);
    const [one, other] = state.layOrder;
    state = act(state, one, { type: "lay", row: 0, col: 0, turns: 0 });
    state = act(state, other, { type: "lay", row: 3, col: 3, turns: 0 });

    expect(state.manholes).toEqual([
      { row: 0, col: 0, value: 2, by: first },
      { row: 5, col: 5, value: -2, by: first },
    ]);
    expect(lineOf(state, one)).toMatchObject({ manholes: 2, flowers: 0, total: 15 });
    expect(lineOf(state, other)).toMatchObject({ manholes: -2, total: 11 });
  });
});

describe("잔디 깔기: the room choosing from a card for a player who does not", () => {
  /** The option the room takes for everyone at each of the choices 6 to 8, with `cards`. */
  function forced(cards: Dealt): number[] {
    let state = pickAll(chooseAll(dealt(game(2), cards), 1), 9);
    const options: number[] = [];
    for (let step = 0; step < 3; step++) {
      state = applyTimeout(state, deadline(state, CONFIG)!, CONFIG);
      const event = state.history.filter((each) => each.type === "choice").at(-1);
      if (event?.type === "choice") options.push(...new Set(event.chosen.map((each) => each.option)));
    }
    return options;
  }

  it("takes the option with nothing to lose, wherever on the card it is", () => {
    const attack: Effect = { kind: "attack", times: 2, loss: 4 };
    const insure: Effect = { kind: "insure", points: 2 };
    const pair: Effect = { kind: "pair", perSide: 1 };
    const neighbour: Effect = { kind: "neighbour", points: 1 };
    const manhole: Effect = { kind: "manhole", values: [1, -1] };
    const rock: Effect = { kind: "rock", count: 1 };

    expect(forced({ 6: [attack, insure], 7: [pair, neighbour], 8: [manhole, rock] })).toEqual([2, 2, 2]);
    expect(forced({ 6: [insure, attack], 7: [neighbour, pair], 8: [rock, manhole] })).toEqual([1, 1, 1]);
  });

  it("says the room chose", () => {
    const state = applyTimeout(game(2, { deck: "fresh", chance: words(3) }), START + CONFIG.chooseSeconds * 1000, CONFIG);

    const event = state.history.at(-1);
    expect(event?.type === "choice" ? event.chosen : []).toEqual([
      { player: state.players[0].id, option: 1, forced: true },
      { player: state.players[1].id, option: 1, forced: true },
    ]);
  });
});
