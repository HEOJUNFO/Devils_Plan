import { describe, expect, it } from "vitest";
import type { Candidate, Presence, StartRequest } from "../../../src/shared/hosting";
import botJson from "../../../src/shared/games/loop-fence/bot-config.json";
import configJson from "../../../src/shared/games/loop-fence/config.json";
import hostJson from "../../../src/shared/games/loop-fence/host-config.json";
import { fenceHost, type FenceSession, type FenceSnapshot } from "../../../src/shared/games/loop-fence/host";
import puzzles from "../../../src/shared/games/loop-fence/puzzles.json";

const T0 = 2_000_000;
const STEP_MS = botJson.stepSeconds * 1000;
const ALL_MS = configJson.seconds * 1000;
const LOCK_MS = configJson.lockSeconds * 1000;

const people = (count: number): Candidate[] => Array.from({ length: count }, (_, slot) => ({ slot, token: `t${slot}`, nick: `P${slot}`, seq: slot }));
const all = (players: Candidate[]): Presence => ({ connected: new Set(players.map((each) => each.token)), seated: new Set(players.map((each) => each.token)) });
const request = (over: Partial<StartRequest> = {}): StartRequest => ({ by: "t0", bots: false, allowBots: true, seed: 5, now: T0, turnSeconds: 60, ...over });

const seen = (session: FenceSession, viewer: string | null, presence: Presence, now: number): FenceSnapshot => fenceHost.view(session, viewer, presence, now) as FenceSnapshot;

function started(count: number, over: Partial<StartRequest> = {}): { session: FenceSession; presence: Presence } {
  const players = people(count);
  const presence = all(players);
  const result = fenceHost.start(null, players, request(over), presence);
  if (!result.ok) throw new Error(result.reason);
  return { session: result.session, presence };
}

/** `session` after the player holding `token` did `action`, which the game must take. */
function did(session: FenceSession, token: string, action: unknown, presence: Presence, now: number): FenceSession {
  const result = fenceHost.act(session, token, action, presence, now);
  if (!result.ok) throw new Error(result.reason);
  return result.session;
}

/** The fence of the puzzle `session` is played on, as the sides it runs along. */
const answerOf = (session: FenceSession): number[] => [...puzzles[session.state.puzzle].fence].flatMap((side, index) => (side === "1" ? [index] : []));

/** `session` after the player holding `token` drew the puzzle's fence and pressed the buzzer. */
function passed(session: FenceSession, token: string, presence: Presence, now: number): FenceSession {
  let next = session;
  for (const side of answerOf(session)) next = did(next, token, { type: "mark", side, to: 1 }, presence, now);
  return did(next, token, { type: "buzz" }, presence, now);
}

describe("starting 울타리 치기 in a room", () => {
  it("is the host's to do, with two players or more, up to six", () => {
    expect(fenceHost.start(null, people(2), request({ by: "t1" }), all(people(2)))).toEqual({ ok: false, reason: "not-host" });
    expect(fenceHost.start(null, people(1), request(), all(people(1)))).toEqual({ ok: false, reason: "too-few" });
    expect(fenceHost.start(null, people(7), request(), all(people(7)))).toEqual({ ok: false, reason: "too-many" });
    expect(started(6).session.state.players).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("is refused while a game is being played, and bots where the room offers none", () => {
    const { session, presence } = started(2);
    expect(fenceHost.start(session, people(2), request(), presence)).toEqual({ ok: false, reason: "already-playing" });
    expect(fenceHost.start(null, people(1), request({ bots: true, allowBots: false }), all(people(1)))).toEqual({ ok: false, reason: "bots-not-allowed" });
  });

  it("gives the second place to a bot when bots are asked for, and adds none to a room of two", () => {
    expect(started(1, { bots: true }).session.players.map((seat) => [seat.id, seat.token, seat.nick])).toEqual([
      [0, "t0", "P0"],
      [1, null, "봇 1"],
    ]);
    expect(started(2, { bots: true }).session.players.map((seat) => seat.token)).toEqual(["t0", "t1"]);
  });

  it("draws the puzzle by the room's chance: the same for a seed, and not one puzzle for every seed", () => {
    expect(started(2, { seed: 5 }).session.state.puzzle).toBe(started(2, { seed: 5 }).session.state.puzzle);
    const drawn = new Set(Array.from({ length: 40 }, (_, seed) => started(2, { seed: seed * 7919 }).session.state.puzzle));
    expect(drawn.size).toBeGreaterThan(10);
    expect([...drawn].every((puzzle) => puzzle >= 0 && puzzle < puzzles.length)).toBe(true);
  });

  it("gives twenty minutes, whatever the room's limit on a turn", () => {
    for (const turnSeconds of [0, 20]) {
      const { session, presence } = started(2, { turnSeconds });
      expect(fenceHost.deadline(session)).toBe(T0 + ALL_MS);
      expect(seen(session, "t0", presence, T0 + 20_000).clock).toEqual({ turn: ALL_MS - 20_000, stand: null, lock: 0 });
    }
  });
});

describe("what a room of 울타리 치기 sends", () => {
  it("has a player's fence for that player alone, and no token", () => {
    const begun = started(3);
    const session = did(begun.session, "t1", { type: "mark", side: 9, to: 1 }, begun.presence, T0 + 1000);
    expect(seen(session, "t1", begun.presence, T0 + 1000).view.marks[9]).toBe(1);
    for (const viewer of ["t0", "t2", null]) {
      const sent = seen(session, viewer, begun.presence, T0 + 1000);
      expect(sent.view.marks.every((mark) => mark === 0)).toBe(true);
      expect(sent.view.standings[1]).toEqual({ player: 1, lines: 1, wrong: 0, done: null, left: false });
      expect(sent.view.answer).toBeNull();
      expect(JSON.stringify(sent)).not.toContain("token");
      expect(JSON.stringify(sent)).not.toContain("boards");
      expect(JSON.stringify(sent)).not.toContain(puzzles[session.state.puzzle].fence);
    }
    expect(seen(session, "t0", begun.presence, T0 + 1000).rules).toEqual({ seconds: 1200, lockSeconds: 15 });
    expect(seen(session, "t0", begun.presence, T0 + 1000).players[2]).toEqual({ id: 2, nick: "P2", bot: false, connected: true, left: false });
  });

  it("says how long a player's buzzer is locked, to that player", () => {
    const { session, presence } = started(2);
    const wrong = did(session, "t0", { type: "buzz" }, presence, T0 + 1000);
    expect(seen(wrong, "t0", presence, T0 + 5000).clock.lock).toBe(LOCK_MS - 4000);
    expect(seen(wrong, "t1", presence, T0 + 5000).clock.lock).toBe(0);
    expect(seen(wrong, null, presence, T0 + 5000).clock.lock).toBe(0);
    expect(fenceHost.act(wrong, "t0", { type: "buzz" }, presence, T0 + 5000)).toEqual({ ok: false, reason: "locked" });
  });

  it("refuses someone watching, what is no action, and what the rules refuse", () => {
    const { session, presence } = started(2);
    expect(fenceHost.act(session, "t9", { type: "buzz" }, presence, T0)).toEqual({ ok: false, reason: "not-seated" });
    expect(fenceHost.act(null, "t0", { type: "buzz" }, presence, T0)).toEqual({ ok: false, reason: "no-game" });
    expect(fenceHost.act(session, "t0", { type: "pass" }, presence, T0)).toEqual({ ok: false, reason: "bad-action" });
    expect(fenceHost.act(session, "t0", { type: "mark", side: 999, to: 1 }, presence, T0)).toEqual({ ok: false, reason: "bad-side" });
    expect(fenceHost.act(session, "t0", { type: "clear" }, presence, T0)).toEqual({ ok: false, reason: "no-change" });
  });

  it("takes no buzzer that comes after the time is up, however late the room's own alarm", () => {
    const { session, presence } = started(2);
    expect(fenceHost.act(session, "t0", { type: "buzz" }, presence, T0 + ALL_MS)).toEqual({ ok: false, reason: "game-over" });
    const over = fenceHost.tick(session, presence, T0 + ALL_MS);
    expect([over.state.phase, over.state.ended]).toEqual(["ended", "time"]);
    expect(fenceHost.places?.(over)).toEqual([
      { token: "t0", place: 1 },
      { token: "t1", place: 1 },
    ]);
  });

  it("ends a game of two when one passes, places the two, and shows the fence to both", () => {
    const { session, presence } = started(2);
    const over = passed(session, "t1", presence, T0 + 60_000);
    expect(fenceHost.running(over)).toBe(false);
    expect(fenceHost.places?.(over)).toEqual([
      { token: "t0", place: 2 },
      { token: "t1", place: 1 },
    ]);
    const sent = seen(over, "t0", presence, T0 + 61_000);
    expect(sent.view).toMatchObject({ phase: "ended", ended: "played", passed: [1] });
    expect(sent.view.answer?.flatMap((on, side) => (on ? [side] : []))).toEqual(answerOf(session));
    expect(sent.clock).toEqual({ turn: null, stand: null, lock: 0 });
  });
});

describe("the bot of 울타리 치기", () => {
  it("draws a side of the puzzle's fence every so often", () => {
    let { session, presence } = started(1, { bots: true });
    const answer = answerOf(session);
    expect(fenceHost.deadline(session)).toBe(T0 + STEP_MS);
    expect(fenceHost.tick(session, presence, T0 + STEP_MS - 1)).toBe(session);
    session = fenceHost.tick(session, presence, T0 + STEP_MS);
    expect(session.state.boards[1].marks.flatMap((mark, side) => (mark === 1 ? [side] : []))).toEqual([answer[0]]);
    expect(fenceHost.deadline(session)).toBe(T0 + STEP_MS * 2);
    // what the person does on their own board does not put the bot off
    session = did(session, "t0", { type: "mark", side: 0, to: 2 }, presence, T0 + STEP_MS + 3000);
    expect(fenceHost.deadline(session)).toBe(T0 + STEP_MS * 2);
    // its fence is in nothing the person is sent
    expect(seen(session, "t0", presence, T0 + STEP_MS + 3000).view.marks.filter((mark) => mark === 1)).toEqual([]);
  });

  it("presses the buzzer when its fence is drawn, against a person who does nothing, and the game is over", () => {
    let { session, presence } = started(1, { bots: true });
    const lines = answerOf(session).length;
    for (let step = 0; step < 200 && fenceHost.running(session); step++) session = fenceHost.tick(session, presence, fenceHost.deadline(session) as number);
    expect(fenceHost.running(session)).toBe(false);
    expect([session.state.ended, session.state.passed]).toEqual(["played", [1]]);
    expect(session.state.boards[1].done).toBe(STEP_MS * (lines + 1));
    expect(session.state.boards[1].wrong).toBe(0);
  });

  it("is done well inside the time on the longest fence the game has", () => {
    const longest = Math.max(...puzzles.map((stored) => [...stored.fence].filter((side) => side === "1").length));
    expect(STEP_MS * (longest + 1)).toBeLessThan(ALL_MS / 2);
  });
});

describe("a room of 울타리 치기 whose players come and go", () => {
  it("goes on without a player who left while two are in the room, and is over when one is", () => {
    const three = started(3);
    const two = fenceHost.attend(three.session, { connected: new Set(["t0", "t2"]), seated: new Set(["t0", "t2"]) }, T0 + 4000);
    expect(two.state.phase).toBe("play");
    expect(two.state.boards[1].left).toBe(true);
    expect(seen(two, "t0", three.presence, T0 + 4000).view.standings[1].left).toBe(true);
    const one = fenceHost.attend(two, { connected: new Set(["t0"]), seated: new Set(["t0"]) }, T0 + 5000);
    expect([one.state.phase, one.state.ended]).toEqual(["ended", "left"]);
    expect(fenceHost.places?.(one)).toBeNull();
  });

  it("stands still while none of its people is connected, with its clocks where they stopped, and goes on when one is back", () => {
    const begun = started(2);
    const presence = begun.presence;
    const session = did(begun.session, "t0", { type: "buzz" }, presence, T0 + 8000);
    const nobody: Presence = { connected: new Set(), seated: presence.seated };

    const still = fenceHost.attend(session, nobody, T0 + 10_000);
    expect(still.frozenAt).toBe(T0 + 10_000);
    expect(seen(still, "t0", nobody, T0 + 30_000)).toMatchObject({ frozen: true, clock: { turn: ALL_MS - 10_000, stand: hostJson.standSeconds * 1000 - 20_000, lock: LOCK_MS - 2000 } });
    expect(fenceHost.deadline(still)).toBe(T0 + 10_000 + hostJson.standSeconds * 1000);

    const back = fenceHost.attend(still, presence, T0 + 40_000);
    expect(back.frozenAt).toBeNull();
    expect(fenceHost.deadline(back)).toBe(T0 + ALL_MS + 30_000);
    expect(seen(back, "t0", presence, T0 + 40_000).clock.lock).toBe(LOCK_MS - 2000);

    const given = fenceHost.tick(still, nobody, T0 + 10_000 + hostJson.standSeconds * 1000);
    expect([given.state.phase, given.state.ended]).toEqual(["ended", "abandoned"]);
  });

  it("holds a place for each of its players, and can carry on with what it stored", () => {
    const { session } = started(2);
    expect(fenceHost.holdsPlace(session, "t1")).toBe(true);
    expect(fenceHost.holdsPlace(session, "t5")).toBe(false);
    expect(fenceHost.usable(JSON.parse(JSON.stringify(session)))).toBe(true);
    expect(fenceHost.usable({ ...session, version: 0 })).toBe(false);
    expect(fenceHost.usable({ ...session, state: { ...session.state, puzzle: 999 } })).toBe(false);
    expect(fenceHost.usable(null)).toBe(false);
    expect(fenceHost.same(session, { ...session })).toBe(true);
  });
});
