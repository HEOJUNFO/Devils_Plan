import { describe, expect, it } from "vitest";
import botJson from "../../../src/shared/games/count-rectangles/bot-config.json";
import shipped from "../../../src/shared/games/count-rectangles/config.json";
import hostJson from "../../../src/shared/games/count-rectangles/host-config.json";
import { rectanglesHostFor, type RectSession, type RectSnapshot } from "../../../src/shared/games/count-rectangles/host";
import { solutions, type RectConfig } from "../../../src/shared/games/count-rectangles/rules";
import type { Candidate, Presence, StartRequest } from "../../../src/shared/hosting";

/** The race alone: how the third choice that follows it is hosted has tests of its own (host-settle.test.ts). */
const RACE: RectConfig = { ...shipped, settle: false };
const host = rectanglesHostFor(RACE);

/** The time the fixtures start at, in ms since the epoch. */
const T0 = 1_800_000_000_000;
const ANSWER_MS = shipped.answerSeconds * 1000;
const PROBLEM_MS = shipped.problemSeconds * 1000;
const PAUSE_MS = shipped.pauseSeconds * 1000;
const BOT_WAIT_MS = botJson.buzzAfterSeconds * 1000;
/** How long a game stands still before it is ended. */
const STAND_MS = hostJson.standSeconds * 1000;

/** The token of fixture player `n`. */
function tokenOf(n: number): string {
  return `token-of-player-${n}`;
}

/** Lobby players 0..count-1 in their slots, in the teams given (none: all alone). */
function candidates(count: number, teams: number[] = []): Candidate[] {
  return Array.from({ length: count }, (_, n) => ({ token: tokenOf(n), nick: `p${n}`, slot: n, team: teams[n] ?? 0 }));
}

/** Everyone in `players` holds a slot; those not named in `away` are connected. */
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
function started(players: Candidate[], overrides: Partial<StartRequest> = {}): RectSession {
  const result = host.start(null, players, request(overrides), presenceOf(players));
  if (!result.ok) throw new Error(`fixture start refused: ${result.reason}`);
  return result.session;
}

/** What `player` is sent at `now`. */
function seenBy(session: RectSession, players: Candidate[], player: number | null, now: number, presence = presenceOf(players)): RectSnapshot {
  return host.view(session, player === null ? null : tokenOf(player), presence, now) as RectSnapshot;
}

/** Applies something the test expects to be accepted. */
function act(session: RectSession, players: Candidate[], player: number, action: unknown, now: number): RectSession {
  const result = host.act(session, tokenOf(player), action, presenceOf(players), now);
  if (!result.ok) throw new Error(`fixture action refused: ${result.reason}`);
  return result.session;
}

describe("starting a game of 네모 세기", () => {
  it("knows each player by the slot they hold, and never by their token in what it sends", () => {
    const players = candidates(3);
    const session = started(players);

    const sent = seenBy(session, players, 1, T0);

    expect(sent.players).toEqual([
      { id: 0, nick: "p0", bot: false, connected: true, left: false },
      { id: 1, nick: "p1", bot: false, connected: true, left: false },
      { id: 2, nick: "p2", bot: false, connected: true, left: false },
    ]);
    expect(sent.view.you).toEqual({ player: 1, unit: 1 });
    expect(JSON.stringify(sent)).not.toContain("token-of-player");
  });

  it("puts players who chose the same team in one unit", () => {
    const players = candidates(5, [1, 0, 1, 1, 0]);

    const session = started(players);

    expect(session.state.units.map((unit) => unit.members)).toEqual([[0, 2, 3], [1], [4]]);
  });

  it("starts a game for one player alone, and for one team with nobody to race", () => {
    const alone = candidates(1);
    const oneTeam = candidates(3, [1, 1, 1]);

    const solo = host.start(null, alone, request(), presenceOf(alone));
    const team = host.start(null, oneTeam, request(), presenceOf(oneTeam));

    expect(solo.ok && solo.session.state.units.map((unit) => unit.members)).toEqual([[0]]);
    expect(team.ok && team.session.state.units.map((unit) => unit.members)).toEqual([[0, 1, 2]]);
  });

  it("refuses a game for nobody", () => {
    expect(host.start(null, [], request(), presenceOf([]))).toMatchObject({ ok: false });
  });

  it("takes the players of a team that is not full each alone, so that one player's choice holds up nobody's start", () => {
    const pair = candidates(3, [1, 1, 0]);
    const loner = candidates(3, [0, 0, 2]);

    expect(started(pair).state.units.map((unit) => unit.members)).toEqual([[0], [1], [2]]);
    expect(started(loner).state.units.map((unit) => unit.members)).toEqual([[0], [1], [2]]);
  });

  it("takes the players of a team of more than three each alone, and leaves a full team beside it as it is", () => {
    const four = candidates(5, [1, 1, 1, 1, 0]);
    const mixed = candidates(6, [1, 1, 1, 2, 2, 0]);

    expect(started(four).state.units.map((unit) => unit.members)).toEqual([[0], [1], [2], [3], [4]]);
    expect(started(mixed).state.units.map((unit) => unit.members)).toEqual([[0, 1, 2], [3], [4], [5]]);
  });

  it("lets only the player who came into the room first start", () => {
    // player 1 came first; player 0 took a lower slot later
    const players = candidates(2).map((player) => ({ ...player, seq: 1 - player.slot }));

    const byLowestSlot = host.start(null, players, request({ by: tokenOf(0) }), presenceOf(players));
    const byFirstComer = host.start(null, players, request({ by: tokenOf(1) }), presenceOf(players));

    expect(byLowestSlot).toEqual({ ok: false, reason: "not-host" });
    expect(byFirstComer.ok).toBe(true);
  });

  it("refuses a second start while a game is being played, and allows one once it is over", () => {
    const players = candidates(2);
    let session = started(players);

    const during = host.start(session, players, request(), presenceOf(players));
    // player 1 answers two problems right: half the units have won
    for (let round = 0; round < 2; round++) {
      const now = T0 + round * (PAUSE_MS + 5000) + 1000;
      session = act(session, players, 1, { type: "buzz" }, now);
      session = act(session, players, 1, { type: "answer", count: session.state.answer }, now + 500);
      session = host.tick(session, presenceOf(players), now + 500 + PAUSE_MS);
    }
    const after = host.start(session, players, request({ now: T0 + 100_000 }), presenceOf(players));

    expect(during).toEqual({ ok: false, reason: "already-playing" });
    expect(host.running(session)).toBe(false);
    expect(after.ok).toBe(true);
  });

  it("refuses bots where the room does not offer them", () => {
    const players = candidates(1);

    expect(host.start(null, players, request({ bots: true }), presenceOf(players))).toEqual({ ok: false, reason: "bots-not-allowed" });
  });

  it("fills the game with bots playing alone where the room offers them, in slots nobody holds", () => {
    const players = [{ token: tokenOf(2), nick: "p2", slot: 2, team: 0 }];

    const result = host.start(null, players, request({ by: tokenOf(2), bots: true, allowBots: true }), presenceOf(players));

    if (!result.ok) throw new Error(result.reason);
    const sent = seenBy(result.session, players, 2, T0);
    expect(sent.players.filter((player) => player.bot).map((player) => player.id)).toEqual([0, 1, 3]);
    expect(sent.players.filter((player) => player.bot).map((player) => player.nick)).toEqual(["봇 1", "봇 2", "봇 3"]);
    expect(sent.view.units).toHaveLength(4);
    expect(sent.view.you).toEqual({ player: 2, unit: 2 });
  });
});

describe("playing", () => {
  it("takes a buzz and an answer from the player holding the token", () => {
    const players = candidates(3);
    let session = started(players);

    session = act(session, players, 2, { type: "buzz" }, T0 + 1000);
    session = act(session, players, 2, { type: "answer", count: session.state.answer }, T0 + 2000);

    expect(session.state.units[2].wins).toBe(1);
    expect(session.state.outcome).toEqual({ kind: "right", player: 2, unit: 2 });
  });

  it("refuses someone who is only watching, and anything when no game is on", () => {
    const players = candidates(2);
    const session = started(players);

    expect(host.act(session, tokenOf(9), { type: "buzz" }, presenceOf(players), T0 + 1)).toEqual({ ok: false, reason: "not-seated" });
    expect(host.act(null, tokenOf(0), { type: "buzz" }, presenceOf(players), T0 + 1)).toEqual({ ok: false, reason: "no-game" });
  });

  it("refuses what is not an action of this game, and passes on the rules' own refusals", () => {
    const players = candidates(2);
    const session = started(players);

    expect(host.act(session, tokenOf(0), { type: "rotate", steps: 1 }, presenceOf(players), T0 + 1)).toEqual({ ok: false, reason: "bad-action" });
    expect(host.act(session, tokenOf(0), { type: "answer", count: 3 }, presenceOf(players), T0 + 1)).toEqual({ ok: false, reason: "not-your-answer" });
  });

  it("does not take someone for the player whose slot they now hold", () => {
    const players = candidates(2);
    const session = started(players);
    // player 1 has left the room and a newcomer sits in slot 1
    const newcomer = "token-of-a-newcomer-in-slot-1";

    expect(host.act(session, newcomer, { type: "buzz" }, presenceOf(players), T0 + 1)).toEqual({ ok: false, reason: "not-seated" });
    expect((host.view(session, newcomer, presenceOf(players), T0 + 1) as RectSnapshot).view.you).toBeNull();
  });
});

describe("an answer and the clock", () => {
  it("is taken a moment before its time is up", () => {
    const players = candidates(2);
    const answering = act(started(players), players, 0, { type: "buzz" }, T0 + 1000);

    const result = host.act(answering, tokenOf(0), { type: "answer", count: answering.state.answer }, presenceOf(players), T0 + 1000 + ANSWER_MS - 1);

    expect(result.ok && result.session.state.outcome).toEqual({ kind: "right", player: 0, unit: 0 });
  });

  it("is not taken once its time is up, however late the room's clock is in saying so", () => {
    const players = candidates(2);
    const answering = act(started(players), players, 0, { type: "buzz" }, T0 + 1000);

    // no alarm has run: the answer itself arrives at the moment the time ends
    const result = host.act(answering, tokenOf(0), { type: "answer", count: answering.state.answer }, presenceOf(players), T0 + 1000 + ANSWER_MS);

    expect(result).toEqual({ ok: false, reason: "not-your-answer" });
  });

  it("gives a buzz that comes after the problem's time the closed problem to meet", () => {
    const players = candidates(2);
    const session = started(players);

    expect(host.act(session, tokenOf(1), { type: "buzz" }, presenceOf(players), T0 + PROBLEM_MS)).toEqual({ ok: false, reason: "not-open" });
    expect(host.act(session, tokenOf(1), { type: "buzz" }, presenceOf(players), T0 + PROBLEM_MS - 1).ok).toBe(true);
  });
});

describe("a problem nobody who is there can still answer", () => {
  /** Player 0 buzzes at `now` and says a wrong number half a second later, with `presence` as it is then. */
  function missBy(session: RectSession, presence: Presence, now: number): RectSession {
    const buzzed = host.act(session, tokenOf(0), { type: "buzz" }, presence, now);
    if (!buzzed.ok) throw new Error(`fixture buzz refused: ${buzzed.reason}`);
    const answered = host.act(buzzed.session, tokenOf(0), { type: "answer", count: buzzed.session.state.answer + 1 }, presence, now + 500);
    if (!answered.ok) throw new Error(`fixture answer refused: ${answered.reason}`);
    return answered.session;
  }

  it("is closed when the only player there answers wrong: one who has left does not hold it open", () => {
    const players = candidates(2);

    const after = missBy(started(players), presenceOf(players, [], [1]), T0 + 3000);

    expect(after.state).toMatchObject({ phase: "pause", outcome: { kind: "all-wrong" }, wrong: [0] });
    expect(host.deadline(after)).toBe(T0 + 3500 + PAUSE_MS);
  });

  it("is closed just the same when the other player is only not connected", () => {
    const players = candidates(2);

    const after = missBy(started(players), presenceOf(players, [1]), T0 + 3000);

    expect(after.state.outcome).toEqual({ kind: "all-wrong" });
  });

  it("is closed at the moment the last player who could still answer goes", () => {
    const players = candidates(2);
    const open = missBy(started(players), presenceOf(players), T0 + 3000);

    const after = host.attend(open, presenceOf(players, [1]), T0 + 9000);

    expect(open.state).toMatchObject({ phase: "problem", wrong: [0] });
    expect(after.state).toMatchObject({ phase: "pause", outcome: { kind: "all-wrong" }, pauseUntil: T0 + 9000 + PAUSE_MS });
  });

  it("stays open while someone there has still to answer", () => {
    const players = candidates(3);

    const after = missBy(started(players), presenceOf(players, [1]), T0 + 3000);

    expect(after.state).toMatchObject({ phase: "problem", outcome: null });
    expect(host.deadline(after)).toBe(T0 + PROBLEM_MS);
  });

  it("stays open for a bot that has still to answer", () => {
    const person = [{ token: tokenOf(0), nick: "p0", slot: 0, team: 0 }];
    const session = started(person, { bots: true, allowBots: true });
    const at = session.botAt! - 2000;

    const after = missBy(session, presenceOf(person), at);

    expect(after.state).toMatchObject({ phase: "problem", wrong: [0] });
  });
});

describe("a game its players have stopped playing", () => {
  /** Lets the clock run the open problem out, and the pause after it. */
  function runOut(session: RectSession, players: Candidate[]): RectSession {
    const closed = host.tick(session, presenceOf(players), host.deadline(session)!);
    return host.running(closed) && closed.state.phase === "pause" ? host.tick(closed, presenceOf(players), host.deadline(closed)!) : closed;
  }

  it("is ended when two problems in a row have run out with nobody buzzing", () => {
    const players = candidates(2);

    const one = runOut(started(players), players);
    const two = runOut(one, players);

    expect(hostJson.idleProblems).toBe(2);
    expect(one.state).toMatchObject({ phase: "problem", round: 2 });
    expect(host.running(two)).toBe(false);
    expect(two.state.history.at(-1)).toEqual({ type: "ended", round: 2, reason: "abandoned" });
    expect(host.deadline(two)).toBeNull();
  });

  it("goes on when a problem in between was so much as buzzed at", () => {
    const players = candidates(2);
    const one = runOut(started(players), players);
    const buzzed = act(one, players, 1, { type: "buzz" }, one.state.openedAt + 5000);

    // the buzz goes unanswered and the problem runs out: touched all the same
    const two = runOut(host.tick(buzzed, presenceOf(players), host.deadline(buzzed)!), players);
    const three = runOut(two, players);

    expect(two.state).toMatchObject({ phase: "problem", round: 3 });
    expect(host.running(three)).toBe(true);
    expect(three.state.round).toBe(4);
  });

  it("is not ended by problems that were answered wrong by everyone", () => {
    const players = candidates(2);
    let session = started(players);
    for (let round = 0; round < 3; round++) {
      const at = session.state.openedAt + 1000;
      for (const player of [0, 1]) {
        session = act(session, players, player, { type: "buzz" }, at + player * 2000);
        session = act(session, players, player, { type: "answer", count: session.state.answer + 1 }, at + player * 2000 + 500);
      }
      session = host.tick(session, presenceOf(players), host.deadline(session)!);
    }

    expect(host.running(session)).toBe(true);
    expect(session.state.round).toBe(4);
  });
});

describe("what a player is sent", () => {
  it("keeps the answer back while the problem is open, and shows it once it is closed", () => {
    const players = candidates(2);
    let session = started(players);

    const open = seenBy(session, players, 0, T0 + 1000);
    session = act(session, players, 0, { type: "buzz" }, T0 + 2000);
    const answering = seenBy(session, players, 1, T0 + 3000);
    session = act(session, players, 0, { type: "answer", count: session.state.answer }, T0 + 4000);
    const closed = seenBy(session, players, 1, T0 + 5000);

    expect(open.view.answer).toBeNull();
    expect(answering.view.answer).toBeNull();
    expect(closed.view.answer).toBe(session.state.answer);
    expect(closed.view.solutions).toEqual(solutions(session.state.board));
  });

  it("says how long each clock has to run", () => {
    const players = candidates(2);
    let session = started(players);

    const open = seenBy(session, players, 0, T0 + 4000);
    session = act(session, players, 0, { type: "buzz" }, T0 + 5000);
    const answering = seenBy(session, players, 1, T0 + 7000);
    session = act(session, players, 0, { type: "answer", count: session.state.answer }, T0 + 8000);
    const closed = seenBy(session, players, 1, T0 + 9000);

    expect(open.clock).toEqual({ answer: null, problem: PROBLEM_MS - 4000, next: null, choose: null, stand: null });
    expect(answering.clock).toEqual({ answer: ANSWER_MS - 2000, problem: PROBLEM_MS - 7000, next: null, choose: null, stand: null });
    expect(closed.clock).toEqual({ answer: null, problem: null, next: PAUSE_MS - 1000, choose: null, stand: null });
  });

  it("gives the numbers of the rules the screen counts with", () => {
    const players = candidates(2);

    expect(seenBy(started(players), players, 0, T0).rules).toEqual({
      teamSize: shipped.teamSize,
      winsNeeded: shipped.winsNeeded,
      answerSeconds: shipped.answerSeconds,
      problemSeconds: shipped.problemSeconds,
      maxSaid: shipped.maxSaid,
      maxProblems: shipped.maxProblems,
      settle: RACE.settle,
      chooseSeconds: shipped.chooseSeconds,
      winPoints: shipped.winPoints,
      losePoints: shipped.losePoints,
      hogLeader: shipped.hogLeader,
      hogMember: shipped.hogMember,
      devoteLeader: shipped.devoteLeader,
      devoteMember: shipped.devoteMember,
      sacrificeLeader: shipped.sacrificeLeader,
      blameMember: shipped.blameMember,
      safeLoss: shipped.safeLoss,
      duelLoss: shipped.duelLoss,
      duelPieces: shipped.duelPieces,
      duelProblems: shipped.duelProblems,
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
});

describe("the room's clock", () => {
  it("is wanted when the open problem's time is up, then when the pause is over", () => {
    const players = candidates(2);
    let session = started(players);

    expect(host.deadline(session)).toBe(T0 + PROBLEM_MS);
    session = host.tick(session, presenceOf(players), T0 + PROBLEM_MS);
    expect(session.state.phase).toBe("pause");
    expect(host.deadline(session)).toBe(T0 + PROBLEM_MS + PAUSE_MS);
    session = host.tick(session, presenceOf(players), T0 + PROBLEM_MS + PAUSE_MS);
    expect(session.state).toMatchObject({ phase: "problem", round: 2 });
  });

  it("is wanted when the time to answer is up, which counts as a wrong answer", () => {
    const players = candidates(3);
    let session = act(started(players), players, 1, { type: "buzz" }, T0 + 1000);

    expect(host.deadline(session)).toBe(T0 + 1000 + ANSWER_MS);
    session = host.tick(session, presenceOf(players), T0 + 1000 + ANSWER_MS);

    expect(session.state.wrong).toEqual([1]);
    expect(session.state.phase).toBe("problem");
  });

  it("changes nothing when asked before anything is due", () => {
    const players = candidates(2);
    const session = started(players);

    expect(host.tick(session, presenceOf(players), T0 + PROBLEM_MS - 1)).toBe(session);
    expect(host.same(session, host.tick(session, presenceOf(players), T0 + 1))).toBe(true);
  });

  it("stands still while none of the game's players is connected, and goes on from where it stood", () => {
    const players = candidates(2);
    const session = started(players);
    const everyone = players.map((player) => player.slot);
    const stoodFor = STAND_MS - 1000;

    const frozen = host.attend(session, presenceOf(players, everyone), T0 + 60_000);
    const whileFrozen = host.tick(frozen, presenceOf(players, everyone), T0 + 60_000 + stoodFor);
    const back = host.attend(whileFrozen, presenceOf(players), T0 + 60_000 + stoodFor);

    expect(seenBy(frozen, players, 0, T0 + 90_000, presenceOf(players, everyone))).toMatchObject({
      frozen: true,
      clock: { problem: PROBLEM_MS - 60_000 },
    });
    expect(whileFrozen).toBe(frozen);
    // the minute already played is kept; the time it stood empty is not counted
    expect(back.frozenAt).toBeNull();
    expect(host.deadline(back)).toBe(T0 + stoodFor + PROBLEM_MS);
    expect(back.state.round).toBe(1);
    expect(seenBy(back, players, 0, T0 + 60_000 + stoodFor)).toMatchObject({
      frozen: false,
      clock: { problem: PROBLEM_MS - 60_000, stand: null },
    });
  });

  it("gives the player answering the rest of their time when the game goes on", () => {
    const players = candidates(2);
    const answering = act(started(players), players, 1, { type: "buzz" }, T0 + 5000);

    const frozen = host.attend(answering, presenceOf(players, [0, 1]), T0 + 7000);
    const back = host.attend(frozen, presenceOf(players), T0 + 67_000);

    expect(seenBy(frozen, players, 1, T0 + 30_000, presenceOf(players, [0, 1])).clock.answer).toBe(ANSWER_MS - 2000);
    expect(host.deadline(back)).toBe(T0 + 5000 + ANSWER_MS + 60_000);
  });

  it("does not stand still while one of its players is still connected, or for someone watching", () => {
    const players = candidates(2);
    const session = started(players);
    const watcher: Presence = { seated: new Set([tokenOf(0), tokenOf(1), "watcher"]), connected: new Set(["watcher"]) };

    expect(host.attend(session, presenceOf(players, [1]), T0 + 1000).frozenAt).toBeNull();
    // only someone who is not in the game is here: nobody can play, so it stands
    expect(host.attend(session, watcher, T0 + 1000).frozenAt).toBe(T0 + 1000);
  });

  it("stands still when the only player connected has already won", () => {
    const players = candidates(3);
    let session = started(players);
    // player 0 answers two problems right and sits out; the other two race on
    for (let round = 0; round < 2; round++) {
      const now = T0 + round * (PAUSE_MS + 5000) + 1000;
      session = act(session, players, 0, { type: "buzz" }, now);
      session = act(session, players, 0, { type: "answer", count: session.state.answer }, now + 500);
      session = host.tick(session, presenceOf(players), now + 500 + PAUSE_MS);
    }
    const later = T0 + 60_000;

    const winnerOnly = host.attend(session, presenceOf(players, [1, 2]), later);
    const racerToo = host.attend(session, presenceOf(players, [2]), later);

    expect(session.state.units[0].place).toBe(1);
    expect(host.running(session)).toBe(true);
    expect(winnerOnly.frozenAt).toBe(later);
    expect(racerToo.frozenAt).toBeNull();
  });
});

describe("a game nobody is left to play", () => {
  /** The last thing that happened in the game. */
  const last = (session: RectSession): unknown => session.state.history.at(-1);
  const ABANDONED = { type: "ended", reason: "abandoned" };

  it("is wanted by the clock when it has stood as long as a game may", () => {
    const players = candidates(2);
    const frozen = host.attend(started(players), presenceOf(players, [0, 1]), T0 + 60_000);

    expect(host.deadline(frozen)).toBe(T0 + 60_000 + STAND_MS);
  });

  it("says how long it will go on standing", () => {
    const players = candidates(2);
    const gone = presenceOf(players, [0, 1]);
    const frozen = host.attend(started(players), gone, T0 + 60_000);

    expect(seenBy(frozen, players, null, T0 + 60_000 + 25_000, gone).clock.stand).toBe(STAND_MS - 25_000);
  });

  it("still stands a moment before that, and is ended when the time comes", () => {
    const players = candidates(2);
    const gone = presenceOf(players, [0, 1]);
    const frozen = host.attend(started(players), gone, T0 + 60_000);

    const before = host.tick(frozen, gone, T0 + 60_000 + STAND_MS - 1);
    const after = host.tick(frozen, gone, T0 + 60_000 + STAND_MS);

    expect(before).toBe(frozen);
    expect(host.running(after)).toBe(false);
    expect(last(after)).toMatchObject(ABANDONED);
    expect(after.frozenAt).toBeNull();
    expect(host.deadline(after)).toBeNull();
    expect(seenBy(after, players, null, T0 + 60_000 + STAND_MS, gone)).toMatchObject({ frozen: false, clock: { stand: null } });
  });

  it("is ended even when a player comes back just after the time has come", () => {
    const players = candidates(2);
    const frozen = host.attend(started(players), presenceOf(players, [0, 1]), T0 + 60_000);

    const back = host.attend(frozen, presenceOf(players), T0 + 60_000 + STAND_MS);

    expect(host.running(back)).toBe(false);
    expect(last(back)).toMatchObject(ABANDONED);
  });

  it("no longer holds anybody's place", () => {
    const players = candidates(2);
    const gone = presenceOf(players, [0, 1]);
    const frozen = host.attend(started(players), gone, T0 + 60_000);

    const after = host.tick(frozen, gone, T0 + 60_000 + STAND_MS);

    expect(host.holdsPlace(frozen, tokenOf(0)) && host.running(frozen)).toBe(true);
    expect(host.running(after)).toBe(false);
  });

  it("is ended at once when everyone who could still win has left the room", () => {
    const players = candidates(2);
    const session = started(players);
    const watcher: Presence = { seated: new Set(["watcher"]), connected: new Set(["watcher"]) };

    const after = host.attend(session, watcher, T0 + 5000);

    expect(host.running(after)).toBe(false);
    expect(last(after)).toMatchObject(ABANDONED);
    expect(after.frozenAt).toBeNull();
  });

  it("is ended when those left in the room have all won already", () => {
    const players = candidates(4);
    let session = started(players);
    for (let round = 0; round < 2; round++) {
      const now = T0 + round * (PAUSE_MS + 5000) + 1000;
      session = act(session, players, 0, { type: "buzz" }, now);
      session = act(session, players, 0, { type: "answer", count: session.state.answer }, now + 500);
      session = host.tick(session, presenceOf(players), now + 500 + PAUSE_MS);
    }

    const after = host.attend(session, presenceOf(players, [], [1, 2, 3]), T0 + 60_000);

    expect(host.running(session)).toBe(true);
    expect(host.running(after)).toBe(false);
    expect(last(after)).toMatchObject(ABANDONED);
    expect(after.state.units[0]).toMatchObject({ place: 1 });
  });

  it("goes on while one player of a team is still in the room", () => {
    const players = candidates(4, [1, 1, 1, 0]);
    const session = started(players);

    const after = host.attend(session, presenceOf(players, [], [0, 1, 3]), T0 + 5000);

    expect(host.running(after)).toBe(true);
    expect(after.frozenAt).toBeNull();
  });

  it("goes on when someone leaves and others can still win", () => {
    const players = candidates(3);
    const session = started(players);

    const after = host.attend(session, presenceOf(players, [], [2]), T0 + 5000);

    expect(host.running(after)).toBe(true);
    expect(after).toBe(session);
  });

  it("is ended by the player's own leaving, when what they asked for is the last thing a game hears", () => {
    const players = candidates(2);
    const session = act(started(players), players, 0, { type: "buzz" }, T0 + 1000);

    // player 1 has left; player 0 leaves while answering
    const after = host.attend(session, presenceOf(players, [], [0, 1]), T0 + 2000);

    expect(after.state.floor).toBeNull();
    expect(host.running(after)).toBe(false);
  });
});

describe("the place a game holds", () => {
  it("is held for every player of a game being played, and for nobody else", () => {
    const players = candidates(2);
    const session = started(players);

    expect(host.holdsPlace(session, tokenOf(1))).toBe(true);
    expect(host.holdsPlace(session, "someone-else")).toBe(false);
  });
});

describe("the bot", () => {
  const players = [{ token: tokenOf(0), nick: "p0", slot: 0, team: 0 }];
  const withBots = (): RectSession => started(players, { bots: true, allowBots: true });

  it("is given a time to buzz, about as long after the problem opens as configured", () => {
    const session = withBots();

    expect(session.botAt).not.toBeNull();
    expect(session.botAt!).toBeGreaterThanOrEqual(T0 + (BOT_WAIT_MS * 2) / 3 - 1);
    expect(session.botAt!).toBeLessThanOrEqual(T0 + (BOT_WAIT_MS * 4) / 3 + 1);
    expect(host.deadline(session)).toBe(session.botAt);
  });

  it("buzzes and answers when its time comes, right or wrong", () => {
    const session = withBots();

    const after = host.tick(session, presenceOf(players), session.botAt!);

    const answers = after.state.history.filter((event) => event.type === "right" || event.type === "wrong");
    expect(after.state.history.filter((event) => event.type === "buzz")).toHaveLength(1);
    expect(answers).toHaveLength(1);
    expect(after.state.phase === "pause" || after.state.wrong.length === 1).toBe(true);
  });

  it("plays a whole game through by itself while the person only watches", () => {
    let session = withBots();

    for (let step = 0; host.running(session); step++) {
      expect(step).toBeLessThan(2000);
      const due = host.deadline(session);
      expect(due).not.toBeNull();
      session = host.tick(session, presenceOf(players), due!);
    }

    expect(session.state.phase).toBe("ended");
    expect(session.state.units[0].wins).toBe(0);
    expect(session.botAt).toBeNull();
    expect(host.deadline(session)).toBeNull();
  });

  it("does not buzz while a person is answering, and is given no time to", () => {
    let session = withBots();
    const due = session.botAt!;
    session = act(session, players, 0, { type: "buzz" }, due - 1000);

    const during = host.tick(session, presenceOf(players), due);

    // the room is not woken for a bot that could do nothing
    expect(session.botAt).toBeNull();
    expect(host.deadline(session)).toBe(due - 1000 + ANSWER_MS);
    expect(during.state.floor).toMatchObject({ player: 0 });
    expect(during.state.history.filter((event) => event.type === "buzz")).toHaveLength(1);
  });

  it("is given a new time to buzz when a person's wrong answer leaves the problem open", () => {
    let session = withBots();
    const at = session.botAt! - 1000;
    session = act(session, players, 0, { type: "buzz" }, at);

    session = act(session, players, 0, { type: "answer", count: session.state.answer + 1 }, at + 500);

    expect(session.state.phase).toBe("problem");
    expect(session.botAt).not.toBeNull();
    expect(session.botAt!).toBeGreaterThan(at + 500);
  });

  it("races on while a person of the game is connected, even one who has won", () => {
    let session = withBots();
    for (let round = 0; round < 2; round++) {
      const now = session.state.openedAt + 1000;
      session = act(session, players, 0, { type: "buzz" }, now);
      session = act(session, players, 0, { type: "answer", count: session.state.answer }, now + 500);
      session = host.tick(session, presenceOf(players), now + 500 + PAUSE_MS);
    }

    expect(session.state.units[0].place).toBe(1);
    expect(host.running(session)).toBe(true);
    expect(session.frozenAt).toBeNull();
    expect(session.botAt).not.toBeNull();
  });

  it("does not race on by itself: the game stands while no person is connected", () => {
    const session = withBots();
    const due = session.botAt!;

    const frozen = host.attend(session, presenceOf(players, [0]), T0 + 1000);
    const later = host.tick(frozen, presenceOf(players, [0]), due);

    expect(frozen.frozenAt).toBe(T0 + 1000);
    expect(later.state.history.filter((event) => event.type === "buzz")).toHaveLength(0);
  });

  it("keeps the time it had to wait when the game goes on", () => {
    const session = withBots();
    const due = session.botAt!;
    const frozen = host.attend(session, presenceOf(players, [0]), T0 + 1000);

    const back = host.attend(frozen, presenceOf(players), T0 + 31_000);

    expect(back.botAt).toBe(due + 30_000);
  });

  it("does not keep a game going once every person has left it", () => {
    const session = withBots();

    const after = host.attend(session, presenceOf(players, [], [0]), T0 + 1000);

    expect(host.running(after)).toBe(false);
    expect(after.botAt).toBeNull();
    expect(host.deadline(after)).toBeNull();
  });

  it("draws the same boards whether or not bots play", () => {
    const pair = candidates(2);

    const people = started(pair, { seed: 42 });
    const mixed = started(pair, { seed: 42, bots: true, allowBots: true });

    expect(mixed.state.board).toEqual(people.state.board);
  });
});

describe("a stored game", () => {
  it("is to be stored again once it stands still, and once it goes on", () => {
    const players = candidates(2);
    const session = started(players);

    const frozen = host.attend(session, presenceOf(players, [0, 1]), T0 + 1000);
    const back = host.attend(frozen, presenceOf(players), T0 + 2000);

    expect(host.same(session, frozen)).toBe(false);
    expect(host.same(frozen, back)).toBe(false);
    expect(host.same(frozen, host.attend(frozen, presenceOf(players, [0, 1]), T0 + 1500))).toBe(true);
  });

  it("is to be stored again once a bot has been given its time", () => {
    const person = [{ token: tokenOf(0), nick: "p0", slot: 0, team: 0 }];
    const session = started(person, { bots: true, allowBots: true });

    expect(host.same(session, { ...session, botAt: null })).toBe(false);
    expect(host.same(session, { ...session })).toBe(true);
  });

  it("is carried on with when it is one this code made", () => {
    const players = candidates(2);
    const stored: unknown = JSON.parse(JSON.stringify(started(players)));

    expect(host.usable(stored)).toBe(true);
  });

  it.each([
    ["another game's", { state: { version: 1, seats: [] }, tokens: [] }],
    ["a later version's", { version: 2, state: { version: 1 } }],
    ["nothing", null],
    ["text", "game"],
  ])("is not carried on with when it is %s", (_what, stored) => {
    expect(host.usable(stored)).toBe(false);
  });
});
