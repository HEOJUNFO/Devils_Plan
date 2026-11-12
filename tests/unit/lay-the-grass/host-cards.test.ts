import { describe, expect, it } from "vitest";
import { chanceOf, randomSource } from "../../../src/shared/game/rng";
import { CHOICES, KINDS, drawCards, showCards } from "../../../src/shared/games/lay-the-grass/cards";
import shipped from "../../../src/shared/games/lay-the-grass/config.json";
import { grassHost, type GrassSession, type GrassSnapshot } from "../../../src/shared/games/lay-the-grass/host";
import { cardsOf, effectOf } from "../../../src/shared/games/lay-the-grass/rules";
import type { Candidate, Presence, StartRequest } from "../../../src/shared/hosting";

/** The game as shipped. */
const host = grassHost;

/** The time the fixtures start at, in ms since the epoch. */
const T0 = 1_800_000_000_000;

/** The kinds a card drawn for choice 6, 7 or 8 may have. */
const DRAWN_KINDS = Object.values(shipped.cards.slots).flat();

/** The token of fixture player `n`. */
function tokenOf(n: number): string {
  return `token-of-player-${n}`;
}

/** Lobby players 0..count-1 in their slots. */
function candidates(count: number): Candidate[] {
  return Array.from({ length: count }, (_, n) => ({ token: tokenOf(n), nick: `p${n}`, slot: n }));
}

/** Everyone in `players` holds a slot and is connected. */
function presenceOf(players: Candidate[]): Presence {
  const tokens = new Set(players.map((p) => p.token));
  return { seated: tokens, connected: tokens };
}

/** Numbers of 32 bits such as a room gives a game, made up for a test: the same for the same `n`. */
function words(n: number): number[] {
  const source = randomSource(n * 7919 + 1);
  return Array.from({ length: 256 }, () => Math.floor(source.next() * 4294967296));
}

/** What a room asks a game to start with when it has said nothing of the cards: its first variant, and numbers of its own. */
function request(overrides: Partial<StartRequest> = {}): StartRequest {
  return { by: tokenOf(0), bots: false, allowBots: false, seed: 7, chance: words(2), now: T0, turnSeconds: 0, ...overrides };
}

/** A game just started by player 0 for `players`, all connected. */
function started(players: Candidate[], overrides: Partial<StartRequest> = {}): GrassSession {
  const result = host.start(null, players, request(overrides), presenceOf(players));
  if (!result.ok) throw new Error(`fixture start refused: ${result.reason}`);
  return result.session;
}

/** What `player` is sent at `now`. */
function seenBy(session: GrassSession, players: Candidate[], player: number | null, now: number): GrassSnapshot {
  return host.view(session, player === null ? null : tokenOf(player), presenceOf(players), now) as GrassSnapshot;
}

/** Applies something the test expects to be accepted. */
function act(session: GrassSession, players: Candidate[], player: number, action: unknown, now: number): GrassSession {
  const result = host.act(session, tokenOf(player), action, presenceOf(players), now);
  if (!result.ok) throw new Error(`fixture action refused: ${result.reason}`);
  return result.session;
}

/** The kinds of drawn option that what is sent as `sent` says anything of. */
function tellsOf(sent: unknown): string[] {
  const text = JSON.stringify(sent);
  return DRAWN_KINDS.filter((kind) => text.includes(`"${kind}"`));
}

describe("잔디 깔기 in a room: the cards of a game", () => {
  it("starts a game on cards drawn for it from the numbers the room gives, when the room has said nothing of the cards", () => {
    const players = candidates(3);

    const session = started(players);

    expect(cardsOf(session.state)).toEqual(drawCards(chanceOf(words(2))(() => 0), shipped.choices, 3, shipped.cards));
    expect(cardsOf(started(players, { seed: 8 }).state)).toEqual(cardsOf(session.state));
    expect(cardsOf(started(players, { chance: words(3) }).state)).not.toEqual(cardsOf(session.state));
  });

  it("starts it on the show's cards when the room asks for them by name, and on drawn ones for any other word", () => {
    const players = candidates(3);

    expect(cardsOf(started(players, { variant: "show" }).state)).toEqual(showCards(CHOICES, 3, shipped.cards));
    expect(cardsOf(started(players, { variant: "fresh" }).state)).toEqual(cardsOf(started(players).state));
    expect(cardsOf(started(players, { variant: "anything" }).state)).toEqual(cardsOf(started(players).state));
  });

  it("sends at the start the first card alone, to everyone, and no number of the cards to come", () => {
    const players = candidates(3);
    const session = started(players);

    for (const viewer of [0, 1, 2, null]) {
      const sent = seenBy(session, players, viewer, T0);
      expect(sent.rules).toEqual({ rounds: shipped.rounds, pickSeconds: shipped.pickSeconds, placeSeconds: shipped.placeSeconds });
      expect(sent.view.cards.map((card) => card.which)).toEqual([5]);
      expect(tellsOf(sent)).toEqual([]);
    }
  });

  it("sends the cards to come to a player who chose 정보, once everyone has chosen, and to nobody else", () => {
    const players = candidates(3);
    let session = started(players);
    session = act(session, players, 0, { type: "choose", option: 1 }, T0 + 1000);
    session = act(session, players, 1, { type: "choose", option: 2 }, T0 + 2000);
    const early = seenBy(session, players, 1, T0 + 2000);
    session = act(session, players, 2, { type: "choose", option: 1 }, T0 + 3000);

    const informed = seenBy(session, players, 1, T0 + 3000);
    // while the choice is open, not even the player who has chosen 정보 is sent anything of them
    expect(tellsOf(early)).toEqual([]);
    expect(informed.view.preview).toEqual([6, 7, 8]);
    expect(informed.view.cards).toEqual(cardsOf(session.state));
    for (const viewer of [0, 2, null]) {
      const sent = seenBy(session, players, viewer, T0 + 3000);
      expect(sent.view.cards.map((card) => card.which)).toEqual([5]);
      expect(tellsOf(sent)).toEqual([]);
    }
  });

  it("never sends the game's own keeping of its cards", () => {
    const players = candidates(2);
    const session = started(players);

    expect(JSON.stringify(seenBy(session, players, 0, T0))).not.toContain("decks");
  });

  it("plays a whole game through with bots whatever cards were drawn, each bot putting on the park what its card has it put", () => {
    const players = candidates(1);
    const kinds = new Set<string>();
    for (let n = 1; n <= 60; n++) {
      let session = started(players, { bots: true, allowBots: true, seed: n, chance: words(n) });
      for (const card of cardsOf(session.state)) for (const effect of card.options) kinds.add(effect.kind);
      for (let step = 0; host.running(session); step++) {
        expect(step).toBeLessThan(600);
        session = host.tick(session, presenceOf(players), host.deadline(session)!);
      }

      const state = session.state;
      expect(state.history.at(-1)).toEqual({ type: "ended", round: 1, reason: "rounds" });
      const score = state.history.find((event) => event.type === "score");
      for (const line of score?.type === "score" ? score.lines : []) {
        expect(line.total).toBe(line.tile + line.manholes + line.flowers + line.pair + line.check + line.harmony + line.neighbours);
      }
      for (const bot of [1, 2, 3]) {
        const cells = effectOf(state, bot, "manhole") ?? effectOf(state, bot, "flower");
        const stands = effectOf(state, bot, "tree") ?? effectOf(state, bot, "rock");
        expect(state.manholes.filter((each) => each.by === bot).map((each) => each.value)).toEqual(cells?.values ?? []);
        expect(state.manholes.filter((each) => each.by === bot).every((each) => (each.flower === true) === (cells?.kind === "flower"))).toBe(true);
        expect(state.trees.filter((each) => each.by === bot)).toHaveLength(stands?.count ?? 0);
        expect(state.trees.filter((each) => each.by === bot).every((each) => (each.rock === true) === (stands?.kind === "rock"))).toBe(true);
      }
      // the person never moved: the room put nothing on the park for them
      expect(state.manholes.some((each) => each.by === 0)).toBe(false);
      expect(state.trees.some((each) => each.by === 0)).toBe(false);
    }
    // over these games every kind of option there is was on a card
    expect([...kinds].sort()).toEqual([...KINDS].sort());
  });
});
