import { describe, expect, it } from "vitest";
import { GAME_IDS, type GameId } from "../../../src/shared/games";
import {
  counted,
  finishOf as finishBy,
  forgotten,
  noRecord,
  playedAny,
  recordFrom,
  recordText,
  stampOf,
  stampsIn,
  TOP_KIND,
  type MyRecord,
  type Finish,
  type GameMessage,
  type RecordConfig,
} from "../../../src/shared/record";

const CONFIG: RecordConfig = { seenMost: 3, peopleAtLeast: 2 };
const ROOM = "ABCDE";
const STARTED = 1_700_000_000_000;

/** Two people at a table, neither a bot. */
const PEOPLE = [
  { nick: "ann", bot: false, connected: true, left: false },
  { nick: "bob", bot: false, connected: true, left: false },
];

/** A game message of `game` with `view` for what the player sees of it: only what the record reads of one. */
function message(game: GameId, view: object, players: object[] = PEOPLE): GameMessage {
  return { type: "game", room: ROOM, game, startedAt: STARTED, view, players } as unknown as GameMessage;
}

/** The finish of `sent`, by the numbers of these tests. */
const finishOf = (sent: GameMessage): Finish | null => finishBy(sent, CONFIG);

/** How the game was over: its own way, or one that cut it short. */
const ended = (reason: string): object[] => [{ type: "round", round: 1 }, { type: "ended", reason }];

/** A finish of `game` under the key `key`. */
const finish = (key: string, game: GameId = "count-cubes", top = false): Finish => ({ key, game, top });

describe("finishOf", () => {
  it("is nothing while a game is being played", () => {
    expect(finishOf(message("russian-roulette", { phase: "turn", seat: 0, result: null, history: [] }))).toBeNull();
    expect(finishOf(message("count-cubes", { phase: "open", you: 0, ranked: [], history: [] }))).toBeNull();
  });

  it("is nothing for someone who watched", () => {
    const result = { shots: 1, hitSeats: [1], chambers: [] };

    expect(finishOf(message("russian-roulette", { phase: "ended", seat: null, result, history: [] }))).toBeNull();
    expect(finishOf(message("memory-poker", { phase: "ended", you: null, standings: [{ player: 0, place: 1 }], history: ended("rounds") }))).toBeNull();
  });

  it("is nothing for a game a bot sat in: bots are there to try the game with", () => {
    const withBot = [PEOPLE[0], { nick: "봇 1", bot: true, connected: true, left: false }];
    const view = { phase: "ended", you: 0, standings: [{ player: 0, place: 1 }], history: ended("rounds") };

    expect(finishOf(message("memory-poker", view, withBot))).toBeNull();
  });

  it("is nothing for a game played alone, and for one the others had left by its end: a place among nobody is not one", () => {
    const view = { phase: "ended", you: 0, ranked: [{ player: 0, took: 1 }], history: ended("ranked") };
    const gone = [PEOPLE[0], { ...PEOPLE[1], left: true }];

    expect(finishOf(message("count-cubes", view, [PEOPLE[0]]))).toBeNull();
    expect(finishOf(message("count-cubes", view, gone))).toBeNull();
  });

  it("counts a game someone was away from at the end but had not left", () => {
    const view = { phase: "ended", you: 0, ranked: [{ player: 0, took: 1 }], history: ended("ranked") };
    const away = [PEOPLE[0], { ...PEOPLE[1], connected: false }];

    expect(finishOf(message("count-cubes", view, away))?.top).toBe(true);
  });

  it("is nothing for a game cut short: one everybody left, one too few were left to play", () => {
    const standings = [{ player: 0, place: 1 }];

    expect(finishOf(message("memory-poker", { phase: "ended", you: 0, standings, history: ended("abandoned") }))).toBeNull();
    expect(finishOf(message("under-thirteen", { phase: "ended", you: 0, standings, history: ended("left") }))).toBeNull();
    expect(finishOf(message("count-cubes", { phase: "ended", you: 0, ranked: [{ player: 0, took: 1 }], history: ended("abandoned") }))).toBeNull();
  });

  it("names the game by its room and when it started, so that the same game is known again", () => {
    const view = { phase: "ended", you: 0, ranked: [{ player: 0, took: 1 }], history: ended("ranked") };

    expect(finishOf(message("count-cubes", view))).toEqual({ key: `${ROOM}.${STARTED}`, game: "count-cubes", top: true });
  });

  it("러시안 룰렛: the top is to be alive at the end", () => {
    const result = { shots: 2, hitSeats: [1], chambers: [] };

    expect(finishOf(message("russian-roulette", { phase: "ended", seat: 0, result, history: [] }))?.top).toBe(true);
    expect(finishOf(message("russian-roulette", { phase: "ended", seat: 1, result, history: [] }))?.top).toBe(false);
  });

  it("네모 세기: the top is to be in a unit that won", () => {
    const units = [{ members: [0], place: 0 }, { members: [1], place: 1 }];
    const view = (unit: number): object => ({ phase: "ended", you: { player: unit, unit }, units, history: [{ type: "ended", round: 3, reason: "half" }] });

    expect(finishOf(message("count-rectangles", view(1)))?.top).toBe(true);
    expect(finishOf(message("count-rectangles", view(0)))?.top).toBe(false);
  });

  it("잔디 깔기: the top is the most points, shared by those level on them", () => {
    const players = [{ id: 0, score: 7 }, { id: 1, score: 7 }, { id: 2, score: 3 }];
    const view = (you: number): object => ({ phase: "ended", you, players, history: [{ type: "ended", round: 4, reason: "rounds" }] });

    expect(finishOf(message("lay-the-grass", view(0)))?.top).toBe(true);
    expect(finishOf(message("lay-the-grass", view(1)))?.top).toBe(true);
    expect(finishOf(message("lay-the-grass", view(2)))?.top).toBe(false);
  });

  it("큐브 세기: the top is the first to have the answer; one who never had it played and was not", () => {
    const ranked = [{ player: 1, took: 4000 }, { player: 0, took: 9000 }];
    const view = (you: number): object => ({ phase: "ended", you, ranked, history: ended("time") });

    expect(finishOf(message("count-cubes", view(1)))?.top).toBe(true);
    expect(finishOf(message("count-cubes", view(0)))?.top).toBe(false);
    expect(finishOf(message("count-cubes", view(2)))?.top).toBe(false);
  });

  it("기억 포커 and 무거운 13: the top is first place, shared by those who share it", () => {
    const standings = [{ player: 0, place: 1 }, { player: 1, place: 1 }, { player: 2, place: 3 }];
    const view = (you: number): object => ({ phase: "ended", you, standings, history: ended("rounds") });

    for (const game of ["memory-poker", "under-thirteen"] as const) {
      expect(finishOf(message(game, view(1)))?.top).toBe(true);
      expect(finishOf(message(game, view(2)))?.top).toBe(false);
    }
  });

  it("미스터리 거래소: the top is the first rank", () => {
    const standings = [{ player: 0, rank: 2, assets: 90, done: true }, { player: 1, rank: 1, assets: 120, done: true }];
    const view = (you: number): object => ({ phase: "ended", you, standings, history: ended("rounds") });

    expect(finishOf(message("mystery-stock-market", view(1)))?.top).toBe(true);
    expect(finishOf(message("mystery-stock-market", view(0)))?.top).toBe(false);
  });

  it("says for every game what its top is called", () => {
    expect(Object.keys(TOP_KIND).sort()).toEqual([...GAME_IDS].sort());
  });
});

describe("counted", () => {
  it("adds a game played, and one at the top when it was", () => {
    const once = counted(noRecord(), finish("A.1", "count-cubes", true), CONFIG);
    const twice = counted(once, finish("A.2", "count-cubes", false), CONFIG);

    expect(twice.games).toEqual({ "count-cubes": { played: 2, top: 1 } });
  });

  it("keeps each game's count apart", () => {
    const record = counted(counted(noRecord(), finish("A.1", "count-cubes"), CONFIG), finish("A.2", "memory-poker", true), CONFIG);

    expect(record.games).toEqual({ "count-cubes": { played: 1, top: 0 }, "memory-poker": { played: 1, top: 1 } });
  });

  it("counts a game once however often its end is heard of, and gives the record back as it was", () => {
    const once = counted(noRecord(), finish("A.1"), CONFIG);

    expect(counted(once, finish("A.1"), CONFIG)).toBe(once);
  });

  it("remembers only the latest games it has counted, the oldest going first", () => {
    let record = noRecord();
    for (let n = 1; n <= CONFIG.seenMost + 1; n++) record = counted(record, finish(`A.${n}`), CONFIG);

    expect(record.seen).toEqual(["A.2", "A.3", "A.4"]);
  });

  it("does not change the record it was given", () => {
    const before = noRecord();

    counted(before, finish("A.1"), CONFIG);

    expect(before).toEqual(noRecord());
  });
});

describe("recordFrom", () => {
  it("reads back what recordText wrote", () => {
    const record = counted(counted(noRecord(), finish("A.1", "count-cubes", true), CONFIG), finish("A.2", "lay-the-grass"), CONFIG);

    expect(recordFrom(recordText(record))).toEqual(record);
  });

  it("is an empty record for nothing kept, and for what cannot be read", () => {
    expect(recordFrom(null)).toEqual(noRecord());
    expect(recordFrom("not json")).toEqual(noRecord());
    expect(recordFrom("[1,2]")).toEqual(noRecord());
  });

  it("leaves out a game there no longer is, and a count that is not one", () => {
    const stored = JSON.stringify({
      games: { "a-game-gone": { played: 3, top: 1 }, "count-cubes": { played: -2, top: 0 }, "memory-poker": { played: 2, top: 5 }, "lay-the-grass": { played: 4, top: 1 } },
      seen: ["A.1", 7, "A.2"],
    });

    expect(recordFrom(stored)).toEqual({ games: { "lay-the-grass": { played: 4, top: 1 } }, seen: ["A.1", "A.2"] });
  });
});

describe("forgotten", () => {
  it("has no game in it, and still knows the games it counted: one of them heard of again is not counted into the empty record", () => {
    const record = counted(noRecord(), finish("A.1"), CONFIG);

    const empty = forgotten(record);

    expect(playedAny(empty)).toBe(false);
    expect(counted(empty, finish("A.1"), CONFIG)).toBe(empty);
  });
});

describe("playedAny", () => {
  it("is whether any game has been counted", () => {
    expect(playedAny(noRecord())).toBe(false);
    expect(playedAny(counted(noRecord(), finish("A.1"), CONFIG))).toBe(true);
  });
});

describe("the board of every game", () => {
  const record: MyRecord = { games: { "russian-roulette": { played: 2, top: 0 }, "memory-poker": { played: 3, top: 1 }, "count-cubes": { played: 0, top: 0 } }, seen: [] };

  it("marks a game played to its end with others, and marks it otherwise once the player came out of one at the top", () => {
    expect(stampOf(record, "russian-roulette")).toBe("played");
    expect(stampOf(record, "memory-poker")).toBe("top");
  });

  it("has no mark for a game never counted, nor for one kept with nothing played", () => {
    expect(stampOf(record, "lay-the-grass")).toBe("none");
    expect(stampOf(record, "count-cubes")).toBe("none");
    expect(GAME_IDS.every((game) => stampOf(noRecord(), game) === "none")).toBe(true);
  });

  it("counts the games that have a mark", () => {
    expect(stampsIn(record, GAME_IDS)).toBe(2);
    expect(stampsIn(noRecord(), GAME_IDS)).toBe(0);
    expect(stampsIn(record, ["memory-poker", "lay-the-grass"])).toBe(1);
  });
});
