import { describe, expect, it } from "vitest";
import botJson from "../../../src/shared/games/count-cubes/bot-config.json";
import shipped from "../../../src/shared/games/count-cubes/config.json";
import hostJson from "../../../src/shared/games/count-cubes/host-config.json";
import { cubesHost, type CubesSession, type CubesSnapshot } from "../../../src/shared/games/count-cubes/host";
import { countOf, lockedUntil, neededOf } from "../../../src/shared/games/count-cubes/rules";
import type { Candidate, Presence, StartRequest } from "../../../src/shared/hosting";

const host = cubesHost;

/** The time the fixtures start at, in ms since the epoch. */
const T0 = 1_800_000_000_000;
const LOCK_MS = shipped.lockSeconds * 1000;
const PROBLEM_MS = shipped.problemSeconds * 1000;
const STAND_MS = hostJson.standSeconds * 1000;
const FIRST_BOT_MS = botJson.answerAfterSeconds * 1000;
/** With bots asked for, the room fills up to this many players. */
const WITH_BOTS = 4;

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
function started(players: Candidate[], overrides: Partial<StartRequest> = {}): CubesSession {
  const result = host.start(null, players, request(overrides), presenceOf(players));
  if (!result.ok) throw new Error(`fixture start refused: ${result.reason}`);
  return result.session;
}

/** What `player` is sent at `now`. */
function seenBy(session: CubesSession, players: Candidate[], player: number | null, now: number, presence = presenceOf(players)): CubesSnapshot {
  return host.view(session, player === null ? null : tokenOf(player), presence, now) as CubesSnapshot;
}

/** The answer to the problem of `session`. */
function answerOf(session: CubesSession): number {
  return countOf(session.state.solid);
}

/** `player` answers `said` at `now`; the test expects it to be taken. */
function answer(session: CubesSession, players: Candidate[], player: number, said: number, now: number, presence = presenceOf(players)): CubesSession {
  const result = host.act(session, tokenOf(player), { type: "answer", said }, presence, now);
  if (!result.ok) throw new Error(`fixture answer refused: ${result.reason}`);
  return result.session;
}

/** Runs the clock to each moment the game asks for, until it is over or `steps` have gone. */
function runOut(session: CubesSession, presence: Presence, steps: number): CubesSession {
  let next = session;
  for (let step = 0; step < steps && host.running(next); step++) {
    const due = host.deadline(next);
    if (due === null) break;
    next = host.tick(next, presence, due);
  }
  return next;
}

describe("큐브 세기 in a room: starting", () => {
  it("starts a game for the players in the room, each known by the slot they hold", () => {
    const players = candidates(3);

    const session = started(players);

    expect(session.state.players).toEqual([0, 1, 2]);
    expect(seenBy(session, players, 1, T0).view.you).toBe(1);
    expect(seenBy(session, players, 1, T0).players.map((player) => player.nick)).toEqual(["p0", "p1", "p2"]);
    expect(host.running(session)).toBe(true);
  });

  it("lets only the host start: whoever came into the room first", () => {
    const players = candidates(3);

    expect(host.start(null, players, request({ by: tokenOf(1) }), presenceOf(players))).toEqual({ ok: false, reason: "not-host" });
  });

  it("refuses a second game while one is being played, and takes one after it", () => {
    const players = candidates(2);
    const session = started(players);
    const over = answer(session, players, 0, answerOf(session), T0 + 1000);

    expect(host.start(session, players, request(), presenceOf(players))).toEqual({ ok: false, reason: "already-playing" });
    expect(host.start(over, players, request({ now: T0 + 5000 }), presenceOf(players)).ok).toBe(true);
  });

  it("starts a game for one player alone", () => {
    const players = candidates(1);

    const result = host.start(null, players, request(), presenceOf(players));

    expect(result.ok && result.session.players.map((seat) => seat.id)).toEqual([0]);
    expect(result.ok && host.running(result.session)).toBe(true);
  });

  it("refuses a game for nobody", () => {
    expect(host.start(null, [], request(), presenceOf([]))).toMatchObject({ ok: false });
  });

  it("refuses bots where the room does not offer them", () => {
    const players = candidates(2);

    expect(host.start(null, players, request({ bots: true }), presenceOf(players))).toEqual({ ok: false, reason: "bots-not-allowed" });
  });

  it("fills places with bots where the room offers them", () => {
    const players = candidates(1);

    const session = started(players, { bots: true, allowBots: true });

    expect(session.players).toHaveLength(WITH_BOTS);
    expect(session.players.filter((seat) => seat.token === null).map((seat) => seat.nick)).toEqual(["봇 1", "봇 2", "봇 3"]);
    expect(seenBy(session, players, 0, T0).players.filter((player) => player.bot)).toHaveLength(WITH_BOTS - 1);
  });

  it("draws the same problem whether or not bots play", () => {
    const players = candidates(2);

    expect(started(players, { bots: true, allowBots: true }).state.solid).toEqual(started(players).state.solid);
  });
});

describe("큐브 세기 in a room: answering", () => {
  it("gives a right answer its place, for everyone to see", () => {
    const players = candidates(3);
    const session = started(players);

    const after = answer(session, players, 2, answerOf(session), T0 + 4000);

    expect(seenBy(after, players, 0, T0 + 4000).view.ranked).toEqual([{ player: 2, took: 4000 }]);
    expect(seenBy(after, players, null, T0 + 4000).view.history).toEqual([{ type: "right", player: 2, place: 1, took: 4000 }]);
  });

  it("shuts out a player who was wrong, and says for how long", () => {
    const players = candidates(3);
    const session = started(players);
    const at = T0 + 4000;

    const after = answer(session, players, 1, answerOf(session) + 1, at);

    expect(seenBy(after, players, 0, at).clock.locks).toEqual([{ player: 1, left: LOCK_MS }]);
    expect(seenBy(after, players, 0, at + 5000).clock.locks).toEqual([{ player: 1, left: LOCK_MS - 5000 }]);
    expect(seenBy(after, players, 0, at + LOCK_MS).clock.locks).toEqual([]);
    expect(host.act(after, tokenOf(1), { type: "answer", said: answerOf(session) }, presenceOf(players), at + 1000)).toEqual({
      ok: false,
      reason: "locked",
    });
  });

  it("ends the game when all but one have the answer", () => {
    const players = candidates(3);
    const session = started(players);

    const one = answer(session, players, 0, answerOf(session), T0 + 1000);
    const two = answer(one, players, 2, answerOf(session), T0 + 2000);

    expect(host.running(one)).toBe(true);
    expect(host.running(two)).toBe(false);
    expect(two.state.ranked).toHaveLength(neededOf(players.length));
    expect(seenBy(two, players, 1, T0 + 2000).view.answer).toBe(answerOf(session));
  });

  it("refuses an answer from someone watching", () => {
    const players = candidates(2);
    const session = started(players);

    expect(host.act(session, "token-of-a-watcher", { type: "answer", said: 1 }, presenceOf(players), T0 + 1)).toEqual({
      ok: false,
      reason: "not-seated",
    });
  });

  it("refuses what is not an answer", () => {
    const players = candidates(2);
    const session = started(players);

    expect(host.act(session, tokenOf(0), { type: "buzz" }, presenceOf(players), T0 + 1)).toEqual({ ok: false, reason: "bad-action" });
  });

  it("refuses an answer where no game is on", () => {
    expect(host.act(null, tokenOf(0), { type: "answer", said: 1 }, presenceOf(candidates(2)), T0)).toEqual({ ok: false, reason: "no-game" });
  });

  it("refuses an answer that comes after the problem's time, even before the clock has said so", () => {
    const players = candidates(3);
    const session = started(players);

    const late = host.act(session, tokenOf(0), { type: "answer", said: answerOf(session) }, presenceOf(players), T0 + PROBLEM_MS);

    expect(late).toEqual({ ok: false, reason: "game-over" });
  });
});

describe("큐브 세기 in a room: the clock", () => {
  it("asks for the clock when the problem comes down", () => {
    const players = candidates(3);
    const session = started(players);

    expect(host.deadline(session)).toBe(T0 + PROBLEM_MS);
    expect(seenBy(session, players, 0, T0 + 10_000).clock.problem).toBe(PROBLEM_MS - 10_000);
  });

  it("does nothing before anything is due", () => {
    const players = candidates(3);
    const session = started(players);

    expect(host.tick(session, presenceOf(players), T0 + PROBLEM_MS - 1)).toBe(session);
  });

  it("ends the game when the problem's time is up, with those who had the answer", () => {
    const players = candidates(4);
    const session = answer(started(players), players, 3, answerOf(started(players)), T0 + 1000);

    const over = host.tick(session, presenceOf(players), T0 + PROBLEM_MS);

    expect(host.running(over)).toBe(false);
    expect(over.state.history.at(-1)).toEqual({ type: "ended", reason: "time" });
    expect(over.state.ranked.map((entry) => entry.player)).toEqual([3]);
    expect(host.deadline(over)).toBeNull();
    expect(seenBy(over, players, 0, T0 + PROBLEM_MS).clock).toEqual({ problem: null, locks: [], stand: null });
  });
});

describe("큐브 세기 in a room: bots", () => {
  it("has a bot answer when its time comes", () => {
    const players = candidates(1);
    const session = started(players, { bots: true, allowBots: true });

    const after = host.tick(session, presenceOf(players), T0 + FIRST_BOT_MS);

    expect(host.deadline(session)).toBe(T0 + FIRST_BOT_MS);
    expect(after.state.history).toHaveLength(1);
    expect(after.state.history[0]).toMatchObject({ player: 1 });
  });

  it("lets a bot that was wrong try again only once it is let back in", () => {
    const players = candidates(1);
    let session = started(players, { bots: true, allowBots: true });
    // run until some bot has been wrong
    for (let step = 0; step < 50 && session.state.wrong.length === 0 && host.running(session); step++) {
      session = host.tick(session, presenceOf(players), host.deadline(session)!);
    }
    const wrong = session.state.wrong[0];

    const next = session.bots.find((bot) => bot.player === wrong.player);

    expect(next?.at).toBe(lockedUntil(session.state, wrong.player) + botJson.againSeconds * 1000);
  });

  it("brings a game to its end with bots alone", () => {
    const players = candidates(1);
    const session = started(players, { bots: true, allowBots: true });

    const over = runOut(session, presenceOf(players), 200);

    expect(host.running(over)).toBe(false);
    expect(over.state.history.at(-1)).toEqual({ type: "ended", reason: "ranked" });
    expect(over.state.ranked).toHaveLength(neededOf(WITH_BOTS));
    expect(over.bots).toEqual([]);
  });
});

describe("큐브 세기 in a room: who is there", () => {
  it("stands still while none of its people is connected, and its clocks stop", () => {
    const players = candidates(2);
    const session = started(players);
    const at = T0 + 30_000;

    const still = host.attend(session, presenceOf(players, [0, 1]), at);

    expect(still.frozenAt).toBe(at);
    expect(host.deadline(still)).toBe(at + STAND_MS);
    const seen = seenBy(still, players, 0, at + 60_000, presenceOf(players, [0, 1]));
    expect(seen.frozen).toBe(true);
    expect(seen.clock.problem).toBe(PROBLEM_MS - 30_000);
    expect(seen.clock.stand).toBe(STAND_MS - 60_000);
  });

  it("goes on when someone is back, and the time it stood is not counted", () => {
    const players = candidates(2);
    const wrong = answer(started(players), players, 1, 0, T0 + 10_000);
    const stood = 50_000;
    const still = host.attend(wrong, presenceOf(players, [0, 1]), T0 + 30_000);

    const back = host.attend(still, presenceOf(players, [1]), T0 + 30_000 + stood);

    expect(back.frozenAt).toBeNull();
    expect(back.state.closesAt).toBe(T0 + PROBLEM_MS + stood);
    expect(lockedUntil(back.state, 1)).toBe(T0 + 10_000 + LOCK_MS + stood);
  });

  it("moves its bots on by the time it stood as well", () => {
    const players = candidates(1);
    const session = started(players, { bots: true, allowBots: true });
    const stood = 50_000;
    const still = host.attend(session, presenceOf(players, [0]), T0 + 1000);

    const back = host.attend(still, presenceOf(players), T0 + 1000 + stood);

    expect(back.bots.map((bot) => bot.at)).toEqual(session.bots.map((bot) => bot.at + stood));
  });

  it("has no bot answer while it stands still", () => {
    const players = candidates(1);
    const session = started(players, { bots: true, allowBots: true });
    const still = host.attend(session, presenceOf(players, [0]), T0 + 1000);

    const later = host.tick(still, presenceOf(players, [0]), T0 + FIRST_BOT_MS + 1000);

    expect(later.state.history).toEqual([]);
  });

  it("is ended when it has stood as long as it may", () => {
    const players = candidates(2);
    const still = host.attend(started(players), presenceOf(players, [0, 1]), T0 + 1000);

    const over = host.tick(still, presenceOf(players, [0, 1]), T0 + 1000 + STAND_MS);

    expect(host.running(over)).toBe(false);
    expect(over.state.history.at(-1)).toEqual({ type: "ended", reason: "abandoned" });
  });

  it("is ended at once when all its people have left the room", () => {
    const players = candidates(2);

    const over = host.attend(started(players), presenceOf(players, [], [0, 1]), T0 + 1000);

    expect(host.running(over)).toBe(false);
    expect(over.state.history.at(-1)).toEqual({ type: "ended", reason: "abandoned" });
  });

  it("does not wait for players who have left: it ends when everyone still there has the answer", () => {
    const players = candidates(4);
    const session = started(players);
    const gone = presenceOf(players, [], [2, 3]);
    const one = answer(session, players, 0, answerOf(session), T0 + 1000);

    const going = host.attend(one, gone, T0 + 2000);
    const over = answer(going, players, 1, answerOf(session), T0 + 3000, gone);

    expect(host.running(going)).toBe(true);
    expect(host.running(over)).toBe(false);
    expect(over.state.ranked.map((entry) => entry.player)).toEqual([0, 1]);
  });

  it("ends when the only ones without the answer leave", () => {
    const players = candidates(4);
    const session = started(players);
    const two = answer(answer(session, players, 0, answerOf(session), T0 + 1000), players, 1, answerOf(session), T0 + 2000);

    const over = host.attend(two, presenceOf(players, [], [2, 3]), T0 + 3000);

    expect(host.running(two)).toBe(true);
    expect(host.running(over)).toBe(false);
    expect(over.state.history.at(-1)).toEqual({ type: "ended", reason: "ranked" });
  });

  it("goes on waiting for a player who is only disconnected", () => {
    const players = candidates(3);
    const session = started(players);
    const one = answer(session, players, 0, answerOf(session), T0 + 1000);

    const going = host.attend(one, presenceOf(players, [1, 2]), T0 + 2000);

    expect(host.running(going)).toBe(true);
    expect(going.frozenAt).toBeNull();
  });

  it("holds the place of each of its players, and of nobody else", () => {
    const session = started(candidates(2));

    expect(host.holdsPlace(session, tokenOf(1))).toBe(true);
    expect(host.holdsPlace(session, "token-of-a-watcher")).toBe(false);
  });
});

describe("큐브 세기 in a room: what is sent and kept", () => {
  it("never sends a token", () => {
    const players = candidates(3);
    const session = started(players);

    const sent = JSON.stringify([0, 1, 2, null].map((viewer) => seenBy(session, players, viewer, T0)));

    for (const player of players) expect(sent).not.toContain(player.token);
  });

  it("keeps the answer back from everyone until the game is over", () => {
    const players = candidates(3);
    const session = answer(started(players), players, 0, answerOf(started(players)), T0 + 1000);

    for (const viewer of [0, 1, 2, null]) expect(seenBy(session, players, viewer, T0 + 1000).view.answer).toBeNull();
  });

  it("marks who is connected and who has left", () => {
    const players = candidates(3);
    const session = started(players);

    const seen = seenBy(session, players, 0, T0, presenceOf(players, [1], [2]));

    expect(seen.players.map((player) => [player.connected, player.left])).toEqual([
      [true, false],
      [false, false],
      [false, true],
    ]);
  });

  it("tells the screen the numbers it counts with", () => {
    const players = candidates(2);

    expect(seenBy(started(players), players, 0, T0).rules).toEqual({
      lockSeconds: shipped.lockSeconds,
      problemSeconds: shipped.problemSeconds,
      maxSaid: shipped.maxSaid,
    });
  });

  it("knows a stored game of its own, and nothing else, as one it can carry on with", () => {
    const session = started(candidates(2));

    expect(host.usable(JSON.parse(JSON.stringify(session)))).toBe(true);
    expect(host.usable(null)).toBe(false);
    expect(host.usable({ ...session, version: 2 })).toBe(false);
    expect(host.usable({ version: 1, state: { version: 1, pickOrder: [] }, players: [] })).toBe(false);
  });

  it("says whether storing a game again would change anything", () => {
    const players = candidates(3);
    const session = started(players);

    expect(host.same(session, host.attend(session, presenceOf(players), T0 + 1))).toBe(true);
    expect(host.same(session, answer(session, players, 1, 0, T0 + 1))).toBe(false);
  });
});
