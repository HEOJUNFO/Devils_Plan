import { describe, expect, it } from "vitest";
import shipped from "../../../src/shared/games/lay-the-grass/config.json";
import hostJson from "../../../src/shared/games/lay-the-grass/host-config.json";
import { grassHost, type GrassSession, type GrassSnapshot } from "../../../src/shared/games/lay-the-grass/host";
import { awaited } from "../../../src/shared/games/lay-the-grass/rules";
import type { Candidate, Presence, StartRequest } from "../../../src/shared/hosting";

/** The game as shipped: one park, with the either-or choices. */
const host = grassHost;

/** The time the fixtures start at, in ms since the epoch. */
const T0 = 1_800_000_000_000;
const CHOOSE_MS = shipped.chooseSeconds * 1000;
const STAND_MS = hostJson.standSeconds * 1000;
/** With bots asked for, the room fills up to this many players. */
const WITH_BOTS = 4;

/** The token of fixture player `n`. */
function tokenOf(n: number): string {
  return `token-of-player-${n}`;
}

/** Lobby players 0..count-1 in their slots. */
function candidates(count: number): Candidate[] {
  return Array.from({ length: count }, (_, n) => ({ token: tokenOf(n), nick: `p${n}`, slot: n }));
}

/** Everyone in `players` holds a slot unless named in `left`; those not named in `away` or `left` are connected. */
function presenceOf(players: Candidate[], away: number[] = [], left: number[] = []): Presence {
  const seated = players.filter((p) => !left.includes(p.slot));
  return {
    seated: new Set(seated.map((p) => p.token)),
    connected: new Set(seated.filter((p) => !away.includes(p.slot)).map((p) => p.token)),
  };
}

/** What the room asks a game to start with: the show's cards, which these tests are about, unless the test asks otherwise. */
function request(overrides: Partial<StartRequest> = {}): StartRequest {
  return { by: tokenOf(0), bots: false, allowBots: false, seed: 7, now: T0, turnSeconds: 0, variant: "show", ...overrides };
}

/** A game just started by player 0 for `players`, all connected. */
function started(players: Candidate[], overrides: Partial<StartRequest> = {}): GrassSession {
  const result = host.start(null, players, request(overrides), presenceOf(players));
  if (!result.ok) throw new Error(`fixture start refused: ${result.reason}`);
  return result.session;
}

/** What `player` is sent at `now`. */
function seenBy(session: GrassSession, players: Candidate[], player: number | null, now: number, presence = presenceOf(players)): GrassSnapshot {
  return host.view(session, player === null ? null : tokenOf(player), presence, now) as GrassSnapshot;
}

/** Applies something the test expects to be accepted. */
function act(session: GrassSession, players: Candidate[], player: number, action: unknown, now: number): GrassSession {
  const result = host.act(session, tokenOf(player), action, presenceOf(players), now);
  if (!result.ok) throw new Error(`fixture action refused: ${result.reason}`);
  return result.session;
}

describe("잔디 깔기 in a room: the either-or choices", () => {
  it("starts with choice 5 put to everyone, and its time on the clock", () => {
    const players = candidates(3);

    const session = started(players);

    const sent = seenBy(session, players, 1, T0);
    expect(sent.view.phase).toBe("choose");
    expect(sent.view.choosing).toEqual({ which: 5, chosen: [], mine: null });
    expect(sent.clock.turn).toBe(CHOOSE_MS);
    expect(host.deadline(session)).toBe(T0 + CHOOSE_MS);
    expect(session.waiting).toBeNull();
  });

  it("tells the screen the numbers on a card with the card, when it comes up", () => {
    const players = candidates(2);

    const sent = seenBy(started(players), players, 0, T0);

    expect(sent.rules).toEqual({ rounds: shipped.rounds, pickSeconds: shipped.pickSeconds, placeSeconds: shipped.placeSeconds });
    expect(sent.view.cards).toEqual([{ which: 5, options: shipped.cards.show["5"] }]);
  });

  it("sends nobody what another player has chosen until everyone has", () => {
    const players = candidates(3);
    const session = act(started(players), players, 1, { type: "choose", option: 2 }, T0 + 1000);

    const own = seenBy(session, players, 1, T0 + 1000);
    const other = seenBy(session, players, 0, T0 + 1000);
    const watching = seenBy(session, players, null, T0 + 1000);

    expect(own.view.choosing).toEqual({ which: 5, chosen: [1], mine: 2 });
    expect(other.view.choosing).toEqual({ which: 5, chosen: [1], mine: null });
    expect(JSON.stringify(other.view)).not.toContain('"option"');
    expect(JSON.stringify(watching.view)).not.toContain('"option"');
  });

  it("goes on to the picking when the last player has chosen", () => {
    const players = candidates(2);
    let session = started(players);
    session = act(session, players, 0, { type: "choose", option: 1 }, T0 + 1000);
    session = act(session, players, 1, { type: "choose", option: 2 }, T0 + 2000);

    const sent = seenBy(session, players, 1, T0 + 2000);
    expect(sent.view.phase).toBe("pick");
    expect(sent.view.choices).toEqual([
      expect.objectContaining({ which: 5, forced: false }),
      expect.objectContaining({ which: 5, forced: false }),
    ]);
    // the one who chose 정보 may look ahead, and picks first: they have no points
    expect(sent.view.preview).toEqual([6, 7, 8]);
    expect(sent.view.turn).toBe(1);
  });

  it("has every bot choose at once, and waits for the people", () => {
    const players = candidates(1);

    const session = started(players, { bots: true, allowBots: true });

    expect(session.players).toHaveLength(WITH_BOTS);
    expect(awaited(session.state)).toEqual([0]);
    expect(seenBy(session, players, 0, T0).view.choosing?.chosen.sort()).toEqual([1, 2, 3]);
  });

  it("chooses at once for a player who has left the room", () => {
    const players = candidates(3);
    const session = started(players);

    const after = host.attend(session, presenceOf(players, [], [2]), T0 + 1000);

    expect(awaited(after.state).sort()).toEqual([0, 1]);
    // 점수, the option with nothing to lose
    expect(after.state.choices).toEqual([{ player: 2, which: 5, option: 1, forced: true }]);
  });

  it("gives a player who is only disconnected the whole time of the choice", () => {
    const players = candidates(3);
    const session = started(players);

    const after = host.attend(session, presenceOf(players, [2]), T0 + 1000);

    expect(awaited(after.state).sort()).toEqual([0, 1, 2]);
    expect(host.deadline(after)).toBe(T0 + CHOOSE_MS);
  });

  it("chooses for everyone still to choose when the time is up", () => {
    const players = candidates(3);
    const session = act(started(players), players, 0, { type: "choose", option: 2 }, T0 + 1000);

    const before = host.tick(session, presenceOf(players), T0 + CHOOSE_MS - 1);
    const after = host.tick(session, presenceOf(players), T0 + CHOOSE_MS);

    expect(before).toBe(session);
    expect(after.state.phase).toBe("pick");
    expect(after.state.choices.filter((chosen) => chosen.forced).map((chosen) => chosen.player).sort()).toEqual([1, 2]);
  });

  it("refuses a choice that comes after its time, even before the clock has said so", () => {
    const players = candidates(2);
    const session = started(players);

    const late = host.act(session, tokenOf(0), { type: "choose", option: 2 }, presenceOf(players), T0 + CHOOSE_MS);

    expect(late).toEqual({ ok: false, reason: "not-choosing" });
  });

  it("stands still during a choice when none of its people is connected, and gives the time back", () => {
    const players = candidates(2);
    const session = started(players);
    const stood = 40_000;

    const still = host.attend(session, presenceOf(players, [0, 1]), T0 + 5000);
    const back = host.attend(still, presenceOf(players, [1]), T0 + 5000 + stood);

    expect(still.frozenAt).toBe(T0 + 5000);
    expect(host.deadline(still)).toBe(T0 + 5000 + STAND_MS);
    expect(back.frozenAt).toBeNull();
    expect(host.deadline(back)).toBe(T0 + CHOOSE_MS + stood);
  });

  it("plays a whole game through its choices with bots, the person never moving", () => {
    const players = candidates(1);
    let session = started(players, { bots: true, allowBots: true });

    for (let step = 0; host.running(session); step++) {
      expect(step).toBeLessThan(400);
      session = host.tick(session, presenceOf(players), host.deadline(session)!);
    }

    const history = session.state.history;
    expect(history.filter((event) => event.type === "choice").map((event) => (event.type === "choice" ? event.which : 0))).toEqual([5, 6, 7, 8]);
    expect(history.filter((event) => event.type === "pick")).toHaveLength(WITH_BOTS);
    expect(history.some((event) => event.type === "score")).toBe(true);
    expect(history.at(-1)).toEqual({ type: "ended", round: 1, reason: "rounds" });
    // the person was chosen for every time, and the bots chose for themselves
    const mine = session.state.choices.filter((chosen) => chosen.player === 0);
    expect(mine.map((chosen) => chosen.forced)).toEqual([true, true, true, true]);
    expect(session.state.choices.filter((chosen) => chosen.player !== 0).every((chosen) => !chosen.forced)).toBe(true);
  });

  it("has the bots put their manholes and trees on the park when their turn comes", () => {
    const players = candidates(1);
    let session = started(players, { bots: true, allowBots: true, seed: 3 });

    for (let step = 0; host.running(session) && session.state.phase !== "place"; step++) {
      expect(step).toBeLessThan(400);
      session = host.tick(session, presenceOf(players), host.deadline(session)!);
    }

    const state = session.state;
    const eight = state.choices.filter((chosen) => chosen.which === 8 && chosen.player !== 0);
    const manholeBots = eight.filter((chosen) => chosen.option === 2).length;
    const treeBots = eight.filter((chosen) => chosen.option === 1).length;
    expect(state.manholes.filter((manhole) => manhole.by !== 0)).toHaveLength(manholeBots * 2);
    expect(state.trees.filter((tree) => tree.by !== 0)).toHaveLength(treeBots);
    // the person put nothing down: the room does not mark the park for anyone
    expect(state.manholes.some((manhole) => manhole.by === 0)).toBe(false);
    expect(state.trees.some((tree) => tree.by === 0)).toBe(false);
  });

  it("does not carry on with a game stored before the choices were in it, or before its cards were", () => {
    const session = started(candidates(2));
    const old = { ...session, version: 1, state: { ...session.state, version: 1 } };
    const cardless = { ...session, version: 2, state: { ...session.state, version: 2 } };

    expect(host.usable(JSON.parse(JSON.stringify(session)))).toBe(true);
    expect(host.usable(old)).toBe(false);
    expect(host.usable(cardless)).toBe(false);
    expect(host.usable({ ...session, state: { ...session.state, choices: undefined } })).toBe(false);
    expect(host.usable({ ...session, state: { ...session.state, decks: undefined } })).toBe(false);
  });
});
