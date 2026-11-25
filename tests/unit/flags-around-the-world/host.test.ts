import { describe, expect, it } from "vitest";
import type { Candidate, Presence, StartRequest } from "../../../src/shared/hosting";
import botJson from "../../../src/shared/games/flags-around-the-world/bot-config.json";
import configJson from "../../../src/shared/games/flags-around-the-world/config.json";
import hostJson from "../../../src/shared/games/flags-around-the-world/host-config.json";
import { flagsHost, type FlagsSession, type FlagsSnapshot } from "../../../src/shared/games/flags-around-the-world/host";
import { showMs, type FlagsConfig } from "../../../src/shared/games/flags-around-the-world/rules";

const config: FlagsConfig = configJson;
const T0 = 2_000_000;
const BOT_MS = botJson.afterSeconds * 1000;
const SHOW_MS = showMs(config);
const GAP_MS = config.gapSeconds * 1000;
const CHOOSE_MS = config.chooseSeconds * 1000;
const REVEAL_MS = config.revealSeconds * 1000;
/** When the flags of the first round are laid out. */
const LAID = T0 + SHOW_MS + GAP_MS;

const people = (count: number): Candidate[] => Array.from({ length: count }, (_, slot) => ({ slot, token: `t${slot}`, nick: `P${slot}`, seq: slot }));
const all = (players: Candidate[]): Presence => ({ connected: new Set(players.map((each) => each.token)), seated: new Set(players.map((each) => each.token)) });
const request = (over: Partial<StartRequest> = {}): StartRequest => ({ by: "t0", bots: false, allowBots: true, seed: 5, now: T0, turnSeconds: 60, ...over });

const seen = (session: FlagsSession, viewer: string | null, presence: Presence, now: number): FlagsSnapshot => flagsHost.view(session, viewer, presence, now) as FlagsSnapshot;

function started(count: number, over: Partial<StartRequest> = {}): { session: FlagsSession; presence: Presence } {
  const players = people(count);
  const presence = all(players);
  const result = flagsHost.start(null, players, request(over), presence);
  if (!result.ok) throw new Error(result.reason);
  return { session: result.session, presence };
}

/** `session` with the flags of its round laid out: its clock run out twice. */
function laid(session: FlagsSession, presence: Presence): FlagsSession {
  const shown = flagsHost.tick(session, presence, T0 + SHOW_MS);
  return flagsHost.tick(shown, presence, LAID);
}

/** `session` after the player holding `token` did `action`, which the game must take. */
function did(session: FlagsSession, token: string, action: unknown, presence: Presence, now: number): FlagsSession {
  const result = flagsHost.act(session, token, action, presence, now);
  if (!result.ok) throw new Error(result.reason);
  return result.session;
}

describe("starting 만국기 in a room", () => {
  it("is the host's to do, with two players or more", () => {
    expect(flagsHost.start(null, people(2), request({ by: "t1" }), all(people(2)))).toEqual({ ok: false, reason: "not-host" });
    expect(flagsHost.start(null, people(1), request(), all(people(1)))).toEqual({ ok: false, reason: "too-few" });
    expect(flagsHost.start(null, people(config.maxPlayers + 1), request(), all(people(config.maxPlayers + 1)))).toEqual({ ok: false, reason: "too-many" });
    expect(started(5).session.state.players).toEqual([0, 1, 2, 3, 4]);
  });

  it("is refused while a game is being played, and bots where the room offers none", () => {
    const { session, presence } = started(2);
    expect(flagsHost.start(session, people(2), request(), presence)).toEqual({ ok: false, reason: "already-playing" });
    expect(flagsHost.start(null, people(1), request({ bots: true, allowBots: false }), all(people(1)))).toEqual({ ok: false, reason: "bots-not-allowed" });
  });

  it("gives the second place to a bot when bots are asked for, and no place where two are here", () => {
    expect(started(1, { bots: true }).session.players.map((seat) => [seat.id, seat.token, seat.nick])).toEqual([
      [0, "t0", "P0"],
      [1, null, "봇 1"],
    ]);
    expect(started(3, { bots: true }).session.players.every((seat) => seat.token !== null)).toBe(true);
  });

  it("draws the flags from the numbers the room gives for what nobody may work out", () => {
    const chance = (salt: number): number[] => Array.from({ length: 256 }, (_, n) => ((n + salt) * 2654435761) >>> 0);
    expect(started(2, { chance: chance(1) }).session.state.shown).not.toEqual(started(2, { chance: chance(2) }).session.state.shown);
  });
});

describe("what a player is sent of 만국기", () => {
  it("is the show's numbers, the round's clock, and the ten flags while they go by", () => {
    const { session, presence } = started(2);
    const snapshot = seen(session, "t1", presence, T0 + 4000);
    expect(snapshot.rules).toEqual({ shown: 10, showSeconds: 1, passes: 3, readySeconds: config.readySeconds, gapSeconds: 5, choices: 25, answers: 5, chooseSeconds: 60, rounds: 3, tiebreaks: config.tiebreaks });
    expect(snapshot.clock).toEqual({ turn: SHOW_MS - 4000, stand: null });
    expect([snapshot.view.you, snapshot.view.shown?.length, snapshot.view.choices]).toEqual([1, 10, null]);
    expect(snapshot.players.map((each) => [each.id, each.nick, each.bot, each.connected, each.left])).toEqual([
      [0, "P0", false, true, false],
      [1, "P1", false, true, false],
    ]);
    expect(JSON.stringify(snapshot)).not.toContain("token");
    expect(flagsHost.deadline(session)).toBe(T0 + SHOW_MS);
  });

  it("is the 25 only once they are laid out, and never which five before the round is scored", () => {
    const { session, presence } = started(2);
    const shown = flagsHost.tick(session, presence, T0 + SHOW_MS);
    expect([shown.state.phase, seen(shown, "t0", presence, T0 + SHOW_MS).view.choices]).toEqual(["wait", null]);
    const out = laid(session, presence);
    for (const viewer of ["t0", "t1", null]) {
      const view = seen(out, viewer, presence, LAID).view;
      expect([view.phase, view.choices?.length, view.answers, view.results]).toEqual(["choose", 25, null, null]);
    }
    expect(flagsHost.deadline(out)).toBe(LAID + CHOOSE_MS);
  });
});

describe("playing 만국기 in a room", () => {
  it("takes flags from one of its players only, and only what the rules take", () => {
    const { session, presence } = started(2);
    const out = laid(session, presence);
    expect(flagsHost.act(null, "t0", { type: "pick", flags: [] }, presence, LAID)).toEqual({ ok: false, reason: "no-game" });
    expect(flagsHost.act(out, "t9", { type: "pick", flags: [] }, presence, LAID)).toEqual({ ok: false, reason: "not-seated" });
    expect(flagsHost.act(out, "t0", { type: "circle" }, presence, LAID)).toEqual({ ok: false, reason: "bad-action" });
    expect(flagsHost.act(session, "t0", { type: "pick", flags: [] }, presence, T0 + 1000)).toEqual({ ok: false, reason: "not-choosing" });
    expect(flagsHost.act(out, "t0", { type: "pick", flags: ["zz"] }, presence, LAID)).toEqual({ ok: false, reason: "bad-flags" });
  });

  it("scores the round when both have chosen, and refuses flags that come after the minute", () => {
    const { session, presence } = started(2);
    const out = laid(session, presence);
    const answers = out.state.answers;
    const one = did(out, "t0", { type: "pick", flags: answers.slice(0, 3) }, presence, LAID + 9000);
    expect(seen(one, "t1", presence, LAID + 9000).view.ready).toEqual([0]);
    const both = did(one, "t1", { type: "pick", flags: answers }, presence, LAID + 20_000);
    expect(both.state.phase).toBe("reveal");
    expect(seen(both, null, presence, LAID + 20_000).view.results?.map((each) => each.points)).toEqual([3, 5]);
    expect(flagsHost.deadline(both)).toBe(LAID + 20_000 + REVEAL_MS);
    // the room's alarm is late: what the clock has brought due comes first
    expect(flagsHost.act(one, "t1", { type: "pick", flags: answers }, presence, LAID + CHOOSE_MS + 5)).toEqual({ ok: false, reason: "not-choosing" });
  });

  it("has a bot choose five of the flags laid out a while after they are", () => {
    const { session, presence } = started(1, { bots: true });
    const out = laid(session, presence);
    expect(flagsHost.deadline(out)).toBe(LAID + BOT_MS);
    const picked = flagsHost.tick(out, presence, LAID + BOT_MS);
    expect(picked.state.picks.map((each) => [each.player, each.flags.length])).toEqual([[1, 5]]);
    expect(new Set(picked.state.picks[0].flags).size).toBe(5);
    expect(picked.state.picks[0].flags.every((flag) => out.state.choices.includes(flag))).toBe(true);
    expect(flagsHost.deadline(picked)).toBe(LAID + CHOOSE_MS);
  });

  it("is played to its end by a bot and a player who never chooses, each of them placed", () => {
    for (const seed of [1, 2, 3]) {
      let { session, presence } = started(1, { bots: true, seed });
      let steps = 0;
      for (; steps < 400 && flagsHost.running(session); steps++) session = flagsHost.tick(session, presence, flagsHost.deadline(session) as number);
      expect(session.state.ended).toBe("played");
      const places = flagsHost.places?.(session) ?? [];
      expect(places.map((each) => each.token)).toEqual(["t0", null]);
      expect([...places.map((each) => each.place)].sort()).toContain(1);
      presence = all(people(1));
    }
  });
});

describe("players who are not here", () => {
  it("does not wait for one who has left the room, and ends the game where fewer than two are left", () => {
    const { session, presence } = started(3);
    const out = laid(session, presence);
    const stayed = new Set(["t0", "t1"]);
    const after = flagsHost.attend(out, { connected: stayed, seated: stayed }, LAID + 4000);
    expect([after.state.phase, after.state.gone]).toEqual(["choose", [2]]);
    expect(seen(after, "t0", { connected: stayed, seated: stayed }, LAID + 4000).players[2]).toMatchObject({ left: true });
    const alone = flagsHost.attend(out, { connected: new Set(["t0"]), seated: new Set(["t0"]) }, LAID + 4000);
    expect([alone.state.phase, alone.state.ended]).toEqual(["ended", "left"]);
    expect(flagsHost.places?.(alone)).toBeNull();
  });

  it("stands still while nobody is connected, moves its clock on when someone is back, and is given up after a while", () => {
    const { session, presence } = started(2);
    const nobody: Presence = { connected: new Set(), seated: presence.seated };
    const still = flagsHost.attend(session, nobody, T0 + 10_000);
    expect(still.frozenAt).toBe(T0 + 10_000);
    expect(seen(still, "t0", nobody, T0 + 50_000)).toMatchObject({ frozen: true, clock: { turn: SHOW_MS - 10_000 } });
    expect(flagsHost.deadline(still)).toBe(T0 + 10_000 + hostJson.standSeconds * 1000);

    const back = flagsHost.attend(still, presence, T0 + 70_000);
    expect(back.frozenAt).toBeNull();
    expect(flagsHost.deadline(back)).toBe(T0 + SHOW_MS + 60_000);

    const given = flagsHost.tick(still, nobody, T0 + 10_000 + hostJson.standSeconds * 1000);
    expect([given.state.phase, given.state.ended]).toEqual(["ended", "abandoned"]);
  });

  it("knows a seat by its token, a stored game by its version, and a game that has not changed", () => {
    const { session } = started(2);
    expect(flagsHost.holdsPlace(session, "t1")).toBe(true);
    expect(flagsHost.holdsPlace(session, "t5")).toBe(false);
    expect(flagsHost.usable(JSON.parse(JSON.stringify(session)))).toBe(true);
    expect(flagsHost.usable({ ...session, version: 0 })).toBe(false);
    expect(flagsHost.usable(null)).toBe(false);
    expect(flagsHost.same(session, { ...session })).toBe(true);
  });
});
