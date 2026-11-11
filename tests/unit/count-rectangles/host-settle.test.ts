import { describe, expect, it } from "vitest";
import shipped from "../../../src/shared/games/count-rectangles/config.json";
import hostJson from "../../../src/shared/games/count-rectangles/host-config.json";
import { rectanglesHost, type RectSession, type RectSnapshot } from "../../../src/shared/games/count-rectangles/host";
import { awaited } from "../../../src/shared/games/count-rectangles/rules";
import type { Candidate, Presence, StartRequest } from "../../../src/shared/hosting";

/** The game as shipped: the third choice follows the race. */
const host = rectanglesHost;

/** The time the fixtures start at, in ms since the epoch. */
const T0 = 1_800_000_000_000;
const CHOOSE_MS = shipped.chooseSeconds * 1000;
const PROBLEM_MS = shipped.problemSeconds * 1000;
const PAUSE_MS = shipped.pauseSeconds * 1000;
const STAND_MS = hostJson.standSeconds * 1000;
/** After this many problems in a row that nobody buzzed in, a game is taken to have nobody playing it. */
const IDLE_PROBLEMS = hostJson.idleProblems;

function tokenOf(n: number): string {
  return `token-of-player-${n}`;
}

/** Lobby players 0..count-1 in their slots, each alone. */
function candidates(count: number): Candidate[] {
  return Array.from({ length: count }, (_, n) => ({ token: tokenOf(n), nick: `p${n}`, slot: n, team: 0 }));
}

/** Everyone in `players` holds a slot but those in `left`; those in neither `away` nor `left` are connected. */
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

function started(players: Candidate[], overrides: Partial<StartRequest> = {}): RectSession {
  const result = host.start(null, players, request(overrides), presenceOf(players));
  if (!result.ok) throw new Error(`fixture start refused: ${result.reason}`);
  return result.session;
}

function seenBy(session: RectSession, players: Candidate[], player: number | null, now: number, presence = presenceOf(players)): RectSnapshot {
  return host.view(session, player === null ? null : tokenOf(player), presence, now) as RectSnapshot;
}

function act(session: RectSession, players: Candidate[], player: number, action: unknown, now: number, presence = presenceOf(players)): RectSession {
  const result = host.act(session, tokenOf(player), action, presence, now);
  if (!result.ok) throw new Error(`fixture action refused: ${result.reason}`);
  return result.session;
}

/**
 * The race played out with everyone there: each of `winners` in turn answers
 * two problems right. Returns the session with the third choice up, and the
 * moment it came up.
 */
function raced(players: Candidate[], winners: number[], overrides: Partial<StartRequest> = {}): { session: RectSession; now: number } {
  let session = started(players, overrides);
  let now = T0 + 1000;
  for (const player of winners) {
    for (let right = 0; right < shipped.winsNeeded; right++) {
      session = act(session, players, player, { type: "buzz" }, now);
      session = act(session, players, player, { type: "answer", count: session.state.answer }, now + 500);
      if (session.state.phase === "pause") {
        now += 500 + PAUSE_MS;
        session = host.tick(session, presenceOf(players), now);
      }
      now += 1000;
    }
  }
  if (session.state.phase !== "choose") throw new Error(`fixture: the race is not over (${session.state.phase})`);
  return { session, now: session.state.choosing!.since };
}

describe("the third choice in a room", () => {
  it("is put to everyone when the race is over, on a clock of its own, and the game is still on", () => {
    const players = candidates(2);
    const { session, now } = raced(players, [1]);

    const sent = seenBy(session, players, 0, now + 3000);

    expect(sent.view.phase).toBe("choose");
    expect(sent.view.choosing).toEqual({ card: "alone", chosen: [], mine: null });
    expect(sent.clock).toEqual({ answer: null, problem: null, next: null, choose: CHOOSE_MS - 3000, stand: null });
    expect(host.running(session)).toBe(true);
    expect(host.deadline(session)).toBe(now + CHOOSE_MS);
  });

  it("takes a player's choice and shows it to that player alone", () => {
    const players = candidates(2);
    const { session, now } = raced(players, [1]);

    const after = act(session, players, 0, { type: "choose", option: 1 }, now + 1000);

    expect(seenBy(after, players, 0, now + 1000).view.choosing).toEqual({ card: "alone", chosen: [0], mine: 1 });
    expect(seenBy(after, players, 1, now + 1000).view.choosing).toEqual({ card: "alone", chosen: [0], mine: null });
    expect(seenBy(after, players, 1, now + 1000).view.choices).toEqual([]);
  });

  it("is over, with everyone's points, when the last player has chosen", () => {
    const players = candidates(2);
    const { session, now } = raced(players, [1]);

    const one = act(session, players, 0, { type: "choose", option: 2 }, now + 1000);
    const both = act(one, players, 1, { type: "choose", option: 2 }, now + 2000);

    expect(host.running(both)).toBe(false);
    expect(seenBy(both, players, null, now + 2000).view.scores?.map((line) => line.total)).toEqual([
      -shipped.losePoints - shipped.safeLoss,
      shipped.winPoints - shipped.safeLoss,
    ]);
  });

  it("is made by the room for whoever has not chosen when the time is up", () => {
    const players = candidates(2);
    const { session, now } = raced(players, [1]);

    const before = host.tick(session, presenceOf(players), now + CHOOSE_MS - 1);
    const after = host.tick(session, presenceOf(players), now + CHOOSE_MS);

    expect(before).toBe(session);
    expect(after.state.phase).toBe("ended");
    expect(after.state.choices.every((chosen) => chosen.forced)).toBe(true);
  });

  it("is made at once for a player who has left the room, and waited for from one who is only away", () => {
    const players = candidates(3);
    const { session, now } = raced(players, [1, 2]);

    const left = host.attend(session, presenceOf(players, [], [0]), now + 1000);
    const away = host.attend(session, presenceOf(players, [0]), now + 1000);

    expect(left.state.choices).toEqual([{ player: 0, option: shipped.defaultOptions.alone, forced: true }]);
    expect(awaited(left.state)).toEqual([1, 2]);
    expect(away).toBe(session);
  });

  it("goes on though nobody is connected: its clock runs, and the room chooses for all", () => {
    const players = candidates(2);
    const { session, now } = raced(players, [1]);
    const nobody = presenceOf(players, [0, 1]);

    const waiting = host.attend(session, nobody, now + 1000);
    const after = host.tick(waiting, nobody, now + CHOOSE_MS);

    expect(waiting.frozenAt).toBeNull();
    expect(after.state.phase).toBe("ended");
    expect(after.state.scores).not.toBeNull();
  });

  it("is made by a bot at once, so that the room waits only for its people", () => {
    const players = candidates(1);
    let session = started(players, { bots: true, allowBots: true });
    // the bots race each other until half the units have won; the person never buzzes
    let now = T0;
    for (let step = 0; step < 400 && session.state.phase !== "choose" && session.state.phase !== "ended"; step++) {
      now = host.deadline(session) ?? now + 1000;
      session = host.tick(session, presenceOf(players), now);
    }

    expect(session.state.phase).toBe("choose");
    expect(awaited(session.state)).toEqual([0]);
  });
});

describe("a team's leader in a room", () => {
  it("is whoever took the team first in the waiting room", () => {
    const players: Candidate[] = [
      { token: tokenOf(0), nick: "p0", slot: 0, team: 1, teamSince: 7 },
      { token: tokenOf(1), nick: "p1", slot: 1, team: 1, teamSince: 3 },
      { token: tokenOf(2), nick: "p2", slot: 2, team: 1, teamSince: 9 },
      { token: tokenOf(3), nick: "p3", slot: 3, team: 0 },
    ];

    const sent = seenBy(started(players), players, 0, T0);

    expect(sent.view.units.map((unit) => unit.leader)).toEqual([1, null]);
  });
});

describe("the added contest in a room", () => {
  /** Four alone; 2 and 3 win the race; 0 and 2 take 도전. Returns the session with the contest's first problem open. */
  function contest(): { players: Candidate[]; session: RectSession; now: number } {
    const players = candidates(4);
    const { session, now } = raced(players, [2, 3]);
    let next = session;
    for (const [player, option] of [[0, 1], [1, 2], [2, 1], [3, 2]]) next = act(next, players, player, { type: "choose", option }, now + 1000);
    return { players, session: next, now: now + 1000 };
  }

  it("puts a problem to those who took it, on the problem's own clock", () => {
    const { players, session, now } = contest();

    const sent = seenBy(session, players, 1, now + 2000);

    expect(sent.view.phase).toBe("problem");
    expect(sent.view.duel).toEqual({ players: [0, 2], round: 1, winner: null });
    expect(sent.clock).toMatchObject({ problem: PROBLEM_MS - 2000, choose: null });
    expect(host.running(session)).toBe(true);
  });

  it("ends the game, with everyone's points, at its first right answer", () => {
    const { players, session, now } = contest();

    const buzzed = act(session, players, 2, { type: "buzz" }, now + 3000);
    const ended = act(buzzed, players, 2, { type: "answer", count: buzzed.state.answer }, now + 4000);

    expect(host.running(ended)).toBe(false);
    expect(ended.state.scores?.find((line) => line.player === 2)).toMatchObject({ pieces: shipped.duelPieces, total: shipped.winPoints });
    expect(ended.state.scores?.find((line) => line.player === 0)).toMatchObject({ pieces: 0, total: -shipped.losePoints - shipped.duelLoss });
  });

  it("stands still while none of its players is connected, and goes on when one is back", () => {
    const { players, session, now } = contest();

    const still = host.attend(session, presenceOf(players, [0, 2]), now + 5000);
    const back = host.attend(still, presenceOf(players, [0]), now + 65_000);

    expect(still.frozenAt).toBe(now + 5000);
    expect(back.frozenAt).toBeNull();
    expect(back.state.openedAt).toBe(session.state.openedAt + 60_000);
  });

  it("ends without a winner when none of its players comes back, and the points are still counted", () => {
    const { players, session, now } = contest();
    const gone = presenceOf(players, [0, 2]);
    const still = host.attend(session, gone, now + 5000);

    const ended = host.tick(still, gone, now + 5000 + STAND_MS);

    expect(ended.state.phase).toBe("ended");
    expect(ended.state.history.slice(-3).map((event) => event.type)).toEqual(["duel-over", "score", "ended"]);
    expect(ended.state.scores?.map((line) => line.total)).toEqual([
      -shipped.losePoints - shipped.duelLoss,
      -shipped.losePoints - shipped.safeLoss,
      shipped.winPoints - shipped.duelLoss,
      shipped.winPoints - shipped.safeLoss,
    ]);
  });

  it("ends without a winner at once when all its players have left the room", () => {
    const { players, session, now } = contest();

    const ended = host.attend(session, presenceOf(players, [], [0, 2]), now + 5000);

    expect(ended.state.phase).toBe("ended");
    expect(ended.state.duel).toMatchObject({ winner: null });
    expect(ended.state.scores).not.toBeNull();
  });

  it("does not wait for a player of it who is away once the other has answered wrong", () => {
    const { players, session, now } = contest();
    const one = presenceOf(players, [0]);

    const buzzed = act(session, players, 2, { type: "buzz" }, now + 3000, one);
    const wrong = act(buzzed, players, 2, { type: "answer", count: buzzed.state.answer + 1 }, now + 4000, one);

    expect(wrong.state.phase).toBe("pause");
    expect(wrong.state.outcome).toEqual({ kind: "all-wrong" });
  });

  it("ends without a winner, the points counted, when problem after problem of it runs out with nobody buzzing", () => {
    const { players, session } = contest();
    const here = presenceOf(players);
    let next = session;
    for (let problem = 0; problem < IDLE_PROBLEMS && next.state.phase !== "ended"; problem++) {
      next = host.tick(next, here, next.state.openedAt + PROBLEM_MS);
      if (next.state.phase === "pause" && problem < IDLE_PROBLEMS - 1) next = host.tick(next, here, next.state.pauseUntil!);
    }

    expect(next.state.phase).toBe("ended");
    expect(next.state.duel).toEqual({ players: [0, 2], round: IDLE_PROBLEMS, winner: null });
    expect(next.state.history.some((event) => event.type === "ended" && event.reason === "abandoned")).toBe(false);
    expect(next.state.scores?.find((line) => line.player === 0)?.choice).toBe(-shipped.duelLoss);
  });

  it("goes on after a problem of it that ran out, as long as somebody buzzed in the one before", () => {
    const { players, session, now } = contest();
    const here = presenceOf(players);
    // the first problem: player 0 buzzes and is wrong, and then its time runs out
    const buzzed = act(session, players, 0, { type: "buzz" }, now + 1000);
    const wrong = act(buzzed, players, 0, { type: "answer", count: buzzed.state.answer + 1 }, now + 2000);
    const timed = host.tick(wrong, here, wrong.state.openedAt + PROBLEM_MS);
    const second = host.tick(timed, here, timed.state.pauseUntil!);
    // the second runs out with nobody buzzing: one such problem is not two
    const after = host.tick(second, here, second.state.openedAt + PROBLEM_MS);

    expect(second.state.duel).toMatchObject({ round: 2, winner: null });
    expect(after.state.phase).toBe("pause");
  });
});

describe("a game stored before the third choice came with it", () => {
  it("is not carried on with", () => {
    const session = started(candidates(2));
    const old = { ...session, version: 1, state: { ...session.state, version: 1 } };

    expect(host.usable(session)).toBe(true);
    expect(host.usable(old)).toBe(false);
  });
});
