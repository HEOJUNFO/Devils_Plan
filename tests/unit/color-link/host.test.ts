import { describe, expect, it } from "vitest";
import type { Candidate, Presence, StartRequest } from "../../../src/shared/hosting";
import botJson from "../../../src/shared/games/color-link/bot-config.json";
import configJson from "../../../src/shared/games/color-link/config.json";
import hostJson from "../../../src/shared/games/color-link/host-config.json";
import { linkHost, type LinkSession, type LinkSnapshot } from "../../../src/shared/games/color-link/host";
import { EMPTY, checkProof, dueOf, lettersLeft, type LinkConfig } from "../../../src/shared/games/color-link/rules";

const config: LinkConfig = configJson;
const T0 = 2_000_000;
const BOT_MS = botJson.afterSeconds * 1000;
const PLACE_MS = config.placeSeconds * 1000;
const PROVE_MS = config.proveSeconds * 1000;

const people = (count: number): Candidate[] => Array.from({ length: count }, (_, slot) => ({ slot, token: `t${slot}`, nick: `P${slot}`, seq: slot }));
const all = (players: Candidate[]): Presence => ({ connected: new Set(players.map((each) => each.token)), seated: new Set(players.map((each) => each.token)) });
const request = (over: Partial<StartRequest> = {}): StartRequest => ({ by: "t0", bots: false, allowBots: true, seed: 5, now: T0, turnSeconds: 60, ...over });

const seen = (session: LinkSession, viewer: string | null, presence: Presence, now: number): LinkSnapshot => linkHost.view(session, viewer, presence, now) as LinkSnapshot;

function started(count: number, over: Partial<StartRequest> = {}): { session: LinkSession; presence: Presence } {
  const players = people(count);
  const presence = all(players);
  const result = linkHost.start(null, players, request(over), presence);
  if (!result.ok) throw new Error(result.reason);
  return { session: result.session, presence };
}

/** `session` after the player holding `token` did `action`, which the game must take. */
function did(session: LinkSession, token: string, action: unknown, presence: Presence, now: number): LinkSession {
  const result = linkHost.act(session, token, action, presence, now);
  if (!result.ok) throw new Error(result.reason);
  return result.session;
}

/** A turn's pieces for `session`: its first empty squares, each letter begun being ended before the next. */
function turn(session: LinkSession): { type: "place"; pieces: { letter: string; cell: number }[] } {
  const letters = lettersLeft(session.state.board.cells, config).slice(0, dueOf(session.state, config));
  const open = [...session.state.board.cells].flatMap((cell, index) => (cell === EMPTY ? [index] : []));
  return { type: "place", pieces: letters.map((letter, index) => ({ letter, cell: open[index] })) };
}

describe("starting 컬러 링크 in a room", () => {
  it("is the host's to do, with two players and no more", () => {
    expect(linkHost.start(null, people(2), request({ by: "t1" }), all(people(2)))).toEqual({ ok: false, reason: "not-host" });
    expect(linkHost.start(null, people(1), request(), all(people(1)))).toEqual({ ok: false, reason: "too-few" });
    expect(linkHost.start(null, people(3), request(), all(people(3)))).toEqual({ ok: false, reason: "too-many" });
    expect(started(2).session.state.players).toEqual([0, 1]);
  });

  it("is refused while a game is being played, and bots where the room offers none", () => {
    const { session, presence } = started(2);
    expect(linkHost.start(session, people(2), request(), presence)).toEqual({ ok: false, reason: "already-playing" });
    expect(linkHost.start(null, people(1), request({ bots: true, allowBots: false }), all(people(1)))).toEqual({ ok: false, reason: "bots-not-allowed" });
  });

  it("gives the second place to a bot when bots are asked for", () => {
    const { session } = started(1, { bots: true });
    expect(session.players.map((seat) => [seat.id, seat.token, seat.nick])).toEqual([
      [0, "t0", "P0"],
      [1, null, "봇 1"],
    ]);
  });

  it("gives a minute and a half for a turn, whatever the room's limit on a turn", () => {
    for (const turnSeconds of [0, 20]) {
      const { session, presence } = started(2, { turnSeconds });
      expect(linkHost.deadline(session)).toBe(T0 + PLACE_MS);
      expect(seen(session, "t0", presence, T0 + 20_000).clock).toEqual({ turn: PLACE_MS - 20_000, stand: null });
    }
  });
});

describe("what a room of 컬러 링크 sends", () => {
  it("is the same board for both players and for someone watching, with no token in it", () => {
    const begun = started(2);
    const first = `t${begun.session.state.turn}`;
    const session = did(begun.session, first, turn(begun.session), begun.presence, T0 + 1000);
    const [mine, theirs, watching] = [seen(session, "t0", begun.presence, T0 + 1000), seen(session, "t1", begun.presence, T0 + 1000), seen(session, null, begun.presence, T0 + 1000)];
    expect([mine.view.you, theirs.view.you, watching.view.you]).toEqual([0, 1, null]);
    expect(theirs.view.board).toEqual(mine.view.board);
    expect(watching.view.board).toEqual(mine.view.board);
    expect(JSON.stringify(mine)).not.toContain("token");
    expect(mine.players).toEqual([
      { id: 0, nick: "P0", bot: false, connected: true, left: false },
      { id: 1, nick: "P1", bot: false, connected: true, left: false },
    ]);
  });

  it("has the numbers of the rules the screen checks pieces and paths by", () => {
    const { session, presence } = started(2);
    expect(seen(session, "t0", presence, T0).rules).toEqual({ letters: "ABCDEFGHIJKLMN", fixed: "XY", minPath: 6, firstPieces: 1, turnPieces: 2, rounds: 5, goal: 3, placeSeconds: 90, chooseSeconds: 90, proveSeconds: 150 });
  });

  it("refuses someone watching, what is no action, and what the rules refuse", () => {
    const { session, presence } = started(2);
    const [first, second] = [`t${session.state.turn}`, `t${session.state.players.find((each) => each !== session.state.turn)}`];
    expect(linkHost.act(session, "t9", { type: "declare" }, presence, T0)).toEqual({ ok: false, reason: "not-seated" });
    expect(linkHost.act(null, "t0", { type: "declare" }, presence, T0)).toEqual({ ok: false, reason: "no-game" });
    expect(linkHost.act(session, first, { type: "win" }, presence, T0)).toEqual({ ok: false, reason: "bad-action" });
    expect(linkHost.act(session, second, turn(session), presence, T0)).toEqual({ ok: false, reason: "not-your-turn" });
    expect(linkHost.act(session, first, { type: "declare" }, presence, T0)).toEqual({ ok: false, reason: "nothing-placed" });
  });

  it("takes no pieces that come after the time is up, however late the room's own alarm", () => {
    const { session, presence } = started(2);
    const first = `t${session.state.turn}`;
    expect(linkHost.act(session, first, turn(session), presence, T0 + PLACE_MS)).toEqual({ ok: false, reason: "not-placing" });
    expect(linkHost.tick(session, presence, T0 + PLACE_MS).state.log[0]).toMatchObject({ how: "late" });
  });
});

describe("the bot of 컬러 링크", () => {
  /** A game against the bot in which the person goes first, found by trying seeds. */
  function personFirst(): { session: LinkSession; presence: Presence } {
    for (let seed = 1; seed < 40; seed++) {
      const begun = started(1, { bots: true, seed });
      if (begun.session.state.turn === 0) return begun;
    }
    throw new Error("no seed has the person first");
  }

  it("places a turn's pieces the rules allow, a while after the turn is its own", () => {
    const begun = personFirst();
    let session = did(begun.session, "t0", turn(begun.session), begun.presence, T0 + 1000);
    expect(linkHost.deadline(session)).toBe(T0 + 1000 + BOT_MS);
    expect(linkHost.tick(session, begun.presence, T0 + 1000 + BOT_MS - 1)).toBe(session);
    session = linkHost.tick(session, begun.presence, T0 + 1000 + BOT_MS);
    expect([session.state.pieces, session.state.last, session.state.turn]).toEqual([3, 1, 0]);
    expect(linkHost.deadline(session)).toBe(T0 + 1000 + BOT_MS + PLACE_MS);
  });

  it("proves the board when the person declares it impossible, with a proof the rules take", () => {
    const begun = personFirst();
    let session = did(begun.session, "t0", turn(begun.session), begun.presence, T0);
    session = linkHost.tick(session, begun.presence, T0 + BOT_MS);
    const before = session.state.board;
    session = did(session, "t0", { type: "declare" }, begun.presence, T0 + BOT_MS + 1000);
    expect([session.state.phase, session.state.prover]).toEqual(["prove", 1]);
    expect(linkHost.deadline(session)).toBe(T0 + BOT_MS + 1000 + BOT_MS);
    session = linkHost.tick(session, begun.presence, T0 + BOT_MS + 1000 + BOT_MS);
    expect(session.state.phase).toBe("show");
    const line = session.state.log[0];
    expect(line).toMatchObject({ winner: 1, how: "proved", declarer: 0, prover: 1 });
    // the paths are a proof of the board as it was with the partners the bot placed
    const partners = [...line.cells].flatMap((cell, index) => (cell !== before.cells[index] ? [{ letter: cell, cell: index }] : []));
    expect(checkProof(before, partners, line.paths, config)).toBeNull();
  });

  it("plays on, round after round, against a person who does nothing, until the game is over", () => {
    let { session, presence } = started(1, { bots: true, seed: 23 });
    for (let step = 0; step < 2000 && linkHost.running(session); step++) session = linkHost.tick(session, presence, linkHost.deadline(session) as number);

    expect(linkHost.running(session)).toBe(false);
    expect([session.state.ended, session.state.winner, session.state.round]).toEqual(["played", 1, 3]);
    expect(linkHost.places?.(session)).toEqual([
      { token: "t0", place: 2 },
      { token: null, place: 1 },
    ]);
  });

  it("plays a whole game with a person who places every turn and gives up every proof, declaring now and then", () => {
    const declared = new Set<number>();
    for (const seed of [1, 2, 3, 4]) {
      let { session, presence } = started(1, { bots: true, seed });
      for (let step = 0; step < 4000 && linkHost.running(session); step++) {
        const now = Math.max(session.state.at, T0) + 500;
        const state = session.state;
        const mine = (state.phase === "place" ? state.turn : state.phase === "prove" ? state.prover : state.phase === "choose" ? state.chooser : null) === 0;
        const place = turn(session);
        if (mine && state.phase === "choose") session = did(session, "t0", { type: "choose", first: true }, presence, now);
        else if (mine && state.phase === "prove") session = did(session, "t0", { type: "forfeit" }, presence, now);
        else if (mine && place.pieces.length === dueOf(state, config)) session = did(session, "t0", place, presence, now);
        else session = linkHost.tick(session, presence, linkHost.deadline(session) as number);
      }
      expect(linkHost.running(session)).toBe(false);
      expect(session.state.ended).toBe("played");
      for (const line of session.state.log) if (line.declarer !== null) declared.add(line.declarer);
    }
    expect(declared.has(1)).toBe(true);
  });
});

describe("a room of 컬러 링크 whose players come and go", () => {
  it("ends when one of the two has left the room", () => {
    const two = started(2);
    const alone = linkHost.attend(two.session, { connected: new Set(["t0"]), seated: new Set(["t0"]) }, T0 + 4000);
    expect([alone.state.phase, alone.state.ended]).toEqual(["ended", "left"]);
    expect(linkHost.places?.(alone)).toBeNull();
  });

  it("stands still while none of its people is connected, with its clock where it stopped, and goes on when one is back", () => {
    const { session, presence } = started(2);
    const nobody: Presence = { connected: new Set(), seated: presence.seated };

    const still = linkHost.attend(session, nobody, T0 + 10_000);
    expect(still.frozenAt).toBe(T0 + 10_000);
    expect(seen(still, "t0", nobody, T0 + 30_000)).toMatchObject({ frozen: true, clock: { turn: PLACE_MS - 10_000, stand: hostJson.standSeconds * 1000 - 20_000 } });
    expect(linkHost.deadline(still)).toBe(T0 + 10_000 + hostJson.standSeconds * 1000);

    const back = linkHost.attend(still, presence, T0 + 40_000);
    expect(back.frozenAt).toBeNull();
    expect(linkHost.deadline(back)).toBe(T0 + PLACE_MS + 30_000);

    const given = linkHost.tick(still, nobody, T0 + 10_000 + hostJson.standSeconds * 1000);
    expect([given.state.phase, given.state.ended]).toEqual(["ended", "abandoned"]);
  });

  it("holds a place for each of its players, and can carry on with what it stored", () => {
    const { session } = started(2);
    expect(linkHost.holdsPlace(session, "t1")).toBe(true);
    expect(linkHost.holdsPlace(session, "t5")).toBe(false);
    expect(linkHost.usable(JSON.parse(JSON.stringify(session)))).toBe(true);
    expect(linkHost.usable({ ...session, version: 0 })).toBe(false);
    expect(linkHost.usable(null)).toBe(false);
    expect(linkHost.same(session, { ...session })).toBe(true);
  });
});
