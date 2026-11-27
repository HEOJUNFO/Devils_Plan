import { describe, expect, it } from "vitest";
import type { Candidate, Presence, StartRequest } from "../../../src/shared/hosting";
import botJson from "../../../src/shared/games/secret-code/bot-config.json";
import configJson from "../../../src/shared/games/secret-code/config.json";
import hostJson from "../../../src/shared/games/secret-code/host-config.json";
import { codeHost, type CodeSession, type CodeSnapshot } from "../../../src/shared/games/secret-code/host";

const T0 = 2_000_000;
const BOT_MS = botJson.afterSeconds * 1000;
const ROUND_MS = configJson.roundSeconds * 1000;
const SHOW_MS = configJson.showSeconds * 1000;

const people = (count: number): Candidate[] => Array.from({ length: count }, (_, slot) => ({ slot, token: `t${slot}`, nick: `P${slot}`, seq: slot }));
const all = (players: Candidate[]): Presence => ({ connected: new Set(players.map((each) => each.token)), seated: new Set(players.map((each) => each.token)) });
const request = (over: Partial<StartRequest> = {}): StartRequest => ({ by: "t0", bots: false, allowBots: true, seed: 5, now: T0, turnSeconds: 60, ...over });

const seen = (session: CodeSession, viewer: string | null, presence: Presence, now: number): CodeSnapshot => codeHost.view(session, viewer, presence, now) as CodeSnapshot;

function started(count: number, over: Partial<StartRequest> = {}): { session: CodeSession; presence: Presence } {
  const players = people(count);
  const presence = all(players);
  const result = codeHost.start(null, players, request(over), presence);
  if (!result.ok) throw new Error(result.reason);
  return { session: result.session, presence };
}

/** `session` after the player holding `token` did `action`, which the game must take. */
function did(session: CodeSession, token: string, action: unknown, presence: Presence, now: number): CodeSession {
  const result = codeHost.act(session, token, action, presence, now);
  if (!result.ok) throw new Error(result.reason);
  return result.session;
}

/** A code that is not the round's. */
const wrongFor = (session: CodeSession): number[] => (session.state.code.join() === "0,1,2,3" ? [0, 1, 2, 4] : [0, 1, 2, 3]);

describe("starting 비밀 코드 in a room", () => {
  it("is the host's to do, with two players or more, up to six", () => {
    expect(codeHost.start(null, people(2), request({ by: "t1" }), all(people(2)))).toEqual({ ok: false, reason: "not-host" });
    expect(codeHost.start(null, people(1), request(), all(people(1)))).toEqual({ ok: false, reason: "too-few" });
    expect(codeHost.start(null, people(7), request(), all(people(7)))).toEqual({ ok: false, reason: "too-many" });
    expect(started(6).session.state.players).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("is refused while a game is being played, and bots where the room offers none", () => {
    const { session, presence } = started(2);
    expect(codeHost.start(session, people(2), request(), presence)).toEqual({ ok: false, reason: "already-playing" });
    expect(codeHost.start(null, people(1), request({ bots: true, allowBots: false }), all(people(1)))).toEqual({ ok: false, reason: "bots-not-allowed" });
  });

  it("gives the second place to a bot when bots are asked for, and adds none to a room of two", () => {
    expect(started(1, { bots: true }).session.players.map((seat) => [seat.id, seat.token, seat.nick])).toEqual([
      [0, "t0", "P0"],
      [1, null, "봇 1"],
    ]);
    expect(started(2, { bots: true }).session.players.map((seat) => seat.token)).toEqual(["t0", "t1"]);
  });

  it("deals the cards and the code by the room's chance: the same for a seed, others for another", () => {
    expect(started(2, { seed: 5 }).session.state.cards).toEqual(started(2, { seed: 5 }).session.state.cards);
    expect(started(2, { seed: 5 }).session.state.code).toEqual(started(2, { seed: 5 }).session.state.code);
    expect(started(2, { seed: 6 }).session.state.cards).not.toEqual(started(2, { seed: 5 }).session.state.cards);
  });

  it("gives a round its four minutes, whatever the room's limit on a turn", () => {
    for (const turnSeconds of [0, 20]) {
      const { session, presence } = started(2, { turnSeconds });
      expect(codeHost.deadline(session)).toBe(T0 + ROUND_MS);
      expect(seen(session, "t0", presence, T0 + 20_000).clock).toEqual({ turn: ROUND_MS - 20_000, stand: null });
    }
  });
});

describe("what a room of 비밀 코드 sends", () => {
  it("has the cards and the conditions for everyone, and neither the code nor a token", () => {
    const { session, presence } = started(3);
    for (const viewer of ["t0", "t2", null]) {
      const sent = seen(session, viewer, presence, T0 + 1000);
      expect(sent.view.cards).toHaveLength(26);
      expect(sent.view.conditions).toEqual(session.state.conditions);
      expect(sent.view.code).toBeNull();
      expect(JSON.stringify(sent)).not.toContain("token");
      expect(JSON.stringify(sent)).not.toContain("rng");
      expect(JSON.stringify(sent)).not.toContain(JSON.stringify(session.state.code));
    }
    expect(seen(session, "t0", presence, T0 + 1000).rules).toEqual({ codeLength: 4, roundSeconds: 240, showSeconds: 8 });
    expect(seen(session, "t0", presence, T0 + 1000).players[2]).toEqual({ id: 2, nick: "P2", bot: false, connected: true, left: false });
  });

  it("refuses someone watching, what is no action, and what the rules refuse", () => {
    const { session, presence } = started(2);
    expect(codeHost.act(session, "t9", { type: "answer", code: [0, 1, 2, 3] }, presence, T0)).toEqual({ ok: false, reason: "not-seated" });
    expect(codeHost.act(null, "t0", { type: "answer", code: [0, 1, 2, 3] }, presence, T0)).toEqual({ ok: false, reason: "no-game" });
    expect(codeHost.act(session, "t0", { type: "pass" }, presence, T0)).toEqual({ ok: false, reason: "bad-action" });
    expect(codeHost.act(session, "t0", { type: "answer", code: [0, 1, 2] }, presence, T0)).toEqual({ ok: false, reason: "bad-code" });
  });

  it("takes no answer that comes after the round's time is up, however late the room's own alarm", () => {
    const { session, presence } = started(3);
    expect(codeHost.act(session, "t0", { type: "answer", code: session.state.code }, presence, T0 + ROUND_MS)).toEqual({ ok: false, reason: "not-now" });
    const over = codeHost.tick(session, presence, T0 + ROUND_MS);
    expect(over.state.phase).toBe("show");
    expect(seen(over, "t1", presence, T0 + ROUND_MS).view.code).toEqual(session.state.code);
    expect(codeHost.deadline(over)).toBe(T0 + ROUND_MS + SHOW_MS);
  });

  it("ends a game of two when one answers right and the code has been shown, and places the two", () => {
    const { session, presence } = started(2);
    const wrong = did(session, "t0", { type: "answer", code: wrongFor(session) }, presence, T0 + 30_000);
    expect(seen(wrong, "t1", presence, T0 + 30_000).view.seats[0]).toMatchObject({ wrong: true, misses: 1 });
    const right = did(wrong, "t1", { type: "answer", code: session.state.code }, presence, T0 + 60_000);
    expect(codeHost.running(right)).toBe(true);
    expect(codeHost.places?.(right)).toBeNull();
    const over = codeHost.tick(right, presence, T0 + 60_000 + SHOW_MS);
    expect(codeHost.running(over)).toBe(false);
    expect(codeHost.places?.(over)).toEqual([
      { token: "t0", place: 2 },
      { token: "t1", place: 1 },
    ]);
    expect(seen(over, "t0", presence, T0 + 70_000)).toMatchObject({ view: { phase: "ended", ended: "played", passed: [1] }, clock: { turn: null, stand: null } });
  });
});

describe("the bot of 비밀 코드", () => {
  it("gives the code a minute and a half into the round, against a person who does nothing, and the game is over", () => {
    let { session, presence } = started(1, { bots: true });
    expect(codeHost.deadline(session)).toBe(T0 + BOT_MS);
    expect(codeHost.tick(session, presence, T0 + BOT_MS - 1)).toBe(session);
    session = codeHost.tick(session, presence, T0 + BOT_MS);
    expect([session.state.phase, session.state.passed]).toEqual(["show", [1]]);
    session = codeHost.tick(session, presence, codeHost.deadline(session) as number);
    expect(codeHost.running(session)).toBe(false);
    expect(session.state.ended).toBe("played");
  });

  it("answers before the round's time is up", () => {
    expect(BOT_MS).toBeLessThan(ROUND_MS);
  });
});

describe("a room of 비밀 코드 whose players come and go", () => {
  it("goes on without a player who left while two are in the room, and is over when one is", () => {
    const three = started(3);
    const two = codeHost.attend(three.session, { connected: new Set(["t0", "t2"]), seated: new Set(["t0", "t2"]) }, T0 + 4000);
    expect(two.state.phase).toBe("round");
    expect(two.state.seats[1].left).toBe(true);
    const one = codeHost.attend(two, { connected: new Set(["t0"]), seated: new Set(["t0"]) }, T0 + 5000);
    expect([one.state.phase, one.state.ended]).toEqual(["ended", "left"]);
    expect(codeHost.places?.(one)).toBeNull();
  });

  it("stands still while none of its people is connected, with its clock where it stopped, and goes on when one is back", () => {
    const { session, presence } = started(2);
    const nobody: Presence = { connected: new Set(), seated: presence.seated };

    const still = codeHost.attend(session, nobody, T0 + 10_000);
    expect(still.frozenAt).toBe(T0 + 10_000);
    expect(seen(still, "t0", nobody, T0 + 30_000)).toMatchObject({ frozen: true, clock: { turn: ROUND_MS - 10_000, stand: hostJson.standSeconds * 1000 - 20_000 } });
    expect(codeHost.deadline(still)).toBe(T0 + 10_000 + hostJson.standSeconds * 1000);

    const back = codeHost.attend(still, presence, T0 + 40_000);
    expect(back.frozenAt).toBeNull();
    expect(codeHost.deadline(back)).toBe(T0 + ROUND_MS + 30_000);

    const given = codeHost.tick(still, nobody, T0 + 10_000 + hostJson.standSeconds * 1000);
    expect([given.state.phase, given.state.ended]).toEqual(["ended", "abandoned"]);
  });

  it("holds a place for each of its players, and can carry on with what it stored", () => {
    const { session } = started(2);
    expect(codeHost.holdsPlace(session, "t1")).toBe(true);
    expect(codeHost.holdsPlace(session, "t5")).toBe(false);
    expect(codeHost.usable(JSON.parse(JSON.stringify(session)))).toBe(true);
    expect(codeHost.usable({ ...session, version: 0 })).toBe(false);
    expect(codeHost.usable(null)).toBe(false);
    expect(codeHost.same(session, { ...session })).toBe(true);
  });
});
