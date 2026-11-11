import { describe, expect, it } from "vitest";
import botJson from "../../../src/shared/games/under-thirteen/bot-config.json";
import shipped from "../../../src/shared/games/under-thirteen/config.json";
import hostJson from "../../../src/shared/games/under-thirteen/host-config.json";
import { underHost, type UnderSession, type UnderSnapshot } from "../../../src/shared/games/under-thirteen/host";
import { askedOf, turnOf, type Chip, type UnderState } from "../../../src/shared/games/under-thirteen/rules";
import type { Candidate, Presence, StartRequest } from "../../../src/shared/hosting";

const host = underHost;

/** The time the fixtures start at, in ms since the epoch. */
const T0 = 1_800_000_000_000;
const SUBMIT_MS = shipped.submitSeconds * 1000;
const CHIPS_MS = shipped.chipsSeconds * 1000;
const TURN_MS = shipped.turnSeconds * 1000;
const PLACE_MS = shipped.placeSeconds * 1000;
const PAUSE_MS = shipped.pauseSeconds * 1000;
const STAND_MS = hostJson.standSeconds * 1000;
const FIRST_BOT_MS = botJson.submitAfterSeconds * 1000;
const NEXT_BOT_MS = botJson.spreadSeconds * 1000;
const BOT_TURN_MS = botJson.turnAfterSeconds * 1000;
/** With bots asked for, the room fills up to this many players. */
const WITH_BOTS = 4;
const ROUNDS = shipped.cards.length * shipped.sets;

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
function started(players: Candidate[], overrides: Partial<StartRequest> = {}): UnderSession {
  const result = host.start(null, players, request(overrides), presenceOf(players));
  if (!result.ok) throw new Error(`fixture start refused: ${result.reason}`);
  return result.session;
}

/** What `player` is sent at `now`. */
function seenBy(session: UnderSession, players: Candidate[], player: number | null, now: number, presence = presenceOf(players)): UnderSnapshot {
  return host.view(session, player === null ? null : tokenOf(player), presence, now) as UnderSnapshot;
}

/** `player` asks `action` at `now`; the test expects it to be taken. */
function act(session: UnderSession, players: Candidate[], player: number, action: object, now: number, presence = presenceOf(players)): UnderSession {
  const result = host.act(session, tokenOf(player), action, presence, now);
  if (!result.ok) throw new Error(`fixture action refused: ${result.reason}`);
  return result.session;
}

/** Players 0, 1, 2 … put in card `n` and chip `chips[n]` at `now`. */
function allIn(session: UnderSession, players: Candidate[], chips: Chip[], now: number): UnderSession {
  return chips.reduce((next, chip, n) => act(next, players, n, { type: "submit", card: n, chip }, now), session);
}

/** Runs the clock to each moment the game asks for, until it is over or `steps` have gone. */
function runOut(session: UnderSession, presence: Presence, steps: number): UnderSession {
  let next = session;
  for (let step = 0; step < steps && host.running(next); step++) {
    const due = host.deadline(next);
    if (due === null) break;
    next = host.tick(next, presence, due);
  }
  return next;
}

/** Runs the clock to each moment the game asks for, until the game is as `there` says or `steps` have gone. */
function runUntil(session: UnderSession, presence: Presence, there: (state: UnderState) => boolean, steps = 60): UnderSession {
  let next = session;
  for (let step = 0; step < steps && host.running(next) && !there(next.state); step++) {
    const due = host.deadline(next);
    if (due === null) break;
    next = host.tick(next, presence, due);
  }
  if (!there(next.state)) throw new Error("the fixture game never came to where the test needs it");
  return next;
}

describe("13 미만 in a room: starting", () => {
  it("starts a game for the players in the room, each known by the slot they hold, in the order they sit", () => {
    const players = candidates(3);

    const session = started(players);
    const seen = seenBy(session, players, 1, T0);

    expect(session.state.players).toEqual([0, 1, 2]);
    expect(seen.view.you).toBe(1);
    expect(seen.view.players).toEqual([0, 1, 2]);
    expect(seen.players.map((player) => player.nick)).toEqual(["p0", "p1", "p2"]);
    expect(host.running(session)).toBe(true);
  });

  it("tells the screen the numbers it draws and counts with", () => {
    const players = candidates(2);

    expect(seenBy(started(players), players, 0, T0).rules).toEqual({
      limit: shipped.limit,
      cards: shipped.cards,
      chipsOfEach: shipped.chipsOfEach,
      rainbowChips: shipped.rainbowChips,
      sets: shipped.sets,
      submitSeconds: shipped.submitSeconds,
      turnSeconds: shipped.turnSeconds,
    });
  });

  it("lets only the host start: whoever came into the room first", () => {
    const players = candidates(3);

    expect(host.start(null, players, request({ by: tokenOf(1) }), presenceOf(players))).toEqual({ ok: false, reason: "not-host" });
  });

  it("refuses a second game while one is being played, and takes one after it", () => {
    const players = candidates(2);
    const session = started(players);
    const over = runOut(session, presenceOf(players), 400);

    expect(host.start(session, players, request(), presenceOf(players))).toEqual({ ok: false, reason: "already-playing" });
    expect(host.running(over)).toBe(false);
    expect(host.start(over, players, request({ now: T0 + 5000 }), presenceOf(players)).ok).toBe(true);
  });

  it("refuses a game for one player: there is nobody to play against", () => {
    const players = candidates(1);

    expect(host.start(null, players, request(), presenceOf(players))).toEqual({ ok: false, reason: "too-few" });
  });

  it("refuses bots where the room does not offer them, and fills places with them where it does", () => {
    const players = candidates(1);

    const session = started(players, { bots: true, allowBots: true });

    expect(host.start(null, players, request({ bots: true }), presenceOf(players))).toEqual({ ok: false, reason: "bots-not-allowed" });
    expect(session.players).toHaveLength(WITH_BOTS);
    expect(session.players.filter((seat) => seat.token === null).map((seat) => seat.nick)).toEqual(["봇 1", "봇 2", "봇 3"]);
    expect(seenBy(session, players, 0, T0).players.filter((player) => player.bot)).toHaveLength(WITH_BOTS - 1);
  });
});

describe("13 미만 in a room: a round", () => {
  it("asks for the clock when the three minutes are up, and says how long is left", () => {
    const players = candidates(2);
    const session = started(players);

    expect(host.deadline(session)).toBe(T0 + SUBMIT_MS);
    expect(seenBy(session, players, 0, T0 + 4000).clock).toEqual({ phase: SUBMIT_MS - 4000, stand: null });
    expect(host.tick(session, presenceOf(players), T0 + SUBMIT_MS - 1)).toBe(session);
  });

  it("keeps what a player put in from everyone else, and tells them only that it is in", () => {
    const players = candidates(3);

    const session = act(started(players), players, 1, { type: "submit", card: 5, chip: "green" }, T0 + 2000);

    expect(seenBy(session, players, 1, T0 + 2000).view.mine).toEqual({ card: 5, chip: "green" });
    for (const viewer of [0, 2, null]) {
      const seen = seenBy(session, players, viewer, T0 + 2000);
      expect(seen.view.submitted).toEqual([1]);
      expect(seen.view.mine).toBeNull();
      expect(seen.view.chips).toBeNull();
      expect(JSON.stringify(seen.view)).not.toContain('"card"');
    }
  });

  it("shows the chips as soon as everyone has put theirs in, and the cards a moment later", () => {
    const players = candidates(3);
    const now = T0 + 5000;

    const chips = allIn(started(players), players, ["red", "green", "blue"], now);
    const cards = host.tick(chips, presenceOf(players), now + CHIPS_MS);

    expect(seenBy(chips, players, 0, now).view).toMatchObject({ phase: "chips", cards: null });
    expect(seenBy(chips, players, 0, now).view.chips).toHaveLength(3);
    expect(host.deadline(chips)).toBe(now + CHIPS_MS);
    expect(seenBy(cards, players, null, now + CHIPS_MS).view).toMatchObject({ phase: "place", order: [2, 1, 0], turn: 2 });
    expect(seenBy(cards, players, 0, now + CHIPS_MS).clock.phase).toBe(TURN_MS);
  });

  it("places a rock for the player whose rock it is, and for nobody else", () => {
    const players = candidates(3);
    const now = T0 + 5000;
    const placing = host.tick(allIn(started(players), players, ["red", "green", "blue"], now), presenceOf(players), now + CHIPS_MS);

    const after = act(placing, players, 2, { type: "place" }, now + CHIPS_MS + 1000);

    expect(host.act(placing, tokenOf(0), { type: "place" }, presenceOf(players), now + CHIPS_MS + 1000)).toEqual({ ok: false, reason: "not-your-turn" });
    expect(seenBy(after, players, 0, now + CHIPS_MS + 1000).view).toMatchObject({ stands: { red: [], green: [], blue: [2] }, turn: 1 });
  });

  it("places the rock itself when a player's time is up, however late the room's clock is", () => {
    const players = candidates(3);
    const now = T0 + 5000;
    const placing = host.tick(allIn(started(players), players, ["red", "green", "blue"], now), presenceOf(players), now + CHIPS_MS);

    const late = host.act(placing, tokenOf(2), { type: "pass" }, presenceOf(players), now + CHIPS_MS + TURN_MS);

    expect(late).toEqual({ ok: false, reason: "not-your-turn" });
    expect(host.tick(placing, presenceOf(players), now + CHIPS_MS + TURN_MS).state.placements).toEqual([
      { player: 2, stand: "blue", weight: 2, sum: 2, cleared: 0, passed: false, forced: true },
    ]);
  });

  it("says what is asked of whoever's rock it is, and places the last in the order itself a moment later", () => {
    const players = candidates(3);
    const now = T0 + 5000;
    const present = presenceOf(players);
    const placing = host.tick(allIn(started(players), players, ["red", "green", "blue"], now), present, now + CHIPS_MS);
    const at = now + CHIPS_MS + 3000;

    // the order is players 2, 1, 0 by their cards: the first two are asked, the last is not
    const second = act(placing, players, 2, { type: "place" }, at);
    const last = act(second, players, 1, { type: "place" }, at);
    const over = host.tick(last, present, at + PLACE_MS);

    expect([placing, second, last].map((session) => seenBy(session, players, 0, at).view.asked)).toEqual(["place-or-pass", "place-or-pass", "nothing"]);
    expect(host.act(last, tokenOf(0), { type: "pass" }, present, at + 1000)).toEqual({ ok: false, reason: "cannot-pass" });
    expect(host.deadline(last)).toBe(at + PLACE_MS);
    expect(seenBy(last, players, 1, at + 500).clock.phase).toBe(PLACE_MS - 500);
    expect(host.tick(last, present, at + PLACE_MS - 1)).toBe(last);
    expect(over.state.phase).toBe("pause");
    expect(over.state.placements.at(-1)).toEqual({ player: 0, stand: "red", weight: 0, sum: 0, cleared: 0, passed: false, forced: false });
    expect(host.deadline(over)).toBe(at + PLACE_MS + PAUSE_MS);
    expect(seenBy(over, players, 0, at + PLACE_MS).view.asked).toBeNull();
  });

  it("places a rock that was passed itself, when the others are on", () => {
    const players = candidates(3);
    const now = T0 + 5000;
    const present = presenceOf(players);
    const placing = host.tick(allIn(started(players), players, ["red", "green", "blue"], now), present, now + CHIPS_MS);
    const at = now + CHIPS_MS + 3000;

    // player 2 passes, player 1 places; then the room places player 0's rock, the last in the order, and the one passed
    const passed = act(act(placing, players, 2, { type: "pass" }, at), players, 1, { type: "place" }, at);
    const back = host.tick(passed, present, at + PLACE_MS);
    const over = host.tick(back, present, at + 2 * PLACE_MS);

    expect(seenBy(back, players, 2, at + PLACE_MS).view).toMatchObject({ turn: 2, asked: "nothing", passed: [2] });
    expect(host.deadline(back)).toBe(at + 2 * PLACE_MS);
    expect(over.state.phase).toBe("pause");
    expect(over.state.placements.map((each) => [each.player, each.passed, each.forced])).toEqual([
      [1, false, false],
      [0, false, false],
      [2, true, false],
    ]);
  });

  it("refuses a move from someone watching, what is no move, and a move where no game is on", () => {
    const players = candidates(2);
    const session = started(players);

    expect(host.act(session, "token-of-a-watcher", { type: "submit", card: 1, chip: "red" }, presenceOf(players), T0 + 1)).toEqual({
      ok: false,
      reason: "not-seated",
    });
    expect(host.act(session, tokenOf(0), { type: "peek" }, presenceOf(players), T0 + 1)).toEqual({ ok: false, reason: "bad-action" });
    expect(host.act(null, tokenOf(0), { type: "pass" }, presenceOf(players), T0)).toEqual({ ok: false, reason: "no-game" });
  });

  it("plays a whole game by the clock when nobody does anything: fourteen rounds, everything put in and placed by the room", () => {
    const players = candidates(3);

    const over = runOut(started(players), presenceOf(players), 400);
    const seen = seenBy(over, players, 0, T0 + 3 * 3600_000);

    expect(host.running(over)).toBe(false);
    expect(host.deadline(over)).toBeNull();
    expect(seen.clock.phase).toBeNull();
    expect(seen.view.round).toBe(ROUNDS);
    expect(seen.view.history.at(-1)).toEqual({ type: "ended", reason: "rounds" });
    expect(seen.view.hand).toEqual({ cards: [], chips: [] });
  });
});

describe("13 미만 in a room: players who are not there", () => {
  it("waits for a player whose connection dropped, until the time is up", () => {
    const players = candidates(3);
    const away = presenceOf(players, [2]);

    let session = act(started(players), players, 0, { type: "submit", card: 0, chip: "red" }, T0 + 1000, away);
    session = act(session, players, 1, { type: "submit", card: 1, chip: "green" }, T0 + 2000, away);

    expect(session.state.phase).toBe("submit");
    expect(host.tick(session, away, T0 + SUBMIT_MS).state.phase).toBe("chips");
  });

  it("does not wait for a player who has left the room: the room puts in for them", () => {
    const players = candidates(3);
    const gone = presenceOf(players, [], [2]);

    let session = act(started(players), players, 0, { type: "submit", card: 0, chip: "red" }, T0 + 1000, gone);
    session = act(session, players, 1, { type: "submit", card: 1, chip: "green" }, T0 + 2000, gone);

    expect(session.state.phase).toBe("chips");
    expect(session.state.submissions.find((each) => each.player === 2)?.forced).toBe(true);
  });

  it("places at once the rock of a player who has left the room", () => {
    const players = candidates(3);
    const now = T0 + 5000;
    const chips = allIn(started(players), players, ["red", "green", "blue"], now);

    const placing = host.tick(chips, presenceOf(players, [], [2]), now + CHIPS_MS);

    expect(placing.state.placements.map((each) => [each.player, each.forced])).toEqual([[2, true]]);
    expect(seenBy(placing, players, 0, now + CHIPS_MS, presenceOf(players, [], [2])).view.turn).toBe(1);
  });

  it("is over when fewer than two of its players are left in the room", () => {
    const players = candidates(2);

    const after = host.attend(started(players), presenceOf(players, [], [1]), T0 + 1000);

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
    expect(waiting.clock).toEqual({ phase: SUBMIT_MS - 4000, stand: STAND_MS - 56_000 });
    expect(host.deadline(frozen)).toBe(T0 + 4000 + STAND_MS);
    expect(back.frozenAt).toBeNull();
    expect(host.deadline(back)).toBe(T0 + SUBMIT_MS + 60_000);
  });

  it("is ended when it has stood still as long as it may, and at once when all its players have left the room", () => {
    const players = candidates(2);
    const nobody = presenceOf(players, [0, 1]);
    const frozen = host.attend(started(players), nobody, T0 + 4000);

    const stood = host.tick(frozen, nobody, T0 + 4000 + STAND_MS);
    const left = host.attend(started(players), presenceOf(players, [], [0, 1]), T0 + 4000);

    for (const over of [stood, left]) {
      expect(host.running(over)).toBe(false);
      expect(over.state.history.at(-1)).toEqual({ type: "ended", reason: "abandoned" });
    }
  });
});

describe("13 미만 in a room: bots", () => {
  /** One person and the bots that fill the room. */
  const person = candidates(1);

  it("has each bot put in a card and a chip it holds, one after the other", () => {
    const session = started(person, { bots: true, allowBots: true });
    const present = presenceOf(person);

    const first = host.tick(session, present, T0 + FIRST_BOT_MS);
    const second = host.tick(first, present, T0 + FIRST_BOT_MS + NEXT_BOT_MS);

    expect(host.deadline(session)).toBe(T0 + FIRST_BOT_MS);
    expect(host.tick(session, present, T0 + FIRST_BOT_MS - 1)).toBe(session);
    expect(first.state.submissions.map((each) => [each.player, each.forced])).toEqual([[1, false]]);
    expect(second.state.submissions.map((each) => each.player)).toEqual([1, 2]);
    expect(host.deadline(second)).toBe(T0 + FIRST_BOT_MS + 2 * NEXT_BOT_MS);
    for (const each of second.state.submissions) {
      expect(shipped.cards).toContain(each.card);
      expect(second.state.hands[each.player].cards).not.toContain(each.card);
    }
  });

  it("shows the chips once the person and every bot have put theirs in", () => {
    const present = presenceOf(person);
    const mine = act(started(person, { bots: true, allowBots: true }), person, 0, { type: "submit", card: 3, chip: "red" }, T0 + 1000);

    const after = runOut(mine, present, WITH_BOTS - 1);

    expect(after.state.phase).toBe("chips");
    expect(after.state.submissions.every((each) => !each.forced)).toBe(true);
  });

  it("has a bot place its rock a moment into its turn, never passing", () => {
    const present = presenceOf(person);
    let session = act(started(person, { bots: true, allowBots: true }), person, 0, { type: "submit", card: 0, chip: "red" }, T0 + 1000);
    // the bots put theirs in, the chips are seen, the cards shown: the first rock is a bot's, the person having put in the lowest card
    session = runOut(session, present, WITH_BOTS);
    const turnStarted = session.state.until - TURN_MS;

    const after = host.tick(session, present, turnStarted + BOT_TURN_MS);

    expect(session.state.phase).toBe("place");
    expect(host.deadline(session)).toBe(turnStarted + BOT_TURN_MS);
    expect(after.state.placements).toHaveLength(1);
    expect(after.state.placements[0]).toMatchObject({ passed: false, forced: false });
    expect(after.state.passed).toEqual([]);
  });

  it("leaves a rock nobody is asked about to the room's own clock, a bot's too", () => {
    const present = presenceOf(person);
    const mine = act(started(person, { bots: true, allowBots: true }), person, 0, { type: "submit", card: 6, chip: "red" }, T0 + 1000);
    // the bots put theirs in, the cards are shown and the rocks placed until only the last in the order is left: a bot's, the person holding the highest card
    const session = runUntil(mine, present, (state) => state.phase === "place" && askedOf(state) === "nothing");
    const last = turnOf(session.state);
    const placed = session.state.placements.length;

    const after = host.tick(session, present, session.state.until);

    expect(session.players.find((seat) => seat.id === last)?.token).toBeNull();
    expect(placed).toBe(WITH_BOTS - 1);
    expect(host.deadline(session)).toBe(session.state.until);
    expect(host.tick(session, present, session.state.until - 1)).toBe(session);
    expect(after.state.phase).toBe("pause");
    expect(after.state.placements.at(-1)).toMatchObject({ player: last, passed: false, forced: false });
  });

  it("finishes a game with a person who never does anything", () => {
    const over = runOut(started(person, { bots: true, allowBots: true }), presenceOf(person), 600);

    expect(host.running(over)).toBe(false);
    expect(over.state.history.at(-1)).toEqual({ type: "ended", reason: "rounds" });
    expect(over.state.round).toBe(ROUNDS);
  });
});

describe("13 미만 in a room: what is kept", () => {
  it("holds a place for each of its players and for nobody else", () => {
    const session = started(candidates(2));

    expect(host.holdsPlace(session, tokenOf(1))).toBe(true);
    expect(host.holdsPlace(session, "token-of-a-watcher")).toBe(false);
  });

  it("knows when storing a game again would change nothing", () => {
    const players = candidates(2);
    const session = started(players);
    const moved = act(session, players, 0, { type: "submit", card: 3, chip: "red" }, T0 + 1000);

    expect(host.same(session, host.attend(session, presenceOf(players), T0 + 1000))).toBe(true);
    expect(host.same(session, moved)).toBe(false);
    expect(host.same(session, { ...session, frozenAt: T0 })).toBe(false);
    expect(host.same(session, { ...session, rng: session.rng + 1 })).toBe(false);
  });

  it("carries on with a game it stored, and with nothing else", () => {
    const session = started(candidates(2));

    expect(host.usable(JSON.parse(JSON.stringify(session)))).toBe(true);
    expect(host.usable({ ...session, version: 2 })).toBe(false);
    expect(host.usable({ ...session, state: { ...session.state, version: 2 } })).toBe(false);
    expect(host.usable({ ...session, state: { ...session.state, hands: "all of them" } })).toBe(false);
    expect(host.usable({ ...session, players: null })).toBe(false);
    expect(host.usable(null)).toBe(false);
  });
});
