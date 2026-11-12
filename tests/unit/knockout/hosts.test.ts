import { describe, expect, it } from "vitest";
import { applyAction, volley, type GameState } from "../../../src/shared/game";
import { rouletteHost } from "../../../src/shared/game/host";
import { rectanglesHost } from "../../../src/shared/games/count-rectangles/host";
import { cubesHost } from "../../../src/shared/games/count-cubes/host";
import { grassHost } from "../../../src/shared/games/lay-the-grass/host";
import { pokerHost } from "../../../src/shared/games/memory-poker/host";
import { marketHost } from "../../../src/shared/games/mystery-stock-market/host";
import { underHost } from "../../../src/shared/games/under-thirteen/host";
import { GAME_IDS } from "../../../src/shared/games";
import { CHANCE_WORDS, type Candidate, type Presence, type StartRequest } from "../../../src/shared/hosting";
import { HOSTS } from "../../../src/shared/hosts";
import { RULES, freshGame, withCredits, withOut } from "../game/fixtures";

/**
 * How each game says it ended for its players, as a room playing 탈락전
 * asks its host. The games are started as a room starts them and their ends
 * are put in place by hand: what is under test is what is read off an end.
 */

const T0 = 1_800_000_000_000;
const tokenOf = (n: number): string => `token-of-player-${n}`;
const candidates = (count: number): Candidate[] => Array.from({ length: count }, (_, n) => ({ token: tokenOf(n), nick: `p${n}`, slot: n }));
const presenceOf = (players: Candidate[]): Presence => ({ seated: new Set(players.map((p) => p.token)), connected: new Set(players.map((p) => p.token)) });
const chance = Array.from({ length: CHANCE_WORDS }, (_, n) => Math.imul(n + 1, 2654435761) >>> 0);
const request = (overrides: Partial<StartRequest> = {}): StartRequest => ({ by: tokenOf(0), bots: false, allowBots: false, seed: 7, chance, now: T0, turnSeconds: 0, ...overrides });

/** A game of `host` just started for `count` people. */
function started<S>(host: { start(current: S | null, players: Candidate[], request: StartRequest, presence: Presence): { ok: true; session: S } | { ok: false; reason: string } }, count: number, overrides: Partial<StartRequest> = {}): S {
  const players = candidates(count);
  const result = host.start(null, players, request(overrides), presenceOf(players));
  if (!result.ok) throw new Error(`fixture start refused: ${result.reason}`);
  return result.session;
}

/** The places of `lines`, in the order of the players; `null` where there are none. */
const placesIn = (lines: { token: string | null; place: number }[] | null | undefined): number[] | null => (lines === null || lines === undefined ? null : lines.map((line) => line.place));

describe("how every game says it ended", () => {
  it.each(GAME_IDS)("%s has places to tell, and none while it is being played", (game) => {
    const host = HOSTS[game];
    const players = candidates(game === "russian-roulette" ? 4 : 2);
    const begun = host.start(null, players, request(), presenceOf(players));
    if (!begun.ok) throw new Error(`fixture start refused: ${begun.reason}`);

    expect(host.places).toBeDefined();
    expect(host.places?.(begun.session)).toBeNull();
  });
});

describe("러시안 룰렛", () => {
  it("has those the last volley hit in last place and the rest in first, each by their token", () => {
    const session = started(rouletteHost, RULES.seats);
    // a game one seat short of its end, ended by seat 0's last credit
    const out = Array.from({ length: RULES.endWhenOut - 1 }, (_, i) => RULES.seats - 1 - i);
    const result = applyAction(withCredits(withOut(freshGame(), out), 0, RULES.costPublic), 0, { type: "public", pair: 0 }, RULES);
    if (!result.ok) throw new Error("fixture move refused");
    const state: GameState = result.state;
    const hit = volley(state).hitSeats;

    const lines = rouletteHost.places?.({ ...session, state });

    expect(state.phase).toBe("ended");
    expect(hit.length).toBeGreaterThan(0);
    expect(placesIn(lines)).toEqual(Array.from({ length: RULES.seats }, (_, seat) => (hit.includes(seat) ? 2 : 1)));
    expect(lines?.map((line) => line.token)).toEqual(session.tokens);
  });
});

describe("무거운 13", () => {
  function over(points: number[], reason: "rounds" | "left" | "abandoned" = "rounds") {
    const session = started(underHost, points.length);
    const penalties = points.map((each, player) => ({ player, points: each, last: each === 0 ? 0 : player + 1 }));
    return { ...session, state: { ...session.state, phase: "ended" as const, penalties, history: [...session.state.history, { type: "ended" as const, reason }] } };
  }

  it("has the fewest penalty points first, and no places for a game cut short", () => {
    expect(placesIn(underHost.places?.(over([5, 0, 9])))).toEqual([2, 1, 3]);
    expect(underHost.places?.(over([5, 0, 9], "left"))).toBeNull();
    expect(underHost.places?.(over([5, 0, 9], "abandoned"))).toBeNull();
  });
});

describe("미스터리 거래소", () => {
  function over(cash: number[], reason: "rounds" | "left" | "abandoned" = "rounds") {
    const session = started(marketHost, cash.length, { variant: "show" });
    const accounts = session.state.accounts.map((account, at) => ({ ...account, cash: cash[at], shares: Object.fromEntries(Object.keys(account.shares).map((stock) => [stock, 0])) as typeof account.shares }));
    return { ...session, state: { ...session.state, phase: "ended" as const, accounts, history: [...session.state.history, { type: "ended" as const, reason }] } };
  }

  it("has the most assets first, and no places for a game cut short", () => {
    expect(placesIn(marketHost.places?.(over([300, 900, 100])))).toEqual([2, 1, 3]);
    expect(marketHost.places?.(over([300, 900], "left"))).toBeNull();
  });
});

describe("네모 세기", () => {
  function over(totals: number[], reason: "half" | "problems" | "abandoned" = "half") {
    const session = started(rectanglesHost, totals.length);
    const scores = totals.map((total, player) => ({ player, race: total, choice: 0, pieces: 0, total }));
    return { ...session, state: { ...session.state, phase: "ended" as const, scores, history: [...session.state.history, { type: "ended" as const, round: session.state.round, reason }] } };
  }

  it("has the most points first, those level together, and no places for a game given up", () => {
    expect(placesIn(rectanglesHost.places?.(over([7, -3, 7])))).toEqual([1, 3, 1]);
    expect(rectanglesHost.places?.(over([7, -3], "abandoned"))).toBeNull();
  });

  it("gives a team one place, by its points a member: how it shared them out puts none of its own behind", () => {
    const team = (members: number[]) => ({ members, wins: 0, place: 0, leader: members[0] });
    const teamed = (totals: number[], units: number[][]) => {
      const session = over(totals);
      return { ...session, state: { ...session.state, units: units.map(team) } };
    };

    // one team racing nobody: the leader took more, and nobody is last
    expect(placesIn(rectanglesHost.places?.(teamed([5, 2, 2], [[0, 1, 2]])))).toEqual([1, 1, 1]);
    // two teams: 6 points a pair against 4, whatever each member holds
    expect(placesIn(rectanglesHost.places?.(teamed([5, 1, 2, 2], [[0, 1], [2, 3]])))).toEqual([1, 1, 2, 2]);
  });
});

describe("잔디 깔기", () => {
  function over(points: number[], reason: "rounds" | "abandoned" = "rounds") {
    const session = started(grassHost, points.length);
    const players = session.state.players.map((each, at) => ({ ...each, score: points[at] }));
    return { ...session, state: { ...session.state, phase: "ended" as const, players, history: [...session.state.history, { type: "ended" as const, round: session.state.round, reason }] } };
  }

  it("has the most points first, and no places for a game given up", () => {
    expect(placesIn(grassHost.places?.(over([12, 30, 12])))).toEqual([2, 1, 2]);
    expect(grassHost.places?.(over([12, 30], "abandoned"))).toBeNull();
  });
});

describe("큐브 세기", () => {
  function over(ranked: number[], count: number, reason: "ranked" | "time" | "abandoned" = "time") {
    const session = started(cubesHost, count);
    return { ...session, state: { ...session.state, phase: "ended" as const, ranked: ranked.map((player, at) => ({ player, took: 1000 * (at + 1) })), history: [...session.state.history, { type: "ended" as const, reason }] } };
  }

  it("has those who had the answer in the order they had it, and the rest together after them", () => {
    expect(placesIn(cubesHost.places?.(over([2, 0], 4)))).toEqual([2, 3, 1, 3]);
    expect(placesIn(cubesHost.places?.(over([1, 0], 2, "ranked")))).toEqual([2, 1]);
  });

  it("has everyone level where nobody had the answer, and no places for a game given up", () => {
    expect(placesIn(cubesHost.places?.(over([], 3)))).toEqual([1, 1, 1]);
    expect(cubesHost.places?.(over([0], 2, "abandoned"))).toBeNull();
  });
});

describe("기억 포커", () => {
  function over(wins: number[], reason: "rounds" | "left" | "abandoned" = "rounds") {
    const session = started(pokerHost, wins.length);
    const tallies = wins.map((each, player) => ({ player, wins: each, ties: 0, losses: 0 }));
    return { ...session, state: { ...session.state, phase: "ended" as const, tallies, history: [...session.state.history, { type: "ended" as const, reason }] } };
  }

  it("has the standings of a game played out, and no places for one cut short", () => {
    expect(placesIn(pokerHost.places?.(over([2, 0, 1])))).toEqual([1, 3, 2]);
    expect(pokerHost.places?.(over([2, 0], "left"))).toBeNull();
  });
});
