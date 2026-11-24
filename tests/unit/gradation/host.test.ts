import { describe, expect, it } from "vitest";
import type { Candidate, Presence, StartRequest } from "../../../src/shared/hosting";
import botJson from "../../../src/shared/games/gradation/bot-config.json";
import configJson from "../../../src/shared/games/gradation/config.json";
import hostJson from "../../../src/shared/games/gradation/host-config.json";
import { gradHost, type GradSession, type GradSnapshot } from "../../../src/shared/games/gradation/host";
import { checkArrangement, type GradConfig } from "../../../src/shared/games/gradation/rules";

const config: GradConfig = configJson;
const T0 = 2_000_000;
const BOT_MS = botJson.afterSeconds * 1000;
const ARRANGE_MS = config.arrangeSeconds * 1000;
const CUPS = [0, 0, 1, 6, 7, 7, 9];

const people = (count: number): Candidate[] => Array.from({ length: count }, (_, slot) => ({ slot, token: `t${slot}`, nick: `P${slot}`, seq: slot }));
const all = (players: Candidate[]): Presence => ({ connected: new Set(players.map((each) => each.token)), seated: new Set(players.map((each) => each.token)) });
const request = (over: Partial<StartRequest> = {}): StartRequest => ({ by: "t0", bots: false, allowBots: true, seed: 5, now: T0, turnSeconds: 60, ...over });

const seen = (session: GradSession, viewer: string | null, presence: Presence, now: number): GradSnapshot => gradHost.view(session, viewer, presence, now) as GradSnapshot;

function started(count: number, over: Partial<StartRequest> = {}): { session: GradSession; presence: Presence } {
  const players = people(count);
  const presence = all(players);
  const result = gradHost.start(null, players, request(over), presence);
  if (!result.ok) throw new Error(result.reason);
  return { session: result.session, presence };
}

/** `session` after the player holding `token` did `action`, which the game must take. */
function did(session: GradSession, token: string, action: unknown, presence: Presence, now: number): GradSession {
  const result = gradHost.act(session, token, action, presence, now);
  if (!result.ok) throw new Error(result.reason);
  return result.session;
}

/** The token of the player the rules know as `player`. */
const tokenOf = (session: GradSession, player: number): string => session.players.find((seat) => seat.id === player)?.token as string;

describe("starting 그라데이션 in a room", () => {
  it("is the host's to do, with two or three players", () => {
    expect(gradHost.start(null, people(3), request({ by: "t1" }), all(people(3)))).toEqual({ ok: false, reason: "not-host" });
    expect(gradHost.start(null, people(1), request(), all(people(1)))).toEqual({ ok: false, reason: "too-few" });
    expect(gradHost.start(null, people(4), request(), all(people(4)))).toEqual({ ok: false, reason: "too-many" });
    expect(started(2).session.state.players).toEqual([0, 1]);
    expect(started(3).session.state.duel).toHaveLength(2);
  });

  it("is refused while a game is being played, and bots where the room offers none", () => {
    const { session, presence } = started(3);
    expect(gradHost.start(session, people(3), request(), presence)).toEqual({ ok: false, reason: "already-playing" });
    expect(gradHost.start(null, people(1), request({ bots: true, allowBots: false }), all(people(1)))).toEqual({ ok: false, reason: "bots-not-allowed" });
  });

  it("fills the places up to the show's three with bots when they are asked for", () => {
    const { session } = started(1, { bots: true });
    expect(session.players.map((seat) => [seat.id, seat.token, seat.nick])).toEqual([
      [0, "t0", "P0"],
      [1, null, "봇 1"],
      [2, null, "봇 2"],
    ]);
  });

  it("gives five minutes for the cubes whatever the room's limit on a turn, and a cup the room's own time or none", () => {
    for (const turnSeconds of [0, 20]) {
      let { session, presence } = started(2, { turnSeconds });
      expect(gradHost.deadline(session)).toBe(T0 + ARRANGE_MS);
      expect(seen(session, "t0", presence, T0 + 20_000).clock).toEqual({ turn: ARRANGE_MS - 20_000, stand: null });
      for (const token of ["t0", "t1"]) session = did(session, token, { type: "arrange", values: CUPS }, presence, T0 + 30_000);
      expect(gradHost.deadline(session)).toBe(turnSeconds === 0 ? null : T0 + 50_000);
      expect(seen(session, "t0", presence, T0 + 40_000).clock.turn).toBe(turnSeconds === 0 ? null : 10_000);
    }
  });
});

describe("what a room of 그라데이션 sends", () => {
  it("has a player's cubes for that player alone", () => {
    const begun = started(3);
    const first = tokenOf(begun.session, begun.session.state.duel[0]);
    const session = did(begun.session, first, { type: "arrange", values: CUPS }, begun.presence, T0 + 1000);

    expect(seen(session, first, begun.presence, T0 + 1000).view.mine?.values).toEqual(CUPS);
    for (const viewer of [...["t0", "t1", "t2"].filter((token) => token !== first), null]) {
      const sent = JSON.stringify(seen(session, viewer, begun.presence, T0 + 1000));
      expect(sent).not.toContain(JSON.stringify(CUPS));
      expect(sent).not.toContain("spare");
      expect(sent).not.toContain("token");
    }
  });

  it("has the numbers of the rules the screen checks cubes with", () => {
    const { session, presence } = started(2);
    expect(seen(session, null, presence, T0).rules).toEqual({ cups: 7, highest: 9, copies: 2, maxSum: 30, winsInARow: 2, arrangeSeconds: 300 });
  });

  it("refuses someone watching, what is no action, and what the rules refuse", () => {
    const { session, presence } = started(2);
    expect(gradHost.act(null, "t0", { type: "submit", cup: 0 }, presence, T0)).toEqual({ ok: false, reason: "no-game" });
    expect(gradHost.act(session, "t9", { type: "submit", cup: 0 }, presence, T0)).toEqual({ ok: false, reason: "not-seated" });
    expect(gradHost.act(session, "t0", { type: "fold" }, presence, T0)).toEqual({ ok: false, reason: "bad-action" });
    expect(gradHost.act(session, "t0", { type: "submit", cup: 0 }, presence, T0)).toEqual({ ok: false, reason: "not-submitting" });
    expect(gradHost.act(session, "t0", { type: "arrange", values: [9, 9, 9, 9, 9, 9, 9] }, presence, T0)).toEqual({ ok: false, reason: "too-many-of-one" });
  });

  it("takes nothing that comes after the time is up, however late the room's own alarm", () => {
    const { session, presence } = started(2);
    const late = gradHost.act(session, "t0", { type: "arrange", values: CUPS }, presence, T0 + ARRANGE_MS + 5);
    expect(late).toEqual({ ok: false, reason: "not-arranging" });
  });
});

describe("the bots of 그라데이션", () => {
  it("distribute cubes the rules allow a while after the match begins, one at a time, and submit a cup a while after their turn comes", () => {
    let { session, presence } = started(1, { bots: true, seed: 11 });
    const bots = session.state.duel.filter((player) => player !== 0);

    expect(gradHost.deadline(session)).toBe(T0 + BOT_MS);
    for (let step = 1; step <= bots.length; step++) session = gradHost.tick(session, presence, T0 + step * BOT_MS);
    for (const bot of bots) expect(checkArrangement(session.state.hands.find((hand) => hand.player === bot)?.values ?? [], config)).toBeNull();

    // the person, where they are in the match, distributes too; then whoever is first submits
    if (session.state.duel.includes(0)) session = did(session, "t0", { type: "arrange", values: CUPS }, presence, T0 + 3 * BOT_MS);
    expect(session.state.phase).toBe("submit");
    const turn = session.state.turn as number;
    if (turn !== 0) {
      const at = gradHost.deadline(session) as number;
      expect(at).toBe(session.state.at + BOT_MS);
      session = gradHost.tick(session, presence, at);
      expect(session.state.table.map((each) => each.player)).toEqual([turn]);
    }
  });

  it("play a game to its end by the clock when the person does nothing", () => {
    let { session, presence } = started(1, { bots: true, turnSeconds: 10 });
    for (let step = 0; step < 2000 && gradHost.running(session); step++) session = gradHost.tick(session, presence, gradHost.deadline(session) as number);

    expect(session.state.ended).toBe("played");
    const places = gradHost.places?.(session) ?? [];
    expect(places.map((each) => each.place).sort()).toEqual([1, 2, 2]);
    expect(places.map((each) => each.token).sort()).toEqual(["t0", null, null].sort());
  });
});

describe("a room of 그라데이션 whose players come and go", () => {
  it("distributes at once for a player who has left the room, and ends when one of two has", () => {
    const three = started(3);
    const gone = tokenOf(three.session, three.session.state.duel[1]);
    const stayed = new Set(["t0", "t1", "t2"].filter((token) => token !== gone));

    const after = gradHost.attend(three.session, { connected: stayed, seated: stayed }, T0 + 4000);

    expect(after.state.phase).toBe("arrange");
    expect(after.state.hands[1].values).not.toBeNull();
    expect(after.state.hands[0].values).toBeNull();

    const two = started(2);
    const alone = gradHost.attend(two.session, { connected: new Set(["t0"]), seated: new Set(["t0"]) }, T0 + 4000);
    expect([alone.state.phase, alone.state.ended]).toEqual(["ended", "left"]);
    expect(gradHost.places?.(alone)).toBeNull();
  });

  it("stands still while none of its people is connected, with its clock where it stopped, and goes on when one is back", () => {
    const { session, presence } = started(2);
    const nobody: Presence = { connected: new Set(), seated: presence.seated };

    const still = gradHost.attend(session, nobody, T0 + 10_000);
    expect(still.frozenAt).toBe(T0 + 10_000);
    expect(seen(still, "t0", nobody, T0 + 60_000)).toMatchObject({ frozen: true, clock: { turn: ARRANGE_MS - 10_000, stand: hostJson.standSeconds * 1000 - 50_000 } });
    expect(gradHost.deadline(still)).toBe(T0 + 10_000 + hostJson.standSeconds * 1000);

    const back = gradHost.attend(still, presence, T0 + 70_000);
    expect(back.frozenAt).toBeNull();
    expect(gradHost.deadline(back)).toBe(T0 + ARRANGE_MS + 60_000);

    const given = gradHost.tick(still, nobody, T0 + 10_000 + hostJson.standSeconds * 1000);
    expect([given.state.phase, given.state.ended]).toEqual(["ended", "abandoned"]);
  });

  it("holds a place for each of its players, and can carry on with what it stored", () => {
    const { session } = started(2);
    expect(gradHost.holdsPlace(session, "t1")).toBe(true);
    expect(gradHost.holdsPlace(session, "t5")).toBe(false);
    expect(gradHost.usable(JSON.parse(JSON.stringify(session)))).toBe(true);
    expect(gradHost.usable({ ...session, version: 0 })).toBe(false);
    expect(gradHost.usable(null)).toBe(false);
    expect(gradHost.same(session, { ...session })).toBe(true);
  });
});
