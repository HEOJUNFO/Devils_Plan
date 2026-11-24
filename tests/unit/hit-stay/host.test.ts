import { describe, expect, it } from "vitest";
import type { Candidate, Presence, StartRequest } from "../../../src/shared/hosting";
import botJson from "../../../src/shared/games/hit-stay/bot-config.json";
import configJson from "../../../src/shared/games/hit-stay/config.json";
import hostJson from "../../../src/shared/games/hit-stay/host-config.json";
import { hitHost, type HitSession, type HitSnapshot } from "../../../src/shared/games/hit-stay/host";
import type { HitConfig } from "../../../src/shared/games/hit-stay/rules";

const config: HitConfig = configJson;
const T0 = 2_000_000;
const BOT_MS = botJson.afterSeconds * 1000;
const REVEAL_MS = config.revealSeconds * 1000;

const people = (count: number): Candidate[] => Array.from({ length: count }, (_, slot) => ({ slot, token: `t${slot}`, nick: `P${slot}`, seq: slot }));
const all = (players: Candidate[]): Presence => ({ connected: new Set(players.map((each) => each.token)), seated: new Set(players.map((each) => each.token)) });
const request = (over: Partial<StartRequest> = {}): StartRequest => ({ by: "t0", bots: false, allowBots: true, seed: 5, now: T0, turnSeconds: 60, ...over });

const seen = (session: HitSession, viewer: string | null, presence: Presence, now: number): HitSnapshot => hitHost.view(session, viewer, presence, now) as HitSnapshot;

function started(count: number, over: Partial<StartRequest> = {}): { session: HitSession; presence: Presence } {
  const players = people(count);
  const presence = all(players);
  const result = hitHost.start(null, players, request(over), presence);
  if (!result.ok) throw new Error(result.reason);
  return { session: result.session, presence };
}

/** `session` after the player holding `token` did `action`, which the game must take. */
function did(session: HitSession, token: string, action: unknown, presence: Presence, now: number): HitSession {
  const result = hitHost.act(session, token, action, presence, now);
  if (!result.ok) throw new Error(result.reason);
  return result.session;
}

/** The token of the player the rules know as `player`. */
const tokenOf = (session: HitSession, player: number): string => session.players.find((seat) => seat.id === player)?.token as string;

/** `session` with everyone's first card revealed. */
function revealed(session: HitSession, presence: Presence, now: number): HitSession {
  let next = session;
  for (const seat of session.players) next = did(next, seat.token as string, { type: "reveal", card: 0 }, presence, now);
  return next;
}

describe("starting HIT, STAY in a room", () => {
  it("is the host's to do, with two to five players", () => {
    expect(hitHost.start(null, people(3), request({ by: "t1" }), all(people(3)))).toEqual({ ok: false, reason: "not-host" });
    expect(hitHost.start(null, people(1), request(), all(people(1)))).toEqual({ ok: false, reason: "too-few" });
    expect(hitHost.start(null, people(6), request(), all(people(6)))).toEqual({ ok: false, reason: "too-many" });
    expect([...started(2).session.state.players].sort()).toEqual([0, 1]);
    expect(started(5).session.state.hands).toHaveLength(5);
  });

  it("is refused while a game is being played, and bots where the room offers none", () => {
    const { session, presence } = started(3);
    expect(hitHost.start(session, people(3), request(), presence)).toEqual({ ok: false, reason: "already-playing" });
    expect(hitHost.start(null, people(1), request({ bots: true, allowBots: false }), all(people(1)))).toEqual({ ok: false, reason: "bots-not-allowed" });
  });

  it("fills the table up to three with bots when they are asked for", () => {
    const { session } = started(1, { bots: true });
    expect(session.players.map((seat) => [seat.id, seat.token, seat.nick])).toEqual([
      [0, "t0", "P0"],
      [1, null, "봇 1"],
      [2, null, "봇 2"],
    ]);
    expect(started(4, { bots: true }).session.players).toHaveLength(4);
  });

  it("gives half a minute to choose a card whatever the room's limit on a turn, and a turn the room's own time or none", () => {
    for (const turnSeconds of [0, 20]) {
      const { session, presence } = started(2, { turnSeconds });
      expect(hitHost.deadline(session)).toBe(T0 + REVEAL_MS);
      expect(seen(session, "t0", presence, T0 + 20_000).clock).toEqual({ turn: REVEAL_MS - 20_000, stand: null });
      const betting = revealed(session, presence, T0 + 5000);
      expect(hitHost.deadline(betting)).toBe(turnSeconds === 0 ? null : T0 + 25_000);
      expect(seen(betting, "t0", presence, T0 + 10_000).clock.turn).toBe(turnSeconds === 0 ? null : 15_000);
    }
  });
});

describe("what a room of HIT, STAY sends", () => {
  it("has a player's face-down cards for that player alone, and never the deck", () => {
    const { session, presence } = started(3);
    const cards = session.state.hands.map((hand) => hand.cards);
    const betting = revealed(session, presence, T0 + 1000);

    for (const seat of betting.players) {
      const sent = seen(betting, seat.token, presence, T0 + 1000);
      const own = betting.state.hands.find((hand) => hand.player === seat.id);
      expect(sent.view.mine?.cards).toEqual(own?.cards);
      expect(JSON.stringify(sent)).not.toContain("deck");
      expect(JSON.stringify(sent)).not.toContain("secret");
      expect(JSON.stringify(sent)).not.toContain("token");
      // of everyone else: the card revealed, and that two are face down
      for (const hand of sent.view.hands) expect([hand.revealed, hand.hidden]).toEqual([betting.state.hands.find((each) => each.player === hand.player)?.cards[0], 2]);
    }
    const watching = seen(betting, null, presence, T0 + 1000);
    expect(watching.view.mine).toBeNull();
    expect(cards).toHaveLength(3);
  });

  it("has the numbers of the rules the screen's sheet is written with", () => {
    const { session, presence } = started(2);
    expect(seen(session, null, presence, T0).rules).toEqual({ dealt: 3, startChips: 30, basicBet: 1, basicBetEvery: 10, limitLowest: 5, limitHighest: 12, revealSeconds: 30, cards: 35 });
  });

  it("refuses someone watching, what is no action, and what the rules refuse", () => {
    const { session, presence } = started(2);
    expect(hitHost.act(null, "t0", { type: "fold" }, presence, T0)).toEqual({ ok: false, reason: "no-game" });
    expect(hitHost.act(session, "t9", { type: "fold" }, presence, T0)).toEqual({ ok: false, reason: "not-seated" });
    expect(hitHost.act(session, "t0", { type: "check" }, presence, T0)).toEqual({ ok: false, reason: "bad-action" });
    expect(hitHost.act(session, "t0", { type: "fold" }, presence, T0)).toEqual({ ok: false, reason: "not-betting" });
    expect(hitHost.act(session, "t0", { type: "reveal", card: 5 }, presence, T0)).toEqual({ ok: false, reason: "bad-card" });
  });

  it("takes nothing that comes after the time is up, however late the room's own alarm", () => {
    const { session, presence } = started(2, { turnSeconds: 20 });
    const betting = revealed(session, presence, T0);
    const first = tokenOf(betting, betting.state.turn as number);
    const late = hitHost.act(betting, first, { type: "bet", to: 1 }, presence, T0 + 20_005);
    // the time was up: they had folded, and the other took the pot
    expect(late).toEqual({ ok: false, reason: "not-playing" });
  });
});

describe("the bots of HIT, STAY", () => {
  it("reveal a card a while after the round begins, one at a time", () => {
    let { session, presence } = started(1, { bots: true, seed: 11 });
    expect(hitHost.deadline(session)).toBe(T0 + BOT_MS);
    session = hitHost.tick(session, presence, T0 + BOT_MS);
    session = hitHost.tick(session, presence, T0 + 2 * BOT_MS);
    expect(session.state.hands.filter((hand) => hand.revealed !== null).map((hand) => hand.player).sort()).toEqual([1, 2]);
    // and then wait for the person, to the end of the half minute
    expect(hitHost.deadline(session)).toBe(T0 + REVEAL_MS);
  });

  it("play a game to its end by the clock when the person does nothing, whoever of them is left winning", () => {
    for (const seed of [1, 2, 3]) {
      let { session, presence } = started(1, { bots: true, turnSeconds: 10, seed });
      let steps = 0;
      for (; steps < 3000 && hitHost.running(session); steps++) session = hitHost.tick(session, presence, hitHost.deadline(session) as number);

      expect([seed, session.state.ended]).toEqual([seed, "played"]);
      expect(steps).toBeLessThan(2500);
      const places = hitHost.places?.(session) ?? [];
      expect(places.map((each) => each.place).sort()).toEqual([1, 2, 3]);
      // the person folded every round and paid the basic bet until it was gone
      expect(places.find((each) => each.token === "t0")?.place).not.toBe(1);
      expect(session.state.chips.reduce((sum, each) => sum + each.chips, 0)).toBe(3 * config.startChips);
    }
  });
});

describe("a room of HIT, STAY whose players come and go", () => {
  it("folds at once for a player who has left the room, and ends when one of two has", () => {
    const three = started(3);
    const betting = revealed(three.session, three.presence, T0 + 1000);
    const gone = tokenOf(betting, betting.state.turn as number);
    const stayed = new Set(["t0", "t1", "t2"].filter((token) => token !== gone));

    const after = hitHost.attend(betting, { connected: stayed, seated: stayed }, T0 + 4000);

    expect(after.state.phase).toBe("bet");
    expect(after.state.history.at(-1)).toMatchObject({ type: "fold", forced: true });
    expect(tokenOf(after, after.state.turn as number)).not.toBe(gone);

    const two = started(2);
    const alone = hitHost.attend(two.session, { connected: new Set(["t0"]), seated: new Set(["t0"]) }, T0 + 4000);
    expect([alone.state.phase, alone.state.ended]).toEqual(["ended", "left"]);
    expect(hitHost.places?.(alone)).toBeNull();
  });

  it("stands still while none of its people is connected, with its clock where it stopped, and goes on when one is back", () => {
    const { session, presence } = started(2);
    const nobody: Presence = { connected: new Set(), seated: presence.seated };

    const still = hitHost.attend(session, nobody, T0 + 10_000);
    expect(still.frozenAt).toBe(T0 + 10_000);
    expect(seen(still, "t0", nobody, T0 + 60_000)).toMatchObject({ frozen: true, clock: { turn: REVEAL_MS - 10_000, stand: hostJson.standSeconds * 1000 - 50_000 } });
    expect(hitHost.deadline(still)).toBe(T0 + 10_000 + hostJson.standSeconds * 1000);

    const back = hitHost.attend(still, presence, T0 + 70_000);
    expect(back.frozenAt).toBeNull();
    expect(hitHost.deadline(back)).toBe(T0 + REVEAL_MS + 60_000);

    const given = hitHost.tick(still, nobody, T0 + 10_000 + hostJson.standSeconds * 1000);
    expect([given.state.phase, given.state.ended]).toEqual(["ended", "abandoned"]);
  });

  it("holds a place for each of its players, and can carry on with what it stored", () => {
    const { session } = started(2);
    expect(hitHost.holdsPlace(session, "t1")).toBe(true);
    expect(hitHost.holdsPlace(session, "t5")).toBe(false);
    expect(hitHost.usable(JSON.parse(JSON.stringify(session)))).toBe(true);
    expect(hitHost.usable({ ...session, version: 0 })).toBe(false);
    expect(hitHost.usable(null)).toBe(false);
    expect(hitHost.same(session, { ...session })).toBe(true);
  });
});
