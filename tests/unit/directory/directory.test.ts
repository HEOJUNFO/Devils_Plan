import { describe, expect, it } from "vitest";
import {
  beyondLimit,
  countRooms,
  isStale,
  listRooms,
  listingOf,
  mayMakeAnother,
  parseReport,
  quickPicks,
  roomsShown,
  type DirectoryConfig,
  type DirectoryEntry,
  type RoomListing,
} from "../../../src/shared/directory";
import { DEFAULT_GAME, GAMES, GAME_IDS, type GameId } from "../../../src/shared/games";
import { createLobby, joinLobby, leaveLobby, type LobbyState, type RoomConfig } from "../../../src/shared/lobby";

/** A small room, so the bounds on a report are easy to reach. */
function roomConfig(overrides: Partial<RoomConfig> = {}): RoomConfig {
  return {
    maxPlayers: 4,
    roomCodeLength: 4,
    roomCodeAlphabet: "ABCD",
    nickMaxLength: 6,
    emptyRoomTtlMinutes: 10,
    joinTimeoutSeconds: 5,
    maxPendingConnections: 8,
    maxStrayMessages: 2,
    awayTurnSeconds: 5,
    awaySlotSeconds: 60,
    messageLimits: {
      setting: { burst: 3, windowSeconds: 30 },
      signal: { burst: 20, windowSeconds: 10 },
      choice: { burst: 5, windowSeconds: 30 },
      other: { burst: 10, windowSeconds: 10 },
    },
    pingSeconds: 5,
    missedPings: 2,
    askAfterSeconds: 2,
    deadAfterSeconds: 2,
    reconnect: { firstMs: 100, jitterMs: 100, grow: 1.5, mostMs: 2000 },
    warmUpMs: 100,
    staleConnectionSeconds: 20,
    pokeSeconds: 15,
    turnSecondsChoices: [0, 20, 40],
    listedTurnSeconds: 20,
    ...overrides,
  };
}

/** Rooms one address may make: a few in a short while, and a few more in a long one. */
const MAKE_LIMITS = [
  { burst: 3, windowSeconds: 60 },
  { burst: 5, windowSeconds: 600 },
];
const SHORT_MS = MAKE_LIMITS[0].windowSeconds * 1000;
const LONG_MS = MAKE_LIMITS[1].windowSeconds * 1000;
/** The time the counts of rooms made are taken at, in ms since the epoch. */
const MAKING_AT = 1_800_000_000_000;

/** A short list and a short memory, so both limits are reached with a few entries. */
function directoryConfig(overrides: Partial<DirectoryConfig> = {}): DirectoryConfig {
  return {
    maxListed: 3,
    maxStored: 5,
    staleHours: 2,
    showLimit: { burst: 3, windowSeconds: 10 },
    makeLimits: MAKE_LIMITS,
    ...overrides,
  };
}

/** A game that is not the one a listing here is of unless it says so. */
const OTHER_GAME: GameId = "count-rectangles";

/** A game that takes fewer players than the largest room holds. */
const SMALL_GAME: GameId = "russian-roulette";

const HOUR = 3_600_000;
/** An arbitrary moment the tests call "now". */
const NOW = 50 * HOUR;

/** A listing of a room waiting with one player, changed by `overrides`. */
function listing(code: string, overrides: Partial<RoomListing> = {}): RoomListing {
  return { code, game: DEFAULT_GAME, host: "ann", players: 1, maxPlayers: 4, playing: false, ...overrides };
}

/** An entry heard from just now, changed by `overrides`. */
function entry(code: string, overrides: Partial<RoomListing> = {}, updatedAt = NOW): DirectoryEntry {
  return { listing: listing(code, overrides), updatedAt };
}

describe("parseReport", () => {
  it("accepts a well-formed listing", () => {
    const report = { code: "ABCD", listing: listing("ABCD", { players: 3, playing: true }) };

    const parsed = parseReport(report, roomConfig());

    expect(parsed).toEqual(report);
  });

  it("accepts a room taking itself off the list", () => {
    const parsed = parseReport({ code: "ABCD", listing: null }, roomConfig());

    expect(parsed).toEqual({ code: "ABCD", listing: null });
  });

  it("keeps only the fields of a listing", () => {
    const report = { code: "ABCD", listing: { ...listing("ABCD"), token: "secret", extra: 1 }, more: true };

    const parsed = parseReport(report, roomConfig());

    expect(parsed).toEqual({ code: "ABCD", listing: listing("ABCD") });
  });

  it("cleans the host's name like any nickname", () => {
    const report = { code: "ABCD", listing: listing("ABCD", { host: "  a   very long name  " }) };

    const parsed = parseReport(report, roomConfig());

    expect(parsed?.listing?.host).toBe("a very");
  });

  it.each([
    ["no code", { listing: null }],
    ["a code of the wrong length", { code: "ABC", listing: null }],
    ["a code with a character outside the alphabet", { code: "ABCZ", listing: null }],
    ["no listing at all", { code: "ABCD" }],
    ["a listing for another room", { code: "ABCD", listing: listing("ABCA") }],
    ["a game nobody has heard of", { code: "ABCD", listing: { ...listing("ABCD"), game: "tiddlywinks" } }],
    ["no game", { code: "ABCD", listing: { ...listing("ABCD"), game: undefined } }],
    ["a host that is not text", { code: "ABCD", listing: { ...listing("ABCD"), host: 7 } }],
    ["an empty host", { code: "ABCD", listing: listing("ABCD", { host: "   " }) }],
    ["nobody connected", { code: "ABCD", listing: listing("ABCD", { players: 0 }) }],
    ["more players than the room holds", { code: "ABCD", listing: listing("ABCD", { players: 5 }) }],
    ["a room larger than any room", { code: "ABCD", listing: listing("ABCD", { maxPlayers: 5 }) }],
    ["a count that is not whole", { code: "ABCD", listing: listing("ABCD", { players: 1.5 }) }],
    ["a count that is not a number", { code: "ABCD", listing: { ...listing("ABCD"), players: "2" } }],
    ["a playing mark that is not yes or no", { code: "ABCD", listing: { ...listing("ABCD"), playing: "no" } }],
    ["text", "ABCD"],
    ["nothing", null],
  ])("refuses a report with %s", (_what, report) => {
    expect(parseReport(report, roomConfig())).toBeNull();
  });

  it("refuses a report of a room larger than its game takes, where a room may hold more", () => {
    const most = GAMES[SMALL_GAME].maxPlayers;
    const report = { code: "ABCD", listing: listing("ABCD", { game: SMALL_GAME, maxPlayers: most + 1 }) };

    expect(parseReport(report, roomConfig({ maxPlayers: most + 2 }))).toBeNull();
  });

  it("accepts a room as large as its game takes, where a room may hold more", () => {
    const most = GAMES[SMALL_GAME].maxPlayers;
    const report = { code: "ABCD", listing: listing("ABCD", { game: SMALL_GAME, players: most, maxPlayers: most }) };

    const parsed = parseReport(report, roomConfig({ maxPlayers: most + 2 }));

    expect(parsed).toEqual(report);
  });
});

/** A well-formed token that is different for each `n`. */
function tokenFor(n: number): string {
  return `player-token-${String(n).padStart(4, "0")}`;
}

/** A room on the list holding players 0..count-1, named p0, p1, … */
function listedRoom(count: number, config: RoomConfig, listed = true): LobbyState {
  let state = createLobby(DEFAULT_GAME, listed);
  for (let n = 0; n < count; n++) {
    const result = joinLobby(state, { token: tokenFor(n), nick: `p${n}` }, config);
    if (!result.ok) throw new Error(`fixture join ${n} refused: ${result.reason}`);
    state = result.state;
  }
  return state;
}

describe("listingOf", () => {
  it("lists a room on the list with its game, its host and how many are connected", () => {
    const config = roomConfig();

    const listed = listingOf("ABCD", listedRoom(3, config), new Set([0, 1, 2]), false, config);

    expect(listed).toEqual({
      code: "ABCD",
      game: DEFAULT_GAME,
      host: "p0",
      players: 3,
      maxPlayers: Math.min(config.maxPlayers, GAMES[DEFAULT_GAME].maxPlayers),
      playing: false,
    });
  });

  it("does not list a room reached by its code alone", () => {
    const config = roomConfig();

    expect(listingOf("ABCD", listedRoom(2, config, false), new Set([0, 1]), false, config)).toBeNull();
  });

  it("does not list a room stored before rooms could be listed", () => {
    const config = roomConfig();
    const old: LobbyState = { players: listedRoom(1, config).players };

    expect(listingOf("ABCD", old, new Set([0]), false, config)).toBeNull();
  });

  it("does not list a room nobody is connected to", () => {
    const config = roomConfig();

    expect(listingOf("ABCD", listedRoom(2, config), new Set(), false, config)).toBeNull();
  });

  it("counts only the players who are connected", () => {
    const config = roomConfig();

    const listed = listingOf("ABCD", listedRoom(3, config), new Set([1, 2]), false, config);

    expect(listed?.players).toBe(2);
  });

  it("names as host the connected player who came into the room first", () => {
    const config = roomConfig();

    const listed = listingOf("ABCD", listedRoom(3, config), new Set([2, 1]), false, config);

    expect(listed?.host).toBe("p1");
  });

  it("does not name as host a latecomer who took a lower slot", () => {
    const config = roomConfig();
    // p0 leaves, and a newcomer takes the slot p0 held
    const without = leaveLobby(listedRoom(3, config), tokenFor(0));
    const joined = joinLobby(without, { token: tokenFor(9), nick: "new" }, config);
    if (!joined.ok) throw new Error("fixture join refused");

    const listed = listingOf("ABCD", joined.state, new Set([0, 1, 2]), false, config);

    expect(joined.slot).toBe(0);
    expect(listed?.host).toBe("p1");
  });

  it("says when a game is being played", () => {
    const config = roomConfig();

    const listed = listingOf("ABCD", listedRoom(1, config), new Set([0]), true, config);

    expect(listed?.playing).toBe(true);
  });

  it("gives a listing its own report accepts", () => {
    const config = roomConfig();
    const listed = listingOf("ABCD", listedRoom(2, config), new Set([0, 1]), true, config);

    const parsed = parseReport({ code: "ABCD", listing: listed }, config);

    expect(parsed).toEqual({ code: "ABCD", listing: listed });
  });
});

describe("isStale", () => {
  it("keeps an entry heard from within the limit", () => {
    const config = directoryConfig();

    expect(isStale(NOW - config.staleHours * HOUR, NOW, config)).toBe(false);
  });

  it("drops an entry not heard from for longer than the limit", () => {
    const config = directoryConfig();

    expect(isStale(NOW - config.staleHours * HOUR - 1, NOW, config)).toBe(true);
  });
});

describe("beyondLimit", () => {
  /** A directory of `count` rooms, the first heard from longest ago. */
  function directory(count: number): Map<string, DirectoryEntry> {
    const codes = ["AAAA", "BBBB", "CCCC", "DDDD", "AAAB", "AAAC", "AAAD", "BBBA"].slice(0, count);
    return new Map(codes.map((code, n) => [code, entry(code, {}, NOW - (count - n) * 1000)]));
  }

  it("drops nothing while the directory is within its limit", () => {
    const config = directoryConfig();

    expect(beyondLimit(directory(config.maxStored), config)).toEqual([]);
    expect(beyondLimit(new Map(), config)).toEqual([]);
  });

  it("drops the rooms heard from longest ago, as many as are over the limit", () => {
    const config = directoryConfig();

    expect(beyondLimit(directory(config.maxStored + 2), config)).toEqual(["AAAA", "BBBB"]);
  });

  it("goes by when a room was heard from, not by where it stands in the directory", () => {
    const config = directoryConfig({ maxStored: 1 });
    const entries = new Map([
      ["AAAA", entry("AAAA", {}, NOW)],
      ["BBBB", entry("BBBB", {}, NOW - 5000)],
    ]);

    expect(beyondLimit(entries, config)).toEqual(["BBBB"]);
  });
});

describe("listRooms", () => {
  it("lists nothing when no room has reported", () => {
    expect(listRooms([], NOW, directoryConfig())).toEqual([]);
  });

  it("puts a room waiting for players before a room in a game", () => {
    const entries = [entry("AAAA", { playing: true, players: 4 }), entry("BBBB", { players: 1 })];

    const rooms = listRooms(entries, NOW, directoryConfig());

    expect(rooms.map((room) => room.code)).toEqual(["BBBB", "AAAA"]);
  });

  it("puts a room with a free place before a full one", () => {
    const entries = [entry("AAAA", { players: 4 }), entry("BBBB", { players: 2 })];

    const rooms = listRooms(entries, NOW, directoryConfig());

    expect(rooms.map((room) => room.code)).toEqual(["BBBB", "AAAA"]);
  });

  it("puts the fuller of two waiting rooms first", () => {
    const entries = [entry("AAAA", { players: 1 }), entry("BBBB", { players: 3 }), entry("CCCC", { players: 2 })];

    const rooms = listRooms(entries, NOW, directoryConfig());

    expect(rooms.map((room) => room.code)).toEqual(["BBBB", "CCCC", "AAAA"]);
  });

  it("puts the room heard from last first among equals", () => {
    const entries = [entry("AAAA", {}, NOW - 2000), entry("BBBB", {}, NOW - 1000)];

    const rooms = listRooms(entries, NOW, directoryConfig());

    expect(rooms.map((room) => room.code)).toEqual(["BBBB", "AAAA"]);
  });

  it("leaves out an entry too old to trust", () => {
    const config = directoryConfig();
    const entries = [entry("AAAA", {}, NOW - config.staleHours * HOUR - 1), entry("BBBB")];

    const rooms = listRooms(entries, NOW, config);

    expect(rooms.map((room) => room.code)).toEqual(["BBBB"]);
  });

  it("shows no more rooms than the list holds, keeping the best to join", () => {
    const config = directoryConfig();
    const entries = [
      entry("AAAA", { playing: true }),
      entry("BBBB", { players: 3 }),
      entry("CCCC", { players: 2 }),
      entry("DDDD", { players: 1 }),
    ];

    const rooms = listRooms(entries, NOW, config);

    expect(rooms).toHaveLength(config.maxListed);
    expect(rooms.map((room) => room.code)).toEqual(["BBBB", "CCCC", "DDDD"]);
  });

  it("gives the same order however the entries arrive", () => {
    const entries = [entry("AAAA"), entry("BBBB"), entry("CCCC")];

    const forward = listRooms(entries, NOW, directoryConfig());
    const backward = listRooms([...entries].reverse(), NOW, directoryConfig());

    expect(backward).toEqual(forward);
  });

  it("does not change the entries it was given", () => {
    const entries = [entry("BBBB", { players: 1 }), entry("AAAA", { players: 3 })];
    const before = JSON.stringify(entries);

    listRooms(entries, NOW, directoryConfig());

    expect(JSON.stringify(entries)).toBe(before);
  });

  it("shows the rooms of every game to someone who asked for none in particular", () => {
    const entries = [entry("AAAA", { game: OTHER_GAME }), entry("BBBB")];

    const rooms = listRooms(entries, NOW, directoryConfig(), null);

    expect(rooms.map((room) => room.code).sort()).toEqual(["AAAA", "BBBB"]);
  });

  it("shows only the rooms of the game asked for", () => {
    const entries = [entry("AAAA", { game: OTHER_GAME }), entry("BBBB"), entry("CCCC", { game: OTHER_GAME, players: 2 })];

    const rooms = listRooms(entries, NOW, directoryConfig(), OTHER_GAME);

    expect(rooms.map((room) => room.code)).toEqual(["CCCC", "AAAA"]);
  });

  it("shows a game's rooms that the list of every game had no room for", () => {
    const config = directoryConfig();
    const entries = [
      entry("AAAA", { players: 3 }),
      entry("BBBB", { players: 3 }),
      entry("CCCC", { players: 3 }),
      entry("DDDD", { game: OTHER_GAME, playing: true }),
    ];

    const all = listRooms(entries, NOW, config);
    const ofGame = listRooms(entries, NOW, config, OTHER_GAME);

    expect(all.map((room) => room.code)).not.toContain("DDDD");
    expect(ofGame.map((room) => room.code)).toEqual(["DDDD"]);
  });

  it("shows no more rooms of one game than the list holds", () => {
    const config = directoryConfig();
    const entries = ["AAAA", "BBBB", "CCCC", "DDDD"].map((code) => entry(code, { game: OTHER_GAME }));

    expect(listRooms(entries, NOW, config, OTHER_GAME)).toHaveLength(config.maxListed);
  });
});

describe("countRooms", () => {
  it("counts no rooms when none has reported", () => {
    expect(countRooms([], NOW, directoryConfig())).toEqual({});
  });

  it("counts the rooms of each game, leaving out a game with none", () => {
    const entries = [entry("AAAA"), entry("BBBB", { game: OTHER_GAME }), entry("CCCC")];

    expect(countRooms(entries, NOW, directoryConfig())).toEqual({ [DEFAULT_GAME]: 2, [OTHER_GAME]: 1 });
  });

  it("counts the rooms the list has no room to show", () => {
    const config = directoryConfig();
    const entries = ["AAAA", "BBBB", "CCCC", "DDDD", "AAAB"].map((code) => entry(code));

    expect(countRooms(entries, NOW, config)).toEqual({ [DEFAULT_GAME]: config.maxListed + 2 });
  });

  it("counts full rooms and rooms in a game: they are on the list too", () => {
    const entries = [entry("AAAA", { players: 4 }), entry("BBBB", { playing: true })];

    expect(countRooms(entries, NOW, directoryConfig())).toEqual({ [DEFAULT_GAME]: 2 });
  });

  it("does not count an entry too old to trust", () => {
    const config = directoryConfig();
    const entries = [entry("AAAA", {}, NOW - config.staleHours * HOUR - 1), entry("BBBB")];

    expect(countRooms(entries, NOW, config)).toEqual({ [DEFAULT_GAME]: 1 });
  });
});

describe("quickPicks", () => {
  it("tries the rooms waiting for players with a place free, in the order the list has them", () => {
    const rooms = [listing("AAAA", { players: 3 }), listing("BBBB", { players: 1 }), listing("CCCC", { players: 2 })];

    expect(quickPicks(rooms)).toEqual(["AAAA", "BBBB", "CCCC"]);
  });

  it("leaves out a room that is full and a room in a game", () => {
    const rooms = [listing("AAAA", { players: 4, maxPlayers: 4 }), listing("BBBB", { playing: true }), listing("CCCC")];

    expect(quickPicks(rooms)).toEqual(["CCCC"]);
  });

  it("has nothing to try when no room is waiting", () => {
    expect(quickPicks([])).toEqual([]);
    expect(quickPicks([listing("AAAA", { playing: true })])).toEqual([]);
  });
});

describe("roomsShown", () => {
  it("shows every room it was sent to someone looking at every game", () => {
    const rooms = [listing("AAAA"), listing("BBBB", { game: OTHER_GAME })];

    const shown = roomsShown(rooms, { [DEFAULT_GAME]: 1, [OTHER_GAME]: 1 }, null);

    expect(shown.rooms.map((room) => room.code)).toEqual(["AAAA", "BBBB"]);
    expect(shown.total).toBe(2);
    expect(shown.more).toBe(0);
  });

  it("shows only the rooms of the game picked, in the order sent", () => {
    const rooms = [listing("AAAA", { game: OTHER_GAME }), listing("BBBB"), listing("CCCC", { game: OTHER_GAME })];

    const shown = roomsShown(rooms, { [DEFAULT_GAME]: 1, [OTHER_GAME]: 2 }, OTHER_GAME);

    expect(shown.rooms.map((room) => room.code)).toEqual(["AAAA", "CCCC"]);
    expect(shown.total).toBe(2);
    expect(shown.more).toBe(0);
  });

  it("says how many rooms there are that it was not sent", () => {
    const rooms = [listing("AAAA"), listing("BBBB", { game: OTHER_GAME })];

    const shown = roomsShown(rooms, { [DEFAULT_GAME]: 30, [OTHER_GAME]: 12 }, null);

    expect(shown.total).toBe(42);
    expect(shown.more).toBe(40);
  });

  it("says how many rooms of the game picked it was not sent", () => {
    const rooms = [listing("AAAA"), listing("BBBB", { game: OTHER_GAME })];

    const shown = roomsShown(rooms, { [DEFAULT_GAME]: 30, [OTHER_GAME]: 12 }, OTHER_GAME);

    expect(shown.total).toBe(12);
    expect(shown.more).toBe(11);
  });

  it("gives the count of every game, none for a game without rooms", () => {
    const shown = roomsShown([listing("AAAA")], { [DEFAULT_GAME]: 1 }, null);

    expect(shown.counts[DEFAULT_GAME]).toBe(1);
    expect(shown.counts[OTHER_GAME]).toBe(0);
    expect(Object.keys(shown.counts).sort()).toEqual([...GAME_IDS].sort());
  });

  it("counts the rooms it was sent when the directory sent no counts", () => {
    const rooms = [listing("AAAA"), listing("BBBB", { game: OTHER_GAME }), listing("CCCC")];

    const shown = roomsShown(rooms, undefined, DEFAULT_GAME);

    expect(shown.counts[DEFAULT_GAME]).toBe(2);
    expect(shown.counts[OTHER_GAME]).toBe(1);
    expect(shown.total).toBe(2);
    expect(shown.more).toBe(0);
  });

  it("leaves out a room and a count of a game it has not heard of", () => {
    const rooms = [listing("AAAA"), { ...listing("BBBB"), game: "a-newer-game" as GameId }];

    const shown = roomsShown(rooms, { [DEFAULT_GAME]: 1, ["a-newer-game" as GameId]: 5 }, null);

    expect(shown.rooms.map((room) => room.code)).toEqual(["AAAA"]);
    expect(shown.total).toBe(1);
    expect(shown.more).toBe(0);
  });

  it("never counts fewer rooms of a game than it shows", () => {
    const rooms = [listing("AAAA"), listing("BBBB")];

    const shown = roomsShown(rooms, { [DEFAULT_GAME]: 1 }, null);

    expect(shown.total).toBe(2);
    expect(shown.more).toBe(0);
  });

  it("takes a count that is not a whole number of rooms for none", () => {
    const counts = { [DEFAULT_GAME]: -3, [OTHER_GAME]: 1.5 };

    const shown = roomsShown([], counts, null);

    expect(shown.total).toBe(0);
    expect(shown.more).toBe(0);
  });
});

describe("mayMakeAnother", () => {
  /** Rooms made so many ms before `MAKING_AT`. */
  const madeAgo = (...ago: number[]): number[] => ago.map((ms) => MAKING_AT - ms);

  it("lets an address that has made none make one", () => {
    expect(mayMakeAnother([], MAKING_AT, MAKE_LIMITS)).toBe(true);
  });

  it("lets an address make as many in the short while as the limit says, and not one more", () => {
    expect(mayMakeAnother(madeAgo(3, 2), MAKING_AT, MAKE_LIMITS)).toBe(true);
    expect(mayMakeAnother(madeAgo(3, 2, 1), MAKING_AT, MAKE_LIMITS)).toBe(false);
  });

  it("counts a room no longer once the short while has passed since it was made", () => {
    expect(mayMakeAnother(madeAgo(SHORT_MS - 1, 2, 1), MAKING_AT, MAKE_LIMITS)).toBe(false);
    expect(mayMakeAnother(madeAgo(SHORT_MS, 2, 1), MAKING_AT, MAKE_LIMITS)).toBe(true);
  });

  it("holds an address that keeps under the short limit to the long one", () => {
    const spread = madeAgo(5 * SHORT_MS, 4 * SHORT_MS, 3 * SHORT_MS, 2 * SHORT_MS, SHORT_MS);

    expect(mayMakeAnother(spread.slice(1), MAKING_AT, MAKE_LIMITS)).toBe(true);
    expect(mayMakeAnother(spread, MAKING_AT, MAKE_LIMITS)).toBe(false);
  });

  it("counts a room no longer once the long while has passed since it was made", () => {
    const spread = madeAgo(LONG_MS, 4 * SHORT_MS, 3 * SHORT_MS, 2 * SHORT_MS, SHORT_MS);

    expect(mayMakeAnother(spread, MAKING_AT, MAKE_LIMITS)).toBe(true);
  });

  it("counts a room said to be made after now, as a clock set back would have it", () => {
    expect(mayMakeAnother(madeAgo(-5, -4, -3), MAKING_AT, MAKE_LIMITS)).toBe(false);
  });

  it("keeps no limit where none is set", () => {
    expect(mayMakeAnother(madeAgo(3, 2, 1), MAKING_AT, [])).toBe(true);
  });
});
