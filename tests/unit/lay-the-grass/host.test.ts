import { describe, expect, it } from "vitest";
import botJson from "../../../src/shared/games/lay-the-grass/bot-config.json";
import shipped from "../../../src/shared/games/lay-the-grass/config.json";
import hostJson from "../../../src/shared/games/lay-the-grass/host-config.json";
import { grassHost, type GrassSession, type GrassSnapshot } from "../../../src/shared/games/lay-the-grass/host";
import { parkSize, waysToLay } from "../../../src/shared/games/lay-the-grass/rules";
import type { Candidate, Presence, StartRequest } from "../../../src/shared/hosting";

const host = grassHost;

/** The time the fixtures start at, in ms since the epoch. */
const T0 = 1_800_000_000_000;
const PICK_MS = shipped.pickSeconds * 1000;
const PLACE_MS = shipped.placeSeconds * 1000;
const PAUSE_MS = shipped.pauseSeconds * 1000;
const AWAY_MS = hostJson.awaySeconds * 1000;
const STAND_MS = hostJson.standSeconds * 1000;
const THINK_MS = botJson.thinkSeconds * 1000;

/** The token of fixture player `n`. */
function tokenOf(n: number): string {
  return `token-of-player-${n}`;
}

/** Lobby players 0..count-1 in their slots. */
function candidates(count: number): Candidate[] {
  return Array.from({ length: count }, (_, n) => ({ token: tokenOf(n), nick: `p${n}`, slot: n }));
}

/** Everyone in `players` holds a slot unless named in `left`; those not named in `away` or `left` are connected. */
function presenceOf(players: Candidate[], away: number[] = [], left: number[] = []): Presence {
  const seated = players.filter((p) => !left.includes(p.slot));
  return {
    seated: new Set(seated.map((p) => p.token)),
    connected: new Set(seated.filter((p) => !away.includes(p.slot)).map((p) => p.token)),
  };
}

function request(overrides: Partial<StartRequest> = {}): StartRequest {
  return { by: tokenOf(0), bots: false, allowBots: false, seed: 7, now: T0, turnSeconds: 0, ...overrides };
}

/** A game just started by player 0 for `players`, all connected. */
function started(players: Candidate[], overrides: Partial<StartRequest> = {}): GrassSession {
  const result = host.start(null, players, request(overrides), presenceOf(players));
  if (!result.ok) throw new Error(`fixture start refused: ${result.reason}`);
  return result.session;
}

/** What `player` is sent at `now`. */
function seenBy(session: GrassSession, players: Candidate[], player: number | null, now: number, presence = presenceOf(players)): GrassSnapshot {
  return host.view(session, player === null ? null : tokenOf(player), presence, now) as GrassSnapshot;
}

/** Applies something the test expects to be accepted. */
function act(session: GrassSession, players: Candidate[], player: number, action: unknown, now: number): GrassSession {
  const result = host.act(session, tokenOf(player), action, presenceOf(players), now);
  if (!result.ok) throw new Error(`fixture action refused: ${result.reason}`);
  return result.session;
}

/** The player whose turn it is. */
function onTurn(session: GrassSession): number {
  const turn = session.state.turn;
  if (turn === null) throw new Error("fixture: it is nobody's turn");
  return turn.player;
}

/** Everyone picks tile 9 in turn, a second apart: the laying has begun. */
function allPicked(session: GrassSession, players: Candidate[]): GrassSession {
  let next = session;
  let now = T0 + 1000;
  while (next.state.phase === "pick") {
    next = act(next, players, onTurn(next), { type: "pick", tile: 9 }, now);
    now += 1000;
  }
  return next;
}

describe("starting a game of 잔디 깔기", () => {
  it("knows each player by the slot they hold, and never by their token in what it sends", () => {
    const players = candidates(3);
    const session = started(players);

    const sent = seenBy(session, players, 1, T0);

    expect(sent.players).toEqual([
      { id: 0, nick: "p0", bot: false, connected: true, left: false },
      { id: 1, nick: "p1", bot: false, connected: true, left: false },
      { id: 2, nick: "p2", bot: false, connected: true, left: false },
    ]);
    expect(sent.view.you).toBe(1);
    expect(JSON.stringify(sent)).not.toContain("token-of-player");
  });

  it("puts up a park of the size for the players in it", () => {
    const players = candidates(5);

    const sent = seenBy(started(players), players, 0, T0);

    expect(parkSize(sent.view.park)).toBe(shipped.cellsPerPlayer * 5 + shipped.extraCells);
    expect(sent.view).toMatchObject({ phase: "pick", round: 1, rounds: shipped.rounds });
  });

  it("refuses a game with nobody to contend with", () => {
    const alone = candidates(1);

    expect(host.start(null, alone, request(), presenceOf(alone))).toEqual({ ok: false, reason: "too-few" });
  });

  it("lets only the player who came into the room first start", () => {
    // player 1 came first; player 0 took a lower slot later
    const players = candidates(2).map((player) => ({ ...player, seq: 1 - player.slot }));

    expect(host.start(null, players, request({ by: tokenOf(0) }), presenceOf(players))).toEqual({ ok: false, reason: "not-host" });
    expect(host.start(null, players, request({ by: tokenOf(1) }), presenceOf(players)).ok).toBe(true);
  });

  it("refuses a second start while a game is being played, and allows one once it is over", () => {
    const players = candidates(2);
    let session = started(players);

    const during = host.start(session, players, request(), presenceOf(players));
    for (let step = 0; host.running(session); step++) {
      expect(step).toBeLessThan(400);
      session = host.tick(session, presenceOf(players), host.deadline(session)!);
    }
    const after = host.start(session, players, request({ now: T0 + 9_000_000 }), presenceOf(players));

    expect(during).toEqual({ ok: false, reason: "already-playing" });
    expect(after.ok).toBe(true);
  });

  it("refuses bots where the room does not offer them", () => {
    const players = candidates(1);

    expect(host.start(null, players, request({ bots: true }), presenceOf(players))).toEqual({ ok: false, reason: "bots-not-allowed" });
  });

  it("fills the game with bots where the room offers them, in slots nobody holds", () => {
    const players = [{ token: tokenOf(2), nick: "p2", slot: 2 }];

    const result = host.start(null, players, request({ by: tokenOf(2), bots: true, allowBots: true }), presenceOf(players));

    if (!result.ok) throw new Error(result.reason);
    const sent = seenBy(result.session, players, 2, T0);
    expect(sent.players.filter((player) => player.bot).map((player) => player.id)).toEqual([0, 1, 3]);
    expect(sent.players.filter((player) => player.bot).map((player) => player.nick)).toEqual(["봇 1", "봇 2", "봇 3"]);
    expect(sent.view.you).toBe(2);
  });
});

describe("playing", () => {
  it("takes a pick from the player holding the token whose turn it is", () => {
    const players = candidates(3);
    const session = started(players);
    const first = onTurn(session);

    const next = act(session, players, first, { type: "pick", tile: 11 }, T0 + 2000);

    expect(next.state.picks).toEqual([{ player: first, tile: 11 }]);
    expect(seenBy(next, players, first, T0 + 2000).view.turn).toBe(onTurn(next));
  });

  it("refuses someone who is only watching, and anything when no game is on", () => {
    const players = candidates(2);
    const session = started(players);

    expect(host.act(session, tokenOf(9), { type: "pick", tile: 9 }, presenceOf(players), T0 + 1)).toEqual({ ok: false, reason: "not-seated" });
    expect(host.act(null, tokenOf(0), { type: "pick", tile: 9 }, presenceOf(players), T0 + 1)).toEqual({ ok: false, reason: "no-game" });
  });

  it("refuses what is not an action of this game, and passes on the rules' own refusals", () => {
    const players = candidates(2);
    const session = started(players);
    const first = onTurn(session);
    const other = players.find((player) => player.slot !== first)!.slot;

    expect(host.act(session, tokenOf(first), { type: "buzz" }, presenceOf(players), T0 + 1)).toEqual({ ok: false, reason: "bad-action" });
    expect(host.act(session, tokenOf(other), { type: "pick", tile: 9 }, presenceOf(players), T0 + 1)).toEqual({ ok: false, reason: "not-your-turn" });
    expect(host.act(session, tokenOf(first), { type: "pick", tile: 5 }, presenceOf(players), T0 + 1)).toEqual({ ok: false, reason: "no-such-tile" });
  });

  it("takes no pick after the turn's time is up, however late the room's clock is in saying so", () => {
    const players = candidates(2);
    const session = started(players);
    const first = onTurn(session);

    // no alarm has run: the pick itself arrives at the moment the time ends
    const late = host.act(session, tokenOf(first), { type: "pick", tile: 13 }, presenceOf(players), T0 + PICK_MS);
    const inTime = host.act(session, tokenOf(first), { type: "pick", tile: 13 }, presenceOf(players), T0 + PICK_MS - 1);

    expect(late).toEqual({ ok: false, reason: "not-your-turn" });
    expect(inTime.ok && inTime.session.state.picks).toEqual([{ player: first, tile: 13 }]);
  });

  it("lays a tile for the player on turn, and counts its number when the park is closed", () => {
    const players = candidates(2);
    let session = allPicked(started(players), players);
    let now = T0 + 20_000;

    while (session.state.phase === "place") {
      const player = onTurn(session);
      const way = waysToLay(session.state.park, session.state.placed, 9)[0];
      session = act(session, players, player, { type: "lay", ...way }, now);
      now += 1000;
    }

    const laid = session.state.placed.length;
    expect(laid).toBeGreaterThan(0);
    expect(session.state.players.reduce((sum, player) => sum + player.score, 0)).toBe(9 * laid);
  });
});

describe("what a player is sent", () => {
  it("says how long the player on turn has, and nothing of the other clocks", () => {
    const players = candidates(2);
    const session = started(players);

    expect(seenBy(session, players, 0, T0 + 4000).clock).toEqual({ turn: PICK_MS - 4000, next: null, stand: null });
  });

  it("gives the time to lay once the laying has begun", () => {
    const players = candidates(2);
    const session = allPicked(started(players), players);
    const since = session.state.turn!.since;

    expect(seenBy(session, players, 0, since + 5000).clock.turn).toBe(PLACE_MS - 5000);
  });

  it("says how long the finished park stays up", () => {
    const players = candidates(2);
    let session = started(players);
    while (session.state.phase !== "pause") session = host.tick(session, presenceOf(players), host.deadline(session)!);
    const until = session.state.pauseUntil!;

    expect(seenBy(session, players, 0, until - 3000).clock).toEqual({ turn: null, next: 3000, stand: null });
  });

  it("gives the numbers of the rules the screen counts with", () => {
    const players = candidates(2);

    expect(seenBy(started(players), players, 0, T0).rules).toEqual({
      rounds: shipped.rounds,
      pickSeconds: shipped.pickSeconds,
      placeSeconds: shipped.placeSeconds,
    });
  });

  it("says who is connected and who has left the room", () => {
    const players = candidates(3);
    const session = started(players);

    const sent = seenBy(session, players, 0, T0 + 1, presenceOf(players, [1], [2]));

    expect(sent.players.map((player) => [player.connected, player.left])).toEqual([
      [true, false],
      [false, false],
      [false, true],
    ]);
  });

  it("does not take someone for the player whose slot they now hold", () => {
    const players = candidates(2);
    const session = started(players);
    const newcomer = "token-of-a-newcomer-in-a-freed-slot";

    expect((host.view(session, newcomer, presenceOf(players), T0 + 1) as GrassSnapshot).view.you).toBeNull();
    expect(host.act(session, newcomer, { type: "pick", tile: 9 }, presenceOf(players), T0 + 1)).toEqual({ ok: false, reason: "not-seated" });
  });
});

describe("the room's clock", () => {
  it("is wanted when the time of the player on turn is up, and then the room picks for them", () => {
    const players = candidates(2);
    const session = started(players);
    const first = onTurn(session);

    const before = host.tick(session, presenceOf(players), T0 + PICK_MS - 1);
    const next = host.tick(session, presenceOf(players), T0 + PICK_MS);

    expect(host.deadline(session)).toBe(T0 + PICK_MS);
    expect(before).toBe(session);
    expect(next.state.picks).toEqual([{ player: first, tile: shipped.defaultTile }]);
    expect(host.deadline(next)).toBe(T0 + PICK_MS + PICK_MS);
  });

  it("is wanted when the pause is over, and then the next park is put up", () => {
    const players = candidates(2);
    let session = started(players);
    let closedAt = T0;
    while (session.state.phase !== "pause") {
      closedAt = host.deadline(session)!;
      session = host.tick(session, presenceOf(players), closedAt);
    }
    const until = session.state.pauseUntil!;

    const before = host.tick(session, presenceOf(players), until - 1);
    const next = host.tick(session, presenceOf(players), until);

    expect(until).toBe(closedAt + PAUSE_MS);
    expect(host.deadline(session)).toBe(until);
    expect(before).toBe(session);
    expect(next.state).toMatchObject({ phase: "pick", round: 2 });
  });

  it("plays a whole game through by the clock alone, to its last park", () => {
    const players = candidates(3);
    let session = started(players);

    for (let step = 0; host.running(session); step++) {
      expect(step).toBeLessThan(400);
      session = host.tick(session, presenceOf(players), host.deadline(session)!);
    }

    expect(session.state.round).toBe(shipped.rounds);
    expect(session.state.history.at(-1)).toMatchObject({ type: "ended", reason: "rounds" });
    expect(host.deadline(session)).toBeNull();
    expect(session.waiting).toBeNull();
  });
});

describe("a player who is not there", () => {
  it("is waited for a short while when not connected, and then moved for", () => {
    const players = candidates(3);
    const session = started(players);
    const first = onTurn(session);
    const gone = presenceOf(players, [first]);

    const waiting = host.attend(session, gone, T0 + 3000);
    const before = host.tick(waiting, gone, T0 + 3000 + AWAY_MS - 1);
    const moved = host.tick(waiting, gone, T0 + 3000 + AWAY_MS);

    expect(waiting.waiting).toEqual({ player: first, at: T0 + 3000 + AWAY_MS });
    expect(host.deadline(waiting)).toBe(T0 + 3000 + AWAY_MS);
    expect(seenBy(waiting, players, null, T0 + 4000, gone).clock.turn).toBe(AWAY_MS - 1000);
    expect(before).toBe(waiting);
    expect(moved.state.history.at(-1)).toMatchObject({ type: "pick", player: first, tile: shipped.defaultTile, forced: true });
  });

  it("is not waited for any longer than their own time, when that is nearly up", () => {
    const players = candidates(3);
    const session = started(players);
    const first = onTurn(session);
    const gone = presenceOf(players, [first]);

    const waiting = host.attend(session, gone, T0 + PICK_MS - 2000);

    expect(host.deadline(waiting)).toBe(T0 + PICK_MS);
  });

  it("moves themselves again when they are back in time", () => {
    const players = candidates(3);
    const session = started(players);
    const first = onTurn(session);

    const waiting = host.attend(session, presenceOf(players, [first]), T0 + 3000);
    const back = host.attend(waiting, presenceOf(players), T0 + 6000);

    expect(back.waiting).toBeNull();
    expect(host.deadline(back)).toBe(T0 + PICK_MS);
  });

  it("is waited for from when they were first found gone, however often the room looks", () => {
    const players = candidates(3);
    const session = started(players);
    const first = onTurn(session);
    const gone = presenceOf(players, [first]);

    const once = host.attend(session, gone, T0 + 3000);
    const again = host.attend(once, gone, T0 + 8000);

    expect(again).toBe(once);
  });

  it("is moved for at once when they have left the room, turn after turn", () => {
    const players = candidates(3);
    const session = started(players);
    const first = onTurn(session);
    const others = players.filter((player) => player.slot !== first).map((player) => player.slot);

    const one = host.attend(session, presenceOf(players, [], [first]), T0 + 3000);
    const all = host.attend(session, presenceOf(players, [], [first, others[0]]), T0 + 3000);

    expect(one.state.picks).toEqual([{ player: first, tile: shipped.defaultTile }]);
    expect(one.waiting).toBeNull();
    // the two who left pick one after the other without anyone waiting; the one who stayed is on turn
    expect(all.state.picks.map((pick) => pick.player)).not.toContain(others[1]);
    expect(onTurn(all)).toBe(others[1]);
  });

  it("no longer has anything moved for them once the game is over", () => {
    const players = candidates(2);
    let session = started(players);
    for (let step = 0; host.running(session); step++) session = host.tick(session, presenceOf(players, [0]), host.deadline(session)!);

    expect(session.waiting).toBeNull();
    expect(host.attend(session, presenceOf(players, [0, 1]), T0 + 99_000_000)).toBe(session);
  });
});

describe("a game nobody is there to play", () => {
  const ABANDONED = { type: "ended", reason: "abandoned" };

  it("stands still while none of its players is connected, and goes on from where it stood", () => {
    const players = candidates(2);
    const session = started(players);
    const gone = presenceOf(players, [0, 1]);
    const stoodFor = STAND_MS - 1000;

    const frozen = host.attend(session, gone, T0 + 5000);
    const whileFrozen = host.tick(frozen, gone, T0 + 5000 + stoodFor);
    const back = host.attend(whileFrozen, presenceOf(players), T0 + 5000 + stoodFor);

    expect(frozen.frozenAt).toBe(T0 + 5000);
    expect(seenBy(frozen, players, null, T0 + 60_000, gone)).toMatchObject({ frozen: true, clock: { turn: PICK_MS - 5000, stand: STAND_MS - 55_000 } });
    expect(whileFrozen).toBe(frozen);
    expect(back.frozenAt).toBeNull();
    expect(host.deadline(back)).toBe(T0 + stoodFor + PICK_MS);
    expect(back.state.picks).toEqual([]);
  });

  it("does not stand still for someone watching: only its own players keep it going", () => {
    const players = candidates(2);
    const session = started(players);
    const watcher: Presence = { seated: new Set([tokenOf(0), tokenOf(1), "watcher"]), connected: new Set(["watcher"]) };

    expect(host.attend(session, presenceOf(players, [1]), T0 + 1000).frozenAt).toBeNull();
    expect(host.attend(session, watcher, T0 + 1000).frozenAt).toBe(T0 + 1000);
  });

  it("is wanted by the clock when it has stood as long as a game may, and is ended then", () => {
    const players = candidates(2);
    const gone = presenceOf(players, [0, 1]);
    const frozen = host.attend(started(players), gone, T0 + 5000);

    const before = host.tick(frozen, gone, T0 + 5000 + STAND_MS - 1);
    const after = host.tick(frozen, gone, T0 + 5000 + STAND_MS);

    expect(host.deadline(frozen)).toBe(T0 + 5000 + STAND_MS);
    expect(before).toBe(frozen);
    expect(host.running(after)).toBe(false);
    expect(after.state.history.at(-1)).toMatchObject(ABANDONED);
    expect(after.frozenAt).toBeNull();
    expect(host.deadline(after)).toBeNull();
  });

  it("is ended at once when all its players have left the room", () => {
    const players = candidates(2);
    const session = started(players);
    const watcher: Presence = { seated: new Set(["watcher"]), connected: new Set(["watcher"]) };

    const after = host.attend(session, watcher, T0 + 5000);

    expect(host.running(after)).toBe(false);
    expect(after.state.history.at(-1)).toMatchObject(ABANDONED);
  });

  it("goes on for the one who stays when the others leave", () => {
    const players = candidates(3);
    const session = started(players);

    const after = host.attend(session, presenceOf(players, [], [1, 2]), T0 + 5000);

    expect(host.running(after)).toBe(true);
    expect(after.frozenAt).toBeNull();
  });
});

describe("the place a game holds", () => {
  it("is held for every player of the game, and for nobody else", () => {
    const players = candidates(2);
    const session = started(players);

    expect(host.holdsPlace(session, tokenOf(1))).toBe(true);
    expect(host.holdsPlace(session, "someone-else")).toBe(false);
  });
});

describe("the bot", () => {
  const players = [{ token: tokenOf(0), nick: "p0", slot: 0 }];
  const withBots = (seed = 7): GrassSession => started(players, { bots: true, allowBots: true, seed });

  /** A game with bots, moved on by the clock until the person is on turn or a bot is. */
  function untilBotOnTurn(): GrassSession {
    for (let seed = 1; seed < 50; seed++) {
      const session = withBots(seed);
      if (onTurn(session) !== 0) return session;
    }
    throw new Error("fixture: no seed puts a bot first");
  }

  it("takes a moment's thought, and then picks a tile there is", () => {
    const session = untilBotOnTurn();
    const bot = onTurn(session);

    const before = host.tick(session, presenceOf(players), T0 + THINK_MS - 1);
    const after = host.tick(session, presenceOf(players), T0 + THINK_MS);

    expect(session.waiting).toEqual({ player: bot, at: T0 + THINK_MS });
    expect(host.deadline(session)).toBe(T0 + THINK_MS);
    expect(before).toBe(session);
    expect(after.state.picks).toHaveLength(1);
    expect(after.state.picks[0].player).toBe(bot);
    expect([3, 4, 6, 7, 9, 11, 13]).toContain(after.state.picks[0].tile);
    expect(after.state.history.at(-1)).toMatchObject({ type: "pick", forced: false });
  });

  it("plays a whole game through with the person only watching their own turns go by", () => {
    let session = withBots();

    for (let step = 0; host.running(session); step++) {
      expect(step).toBeLessThan(600);
      session = host.tick(session, presenceOf(players), host.deadline(session)!);
    }

    expect(session.state.history.at(-1)).toMatchObject({ type: "ended", reason: "rounds" });
    expect(session.state.history.some((event) => event.type === "lay")).toBe(true);
  });

  it("does not keep a game going once every person has left it", () => {
    const session = withBots();

    const after = host.attend(session, presenceOf(players, [], [0]), T0 + 1000);

    expect(host.running(after)).toBe(false);
    expect(after.waiting).toBeNull();
  });

  it("does not move while the game stands still, and keeps the time it had to wait", () => {
    const session = untilBotOnTurn();
    const frozen = host.attend(session, presenceOf(players, [0]), T0 + 500);

    const later = host.tick(frozen, presenceOf(players, [0]), T0 + THINK_MS + 5000);
    const back = host.attend(frozen, presenceOf(players), T0 + 30_500);

    expect(later.state.picks).toEqual([]);
    expect(back.waiting?.at).toBe(T0 + THINK_MS + 30_000);
  });

  it("draws the same parks whether or not bots play", () => {
    const four = candidates(4);

    const people = started(four, { seed: 42 });
    const mixed = started(four, { seed: 42, bots: true, allowBots: true });

    expect(mixed.state.park).toEqual(people.state.park);
  });
});

describe("a stored game", () => {
  it("is to be stored again once it stands still, and once the room waits on someone", () => {
    const players = candidates(2);
    const session = started(players);
    const first = onTurn(session);

    const frozen = host.attend(session, presenceOf(players, [0, 1]), T0 + 1000);
    const waiting = host.attend(session, presenceOf(players, [first]), T0 + 1000);

    expect(host.same(session, frozen)).toBe(false);
    expect(host.same(session, waiting)).toBe(false);
    expect(host.same(waiting, { ...waiting, waiting: { ...waiting.waiting!, at: waiting.waiting!.at + 1 } })).toBe(false);
    expect(host.same(session, { ...session })).toBe(true);
  });

  it("is carried on with when it is one this code made", () => {
    const players = candidates(2);
    const stored: unknown = JSON.parse(JSON.stringify(started(players)));

    expect(host.usable(stored)).toBe(true);
  });

  it.each([
    ["another game's", { version: 1, state: { version: 1, units: [] }, players: [] }],
    ["a later version's", { version: 2, state: { version: 1, pickOrder: [] } }],
    ["nothing", null],
    ["text", "game"],
  ])("is not carried on with when it is %s", (_what, stored) => {
    expect(host.usable(stored)).toBe(false);
  });
});
