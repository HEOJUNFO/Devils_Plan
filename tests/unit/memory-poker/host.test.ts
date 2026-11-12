import { describe, expect, it } from "vitest";
import botJson from "../../../src/shared/games/memory-poker/bot-config.json";
import shipped from "../../../src/shared/games/memory-poker/config.json";
import hostJson from "../../../src/shared/games/memory-poker/host-config.json";
import { pokerHost, type PokerSession, type PokerSnapshot } from "../../../src/shared/games/memory-poker/host";
import { GAMES } from "../../../src/shared/games";
import type { Candidate, Presence, StartRequest } from "../../../src/shared/hosting";

const host = pokerHost;

/** The time the fixtures start at, in ms since the epoch. */
const T0 = 1_800_000_000_000;
const MEMORISE_MS = shipped.memoriseSeconds * 1000;
const CHOOSE_MS = shipped.chooseSeconds * 1000;
const REVEAL_MS = shipped.revealSeconds * 1000;
const STAND_MS = hostJson.standSeconds * 1000;
const FIRST_BOT_MS = botJson.chooseAfterSeconds * 1000;
const NEXT_BOT_MS = botJson.spreadSeconds * 1000;
/** When the board of the first round is turned over, if nothing holds the game up. */
const TURNED = T0 + MEMORISE_MS;
/** With bots asked for, the room fills up to this many players. */
const WITH_BOTS = 4;
const CELLS = shipped.rows * shipped.cols;
const PICKS = shipped.picks;
/** How many steps of the clock a whole game is, when nobody chooses: three a round. */
const STEPS = shipped.rounds * 3;

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
function started(players: Candidate[], overrides: Partial<StartRequest> = {}): PokerSession {
  const result = host.start(null, players, request(overrides), presenceOf(players));
  if (!result.ok) throw new Error(`fixture start refused: ${result.reason}`);
  return result.session;
}

/** A game of `players` with the board of its first round just turned over. */
function turned(players: Candidate[], overrides: Partial<StartRequest> = {}): PokerSession {
  return host.tick(started(players, overrides), presenceOf(players), TURNED);
}

/** What `player` is sent at `now`. */
function seenBy(session: PokerSession, players: Candidate[], player: number | null, now: number, presence = presenceOf(players)): PokerSnapshot {
  return host.view(session, player === null ? null : tokenOf(player), presence, now) as PokerSnapshot;
}

/** `player` picks `cells` and makes the choice final at `now`; the test expects both to be taken. */
function choose(session: PokerSession, players: Candidate[], player: number, cells: number[], now: number, presence = presenceOf(players)): PokerSession {
  const picked = host.act(session, tokenOf(player), { type: "pick", cells }, presence, now);
  if (!picked.ok) throw new Error(`fixture pick refused: ${picked.reason}`);
  const locked = host.act(picked.session, tokenOf(player), { type: "lock" }, presence, now);
  if (!locked.ok) throw new Error(`fixture lock refused: ${locked.reason}`);
  return locked.session;
}

/** Runs the clock to each moment the game asks for, until it is over or `steps` have gone. */
function runOut(session: PokerSession, presence: Presence, steps: number): PokerSession {
  let next = session;
  for (let step = 0; step < steps && host.running(next); step++) {
    const due = host.deadline(next);
    if (due === null) break;
    next = host.tick(next, presence, due);
  }
  return next;
}

describe("기억 포커 in a room: starting", () => {
  it("starts a game for the players in the room, each known by the slot they hold", () => {
    const players = candidates(3);

    const session = started(players);

    expect(session.state.players).toEqual([0, 1, 2]);
    expect(seenBy(session, players, 1, T0).view.you).toBe(1);
    expect(seenBy(session, players, 1, T0).players.map((player) => player.nick)).toEqual(["p0", "p1", "p2"]);
    expect(host.running(session)).toBe(true);
  });

  it("tells the screen the numbers it lays the board out and counts with", () => {
    const players = candidates(2);

    expect(seenBy(started(players), players, 0, T0).rules).toEqual({
      rounds: shipped.rounds,
      rows: shipped.rows,
      cols: shipped.cols,
      shared: shipped.shared,
      picks: shipped.picks,
      memoriseSeconds: shipped.memoriseSeconds,
      chooseSeconds: shipped.chooseSeconds,
      revealSeconds: shipped.revealSeconds,
      sharedFromStart: shipped.sharedFromStart,
    });
  });

  it("lets only the host start: whoever came into the room first", () => {
    const players = candidates(3);

    expect(host.start(null, players, request({ by: tokenOf(1) }), presenceOf(players))).toEqual({ ok: false, reason: "not-host" });
  });

  it("refuses a second game while one is being played, and takes one after it", () => {
    const players = candidates(2);
    const session = started(players);
    const over = runOut(session, presenceOf(players), STEPS);

    expect(host.start(session, players, request(), presenceOf(players))).toEqual({ ok: false, reason: "already-playing" });
    expect(host.running(over)).toBe(false);
    expect(host.start(over, players, request({ now: T0 + 5000 }), presenceOf(players)).ok).toBe(true);
  });

  it("refuses a game for one player: there is nobody to play a hand against", () => {
    const players = candidates(1);

    expect(host.start(null, players, request(), presenceOf(players))).toEqual({ ok: false, reason: "too-few" });
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

  it("deals the same cards whatever the bots do", () => {
    const players = candidates(4);
    const bots = candidates(1);

    // into the second round: three steps of the clock, and one more for each bot's choice
    const people = runOut(started(players), presenceOf(players), 3);
    const withBots = runOut(started(bots, { bots: true, allowBots: true }), presenceOf(bots), 3 + (WITH_BOTS - 1));

    expect([people.state.round, withBots.state.round]).toEqual([2, 2]);
    expect(withBots.state.board).toEqual(people.state.board);
    expect(withBots.state.shared).toEqual(people.state.shared);
  });
});

describe("기억 포커 in a room: the clock", () => {
  it("asks for the clock when the board's time is up, and says how long is left", () => {
    const players = candidates(2);
    const session = started(players);

    expect(host.deadline(session)).toBe(TURNED);
    expect(seenBy(session, players, 0, T0 + 4000).clock).toEqual({ phase: MEMORISE_MS - 4000, stand: null });
    expect(host.tick(session, presenceOf(players), TURNED - 1)).toBe(session);
  });

  it("shows the board while it is being learned and not while it is turned over, to a player or to someone watching", () => {
    const players = candidates(2);
    const open = started(players);
    const over = turned(players);

    for (const viewer of [0, 1, null]) {
      expect(seenBy(open, players, viewer, T0).view.board).toEqual(open.state.board);
      expect(seenBy(over, players, viewer, TURNED).view.board).toBeNull();
      expect(JSON.stringify(seenBy(over, players, viewer, TURNED))).not.toContain(JSON.stringify(over.state.board));
    }
    expect(seenBy(over, players, 0, TURNED).clock.phase).toBe(CHOOSE_MS);
  });

  it("plays a whole game by the clock when nobody chooses: every round shown, cells chosen for everyone", () => {
    const players = candidates(3);

    const over = runOut(started(players), presenceOf(players), STEPS);
    const seen = seenBy(over, players, 0, T0 + 10 * 60_000);

    expect(host.running(over)).toBe(false);
    expect(host.deadline(over)).toBeNull();
    expect(seen.clock.phase).toBeNull();
    expect(seen.view.history.at(-1)).toEqual({ type: "ended", reason: "rounds" });
    expect(seen.view.history.filter((event) => event.type === "shown")).toHaveLength(shipped.rounds);
    expect(seen.view.shown?.hands.map((hand) => hand.forced)).toEqual([PICKS, PICKS, PICKS]);
    expect(seen.view.standings.map((standing) => standing.wins + standing.ties + standing.losses)).toEqual([shipped.rounds, shipped.rounds, shipped.rounds]);
  });

  it("is still being played while its last round is shown", () => {
    const players = candidates(2);

    expect(host.running(runOut(started(players), presenceOf(players), STEPS - 1))).toBe(true);
  });
});

describe("기억 포커 in a room: choosing", () => {
  it("takes a player's cells and keeps them from everyone else", () => {
    const players = candidates(3);
    const picked = host.act(turned(players), tokenOf(1), { type: "pick", cells: [3, 9] }, presenceOf(players), TURNED + 2000);
    if (!picked.ok) throw new Error(picked.reason);

    expect(seenBy(picked.session, players, 1, TURNED + 2000).view.mine).toEqual({ cells: [3, 9], locked: false });
    expect(seenBy(picked.session, players, 0, TURNED + 2000).view.mine).toEqual({ cells: [], locked: false });
    expect(JSON.stringify(seenBy(picked.session, players, 0, TURNED + 2000).view)).not.toContain("[3,9]");
    expect(seenBy(picked.session, players, null, TURNED + 2000).view.mine).toBeNull();
  });

  it("tells everyone who has made a final choice, and waits for the others", () => {
    const players = candidates(3);

    const session = choose(turned(players), players, 1, [3, 9], TURNED + 2000);

    expect(session.state.phase).toBe("choose");
    expect(seenBy(session, players, 0, TURNED + 2000).view.locked).toEqual([1]);
    expect(host.deadline(session)).toBe(TURNED + CHOOSE_MS);
  });

  it("shows the round as soon as everyone has made a final choice", () => {
    const players = candidates(2);
    const now = TURNED + 5000;

    const session = choose(choose(turned(players), players, 0, [3, 9], TURNED + 2000), players, 1, [0, 1], now);
    const seen = seenBy(session, players, 0, now);

    expect(seen.view.phase).toBe("reveal");
    expect(seen.clock.phase).toBe(REVEAL_MS);
    expect(seen.view.board).toEqual(session.state.board);
    expect(seen.view.shown?.hands.map((hand) => hand.cells)).toEqual([
      [3, 9],
      [0, 1],
    ]);
    expect(host.deadline(session)).toBe(now + REVEAL_MS);
  });

  it("takes no choice once the time is up, however late the room's clock is", () => {
    const players = candidates(2);
    const session = turned(players);

    expect(host.act(session, tokenOf(0), { type: "pick", cells: [3, 9] }, presenceOf(players), TURNED + CHOOSE_MS)).toEqual({
      ok: false,
      reason: "not-choosing",
    });
  });

  it("takes no choice while the board lies open", () => {
    const players = candidates(2);

    expect(host.act(started(players), tokenOf(0), { type: "pick", cells: [3, 9] }, presenceOf(players), T0 + 1000)).toEqual({
      ok: false,
      reason: "not-choosing",
    });
  });

  it("refuses a choice from someone watching", () => {
    const players = candidates(2);

    expect(host.act(turned(players), "token-of-a-watcher", { type: "pick", cells: [3, 9] }, presenceOf(players), TURNED + 1)).toEqual({
      ok: false,
      reason: "not-seated",
    });
  });

  it("refuses what is no move, and a move where no game is on", () => {
    const players = candidates(2);

    expect(host.act(turned(players), tokenOf(0), { type: "peek" }, presenceOf(players), TURNED + 1)).toEqual({ ok: false, reason: "bad-action" });
    expect(host.act(null, tokenOf(0), { type: "lock" }, presenceOf(players), T0)).toEqual({ ok: false, reason: "no-game" });
  });
});

describe("기억 포커 in a room: players who are not there", () => {
  it("waits for a player whose connection dropped, until the time is up", () => {
    const players = candidates(3);
    const away = presenceOf(players, [2]);

    const session = choose(choose(turned(players), players, 0, [3, 9], TURNED + 1000, away), players, 1, [0, 1], TURNED + 2000, away);
    const late = host.tick(session, away, TURNED + CHOOSE_MS);

    expect(session.state.phase).toBe("choose");
    expect(late.state.phase).toBe("reveal");
    expect(late.state.shown?.hands.find((hand) => hand.player === 2)?.forced).toBe(PICKS);
  });

  it("does not wait for a player who has left the room", () => {
    const players = candidates(3);
    const gone = presenceOf(players, [], [2]);

    const session = choose(choose(turned(players), players, 0, [3, 9], TURNED + 1000, gone), players, 1, [0, 1], TURNED + 2000, gone);

    expect(session.state.phase).toBe("reveal");
  });

  it("shows the round when the one player waited for leaves the room", () => {
    const players = candidates(3);
    const session = choose(choose(turned(players), players, 0, [3, 9], TURNED + 1000), players, 1, [0, 1], TURNED + 2000);

    const after = host.attend(session, presenceOf(players, [], [2]), TURNED + 3000);

    expect(session.state.phase).toBe("choose");
    expect(after.state.phase).toBe("reveal");
    expect(after.state.until).toBe(TURNED + 3000 + REVEAL_MS);
  });

  it("is over when fewer than two of its players are left in the room", () => {
    const players = candidates(2);

    const after = host.attend(turned(players), presenceOf(players, [], [1]), TURNED + 1000);

    expect(host.running(after)).toBe(false);
    expect(after.state.history.at(-1)).toEqual({ type: "ended", reason: "left" });
  });

  it("stands still while none of its players is connected, and goes on from where it stopped", () => {
    const players = candidates(2);
    const session = started(players);
    const nobody = presenceOf(players, [0, 1]);

    const frozen = host.attend(session, nobody, T0 + 4000);
    const waiting = seenBy(frozen, players, null, T0 + 60_000, nobody);
    const back = host.attend(frozen, presenceOf(players), T0 + 64_000);

    expect(frozen.frozenAt).toBe(T0 + 4000);
    expect(waiting.frozen).toBe(true);
    expect(waiting.clock).toEqual({ phase: MEMORISE_MS - 4000, stand: STAND_MS - 56_000 });
    expect(host.deadline(frozen)).toBe(T0 + 4000 + STAND_MS);
    expect(back.frozenAt).toBeNull();
    expect(host.deadline(back)).toBe(TURNED + 60_000);
  });

  it("is ended when it has stood still as long as it may", () => {
    const players = candidates(2);
    const nobody = presenceOf(players, [0, 1]);
    const frozen = host.attend(started(players), nobody, T0 + 4000);

    const over = host.tick(frozen, nobody, T0 + 4000 + STAND_MS);

    expect(host.running(over)).toBe(false);
    expect(over.state.history.at(-1)).toEqual({ type: "ended", reason: "abandoned" });
  });

  it("is ended at once when all of its players have left the room", () => {
    const players = candidates(2);

    const over = host.attend(started(players), presenceOf(players, [], [0, 1]), T0 + 4000);

    expect(host.running(over)).toBe(false);
    expect(over.state.history.at(-1)).toEqual({ type: "ended", reason: "abandoned" });
  });
});

describe("기억 포커 in a room: bots", () => {
  /** One person and the bots that fill the room. */
  const person = candidates(1);

  it("has no bot choose while the board lies open", () => {
    const session = started(person, { bots: true, allowBots: true });

    expect(session.bots).toEqual([]);
    expect(host.deadline(session)).toBe(TURNED);
  });

  it("has each bot choose a while after the board is turned over, one after the other", () => {
    const session = turned(person, { bots: true, allowBots: true });
    const present = presenceOf(person);

    const first = host.tick(session, present, TURNED + FIRST_BOT_MS);
    const second = host.tick(first, present, TURNED + FIRST_BOT_MS + NEXT_BOT_MS);

    expect(session.bots.map((bot) => bot.at)).toEqual([TURNED + FIRST_BOT_MS, TURNED + FIRST_BOT_MS + NEXT_BOT_MS, TURNED + FIRST_BOT_MS + 2 * NEXT_BOT_MS]);
    expect(host.deadline(session)).toBe(TURNED + FIRST_BOT_MS);
    expect(host.tick(session, present, TURNED + FIRST_BOT_MS - 1)).toBe(session);
    expect(first.state.choices.filter((choice) => choice.locked)).toHaveLength(1);
    expect(second.state.choices.filter((choice) => choice.locked)).toHaveLength(2);
  });

  it("has a bot choose as many cells of the board as a choice is, none of them twice", () => {
    for (let seed = 0; seed < 50; seed++) {
      const session = turned(person, { bots: true, allowBots: true, seed });

      const after = host.tick(session, presenceOf(person), TURNED + FIRST_BOT_MS);
      const cells = after.state.choices.find((choice) => choice.locked)?.cells ?? [];

      expect(cells, `seed ${seed}`).toHaveLength(PICKS);
      expect(new Set(cells).size).toBe(PICKS);
      expect(cells.every((cell) => Number.isInteger(cell) && cell >= 0 && cell < CELLS)).toBe(true);
    }
  });

  it("shows the round once the person and every bot have chosen, before the time is up", () => {
    const present = presenceOf(person);
    const chosen = choose(turned(person, { bots: true, allowBots: true }), person, 0, [3, 9], TURNED + 1000);

    const after = runOut(chosen, present, WITH_BOTS - 1);

    expect(after.state.phase).toBe("reveal");
    expect(after.state.until).toBe(TURNED + FIRST_BOT_MS + 2 * NEXT_BOT_MS + REVEAL_MS);
    expect(after.state.shown?.hands.map((hand) => hand.forced)).toEqual([0, 0, 0, 0]);
    expect(after.bots).toEqual([]);
  });

  it("plans the bots' choices afresh in every round", () => {
    const present = presenceOf(person);
    const first = turned(person, { bots: true, allowBots: true });

    const second = runOut(first, present, WITH_BOTS + 2);

    expect(second.state.round).toBe(2);
    expect(second.state.phase).toBe("choose");
    expect(second.bots).toHaveLength(WITH_BOTS - 1);
    expect(second.planned).toBe(2);
  });

  it("finishes a game with a person who never chooses", () => {
    const over = runOut(started(person, { bots: true, allowBots: true }), presenceOf(person), STEPS * WITH_BOTS);

    expect(host.running(over)).toBe(false);
    expect(over.state.history.at(-1)).toEqual({ type: "ended", reason: "rounds" });
  });
});

describe("기억 포커 in a room: what is kept", () => {
  it("holds a place for each of its players and for nobody else", () => {
    const session = started(candidates(2));

    expect(host.holdsPlace(session, tokenOf(1))).toBe(true);
    expect(host.holdsPlace(session, "token-of-a-watcher")).toBe(false);
  });

  it("knows when storing a game again would change nothing", () => {
    const players = candidates(2);
    const session = turned(players);
    const picked = host.act(session, tokenOf(0), { type: "pick", cells: [3, 9] }, presenceOf(players), TURNED + 1000);

    expect(host.same(session, host.attend(session, presenceOf(players), TURNED + 1000))).toBe(true);
    expect(picked.ok && host.same(session, picked.session)).toBe(false);
    expect(host.same(session, { ...session, frozenAt: TURNED })).toBe(false);
    expect(host.same(session, { ...session, planned: 0 })).toBe(false);
    expect(host.same(session, { ...session, bots: [{ player: 3, at: TURNED }] })).toBe(false);
  });

  it("carries on with a game it stored, and with nothing else", () => {
    const session = started(candidates(2));

    expect(host.usable(JSON.parse(JSON.stringify(session)))).toBe(true);
    expect(host.usable({ ...session, version: 2 })).toBe(false);
    expect(host.usable({ ...session, state: { ...session.state, version: 2 } })).toBe(false);
    expect(host.usable({ ...session, state: { ...session.state, board: "all of it" } })).toBe(false);
    expect(host.usable({ ...session, bots: null })).toBe(false);
    expect(host.usable(null)).toBe(false);
    expect(host.usable("a game")).toBe(false);
  });
});

describe("기억 포커 in a room: how many rounds the host makes a game", () => {
  it.each([
    ["rounds-three", 3],
    ["rounds-five", 5],
    ["rounds-seven", 7],
  ])("plays %s as that many rounds: said to the players, and the game is over after the last and not before", (variant, rounds) => {
    const players = candidates(3);
    const presence = presenceOf(players);

    const session = started(players, { variant });
    // three steps of the clock a round, when nobody chooses
    const nearly = runOut(session, presence, rounds * 3 - 1);
    const over = runOut(nearly, presence, 1);

    expect(seenBy(session, players, 0, T0).rules.rounds).toBe(rounds);
    expect(host.running(nearly)).toBe(true);
    expect(host.running(over)).toBe(false);
    expect(seenBy(over, players, 0, T0 + 20 * 60_000).view.round).toBe(rounds);
  });

  it("plays the rounds it always did where the host chose nothing, or something that is no number of rounds", () => {
    const players = candidates(2);

    expect(seenBy(started(players), players, 0, T0).rules.rounds).toBe(shipped.rounds);
    expect(seenBy(started(players, { variant: "show" }), players, 0, T0).rules.rounds).toBe(shipped.rounds);
  });

  it("goes on with a game kept from before the host could choose, by the rounds it always had", () => {
    const players = candidates(2);
    const { rounds: _rounds, ...kept } = started(players);

    const over = runOut(kept as PokerSession, presenceOf(players), shipped.rounds * 3);

    expect(host.usable(kept)).toBe(true);
    expect(host.running(over)).toBe(false);
    expect(seenBy(over, players, 0, T0 + 20 * 60_000).view.round).toBe(shipped.rounds);
  });

  it("knows how many rounds each of the ways the list of games names is, the first of them the rounds it always had", () => {
    const ways = GAMES["memory-poker"].variants.map((each) => each.id);

    expect(Object.keys(hostJson.rounds).sort()).toEqual([...ways].sort());
    expect(hostJson.rounds[ways[0] as keyof typeof hostJson.rounds]).toBe(shipped.rounds);
  });
});
