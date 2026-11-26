import { describe, expect, it } from "vitest";
import type { Candidate, Presence, StartRequest } from "../../../src/shared/hosting";
import botJson from "../../../src/shared/games/tower-of-equations/bot-config.json";
import configJson from "../../../src/shared/games/tower-of-equations/config.json";
import hostJson from "../../../src/shared/games/tower-of-equations/host-config.json";
import { towerHost, type TowerSession, type TowerSnapshot } from "../../../src/shared/games/tower-of-equations/host";
import { shortWay, solved, type TowerConfig } from "../../../src/shared/games/tower-of-equations/rules";
import { DEALER_EXAMPLE, SHOW_START } from "./documented";

const config: TowerConfig = configJson;
const T0 = 2_000_000;
const BUZZ_MS = botJson.buzzSeconds * 1000;
const BOT_MS = botJson.afterSeconds * 1000;
const THINK_MS = config.thinkSeconds * 1000;
const SAY_MS = config.saySeconds * 1000;
const MORE_MS = config.moreSeconds * 1000;

const people = (count: number): Candidate[] => Array.from({ length: count }, (_, slot) => ({ slot, token: `t${slot}`, nick: `P${slot}`, seq: slot }));
const all = (players: Candidate[]): Presence => ({ connected: new Set(players.map((each) => each.token)), seated: new Set(players.map((each) => each.token)) });
const request = (over: Partial<StartRequest> = {}): StartRequest => ({ by: "t0", bots: false, allowBots: true, seed: 5, now: T0, turnSeconds: 60, ...over });

const seen = (session: TowerSession, viewer: string | null, presence: Presence, now: number): TowerSnapshot => towerHost.view(session, viewer, presence, now) as TowerSnapshot;

function started(count: number, over: Partial<StartRequest> = {}): { session: TowerSession; presence: Presence } {
  const players = people(count);
  const presence = all(players);
  const result = towerHost.start(null, players, request(over), presence);
  if (!result.ok) throw new Error(result.reason);
  return { session: result.session, presence };
}

/** `session` after the player holding `token` did `action`, which the game must take. */
function did(session: TowerSession, token: string, action: unknown, presence: Presence, now: number): TowerSession {
  const result = towerHost.act(session, token, action, presence, now);
  if (!result.ok) throw new Error(result.reason);
  return result.session;
}

/** `session` with a problem one move from its towers: the number 2 goes on top of the first tower. */
function easy(session: TowerSession): TowerSession {
  const towers = [["+2", "×3", "+7"], ["-5", "2"], ["3", "5", "7", "+3", "+5", "-2", "-3", "-7", "×2", "×5", "×7"], []];
  return { ...session, state: { ...session.state, towers, target: DEALER_EXAMPLE.target, height: DEALER_EXAMPLE.height, way: null } };
}

describe("starting 수식의 탑 in a room", () => {
  it("is the host's to do, with two to six players", () => {
    expect(towerHost.start(null, people(2), request({ by: "t1" }), all(people(2)))).toEqual({ ok: false, reason: "not-host" });
    expect(towerHost.start(null, people(1), request(), all(people(1)))).toEqual({ ok: false, reason: "too-few" });
    expect(towerHost.start(null, people(7), request(), all(people(7)))).toEqual({ ok: false, reason: "too-many" });
    expect(started(6).session.state.players).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("is refused while a game is being played, and bots where the room offers none", () => {
    const { session, presence } = started(2);
    expect(towerHost.start(session, people(2), request(), presence)).toEqual({ ok: false, reason: "already-playing" });
    expect(towerHost.start(null, people(1), request({ bots: true, allowBots: false }), all(people(1)))).toEqual({ ok: false, reason: "bots-not-allowed" });
  });

  it("gives the second place to a bot when bots are asked for, and none where two are there", () => {
    expect(started(1, { bots: true }).session.players.map((seat) => [seat.id, seat.token, seat.nick])).toEqual([
      [0, "t0", "P0"],
      [1, null, "봇 1"],
    ]);
    expect(started(2, { bots: true }).session.players.map((seat) => seat.token)).toEqual(["t0", "t1"]);
  });

  it("deals towers of the room's own, or stands the show's first towers where the room asks for them", () => {
    expect(started(2, { variant: "show" }).session.state.towers).toEqual(SHOW_START);
    const fresh = started(2).session.state.towers;
    expect(fresh).not.toEqual(SHOW_START);
    expect(fresh.map((tower) => tower.length)).toEqual([6, 5, 5, 0]);
    expect(started(2, { variant: "fresh" }).session.state.towers).toEqual(fresh);
    expect(started(2, { variant: "nothing-known" }).session.state.towers).toEqual(fresh);
    // the room's unguessable number is part of what the towers are dealt from
    expect(started(2, { chance: [77] }).session.state.towers).not.toEqual(fresh);
  });

  it("gives two and a half minutes for the buzzer, whatever the room's limit on a turn", () => {
    for (const turnSeconds of [0, 20]) {
      const { session, presence } = started(2, { turnSeconds });
      expect(towerHost.deadline(session)).toBe(T0 + THINK_MS);
      expect(seen(session, "t0", presence, T0 + 20_000).clock).toEqual({ turn: THINK_MS - 20_000, stand: null });
    }
  });
});

describe("what a room of 수식의 탑 sends", () => {
  it("is the same game for every player and for someone watching, without the room's way to solve the problem", () => {
    const { session, presence } = started(3);
    const views = ["t0", "t1", null].map((viewer) => seen(session, viewer, presence, T0));

    expect(views.map((each) => each.view.you)).toEqual([0, 1, null]);
    for (const each of views) {
      expect({ ...each.view, you: null }).toEqual(views[2].view);
      const sent = JSON.stringify(each);
      expect(sent).not.toContain("way");
      expect(sent).not.toContain("plan");
      expect(sent).not.toContain("token");
      expect(sent).not.toContain("rng");
    }
  });

  it("has the numbers of the rules the screen draws the towers by and its sheet is written with", () => {
    const { session, presence } = started(2);
    expect(seen(session, null, presence, T0).rules).toEqual({ positions: 4, blocks: 16, goal: 7, firstPoints: 1, morePoints: 2, thinkSeconds: 150, saySeconds: 5, moreSeconds: 60, moveSeconds: 60, maxMoves: 20, maxRounds: 40 });
  });

  it("refuses someone watching, what is no action, and what the rules refuse", () => {
    const { session, presence } = started(2);
    expect(towerHost.act(null, "t0", { type: "buzz" }, presence, T0)).toEqual({ ok: false, reason: "no-game" });
    expect(towerHost.act(session, "t9", { type: "buzz" }, presence, T0)).toEqual({ ok: false, reason: "not-seated" });
    expect(towerHost.act(session, "t0", { type: "shout" }, presence, T0)).toEqual({ ok: false, reason: "bad-action" });
    expect(towerHost.act(session, "t0", { type: "declare", moves: 3 }, presence, T0)).toEqual({ ok: false, reason: "not-declaring" });
    expect(towerHost.act(session, "t0", { type: "forfeit" }, presence, T0)).toEqual({ ok: false, reason: "not-moving" });
  });

  it("takes no number of moves declared after the five seconds are up, however late the room's own alarm", () => {
    const { session, presence } = started(2);
    const buzzed = did(session, "t0", { type: "buzz" }, presence, T0 + 1000);
    expect(towerHost.deadline(buzzed)).toBe(T0 + 1000 + SAY_MS);
    expect(towerHost.act(buzzed, "t0", { type: "declare", moves: 3 }, presence, T0 + 1000 + SAY_MS + 5)).toEqual({ ok: false, reason: "not-declaring" });
  });

  it("gives the places of a game played to its end, by points", () => {
    const begun = started(2);
    let session: TowerSession = { ...begun.session, state: { ...begun.session.state, scores: [{ player: 0, points: 6 }, { player: 1, points: 2 }] } };
    session = did(easy(session), "t0", { type: "buzz" }, begun.presence, T0 + 1000);
    session = did(session, "t0", { type: "declare", moves: 1 }, begun.presence, T0 + 2000);
    expect(towerHost.places?.(session)).toBeNull();
    session = did(session, "t0", { type: "move", from: 1, count: 1, to: 0, flip: false }, begun.presence, T0 + 3000);

    expect(towerHost.running(session)).toBe(false);
    expect(towerHost.places?.(session)).toEqual([
      { token: "t0", place: 1 },
      { token: "t1", place: 2 },
    ]);
    expect(seen(session, null, begun.presence, T0 + 3000).clock).toEqual({ turn: null, stand: null });
  });
});

describe("the bot of 수식의 탑", () => {
  it("looks at a round's problem a while into the round, presses the buzzer when it has found a way of three moves at most, declares it and makes it", () => {
    const begun = started(1, { bots: true });
    let session = easy(begun.session);

    expect(towerHost.deadline(session)).toBe(T0 + BUZZ_MS);
    session = towerHost.tick(session, begun.presence, T0 + BUZZ_MS);
    expect([session.state.phase, session.state.buzzer]).toEqual(["say", 1]);
    session = towerHost.tick(session, begun.presence, T0 + BUZZ_MS + BOT_MS);
    // one move declared: nobody can declare fewer, and the challenge is the bot's
    expect([session.state.phase, session.state.challenger, session.state.bids]).toEqual(["move", 1, [{ player: 1, moves: 1 }]]);
    session = towerHost.tick(session, begun.presence, T0 + BUZZ_MS + BOT_MS * 2);

    expect(session.state.result).toMatchObject({ player: 1, success: true, points: 1 });
    expect(solved(session.state.towers, DEALER_EXAMPLE.target, DEALER_EXAMPLE.height)).toBe(true);
  });

  it("leaves a round whose problem it finds no way to solve to the person, and says at once that it will declare no fewer than they did", () => {
    // a target number no three blocks come to: no way of any length, and so none the bot finds
    const begun = started(1, { bots: true });
    const found: TowerSession = { ...begun.session, state: { ...begun.session.state, target: 100_000, height: 3, way: null } };
    expect(shortWay(found.state.towers, 100_000, 3, 3)).toBeNull();
    const presence = begun.presence;

    let session = towerHost.tick(found, presence, T0 + BUZZ_MS);
    expect([session.state.phase, session.plan]).toEqual(["think", { round: 1, way: null }]);
    // it does not look again: the round's own clock is all that is waited for
    expect(towerHost.deadline(session)).toBe(T0 + THINK_MS);

    session = did(session, "t0", { type: "buzz" }, presence, T0 + 30_000);
    session = did(session, "t0", { type: "declare", moves: 5 }, presence, T0 + 31_000);
    expect(towerHost.deadline(session)).toBe(T0 + 31_000 + BOT_MS);
    session = towerHost.tick(session, presence, T0 + 31_000 + BOT_MS);
    expect([session.state.phase, session.state.challenger, session.state.passed]).toEqual(["move", 0, [1]]);
    expect(towerHost.deadline(session)).toBeGreaterThan(T0 + 31_000 + BOT_MS + MORE_MS / 2);
  });

  it("solves problem after problem of the room's own against a person who does nothing, and wins the game", () => {
    let { session, presence } = started(1, { bots: true, seed: 23 });
    for (let step = 0; step < 3000 && towerHost.running(session); step++) session = towerHost.tick(session, presence, towerHost.deadline(session) as number);

    expect([session.state.ended, session.state.scores]).toEqual(["played", [{ player: 0, points: 0 }, { player: 1, points: config.goal }]]);
    expect(towerHost.places?.(session)).toEqual([
      { token: "t0", place: 2 },
      { token: null, place: 1 },
    ]);
  });
});

describe("a room of 수식의 탑 whose players come and go", () => {
  it("ends when fewer than two are left in the room, and goes on while two are", () => {
    const three = started(3);
    const two = towerHost.attend(three.session, { connected: new Set(["t0", "t1"]), seated: new Set(["t0", "t1"]) }, T0 + 4000);
    expect(two.state.phase).toBe("think");
    const alone = towerHost.attend(two, { connected: new Set(["t0"]), seated: new Set(["t0"]) }, T0 + 5000);
    expect([alone.state.phase, alone.state.ended]).toEqual(["ended", "left"]);
    expect(towerHost.places?.(alone)).toBeNull();
  });

  it("stands still while none of its people is connected, with its clock where it stopped, and goes on when one is back", () => {
    const { session, presence } = started(2);
    const nobody: Presence = { connected: new Set(), seated: presence.seated };

    const still = towerHost.attend(session, nobody, T0 + 10_000);
    expect(still.frozenAt).toBe(T0 + 10_000);
    expect(seen(still, "t0", nobody, T0 + 60_000)).toMatchObject({ frozen: true, clock: { turn: THINK_MS - 10_000, stand: hostJson.standSeconds * 1000 - 50_000 } });
    expect(towerHost.deadline(still)).toBe(T0 + 10_000 + hostJson.standSeconds * 1000);

    const back = towerHost.attend(still, presence, T0 + 70_000);
    expect(back.frozenAt).toBeNull();
    expect(towerHost.deadline(back)).toBe(T0 + THINK_MS + 60_000);

    const given = towerHost.tick(still, nobody, T0 + 10_000 + hostJson.standSeconds * 1000);
    expect([given.state.phase, given.state.ended]).toEqual(["ended", "abandoned"]);
  });

  it("holds a place for each of its players, and can carry on with what it stored", () => {
    const { session } = started(2);
    expect(towerHost.holdsPlace(session, "t1")).toBe(true);
    expect(towerHost.holdsPlace(session, "t5")).toBe(false);
    expect(towerHost.usable(JSON.parse(JSON.stringify(session)))).toBe(true);
    expect(towerHost.usable({ ...session, version: 0 })).toBe(false);
    expect(towerHost.usable(null)).toBe(false);
    expect(towerHost.same(session, { ...session })).toBe(true);
  });
});
