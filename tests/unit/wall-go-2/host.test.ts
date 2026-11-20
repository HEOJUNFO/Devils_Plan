import { describe, expect, it } from "vitest";
import type { Candidate, Presence, StartRequest } from "../../../src/shared/hosting";
import botJson from "../../../src/shared/games/wall-go-2/bot-config.json";
import hostJson from "../../../src/shared/games/wall-go-2/host-config.json";
import { wallHost, type WallSession, type WallSnapshot } from "../../../src/shared/games/wall-go-2/host";
import { kindsToPlace, type WallConfig } from "../../../src/shared/games/wall-go-2/rules";
import configJson from "../../../src/shared/games/wall-go-2/config.json";

const config = configJson as WallConfig;
const T0 = 2_000_000;
const BOT_MS = botJson.afterSeconds * 1000;

const people = (count: number): Candidate[] => Array.from({ length: count }, (_, slot) => ({ slot, token: `t${slot}`, nick: `P${slot}`, seq: slot }));
const all = (players: Candidate[]): Presence => ({ connected: new Set(players.map((each) => each.token)), seated: new Set(players.map((each) => each.token)) });
const request = (over: Partial<StartRequest> = {}): StartRequest => ({ by: "t0", bots: false, allowBots: true, seed: 5, now: T0, turnSeconds: 60, ...over });

const seen = (session: WallSession, viewer: string | null, presence: Presence, now: number): WallSnapshot => wallHost.view(session, viewer, presence, now) as WallSnapshot;

function started(count: number, over: Partial<StartRequest> = {}): { session: WallSession; presence: Presence } {
  const players = people(count);
  const presence = all(players);
  const result = wallHost.start(null, players, request(over), presence);
  if (!result.ok) throw new Error(result.reason);
  return { session: result.session, presence };
}

describe("starting 벽바둑Ⅱ in a room", () => {
  it("is the host's to do, with two or three players", () => {
    expect(wallHost.start(null, people(3), request({ by: "t1" }), all(people(3)))).toEqual({ ok: false, reason: "not-host" });
    expect(wallHost.start(null, people(1), request(), all(people(1)))).toEqual({ ok: false, reason: "too-few" });
    expect(wallHost.start(null, people(4), request(), all(people(4)))).toEqual({ ok: false, reason: "too-many" });
    expect(started(2).session.state.mode).toBe("duel");
    expect(started(3).session.state.mode).toBe("three");
  });

  it("is refused while a match is being played, and bots where the room offers none", () => {
    const { session, presence } = started(3);
    expect(wallHost.start(session, people(3), request(), presence)).toEqual({ ok: false, reason: "already-playing" });
    expect(wallHost.start(null, people(1), request({ bots: true, allowBots: false }), all(people(1)))).toEqual({ ok: false, reason: "bots-not-allowed" });
  });

  it("fills the places up to the show's three with bots when they are asked for", () => {
    const { session } = started(1, { bots: true });
    expect(session.players.map((seat) => [seat.id, seat.token, seat.nick])).toEqual([
      [0, "t0", "P0"],
      [1, null, "봇 1"],
      [2, null, "봇 2"],
    ]);
    expect(started(3, { bots: true }).session.players.every((seat) => seat.token !== null)).toBe(true);
  });

  it("gives a turn the room's own time, and none where the room sets no limit", () => {
    const timed = started(2, { turnSeconds: 120 });
    expect(wallHost.deadline(timed.session)).toBe(T0 + 120_000);
    expect(seen(timed.session, "t0", timed.presence, T0 + 20_000).clock).toEqual({ turn: 100_000, stand: null });
    const free = started(2, { turnSeconds: 0 });
    expect(wallHost.deadline(free.session)).toBeNull();
    expect(seen(free.session, "t0", free.presence, T0 + 20_000).clock).toEqual({ turn: null, stand: null });
  });
});

describe("playing it", () => {
  it("takes what the player whose turn it is asks, and refuses the others", () => {
    const { session, presence } = started(3);
    const first = session.state.order[0];
    const other = session.state.order[1];
    expect(wallHost.act(session, `t${other}`, { type: "place", kind: "square", x: 0, y: 0 }, presence, T0)).toEqual({ ok: false, reason: "not-your-turn" });
    expect(wallHost.act(session, "nobody", { type: "place", kind: "square", x: 0, y: 0 }, presence, T0)).toEqual({ ok: false, reason: "not-seated" });
    expect(wallHost.act(session, `t${first}`, { type: "jump" }, presence, T0)).toEqual({ ok: false, reason: "bad-action" });
    expect(wallHost.act(null, "t0", { type: "wall", side: "up" }, presence, T0)).toEqual({ ok: false, reason: "no-game" });
    const result = wallHost.act(session, `t${first}`, { type: "place", kind: "square", x: 0, y: 0 }, presence, T0 + 1000);
    expect(result.ok && result.session.state.counters).toEqual([{ player: first, kind: "square", x: 0, y: 0 }]);
  });

  it("does for a player whose time has run out before it takes what they ask late", () => {
    const { session, presence } = started(3);
    const first = session.state.order[0];
    const late = wallHost.act(session, `t${first}`, { type: "place", kind: "square", x: 0, y: 0 }, presence, T0 + 60_000);
    expect(late).toEqual({ ok: false, reason: "not-your-turn" });
    expect(wallHost.tick(session, presence, T0 + 60_000).state.counters).toHaveLength(1);
  });

  it("has a bot do what is waited for a while after the last thing done, and wakes the room for it", () => {
    const { session, presence } = started(1, { bots: true, turnSeconds: 0, seed: 3 });
    let next = session;
    let now = T0;
    // the person's own counters are placed as their turn comes; the bots place theirs
    for (let step = 0; step < 40 && next.state.phase === "place"; step++) {
      if (next.state.turn === 0) {
        const taken = next.state.counters.length;
        const result = wallHost.act(next, "t0", { type: "place", kind: kindsToPlace(next.state, 0, config)[0], x: taken, y: 3 }, presence, now);
        if (!result.ok) throw new Error(result.reason);
        next = result.session;
        continue;
      }
      expect(wallHost.deadline(next)).toBe(next.state.at + BOT_MS);
      expect(wallHost.tick(next, presence, next.state.at + BOT_MS - 1)).toBe(next);
      now = next.state.at + BOT_MS;
      next = wallHost.tick(next, presence, now);
    }
    expect(next.state.phase).toBe("move");
    expect(next.state.counters).toHaveLength(6);
  });

  it("plays a match of bots and one absent person out to its places", () => {
    const players = people(1);
    const presence: Presence = { connected: new Set(["t0"]), seated: new Set(["t0"]) };
    const begun = wallHost.start(null, players, request({ bots: true, turnSeconds: 60 }), presence);
    if (!begun.ok) throw new Error(begun.reason);
    // the person does nothing: their time runs out turn after turn, and the bots play
    let { session, now } = { session: begun.session, now: T0 };
    for (let step = 0; step < 4000 && wallHost.running(session); step++) {
      now = wallHost.deadline(session) ?? now + 1000;
      session = wallHost.tick(session, presence, now);
    }
    expect(wallHost.running(session)).toBe(false);
    expect(session.state.ended).toBe("played");
    const places = wallHost.places?.(session) ?? null;
    expect(places).not.toBeNull();
    expect(places?.map((each) => each.place).sort()).toContain(1);
    expect(places).toHaveLength(3);
  });
});

describe("who is here", () => {
  it("stands still while none of its people is connected, and goes on with the time it had", () => {
    const { session, presence } = started(2);
    const away: Presence = { connected: new Set(), seated: presence.seated };
    const frozen = wallHost.attend(session, away, T0 + 10_000);
    expect(frozen.frozenAt).toBe(T0 + 10_000);
    expect(wallHost.view(frozen, "t0", away, T0 + 40_000)).toMatchObject({ frozen: true, clock: { turn: 50_000, stand: hostJson.standSeconds * 1000 - 30_000 } });
    expect(wallHost.deadline(frozen)).toBe(T0 + 10_000 + hostJson.standSeconds * 1000);
    const back = wallHost.attend(frozen, presence, T0 + 40_000);
    expect(back.frozenAt).toBeNull();
    expect(back.state.until).toBe(T0 + 90_000);
  });

  it("is ended when that lasts, and at once when its people have all left the room", () => {
    const { session, presence } = started(2);
    const away: Presence = { connected: new Set(), seated: presence.seated };
    const frozen = wallHost.attend(session, away, T0);
    const over = wallHost.tick(frozen, away, T0 + hostJson.standSeconds * 1000);
    expect(over.state.ended).toBe("abandoned");
    const gone = wallHost.attend(session, { connected: new Set(), seated: new Set() }, T0 + 1);
    expect(gone.state.ended).toBe("abandoned");
    expect(wallHost.places?.(gone)).toBeNull();
  });

  it("ends a match one of whose two players has left the room", () => {
    const { session } = started(2);
    const left: Presence = { connected: new Set(["t0"]), seated: new Set(["t0"]) };
    const over = wallHost.attend(session, left, T0 + 5);
    expect(over.state.ended).toBe("left");
    expect(wallHost.running(over)).toBe(false);
  });

  it("places for one of three who has left, and plays on with the other two", () => {
    const { session } = started(3, { turnSeconds: 0 });
    const gone = session.state.order[0];
    const tokens = [0, 1, 2].filter((id) => id !== gone).map((id) => `t${id}`);
    const next = wallHost.attend(session, { connected: new Set(tokens), seated: new Set(tokens) }, T0 + 5);
    expect(next.state.phase).toBe("place");
    expect(next.state.counters).toHaveLength(1);
    expect(next.state.turn).toBe(session.state.order[1]);
  });
});

describe("what is sent and kept", () => {
  it("shows each player the same board and who they are, and a watcher nobody", () => {
    const { session, presence } = started(3);
    const mine = seen(session, "t1", presence, T0);
    const watching = seen(session, null, presence, T0);
    expect(mine.view.you).toBe(1);
    expect(watching.view.you).toBeNull();
    expect(mine.rules).toEqual({ squareReach: 2, countersOfThree: 1, countersOfTwo: 2 });
    expect(mine.players).toEqual([0, 1, 2].map((id) => ({ id, nick: `P${id}`, bot: false, connected: true, left: false })));
    expect(JSON.stringify(mine)).not.toContain("t1");
  });

  it("tells a session it can carry on with from one it cannot", () => {
    const { session, presence } = started(3);
    expect(wallHost.usable(JSON.parse(JSON.stringify(session)))).toBe(true);
    expect(wallHost.usable({ ...session, version: 2 })).toBe(false);
    expect(wallHost.usable(null)).toBe(false);
    expect(wallHost.same(session, wallHost.tick(session, presence, T0 + 1))).toBe(true);
    expect(wallHost.holdsPlace(session, "t2")).toBe(true);
    expect(wallHost.holdsPlace(session, "t9")).toBe(false);
  });
});
