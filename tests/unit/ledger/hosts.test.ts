import { describe, expect, it } from "vitest";
import { rectanglesHost } from "../../../src/shared/games/count-rectangles/host";
import rectConfig from "../../../src/shared/games/count-rectangles/config.json";
import marketConfig from "../../../src/shared/games/mystery-stock-market/config.json";
import { marketHost } from "../../../src/shared/games/mystery-stock-market/host";
import underHostConfig from "../../../src/shared/games/under-thirteen/host-config.json";
import { underHost } from "../../../src/shared/games/under-thirteen/host";
import { GAME_IDS } from "../../../src/shared/games";
import { CHANCE_WORDS, type Candidate, type Presence, type StartRequest } from "../../../src/shared/hosting";
import { HOSTS } from "../../../src/shared/hosts";

/**
 * What each game pays in pieces when it is over, as the room's ledger asks
 * its host. The games are started as a room starts them and their ends are
 * put in place by hand: the rule under test is what is read off an end, not
 * how a game gets there.
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

/** What `lines` gives each token, in the order of the players. */
const byToken = (lines: { token: string | null; pieces: number }[] | null | undefined): (number | null)[] | null =>
  lines === null || lines === undefined ? null : lines.map((line) => line.pieces);

describe("the pieces 무거운 13 pays", () => {
  const FIRST = underHostConfig.firstPieces;
  /** A game of `count` over for `reason`, each player with these penalty points. */
  function over(points: number[], reason: "rounds" | "left" | "abandoned" = "rounds") {
    const session = started(underHost, points.length);
    const penalties = points.map((each, player) => ({ player, points: each, last: each === 0 ? 0 : player + 1 }));
    return { ...session, state: { ...session.state, phase: "ended" as const, penalties, history: [...session.state.history, { type: "ended" as const, reason }] } };
  }

  it("is the show's four, to whoever is first", () => {
    expect(FIRST).toBe(4);
    expect(byToken(underHost.pieces?.(over([5, 0, 9])))).toEqual([0, FIRST, 0]);
  });

  it("is shared out evenly among those level in first place, and what is left over goes to nobody", () => {
    expect(byToken(underHost.pieces?.(over([0, 0, 9])))).toEqual([2, 2, 0]);
    expect(byToken(underHost.pieces?.(over([0, 0, 0])))).toEqual([1, 1, 1]);
  });

  it("is nothing yet while the game is played, and nothing for a game cut short", () => {
    expect(underHost.pieces?.(started(underHost, 3))).toBeNull();
    expect(underHost.pieces?.(over([5, 0, 9], "left"))).toBeNull();
    expect(underHost.pieces?.(over([5, 0, 9], "abandoned"))).toBeNull();
  });

  it("names each player by their token, and a bot by none", () => {
    const session = started(underHost, 1, { bots: true, allowBots: true });
    const ended = { ...session, state: { ...session.state, phase: "ended" as const, history: [...session.state.history, { type: "ended" as const, reason: "rounds" as const }] } };

    const lines = underHost.pieces?.(ended) ?? [];

    expect(lines[0].token).toBe(tokenOf(0));
    expect(lines.slice(1).every((line) => line.token === null)).toBe(true);
    expect(lines.length).toBe(ended.players.length);
  });
});

describe("the pieces 미스터리 거래소 pays", () => {
  const [ONE, TWO, THREE] = marketConfig.awards;
  /** A game of as many players as `cash` over for `reason`, each holding this much money and no shares. */
  function over(cash: number[], reason: "rounds" | "left" | "abandoned" = "rounds") {
    const session = started(marketHost, cash.length, { variant: "show" });
    const accounts = session.state.accounts.map((account, at) => ({ ...account, cash: cash[at], shares: Object.fromEntries(Object.keys(account.shares).map((stock) => [stock, 0])) as typeof account.shares }));
    return { ...session, state: { ...session.state, phase: "ended" as const, accounts, history: [...session.state.history, { type: "ended" as const, reason }] } };
  }

  it("is the show's: one piece from 1,500,000 won of assets, two from 3,000,000, three from 6,000,000", () => {
    expect([ONE, TWO, THREE]).toEqual([1_500_000, 3_000_000, 6_000_000]);
    expect(byToken(marketHost.pieces?.(over([ONE - 1, ONE, TWO, THREE])))).toEqual([0, 1, 2, 3]);
  });

  it("is no more than three, whatever a player ends with", () => {
    expect(byToken(marketHost.pieces?.(over([marketConfig.prizeAssets * 2, 0])))).toEqual([3, 0]);
  });

  it("is nothing yet while the game is played, and nothing for a game cut short", () => {
    expect(marketHost.pieces?.(started(marketHost, 2))).toBeNull();
    expect(marketHost.pieces?.(over([THREE, THREE], "left"))).toBeNull();
    expect(marketHost.pieces?.(over([THREE, THREE], "abandoned"))).toBeNull();
  });
});

describe("the pieces 네모 세기 pays", () => {
  /** A game of two over for `reason`, with these pieces on its lines of the score. */
  function over(pieces: number[], reason: "half" | "problems" | "abandoned" = "half") {
    const session = started(rectanglesHost, pieces.length);
    const scores = pieces.map((each, player) => ({ player, race: 0, choice: 0, pieces: each, total: 0 }));
    return { ...session, state: { ...session.state, phase: "ended" as const, scores, history: [...session.state.history, { type: "ended" as const, round: session.state.round, reason }] } };
  }

  it("is what the added contest gave its winner: the show's three", () => {
    expect(rectConfig.duelPieces).toBe(3);
    expect(byToken(rectanglesHost.pieces?.(over([rectConfig.duelPieces, 0])))).toEqual([3, 0]);
  });

  it("is nothing yet while the game is played, and nothing for a game cut short or one with no score", () => {
    const session = started(rectanglesHost, 2);

    expect(rectanglesHost.pieces?.(session)).toBeNull();
    expect(rectanglesHost.pieces?.(over([3, 0], "abandoned"))).toBeNull();
    expect(rectanglesHost.pieces?.({ ...over([3, 0]), state: { ...over([3, 0]).state, scores: null } })).toBeNull();
  });
});

describe("the games no payout is documented for", () => {
  it.each(GAME_IDS.filter((game) => !["under-thirteen", "mystery-stock-market", "count-rectangles"].includes(game)))("%s pays no pieces", (game) => {
    expect(HOSTS[game].pieces).toBeUndefined();
  });
});
