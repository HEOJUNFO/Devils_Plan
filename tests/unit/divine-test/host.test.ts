import { describe, expect, it } from "vitest";
import type { Candidate, Presence, StartRequest } from "../../../src/shared/hosting";
import botJson from "../../../src/shared/games/divine-test/bot-config.json";
import configJson from "../../../src/shared/games/divine-test/config.json";
import hostJson from "../../../src/shared/games/divine-test/host-config.json";
import { divineHost, type DivineSession, type DivineSnapshot } from "../../../src/shared/games/divine-test/host";
import { emptyBoard, type DivineConfig } from "../../../src/shared/games/divine-test/rules";
import { SHOW_SQUARE } from "./documented";

const config: DivineConfig = configJson;
const T0 = 2_000_000;
const STEP_MS = botJson.stepSeconds * 1000;
const ALL_MS = config.seconds * 1000;
const SQUARE = SHOW_SQUARE.flat();

const people = (count: number): Candidate[] => Array.from({ length: count }, (_, slot) => ({ slot, token: `t${slot}`, nick: `P${slot}`, seq: slot }));
const all = (players: Candidate[]): Presence => ({ connected: new Set(players.map((each) => each.token)), seated: new Set(players.map((each) => each.token)) });
const request = (over: Partial<StartRequest> = {}): StartRequest => ({ by: "t0", bots: false, allowBots: true, seed: 5, now: T0, turnSeconds: 60, ...over });

const seen = (session: DivineSession, viewer: string | null, presence: Presence, now: number): DivineSnapshot => divineHost.view(session, viewer, presence, now) as DivineSnapshot;

function started(count: number, over: Partial<StartRequest> = {}): { session: DivineSession; presence: Presence } {
  const players = people(count);
  const presence = all(players);
  const result = divineHost.start(null, players, request(over), presence);
  if (!result.ok) throw new Error(result.reason);
  return { session: result.session, presence };
}

/** `session` after the player holding `token` did `action`, which the game must take. */
function did(session: DivineSession, token: string, action: unknown, presence: Presence, now: number): DivineSession {
  const result = divineHost.act(session, token, action, presence, now);
  if (!result.ok) throw new Error(result.reason);
  return result.session;
}

/** `session` after the player holding `token` laid the show's whole square. */
function laid(session: DivineSession, token: string, presence: Presence, now: number): DivineSession {
  let next = session;
  for (let tile = 2; tile <= SQUARE.length; tile++) next = did(next, token, { type: "put", tile, cell: SQUARE.indexOf(tile) }, presence, now);
  return next;
}

describe("starting 신의 시험 in a room", () => {
  it("is the host's to do, with two players or more, up to six", () => {
    expect(divineHost.start(null, people(2), request({ by: "t1" }), all(people(2)))).toEqual({ ok: false, reason: "not-host" });
    expect(divineHost.start(null, people(1), request(), all(people(1)))).toEqual({ ok: false, reason: "too-few" });
    expect(divineHost.start(null, people(7), request(), all(people(7)))).toEqual({ ok: false, reason: "too-many" });
    expect(started(6).session.state.players).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("is refused while a game is being played, and bots where the room offers none", () => {
    const { session, presence } = started(2);
    expect(divineHost.start(session, people(2), request(), presence)).toEqual({ ok: false, reason: "already-playing" });
    expect(divineHost.start(null, people(1), request({ bots: true, allowBots: false }), all(people(1)))).toEqual({ ok: false, reason: "bots-not-allowed" });
  });

  it("gives the second place to a bot when bots are asked for, and adds none to a room of two", () => {
    expect(started(1, { bots: true }).session.players.map((seat) => [seat.id, seat.token, seat.nick])).toEqual([
      [0, "t0", "P0"],
      [1, null, "봇 1"],
    ]);
    expect(started(2, { bots: true }).session.players.map((seat) => seat.token)).toEqual(["t0", "t1"]);
  });

  it("gives half an hour, whatever the room's limit on a turn", () => {
    for (const turnSeconds of [0, 20]) {
      const { session, presence } = started(2, { turnSeconds });
      expect(divineHost.deadline(session)).toBe(T0 + ALL_MS);
      expect(seen(session, "t0", presence, T0 + 20_000).clock).toEqual({ turn: ALL_MS - 20_000, stand: null });
    }
  });
});

describe("what a room of 신의 시험 sends", () => {
  it("has a player's board for that player alone, and no token", () => {
    const begun = started(3);
    const session = did(begun.session, "t1", { type: "put", tile: 30, cell: 0 }, begun.presence, T0 + 1000);
    expect(seen(session, "t1", begun.presence, T0 + 1000).view.cells[0]).toBe(30);
    for (const viewer of ["t0", "t2", null]) {
      const sent = seen(session, viewer, begun.presence, T0 + 1000);
      expect(sent.view.cells).toEqual(emptyBoard(config));
      expect(sent.view.standings[1]).toEqual({ player: 1, placed: 2, lines: 0, moves: 1, done: null, left: false });
      expect(JSON.stringify(sent)).not.toContain("token");
      expect(JSON.stringify(sent)).not.toContain("boards");
    }
    expect(seen(session, "t0", begun.presence, T0 + 1000).rules).toEqual({ size: 7, fixed: [{ tile: 1, cell: 3 }], seconds: 1800 });
    expect(seen(session, "t0", begun.presence, T0 + 1000).players[2]).toEqual({ id: 2, nick: "P2", bot: false, connected: true, left: false });
  });

  it("refuses someone watching, what is no action, and what the rules refuse", () => {
    const { session, presence } = started(2);
    expect(divineHost.act(session, "t9", { type: "take", cell: 0 }, presence, T0)).toEqual({ ok: false, reason: "not-seated" });
    expect(divineHost.act(null, "t0", { type: "take", cell: 0 }, presence, T0)).toEqual({ ok: false, reason: "no-game" });
    expect(divineHost.act(session, "t0", { type: "pass" }, presence, T0)).toEqual({ ok: false, reason: "bad-action" });
    expect(divineHost.act(session, "t0", { type: "put", tile: 1, cell: 5 }, presence, T0)).toEqual({ ok: false, reason: "bad-tile" });
    expect(divineHost.act(session, "t0", { type: "take", cell: 5 }, presence, T0)).toEqual({ ok: false, reason: "empty-cell" });
  });

  it("takes no tile that comes after the time is up, however late the room's own alarm", () => {
    const { session, presence } = started(2);
    expect(divineHost.act(session, "t0", { type: "put", tile: 30, cell: 0 }, presence, T0 + ALL_MS)).toEqual({ ok: false, reason: "game-over" });
    const over = divineHost.tick(session, presence, T0 + ALL_MS);
    expect([over.state.phase, over.state.ended]).toEqual(["ended", "time"]);
    expect(divineHost.places?.(over)).toEqual([
      { token: "t0", place: 1 },
      { token: "t1", place: 1 },
    ]);
  });

  it("ends a game of two when one passes, and places the two", () => {
    const { session, presence } = started(2);
    const over = laid(session, "t1", presence, T0 + 60_000);
    expect(divineHost.running(over)).toBe(false);
    expect(divineHost.places?.(over)).toEqual([
      { token: "t0", place: 2 },
      { token: "t1", place: 1 },
    ]);
    expect(seen(over, "t0", presence, T0 + 61_000).view).toMatchObject({ phase: "ended", ended: "played", passed: [1] });
  });
});

describe("the bot of 신의 시험", () => {
  it("lays a tile every so often, the lowest first, where the Siamese method has it", () => {
    let { session, presence } = started(1, { bots: true });
    expect(divineHost.deadline(session)).toBe(T0 + STEP_MS);
    expect(divineHost.tick(session, presence, T0 + STEP_MS - 1)).toBe(session);
    session = divineHost.tick(session, presence, T0 + STEP_MS);
    expect(session.state.boards[1].cells[SQUARE.indexOf(2)]).toBe(2);
    expect(divineHost.deadline(session)).toBe(T0 + STEP_MS * 2);
    // what the person does on their own board does not put the bot off
    session = did(session, "t0", { type: "put", tile: 30, cell: 0 }, presence, T0 + STEP_MS + 5000);
    expect(divineHost.deadline(session)).toBe(T0 + STEP_MS * 2);
    // its board is in nothing the person is sent
    expect(seen(session, "t0", presence, T0 + STEP_MS + 5000).view.cells.filter((tile) => tile !== 0).sort((a, b) => a - b)).toEqual([1, 30]);
  });

  it("passes its board in the end, against a person who does nothing, and the game is over", () => {
    let { session, presence } = started(1, { bots: true });
    for (let step = 0; step < 200 && divineHost.running(session); step++) session = divineHost.tick(session, presence, divineHost.deadline(session) as number);
    expect(divineHost.running(session)).toBe(false);
    expect([session.state.ended, session.state.passed]).toEqual(["played", [1]]);
    expect(session.state.boards[1].cells).toEqual(SQUARE);
    expect(session.state.boards[1].done).toBe(STEP_MS * 48);
    expect(STEP_MS * 48).toBeLessThan(ALL_MS);
  });
});

describe("a room of 신의 시험 whose players come and go", () => {
  it("goes on without a player who left while two are in the room, and is over when one is", () => {
    const three = started(3);
    const two = divineHost.attend(three.session, { connected: new Set(["t0", "t2"]), seated: new Set(["t0", "t2"]) }, T0 + 4000);
    expect(two.state.phase).toBe("play");
    expect(two.state.boards[1].left).toBe(true);
    expect(seen(two, "t0", three.presence, T0 + 4000).view.standings[1].left).toBe(true);
    const one = divineHost.attend(two, { connected: new Set(["t0"]), seated: new Set(["t0"]) }, T0 + 5000);
    expect([one.state.phase, one.state.ended]).toEqual(["ended", "left"]);
    expect(divineHost.places?.(one)).toBeNull();
  });

  it("stands still while none of its people is connected, with its clock where it stopped, and goes on when one is back", () => {
    const { session, presence } = started(2);
    const nobody: Presence = { connected: new Set(), seated: presence.seated };

    const still = divineHost.attend(session, nobody, T0 + 10_000);
    expect(still.frozenAt).toBe(T0 + 10_000);
    expect(seen(still, "t0", nobody, T0 + 30_000)).toMatchObject({ frozen: true, clock: { turn: ALL_MS - 10_000, stand: hostJson.standSeconds * 1000 - 20_000 } });
    expect(divineHost.deadline(still)).toBe(T0 + 10_000 + hostJson.standSeconds * 1000);

    const back = divineHost.attend(still, presence, T0 + 40_000);
    expect(back.frozenAt).toBeNull();
    expect(divineHost.deadline(back)).toBe(T0 + ALL_MS + 30_000);

    const given = divineHost.tick(still, nobody, T0 + 10_000 + hostJson.standSeconds * 1000);
    expect([given.state.phase, given.state.ended]).toEqual(["ended", "abandoned"]);
  });

  it("holds a place for each of its players, and can carry on with what it stored", () => {
    const { session } = started(2);
    expect(divineHost.holdsPlace(session, "t1")).toBe(true);
    expect(divineHost.holdsPlace(session, "t5")).toBe(false);
    expect(divineHost.usable(JSON.parse(JSON.stringify(session)))).toBe(true);
    expect(divineHost.usable({ ...session, version: 0 })).toBe(false);
    expect(divineHost.usable(null)).toBe(false);
    expect(divineHost.same(session, { ...session })).toBe(true);
  });
});
