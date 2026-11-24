import { describe, expect, it } from "vitest";
import type { Candidate, Presence, StartRequest } from "../../../src/shared/hosting";
import botJson from "../../../src/shared/games/equation-traffic-light/bot-config.json";
import configJson from "../../../src/shared/games/equation-traffic-light/config.json";
import hostJson from "../../../src/shared/games/equation-traffic-light/host-config.json";
import { eqHost, type EqSession, type EqSnapshot } from "../../../src/shared/games/equation-traffic-light/host";
import type { EqConfig } from "../../../src/shared/games/equation-traffic-light/rules";
import { SHOW_EQUATIONS } from "./documented";

const config: EqConfig = configJson;
const T0 = 2_000_000;
const BOT_MS = botJson.afterSeconds * 1000;
const CREATE_MS = config.createSeconds * 1000;
const GUESS_MS = config.guessSeconds * 1000;
const [A, B] = SHOW_EQUATIONS;

const people = (count: number): Candidate[] => Array.from({ length: count }, (_, slot) => ({ slot, token: `t${slot}`, nick: `P${slot}`, seq: slot }));
const all = (players: Candidate[]): Presence => ({ connected: new Set(players.map((each) => each.token)), seated: new Set(players.map((each) => each.token)) });
const request = (over: Partial<StartRequest> = {}): StartRequest => ({ by: "t0", bots: false, allowBots: true, seed: 5, now: T0, turnSeconds: 60, ...over });

const seen = (session: EqSession, viewer: string | null, presence: Presence, now: number): EqSnapshot => eqHost.view(session, viewer, presence, now) as EqSnapshot;

function started(count: number, over: Partial<StartRequest> = {}): { session: EqSession; presence: Presence } {
  const players = people(count);
  const presence = all(players);
  const result = eqHost.start(null, players, request(over), presence);
  if (!result.ok) throw new Error(result.reason);
  return { session: result.session, presence };
}

/** `session` after the player holding `token` did `action`, which the game must take. */
function did(session: EqSession, token: string, action: unknown, presence: Presence, now: number): EqSession {
  const result = eqHost.act(session, token, action, presence, now);
  if (!result.ok) throw new Error(result.reason);
  return result.session;
}

describe("starting 수식 신호등 in a room", () => {
  it("is the host's to do, with two players and no more", () => {
    expect(eqHost.start(null, people(2), request({ by: "t1" }), all(people(2)))).toEqual({ ok: false, reason: "not-host" });
    expect(eqHost.start(null, people(1), request(), all(people(1)))).toEqual({ ok: false, reason: "too-few" });
    expect(eqHost.start(null, people(3), request(), all(people(3)))).toEqual({ ok: false, reason: "too-many" });
    expect(started(2).session.state.players).toEqual([0, 1]);
  });

  it("is refused while a game is being played, and bots where the room offers none", () => {
    const { session, presence } = started(2);
    expect(eqHost.start(session, people(2), request(), presence)).toEqual({ ok: false, reason: "already-playing" });
    expect(eqHost.start(null, people(1), request({ bots: true, allowBots: false }), all(people(1)))).toEqual({ ok: false, reason: "bots-not-allowed" });
  });

  it("gives the second place to a bot when bots are asked for", () => {
    const { session } = started(1, { bots: true });
    expect(session.players.map((seat) => [seat.id, seat.token, seat.nick])).toEqual([
      [0, "t0", "P0"],
      [1, null, "봇 1"],
    ]);
  });

  it("gives five minutes for the equation and five for an answer, whatever the room's limit on a turn", () => {
    for (const turnSeconds of [0, 20]) {
      let { session, presence } = started(2, { turnSeconds });
      expect(eqHost.deadline(session)).toBe(T0 + CREATE_MS);
      expect(seen(session, "t0", presence, T0 + 20_000).clock).toEqual({ turn: CREATE_MS - 20_000, stand: null });
      session = did(session, "t0", { type: "create", equation: A }, presence, T0 + 30_000);
      session = did(session, "t1", { type: "create", equation: B }, presence, T0 + 30_000);
      expect(eqHost.deadline(session)).toBe(T0 + 30_000 + GUESS_MS);
    }
  });
});

describe("what a room of 수식 신호등 sends", () => {
  it("has a player's equation for that player alone, until the game is over", () => {
    const begun = started(2);
    let session = did(begun.session, "t0", { type: "create", equation: A }, begun.presence, T0 + 1000);

    expect(seen(session, "t0", begun.presence, T0 + 1000).view.mine?.equation).toBe(A);
    for (const viewer of ["t1", null]) {
      const sent = JSON.stringify(seen(session, viewer, begun.presence, T0 + 1000));
      expect(sent).not.toContain(A);
      expect(sent).not.toContain("spare");
      expect(sent).not.toContain("token");
    }

    session = did(session, "t1", { type: "create", equation: B }, begun.presence, T0 + 2000);
    session = did(session, "t0", { type: "answer", cells: B }, begun.presence, T0 + 3000);
    // an answer not shown yet, which here is the other's equation, is sent to nobody else
    expect(JSON.stringify(seen(session, null, begun.presence, T0 + 3000))).not.toContain(B);
    session = did(session, "t1", { type: "answer", cells: "123456789" }, begun.presence, T0 + 4000);

    const over = seen(session, null, begun.presence, T0 + 4000);
    expect(over.view.secrets).toEqual([
      { player: 0, equation: A },
      { player: 1, equation: B },
    ]);
    expect(over.clock).toEqual({ turn: null, stand: null });
    expect(eqHost.places?.(session)).toEqual([
      { token: "t0", place: 1 },
      { token: "t1", place: 2 },
    ]);
  });

  it("has the numbers of the rules the screen checks an equation with", () => {
    const { session, presence } = started(2);
    expect(seen(session, null, presence, T0).rules).toEqual({ cells: 9, createSeconds: 300, guessSeconds: 300, maxDigits: config.maxDigits });
  });

  it("refuses someone watching, what is no action, and what the rules refuse", () => {
    const { session, presence } = started(2);
    expect(eqHost.act(null, "t0", { type: "create", equation: A }, presence, T0)).toEqual({ ok: false, reason: "no-game" });
    expect(eqHost.act(session, "t9", { type: "create", equation: A }, presence, T0)).toEqual({ ok: false, reason: "not-seated" });
    expect(eqHost.act(session, "t0", { type: "fold" }, presence, T0)).toEqual({ ok: false, reason: "bad-action" });
    expect(eqHost.act(session, "t0", { type: "answer", cells: A }, presence, T0)).toEqual({ ok: false, reason: "not-guessing" });
    expect(eqHost.act(session, "t0", { type: "create", equation: "2^5+15=48" }, presence, T0)).toEqual({ ok: false, reason: "not-true" });
  });

  it("takes no equation that comes after the time is up, however late the room's own alarm", () => {
    const { session, presence } = started(2);
    const late = eqHost.act(session, "t0", { type: "create", equation: A }, presence, T0 + CREATE_MS + 5);
    expect(late).toEqual({ ok: false, reason: "not-creating" });
  });
});

describe("the bot of 수식 신호등", () => {
  it("creates one of the room's equations a while after the game begins, and answers a while after a turn does", () => {
    let { session, presence } = started(1, { bots: true, seed: 11 });

    expect(eqHost.deadline(session)).toBe(T0 + BOT_MS);
    session = eqHost.tick(session, presence, T0 + BOT_MS);
    expect(config.stock).toContain(session.state.secrets[1].equation);
    // nothing of it is sent to the person
    expect(JSON.stringify(seen(session, "t0", presence, T0 + BOT_MS))).not.toContain(session.state.secrets[1].equation as string);

    session = did(session, "t0", { type: "create", equation: A }, presence, T0 + 9000);
    expect(eqHost.deadline(session)).toBe(T0 + 9000 + BOT_MS);
    session = eqHost.tick(session, presence, T0 + 9000 + BOT_MS);
    expect(session.state.answers.map((each) => each.player)).toEqual([1]);
    expect(config.stock).toContain(session.state.answers[0].cells);
    // and then waits for the person, to the end of the turn
    expect(eqHost.deadline(session)).toBe(T0 + 9000 + GUESS_MS);
  });

  it("answers only with what its clues so far allow, and so finds an equation of the room's", () => {
    // the person does nothing: the room sets their equation, and the bot works it out turn by turn
    let { session, presence } = started(1, { bots: true, seed: 23 });
    for (let step = 0; step < 200 && eqHost.running(session); step++) session = eqHost.tick(session, presence, eqHost.deadline(session) as number);

    expect([session.state.ended, session.state.winner]).toEqual(["played", 1]);
    expect(session.state.turn).toBeLessThanOrEqual(8);
    expect([...(eqHost.places?.(session) ?? [])].sort((a, b) => a.place - b.place)).toEqual([
      { token: null, place: 1 },
      { token: "t0", place: 2 },
    ]);
  });
});

describe("a room of 수식 신호등 whose players come and go", () => {
  it("ends when one of the two has left the room", () => {
    const two = started(2);
    const alone = eqHost.attend(two.session, { connected: new Set(["t0"]), seated: new Set(["t0"]) }, T0 + 4000);
    expect([alone.state.phase, alone.state.ended]).toEqual(["ended", "left"]);
    expect(eqHost.places?.(alone)).toBeNull();
  });

  it("stands still while none of its people is connected, with its clock where it stopped, and goes on when one is back", () => {
    const { session, presence } = started(2);
    const nobody: Presence = { connected: new Set(), seated: presence.seated };

    const still = eqHost.attend(session, nobody, T0 + 10_000);
    expect(still.frozenAt).toBe(T0 + 10_000);
    expect(seen(still, "t0", nobody, T0 + 60_000)).toMatchObject({ frozen: true, clock: { turn: CREATE_MS - 10_000, stand: hostJson.standSeconds * 1000 - 50_000 } });
    expect(eqHost.deadline(still)).toBe(T0 + 10_000 + hostJson.standSeconds * 1000);

    const back = eqHost.attend(still, presence, T0 + 70_000);
    expect(back.frozenAt).toBeNull();
    expect(eqHost.deadline(back)).toBe(T0 + CREATE_MS + 60_000);

    const given = eqHost.tick(still, nobody, T0 + 10_000 + hostJson.standSeconds * 1000);
    expect([given.state.phase, given.state.ended]).toEqual(["ended", "abandoned"]);
  });

  it("holds a place for each of its players, and can carry on with what it stored", () => {
    const { session } = started(2);
    expect(eqHost.holdsPlace(session, "t1")).toBe(true);
    expect(eqHost.holdsPlace(session, "t5")).toBe(false);
    expect(eqHost.usable(JSON.parse(JSON.stringify(session)))).toBe(true);
    expect(eqHost.usable({ ...session, version: 0 })).toBe(false);
    expect(eqHost.usable(null)).toBe(false);
    expect(eqHost.same(session, { ...session })).toBe(true);
  });
});
