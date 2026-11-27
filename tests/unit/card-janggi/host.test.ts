import { describe, expect, it } from "vitest";
import type { Candidate, Presence, StartRequest } from "../../../src/shared/hosting";
import botJson from "../../../src/shared/games/card-janggi/bot-config.json";
import configJson from "../../../src/shared/games/card-janggi/config.json";
import hostJson from "../../../src/shared/games/card-janggi/host-config.json";
import { janggiHost, type JanggiSession, type JanggiSnapshot } from "../../../src/shared/games/card-janggi/host";
import { isOrder, type JanggiConfig } from "../../../src/shared/games/card-janggi/rules";

const config: JanggiConfig = configJson;
const T0 = 2_000_000;
const BOT_MS = botJson.afterSeconds * 1000;
const ARRANGE_MS = config.arrangeSeconds * 1000;
const MOVE_MS = config.moveSeconds * 1000;
const ALL = ["rat", "monkey", "horse", "giraffe", "elephant"];
const FOUR = ["giraffe", "horse", "monkey", "rat"];

const people = (count: number): Candidate[] => Array.from({ length: count }, (_, slot) => ({ slot, token: `t${slot}`, nick: `P${slot}`, seq: slot }));
const all = (players: Candidate[]): Presence => ({ connected: new Set(players.map((each) => each.token)), seated: new Set(players.map((each) => each.token)) });
const request = (over: Partial<StartRequest> = {}): StartRequest => ({ by: "t0", bots: false, allowBots: true, seed: 5, now: T0, turnSeconds: 60, ...over });

const seen = (session: JanggiSession, viewer: string | null, presence: Presence, now: number): JanggiSnapshot => janggiHost.view(session, viewer, presence, now) as JanggiSnapshot;

function started(count: number, over: Partial<StartRequest> = {}): { session: JanggiSession; presence: Presence } {
  const players = people(count);
  const presence = all(players);
  const result = janggiHost.start(null, players, request(over), presence);
  if (!result.ok) throw new Error(result.reason);
  return { session: result.session, presence };
}

/** `session` after the player holding `token` did `action`, which the game must take. */
function did(session: JanggiSession, token: string, action: unknown, presence: Presence, now: number): JanggiSession {
  const result = janggiHost.act(session, token, action, presence, now);
  if (!result.ok) throw new Error(result.reason);
  return result.session;
}

/** The tokens of the round's first player and of the other. */
const sides = (session: JanggiSession): [string, string] => [`t${session.state.first}`, `t${session.state.players.find((each) => each !== session.state.first)}`];

describe("starting 카드 장기 in a room", () => {
  it("is the host's to do, with two players and no more", () => {
    expect(janggiHost.start(null, people(2), request({ by: "t1" }), all(people(2)))).toEqual({ ok: false, reason: "not-host" });
    expect(janggiHost.start(null, people(1), request(), all(people(1)))).toEqual({ ok: false, reason: "too-few" });
    expect(janggiHost.start(null, people(3), request(), all(people(3)))).toEqual({ ok: false, reason: "too-many" });
    expect(started(2).session.state.players).toEqual([0, 1]);
  });

  it("is refused while a game is being played, and bots where the room offers none", () => {
    const { session, presence } = started(2);
    expect(janggiHost.start(session, people(2), request(), presence)).toEqual({ ok: false, reason: "already-playing" });
    expect(janggiHost.start(null, people(1), request({ bots: true, allowBots: false }), all(people(1)))).toEqual({ ok: false, reason: "bots-not-allowed" });
  });

  it("gives the second place to a bot when bots are asked for", () => {
    const { session } = started(1, { bots: true });
    expect(session.players.map((seat) => [seat.id, seat.token, seat.nick])).toEqual([
      [0, "t0", "P0"],
      [1, null, "봇 1"],
    ]);
  });

  it("gives a minute and a half to lay the cards and 45 seconds to move, whatever the room's limit on a turn", () => {
    for (const turnSeconds of [0, 20]) {
      let { session, presence } = started(2, { turnSeconds });
      const [first, second] = sides(session);
      expect(janggiHost.deadline(session)).toBe(T0 + ARRANGE_MS);
      expect(seen(session, "t0", presence, T0 + 20_000).clock).toEqual({ turn: ARRANGE_MS - 20_000, stand: null });
      session = did(session, first, { type: "arrange", order: ALL }, presence, T0 + 1000);
      session = did(session, second, { type: "arrange", order: FOUR }, presence, T0 + 30_000);
      expect(janggiHost.deadline(session)).toBe(T0 + 30_000 + MOVE_MS);
    }
  });
});

describe("what a room of 카드 장기 sends", () => {
  it("has the order a player's cards lie in for that player alone, and no token", () => {
    const begun = started(2);
    const [first, second] = sides(begun.session);
    let session = did(begun.session, first, { type: "arrange", order: ALL }, begun.presence, T0 + 1000);

    // one has laid theirs, the other not: nothing of them is in what the other is sent
    expect(seen(session, first, begun.presence, T0 + 1000).view.mine).toEqual(ALL);
    for (const viewer of [second, null]) {
      const sent = JSON.stringify(seen(session, viewer, begun.presence, T0 + 1000).view);
      expect(sent).not.toContain("elephant");
      expect(sent).not.toContain("token");
    }

    session = did(session, second, { type: "arrange", order: FOUR }, begun.presence, T0 + 2000);
    const theirs = seen(session, second, begun.presence, T0 + 2000);
    expect(theirs.view.mine).toEqual(FOUR);
    expect(theirs.view.hands.find((hand) => hand.player === session.state.first)).toMatchObject({ used: [], current: "rat", hidden: 4 });
    // the first player's other four are in nothing the second is sent, but in the rules' own list of cards
    expect(JSON.stringify({ ...theirs.view, mine: null })).not.toContain("monkey");
    expect(JSON.stringify(seen(session, null, begun.presence, T0 + 2000))).not.toContain("token");
    expect(theirs.players).toEqual([
      { id: 0, nick: "P0", bot: false, connected: true, left: false },
      { id: 1, nick: "P1", bot: false, connected: true, left: false },
    ]);
  });

  it("has the numbers of the rules the screen draws the cards and finds the moves by", () => {
    const { session, presence } = started(2);
    const rules = seen(session, "t0", presence, T0).rules;
    expect(Object.keys(rules.cards)).toEqual(["rat", "horse", "monkey", "elephant", "giraffe"]);
    expect(rules).toMatchObject({ secondCards: 4, rounds: 3, goal: 2, arrangeSeconds: 90, rearrangeSeconds: 90, moveSeconds: 45 });
  });

  it("refuses someone watching, what is no action, and what the rules refuse", () => {
    const { session, presence } = started(2);
    const [first] = sides(session);
    expect(janggiHost.act(session, "t9", { type: "resign" }, presence, T0)).toEqual({ ok: false, reason: "not-seated" });
    expect(janggiHost.act(null, "t0", { type: "resign" }, presence, T0)).toEqual({ ok: false, reason: "no-game" });
    expect(janggiHost.act(session, first, { type: "win" }, presence, T0)).toEqual({ ok: false, reason: "bad-action" });
    expect(janggiHost.act(session, first, { type: "arrange", order: FOUR }, presence, T0)).toEqual({ ok: false, reason: "bad-order" });
    expect(janggiHost.act(session, first, { type: "move", from: 18, to: 19 }, presence, T0)).toEqual({ ok: false, reason: "not-moving" });
  });

  it("takes no cards that come after the time is up, however late the room's own alarm", () => {
    const { session, presence } = started(2);
    const [first] = sides(session);
    expect(janggiHost.act(session, first, { type: "arrange", order: ALL }, presence, T0 + ARRANGE_MS)).toEqual({ ok: false, reason: "not-arranging" });
    const late = janggiHost.tick(session, presence, T0 + ARRANGE_MS);
    expect(late.state.phase).toBe("move");
    expect(late.state.hands.every((hand) => hand.ready)).toBe(true);
  });
});

describe("the bot of 카드 장기", () => {
  it("lays as many cards as it is to lay, a while after the round begins, and moves a while after its turn comes", () => {
    let { session, presence } = started(1, { bots: true });
    expect(janggiHost.deadline(session)).toBe(T0 + BOT_MS);
    expect(janggiHost.tick(session, presence, T0 + BOT_MS - 1)).toBe(session);
    session = janggiHost.tick(session, presence, T0 + BOT_MS);
    const hand = session.state.hands.find((each) => each.player === 1);
    expect(hand?.ready).toBe(true);
    expect(isOrder(hand?.order ?? [], session.state.first === 1 ? 5 : 4, config)).toBe(true);
    // the bot's cards are in nothing the person is sent while theirs are not laid
    expect(JSON.stringify(seen(session, "t0", presence, T0 + BOT_MS).view)).not.toContain("elephant");

    session = did(session, "t0", { type: "arrange", order: session.state.first === 0 ? ALL : FOUR }, presence, T0 + 5000);
    for (let step = 0; step < 4 && session.state.turn !== 1; step++) {
      // the person moves first: by the room's clock and the bot's hand, since they do nothing
      session = janggiHost.tick(session, presence, janggiHost.deadline(session) as number);
    }
    expect(session.state.turn).toBe(1);
    const before = session.state.moves;
    session = janggiHost.tick(session, presence, janggiHost.deadline(session) as number);
    expect(session.state.moves).toBeGreaterThan(before);
    expect(session.state.history.some((event) => event.type === "moved" && event.player === 1 && event.by === 1)).toBe(true);
  });

  it("plays on, round after round, against a person who does nothing, until the game is over", () => {
    for (const seed of [23, 24, 25]) {
      let { session, presence } = started(1, { bots: true, seed });
      for (let step = 0; step < 5000 && janggiHost.running(session); step++) session = janggiHost.tick(session, presence, janggiHost.deadline(session) as number);

      expect(janggiHost.running(session)).toBe(false);
      expect(session.state.ended).toBe("played");
      expect(session.state.log.length).toBeGreaterThanOrEqual(2);
      // the person's moves were made for them: by the bot, or by the room when the bot was too late for it
      expect(session.state.history.some((event) => event.type === "moved" && event.player === 0 && event.by !== 0)).toBe(true);
    }
  });
});

describe("a room of 카드 장기 whose players come and go", () => {
  it("ends when one of the two has left the room", () => {
    const two = started(2);
    const alone = janggiHost.attend(two.session, { connected: new Set(["t0"]), seated: new Set(["t0"]) }, T0 + 4000);
    expect([alone.state.phase, alone.state.ended]).toEqual(["ended", "left"]);
    expect(janggiHost.places?.(alone)).toBeNull();
  });

  it("stands still while none of its people is connected, with its clock where it stopped, and goes on when one is back", () => {
    const { session, presence } = started(2);
    const nobody: Presence = { connected: new Set(), seated: presence.seated };

    const still = janggiHost.attend(session, nobody, T0 + 10_000);
    expect(still.frozenAt).toBe(T0 + 10_000);
    expect(seen(still, "t0", nobody, T0 + 30_000)).toMatchObject({ frozen: true, clock: { turn: ARRANGE_MS - 10_000, stand: hostJson.standSeconds * 1000 - 20_000 } });
    expect(janggiHost.deadline(still)).toBe(T0 + 10_000 + hostJson.standSeconds * 1000);

    const back = janggiHost.attend(still, presence, T0 + 40_000);
    expect(back.frozenAt).toBeNull();
    expect(janggiHost.deadline(back)).toBe(T0 + ARRANGE_MS + 30_000);

    const given = janggiHost.tick(still, nobody, T0 + 10_000 + hostJson.standSeconds * 1000);
    expect([given.state.phase, given.state.ended]).toEqual(["ended", "abandoned"]);
  });

  it("holds a place for each of its players, and can carry on with what it stored", () => {
    const { session } = started(2);
    expect(janggiHost.holdsPlace(session, "t1")).toBe(true);
    expect(janggiHost.holdsPlace(session, "t5")).toBe(false);
    expect(janggiHost.usable(JSON.parse(JSON.stringify(session)))).toBe(true);
    expect(janggiHost.usable({ ...session, version: 0 })).toBe(false);
    expect(janggiHost.usable(null)).toBe(false);
    expect(janggiHost.same(session, { ...session })).toBe(true);
  });
});
