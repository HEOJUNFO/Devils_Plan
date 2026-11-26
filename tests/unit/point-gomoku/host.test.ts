import { describe, expect, it } from "vitest";
import type { Candidate, Presence, StartRequest } from "../../../src/shared/hosting";
import botJson from "../../../src/shared/games/point-gomoku/bot-config.json";
import configJson from "../../../src/shared/games/point-gomoku/config.json";
import hostJson from "../../../src/shared/games/point-gomoku/host-config.json";
import { omokHost, type OmokSession, type OmokSnapshot } from "../../../src/shared/games/point-gomoku/host";
import { checkBets, checkSpots, type OmokConfig } from "../../../src/shared/games/point-gomoku/rules";

const config: OmokConfig = configJson;
const T0 = 2_000_000;
const BOT_MS = botJson.afterSeconds * 1000;
const SELECT_MS = config.selectSeconds * 1000;
const BET_MS = config.betSeconds * 1000;
const SPOTS = [180, 181, 182];

const people = (count: number): Candidate[] => Array.from({ length: count }, (_, slot) => ({ slot, token: `t${slot}`, nick: `P${slot}`, seq: slot }));
const all = (players: Candidate[]): Presence => ({ connected: new Set(players.map((each) => each.token)), seated: new Set(players.map((each) => each.token)) });
const request = (over: Partial<StartRequest> = {}): StartRequest => ({ by: "t0", bots: false, allowBots: true, seed: 5, now: T0, turnSeconds: 60, ...over });

const seen = (session: OmokSession, viewer: string | null, presence: Presence, now: number): OmokSnapshot => omokHost.view(session, viewer, presence, now) as OmokSnapshot;

function started(count: number, over: Partial<StartRequest> = {}): { session: OmokSession; presence: Presence } {
  const players = people(count);
  const presence = all(players);
  const result = omokHost.start(null, players, request(over), presence);
  if (!result.ok) throw new Error(result.reason);
  return { session: result.session, presence };
}

/** `session` after the player holding `token` did `action`, which the game must take. */
function did(session: OmokSession, token: string, action: unknown, presence: Presence, now: number): OmokSession {
  const result = omokHost.act(session, token, action, presence, now);
  if (!result.ok) throw new Error(result.reason);
  return result.session;
}

/** The tokens of the round's selector and of the other player. */
const sides = (session: OmokSession): [string, string] => [`t${session.state.selector}`, `t${session.state.players.find((each) => each !== session.state.selector)}`];

describe("starting 포인트 오목 in a room", () => {
  it("is the host's to do, with two players and no more", () => {
    expect(omokHost.start(null, people(2), request({ by: "t1" }), all(people(2)))).toEqual({ ok: false, reason: "not-host" });
    expect(omokHost.start(null, people(1), request(), all(people(1)))).toEqual({ ok: false, reason: "too-few" });
    expect(omokHost.start(null, people(3), request(), all(people(3)))).toEqual({ ok: false, reason: "too-many" });
    expect(started(2).session.state.players).toEqual([0, 1]);
  });

  it("is refused while a game is being played, and bots where the room offers none", () => {
    const { session, presence } = started(2);
    expect(omokHost.start(session, people(2), request(), presence)).toEqual({ ok: false, reason: "already-playing" });
    expect(omokHost.start(null, people(1), request({ bots: true, allowBots: false }), all(people(1)))).toEqual({ ok: false, reason: "bots-not-allowed" });
  });

  it("gives the second place to a bot when bots are asked for", () => {
    const { session } = started(1, { bots: true });
    expect(session.players.map((seat) => [seat.id, seat.token, seat.nick])).toEqual([
      [0, "t0", "P0"],
      [1, null, "봇 1"],
    ]);
  });

  it("gives 45 seconds to mark the spots and as long to bet, whatever the room's limit on a turn", () => {
    for (const turnSeconds of [0, 20]) {
      let { session, presence } = started(2, { turnSeconds });
      const [selector] = sides(session);
      expect(omokHost.deadline(session)).toBe(T0 + SELECT_MS);
      expect(seen(session, "t0", presence, T0 + 20_000).clock).toEqual({ turn: SELECT_MS - 20_000, stand: null });
      session = did(session, selector, { type: "select", spots: SPOTS }, presence, T0 + 30_000);
      expect(omokHost.deadline(session)).toBe(T0 + 30_000 + BET_MS);
    }
  });
});

describe("what a room of 포인트 오목 sends", () => {
  it("has a player's points and bets for that player alone, until the game is over", () => {
    const begun = started(2);
    const [selector, other] = sides(begun.session);
    let session = did(begun.session, selector, { type: "select", spots: SPOTS }, begun.presence, T0 + 1000);
    session = did(session, selector, { type: "bet", bets: [7, 2, 1] }, begun.presence, T0 + 2000);

    expect(seen(session, selector, begun.presence, T0 + 2000).view.mine).toEqual({ points: 10, bets: [7, 2, 1] });
    expect(seen(session, other, begun.presence, T0 + 2000).view.mine).toEqual({ points: 10, bets: null });
    for (const viewer of [other, null]) {
      const sent = JSON.stringify(seen(session, viewer, begun.presence, T0 + 2000));
      expect(sent).not.toContain("[7,2,1]");
      expect(sent).not.toContain("spare");
      expect(sent).not.toContain("token");
      expect(sent).not.toContain("purses\":[");
    }

    session = did(session, other, { type: "bet", bets: [8, 1, 1] }, begun.presence, T0 + 3000);
    const next = seen(session, null, begun.presence, T0 + 3000);
    expect(next.view.log).toEqual([{ round: 1, selector: session.state.log[0].selector, spots: SPOTS, owners: session.state.log[0].owners, bets: [] }]);
    expect(JSON.stringify(next)).not.toContain("[8,1,1]");
  });

  it("has the numbers of the rules the screen draws the board and checks spots and bets by", () => {
    const { session, presence } = started(2);
    expect(seen(session, null, presence, T0).rules).toEqual({ size: 19, line: 5, spots: 3, roundPoints: 10, minBet: 1, selectSeconds: 45, betSeconds: 45 });
  });

  it("refuses someone watching, what is no action, and what the rules refuse", () => {
    const { session, presence } = started(2);
    const [selector, other] = sides(session);
    expect(omokHost.act(null, "t0", { type: "select", spots: SPOTS }, presence, T0)).toEqual({ ok: false, reason: "no-game" });
    expect(omokHost.act(session, "t9", { type: "select", spots: SPOTS }, presence, T0)).toEqual({ ok: false, reason: "not-seated" });
    expect(omokHost.act(session, selector, { type: "pass" }, presence, T0)).toEqual({ ok: false, reason: "bad-action" });
    expect(omokHost.act(session, other, { type: "select", spots: SPOTS }, presence, T0)).toEqual({ ok: false, reason: "not-selector" });
    expect(omokHost.act(session, selector, { type: "select", spots: [0, 1, 3] }, presence, T0)).toEqual({ ok: false, reason: "not-in-line" });
  });

  it("takes no spots that come after the time is up, however late the room's own alarm", () => {
    const { session, presence } = started(2);
    const [selector] = sides(session);
    const late = omokHost.act(session, selector, { type: "select", spots: SPOTS }, presence, T0 + SELECT_MS + 5);
    expect(late).toEqual({ ok: false, reason: "not-selecting" });
  });
});

describe("the bot of 포인트 오목", () => {
  it("marks spots the rules allow a while after its round begins, and bets what the rules allow a while after spots are marked", () => {
    for (const seed of [11, 12, 13, 14]) {
      let { session, presence } = started(1, { bots: true, seed });
      // whoever is the first selector, the bot does its part and then waits for the person
      for (let step = 0; step < 6 && omokHost.deadline(session) === session.state.at + BOT_MS; step++) session = omokHost.tick(session, presence, session.state.at + BOT_MS);

      if (session.state.selector === 0 && session.state.round === 1 && session.state.phase === "select") {
        // the person marks first: the bot then bets
        session = did(session, "t0", { type: "select", spots: SPOTS }, presence, T0 + 9000);
        expect(omokHost.deadline(session)).toBe(T0 + 9000 + BOT_MS);
        session = omokHost.tick(session, presence, T0 + 9000 + BOT_MS);
      }
      expect(session.state.phase).toBe("bet");
      expect(checkSpots(".".repeat(361), session.state.spots ?? [], config)).toBeNull();
      const bet = session.state.bets.find((each) => each.player === 1);
      expect(bet).toBeDefined();
      expect(checkBets(bet?.bets ?? [], 10, config)).toBeNull();
      // nothing of it is sent to the person, and the game then waits for the person to the end of the time to bet
      expect(seen(session, "t0", presence, T0).view.mine?.bets).toBeNull();
      expect(omokHost.deadline(session)).toBe((session.state.until as number));
    }
  });

  it("plays on, round after round, against a person who does nothing, until the game is over", () => {
    let { session, presence } = started(1, { bots: true, seed: 23 });
    for (let step = 0; step < 2000 && omokHost.running(session); step++) session = omokHost.tick(session, presence, omokHost.deadline(session) as number);

    expect(omokHost.running(session)).toBe(false);
    expect(["played", "level", "full"]).toContain(session.state.ended);
    expect(session.state.round).toBeGreaterThan(3);
  });
});

describe("a room of 포인트 오목 whose players come and go", () => {
  it("ends when one of the two has left the room", () => {
    const two = started(2);
    const alone = omokHost.attend(two.session, { connected: new Set(["t0"]), seated: new Set(["t0"]) }, T0 + 4000);
    expect([alone.state.phase, alone.state.ended]).toEqual(["ended", "left"]);
    expect(omokHost.places?.(alone)).toBeNull();
  });

  it("stands still while none of its people is connected, with its clock where it stopped, and goes on when one is back", () => {
    const { session, presence } = started(2);
    const nobody: Presence = { connected: new Set(), seated: presence.seated };

    const still = omokHost.attend(session, nobody, T0 + 10_000);
    expect(still.frozenAt).toBe(T0 + 10_000);
    expect(seen(still, "t0", nobody, T0 + 30_000)).toMatchObject({ frozen: true, clock: { turn: SELECT_MS - 10_000, stand: hostJson.standSeconds * 1000 - 20_000 } });
    expect(omokHost.deadline(still)).toBe(T0 + 10_000 + hostJson.standSeconds * 1000);

    const back = omokHost.attend(still, presence, T0 + 40_000);
    expect(back.frozenAt).toBeNull();
    expect(omokHost.deadline(back)).toBe(T0 + SELECT_MS + 30_000);

    const given = omokHost.tick(still, nobody, T0 + 10_000 + hostJson.standSeconds * 1000);
    expect([given.state.phase, given.state.ended]).toEqual(["ended", "abandoned"]);
  });

  it("holds a place for each of its players, and can carry on with what it stored", () => {
    const { session } = started(2);
    expect(omokHost.holdsPlace(session, "t1")).toBe(true);
    expect(omokHost.holdsPlace(session, "t5")).toBe(false);
    expect(omokHost.usable(JSON.parse(JSON.stringify(session)))).toBe(true);
    expect(omokHost.usable({ ...session, version: 0 })).toBe(false);
    expect(omokHost.usable(null)).toBe(false);
    expect(omokHost.same(session, { ...session })).toBe(true);
  });
});
