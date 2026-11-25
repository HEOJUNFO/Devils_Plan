import { describe, expect, it } from "vitest";
import type { Candidate, Presence, StartRequest } from "../../../src/shared/hosting";
import botJson from "../../../src/shared/games/hidden-word/bot-config.json";
import configJson from "../../../src/shared/games/hidden-word/config.json";
import hostJson from "../../../src/shared/games/hidden-word/host-config.json";
import { hiddenHost, makeHiddenHost, type HiddenSession, type HiddenSnapshot } from "../../../src/shared/games/hidden-word/host";
import type { HiddenConfig } from "../../../src/shared/games/hidden-word/rules";
import { FIRST_PIECES, scripted } from "./documented";

const config: HiddenConfig = configJson;
const T0 = 2_000_000;
const BOT_MS = botJson.afterSeconds * 1000;
const STAND_MS = hostJson.standSeconds * 1000;

/** Three envelopes. Every word has 숲 as a clue that ends the giving of clues, and 숲 has 나무 nearest it. */
const WORDS = [
  ["나무", "의자", "편지", "모자", "기차"],
  ["바다", "연필", "시계", "구두", "피아노"],
  ["사과", "거울", "우산", "비누", "자전거"],
];
const SCORES: Record<string, number> = { "숲 나무": 99 };
for (const word of WORDS.flat()) SCORES[`${word} 숲`] = 96;
const lexicon = scripted(WORDS.flat(), SCORES, ["오답", "잎"]);
const host = makeHiddenHost(lexicon);
/** The draws that leave the list's words and the players in their own order. */
const PLAIN = Array.from({ length: 64 }, () => 0xffffffff);

const people = (count: number): Candidate[] => Array.from({ length: count }, (_, slot) => ({ slot, token: `t${slot}`, nick: `P${slot}`, seq: slot }));
const all = (players: Candidate[]): Presence => ({ connected: new Set(players.map((each) => each.token)), seated: new Set(players.map((each) => each.token)) });
const request = (over: Partial<StartRequest> = {}): StartRequest => ({ by: "t0", bots: false, allowBots: true, seed: 5, now: T0, turnSeconds: 60, chance: PLAIN, ...over });
const seen = (session: HiddenSession, viewer: string | null, presence: Presence, now: number): HiddenSnapshot => host.view(session, viewer, presence, now) as HiddenSnapshot;

function started(count: number, over: Partial<StartRequest> = {}): { session: HiddenSession; presence: Presence } {
  const players = people(count);
  const presence = all(players);
  const result = host.start(null, players, request(over), presence);
  if (!result.ok) throw new Error(result.reason);
  return { session: result.session, presence };
}

/** `session` after the player holding `token` did `action`, which the game must take. */
function did(session: HiddenSession, token: string, action: unknown, presence: Presence, now: number): HiddenSession {
  const result = host.act(session, token, action, presence, now);
  if (!result.ok) throw new Error(result.reason);
  return result.session;
}

/** `session` with all three having chosen the first word of their envelope: P0 gives clues. */
function chosen(session: HiddenSession, presence: Presence): HiddenSession {
  let next = session;
  for (const [at, token] of ["t0", "t1", "t2"].entries()) next = did(next, token, { type: "choose", word: WORDS[at][0] }, presence, T0 + 1000);
  return next;
}

describe("starting 히든 워드 in a room", () => {
  it("is the host's to do, with three to six players", () => {
    expect(host.start(null, people(3), request({ by: "t1" }), all(people(3)))).toEqual({ ok: false, reason: "not-host" });
    expect(host.start(null, people(2), request(), all(people(2)))).toEqual({ ok: false, reason: "too-few" });
    expect(host.start(null, people(config.maxPlayers + 1), request(), all(people(config.maxPlayers + 1)))).toEqual({ ok: false, reason: "too-many" });
    expect(started(3).session.state.players).toEqual([0, 1, 2]);
    expect(config.minPlayers).toBe(3);
    expect(config.maxPlayers).toBe(6);
  });

  it("is refused while a game is being played, and bots where the room offers none", () => {
    const { session, presence } = started(3);
    expect(host.start(session, people(3), request(), presence)).toEqual({ ok: false, reason: "already-playing" });
    expect(host.start(null, people(1), request({ bots: true, allowBots: false }), all(people(1)))).toEqual({ ok: false, reason: "bots-not-allowed" });
  });

  it("fills the places up to three with bots when bots are asked for, and none where three are here", () => {
    const one = started(1, { bots: true }).session;
    expect(one.players.map((seat) => [seat.id, seat.token, seat.nick])).toEqual([
      [0, "t0", "P0"],
      [1, null, "봇 1"],
      [2, null, "봇 2"],
    ]);
    expect(started(3, { bots: true }).session.players.every((seat) => seat.token !== null)).toBe(true);
  });

  it("is refused where the list of words cannot fill the envelopes", () => {
    expect(host.start(null, people(4), request(), all(people(4)))).toEqual({ ok: false, reason: "too-few-words" });
  });

  it("can be done with the game's own list of words", () => {
    const result = hiddenHost.start(null, people(6), request({ chance: undefined }), all(people(6)));
    if (!result.ok) throw new Error(result.reason);
    expect(result.session.state.hands.every((hand) => hand.words.length === config.envelope)).toBe(true);
    expect(new Set(result.session.state.hands.flatMap((hand) => hand.words)).size).toBe(6 * config.envelope);
  });
});

describe("what a player is sent", () => {
  it("has their own envelope and nobody else's, the numbers of the rules, and the clock", () => {
    const { session, presence } = started(3);
    const mine = seen(session, "t0", presence, T0 + 2000);
    expect(mine.view.you).toBe(0);
    expect(mine.view.hand?.words).toEqual(WORDS[0]);
    expect(mine.clock).toEqual({ turn: config.chooseSeconds * 1000 - 2000, stand: null });
    expect(mine.rules).toMatchObject({ rounds: 2, clues: 10, threshold: 95, stages: 3, pieces: config.pieces, firstPieces: FIRST_PIECES });
    expect(mine.players.map((player) => player.nick)).toEqual(["P0", "P1", "P2"]);
    const other = JSON.stringify(seen(session, "t1", presence, T0));
    const watcher = seen(session, null, presence, T0);
    for (const word of WORDS[0]) {
      expect(other).not.toContain(word);
      expect(JSON.stringify(watcher)).not.toContain(word);
    }
    expect(watcher.view.you).toBeNull();
  });

  it("never has a token", () => {
    const { session, presence } = started(3);
    expect(JSON.stringify(seen(session, "t0", presence, T0))).not.toMatch(/"t[012]"/);
  });
});

describe("asking the game for something", () => {
  it("is for its players, in the game's own words", () => {
    const { session, presence } = started(3);
    expect(host.act(null, "t0", { type: "choose", word: "나무" }, presence, T0)).toEqual({ ok: false, reason: "no-game" });
    expect(host.act(session, "t9", { type: "choose", word: "나무" }, presence, T0)).toEqual({ ok: false, reason: "not-seated" });
    expect(host.act(session, "t0", { type: "choose", word: "tree" }, presence, T0)).toEqual({ ok: false, reason: "bad-action" });
    expect(host.act(session, "t0", { type: "choose", word: "바다" }, presence, T0)).toEqual({ ok: false, reason: "not-in-envelope" });
  });

  it("scores a clue in the room, by the list the host was given", () => {
    const { session, presence } = started(3);
    const clued = did(chosen(session, presence), "t0", { type: "clue", word: "숲" }, presence, T0 + 2000);
    expect(clued.state.clues).toEqual([{ word: "숲", score: 96, stage: 1, room: false }]);
    expect(seen(clued, "t2", presence, T0 + 2000).view.clues).toEqual([{ word: "숲", score: 96, stage: 1, room: false }]);
    expect(host.act(clued, "t0", { type: "clue", word: "없는말" }, presence, T0 + 2000)).toEqual({ ok: false, reason: "not-clue-time" });
  });

  it("comes too late once the clock has run out, however late the room is in saying so", () => {
    const { session, presence } = started(3);
    const clue = chosen(session, presence);
    const over = (clue.state.until as number) + 1;
    // the room gave the setter's clue for them, and the others are writing: a clue is refused
    expect(host.act(clue, "t0", { type: "clue", word: "잎" }, presence, over)).toEqual({ ok: false, reason: "not-clue-time" });
    const answered = did(clue, "t1", { type: "answer", words: ["나무"] }, presence, over);
    expect(answered.state.clues).toEqual([{ word: "숲", score: 96, stage: 1, room: true }]);
  });
});

describe("the bot", () => {
  it("does its part a while after the last thing done: a hidden word, a clue, an answer", () => {
    const { session, presence } = started(1, { bots: true });
    expect(host.deadline(session)).toBe(T0 + BOT_MS);
    expect(host.tick(session, presence, T0 + BOT_MS - 1)).toBe(session);
    let next = host.tick(session, presence, T0 + BOT_MS);
    expect(next.state.hands[1].chosen).toBe(WORDS[1][0]);
    next = host.tick(next, presence, host.deadline(next) as number);
    expect(next.state.hands[2].chosen).toBe(WORDS[2][0]);
    // the person chooses, and gives a clue that ends the clues: the bots answer the word nearest it
    next = did(next, "t0", { type: "choose", word: "나무" }, presence, T0 + 20_000);
    expect(next.state.phase).toBe("clue");
    expect(next.state.setter).toBe(0);
    next = did(next, "t0", { type: "clue", word: "숲" }, presence, T0 + 21_000);
    next = host.tick(next, presence, host.deadline(next) as number);
    next = host.tick(next, presence, host.deadline(next) as number);
    expect(next.state.phase).toBe("reveal");
    expect(next.state.result?.answers).toEqual([
      { player: 1, words: ["나무"], right: true },
      { player: 2, words: ["나무"], right: true },
    ]);
    // the next setter is a bot: its clue is the word nearest its hidden word
    next = host.tick(next, presence, host.deadline(next) as number);
    expect(next.state.setter).toBe(1);
    next = host.tick(next, presence, host.deadline(next) as number);
    expect(next.state.clues).toEqual([{ word: "숲", score: 96, stage: 1, room: false }]);
    expect(next.state.phase).toBe("answer");
  });

  it("plays a whole game with a person who only chooses and answers", () => {
    const start = started(1, { bots: true });
    const presence = start.presence;
    let session = start.session;
    let now = T0;
    // the person's clue for each stage: the first ends the clues, the others are left to the clock
    const mine = ["숲", "잎", "오답"];
    for (let step = 0; step < 1000 && host.running(session); step++) {
      const view = seen(session, "t0", presence, now).view;
      if (view.phase === "choose" && view.hand?.chosen === null) {
        session = did(session, "t0", { type: "choose", word: view.hand.words.find((word) => !view.hand?.used.includes(word)) }, presence, now);
      } else if (view.phase === "clue" && view.setter === 0 && !view.clues.some((clue) => clue.stage === view.stage)) {
        session = did(session, "t0", { type: "clue", word: mine[view.stage - 1] }, presence, now);
      } else if (view.phase === "answer" && view.setter !== 0 && view.answer === null) {
        session = did(session, "t0", { type: "answer", words: ["오답"] }, presence, now);
      } else {
        now = host.deadline(session) as number;
        session = host.tick(session, presence, now);
      }
    }
    expect(session.state.phase).toBe("ended");
    expect(session.state.ended).toBe("played");
    expect(session.state.past.length).toBe(6);
    expect(host.deadline(session)).toBeNull();
    // the bots found the person's first word at once; nobody found the second in its three stages, at double worth
    expect(session.state.scores[0]).toEqual({ player: 0, rounds: [0, 2 * (1 + 2 + 3)] });
    expect(session.state.past.filter((turn) => turn.setter === 0)).toEqual([
      { round: 1, setter: 0, word: "나무", stage: 1, right: [1, 2], setterPoints: 0 },
      { round: 2, setter: 0, word: "의자", stage: 3, right: [], setterPoints: 12 },
    ]);
    expect(host.places?.(session)?.map((line) => line.token)).toEqual(["t0", null, null]);
  });
});

describe("the end of a game", () => {
  it("pays first place the show's four pieces, shared evenly, and places everyone", () => {
    const { session, presence } = started(3);
    expect(hostJson.firstPieces).toBe(FIRST_PIECES);
    expect(host.pieces?.(session)).toBeNull();
    expect(host.places?.(session)).toBeNull();
    // a game played to its end in which 0 and 1 are level at the top
    const end: HiddenSession = {
      ...session,
      state: {
        ...session.state,
        phase: "ended",
        ended: "played",
        until: null,
        scores: [
          { player: 0, rounds: [3, 4] },
          { player: 1, rounds: [1, 6] },
          { player: 2, rounds: [2, 2] },
        ],
      },
    };
    expect(host.pieces?.(end)).toEqual([
      { token: "t0", pieces: 2 },
      { token: "t1", pieces: 2 },
      { token: "t2", pieces: 0 },
    ]);
    expect(host.places?.(end)).toEqual([
      { token: "t0", place: 1 },
      { token: "t1", place: 1 },
      { token: "t2", place: 3 },
    ]);
    expect(host.running(end)).toBe(false);
    expect(host.tick(end, presence, T0 + 9_000_000)).toBe(end);
  });
});

describe("a game nobody is at", () => {
  it("stands still, goes on when someone is back, and is ended if nobody is", () => {
    const { session, presence } = started(3);
    const away: Presence = { connected: new Set(), seated: presence.seated };
    const frozen = host.attend(session, away, T0 + 5000);
    expect(frozen.frozenAt).toBe(T0 + 5000);
    expect(seen(frozen, "t0", away, T0 + 9000)).toMatchObject({ frozen: true, clock: { turn: config.chooseSeconds * 1000 - 5000, stand: STAND_MS - 4000 } });
    expect(host.deadline(frozen)).toBe(T0 + 5000 + STAND_MS);
    const back = host.attend(frozen, presence, T0 + 65_000);
    expect(back.frozenAt).toBeNull();
    expect(back.state.until).toBe((session.state.until as number) + 60_000);
    const given = host.tick(frozen, away, T0 + 5000 + STAND_MS);
    expect(given.state.ended).toBe("abandoned");
  });

  it("is over when fewer than two of its players are still in the room", () => {
    const { session, presence } = started(3);
    const left: Presence = { connected: new Set(["t0"]), seated: new Set(["t0"]) };
    expect(host.attend(session, left, T0 + 1000).state.ended).toBe("left");
    expect(host.holdsPlace(session, "t1")).toBe(true);
    expect(host.holdsPlace(session, "t9")).toBe(false);
    expect(host.attend(session, presence, T0 + 1000)).toBe(session);
  });
});

describe("a stored game", () => {
  it("is carried on with when it is one of this version", () => {
    const { session } = started(3);
    expect(host.usable(JSON.parse(JSON.stringify(session)))).toBe(true);
    expect(host.usable({ ...session, version: 0 })).toBe(false);
    expect(host.usable({ ...session, state: { ...session.state, hands: undefined } })).toBe(false);
    expect(host.usable(null)).toBe(false);
    expect(host.same(session, session)).toBe(true);
    expect(host.same(session, { ...session, frozenAt: 1 })).toBe(false);
  });
});
