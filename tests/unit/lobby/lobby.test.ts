import { describe, expect, it } from "vitest";
import { DEFAULT_GAME } from "../../../src/shared/games";
import {
  awayPlayers,
  createLobby,
  dropLapsed,
  gameOf,
  generateRoomCode,
  isValidRoomCode,
  isValidToken,
  joinLobby,
  leaveLobby,
  markAway,
  normalizeNick,
  setListed,
  setTurnSeconds,
  slotLapsesAt,
  turnSecondsOf,
  viewLobby,
  type LobbyState,
  type RoomConfig,
} from "../../../src/shared/lobby";

/** A small room so the "full" boundary is reached in three joins. */
function testConfig(overrides: Partial<RoomConfig> = {}): RoomConfig {
  return {
    maxPlayers: 3,
    roomCodeLength: 4,
    roomCodeAlphabet: "ABCD",
    nickMaxLength: 6,
    emptyRoomTtlMinutes: 10,
    joinTimeoutSeconds: 5,
    awayTurnSeconds: 5,
    awaySlotSeconds: 60,
    messageWindowSeconds: 10,
    messageLimits: { setting: 3, signal: 20, other: 10 },
    pingSeconds: 5,
    staleConnectionSeconds: 20,
    pokeSeconds: 15,
    turnSecondsChoices: [0, 20, 40],
    listedTurnSeconds: 20,
    ...overrides,
  };
}

/** A well-formed token that is different for each `n`. */
function tokenFor(n: number): string {
  return `player-token-${String(n).padStart(4, "0")}`;
}

/** A lobby holding players 0..count-1, joined in order. */
function lobbyWith(count: number, config: RoomConfig): LobbyState {
  let state = createLobby();
  for (let n = 0; n < count; n++) {
    const result = joinLobby(state, { token: tokenFor(n), nick: `p${n}` }, config);
    if (!result.ok) throw new Error(`fixture join ${n} refused: ${result.reason}`);
    state = result.state;
  }
  return state;
}

describe("joinLobby", () => {
  it("gives the first player slot 0", () => {
    const config = testConfig();

    const result = joinLobby(createLobby(), { token: tokenFor(0), nick: "ann" }, config);

    expect(result).toMatchObject({ ok: true, slot: 0, rejoined: false });
  });

  it("gives each new player the next slot", () => {
    const config = testConfig();
    const state = lobbyWith(2, config);

    const result = joinLobby(state, { token: tokenFor(2), nick: "cat" }, config);

    expect(result).toMatchObject({ ok: true, slot: 2, rejoined: false });
  });

  it("refuses a player when every slot is taken", () => {
    const config = testConfig();
    const state = lobbyWith(config.maxPlayers, config);

    const result = joinLobby(state, { token: tokenFor(99), nick: "late" }, config);

    expect(result).toEqual({ ok: false, reason: "full" });
  });

  it("returns a known token to the slot it already holds", () => {
    const config = testConfig();
    const state = lobbyWith(3, config);

    const result = joinLobby(state, { token: tokenFor(1), nick: "p1" }, config);

    expect(result).toMatchObject({ ok: true, slot: 1, rejoined: true });
  });

  it("lets a returning player back into a full room", () => {
    const config = testConfig();
    const state = lobbyWith(config.maxPlayers, config);

    const result = joinLobby(state, { token: tokenFor(0), nick: "p0" }, config);

    expect(result.ok).toBe(true);
  });

  it("takes the new nickname when a player rejoins", () => {
    const config = testConfig();
    const state = lobbyWith(2, config);

    const result = joinLobby(state, { token: tokenFor(1), nick: "renamed-too-long" }, config);

    if (!result.ok) throw new Error("rejoin refused");
    expect(result.state.players.map((p) => p.nick)).toEqual(["p0", "rename"]);
  });

  it("refuses a malformed token", () => {
    const result = joinLobby(createLobby(), { token: "short", nick: "ann" }, testConfig());

    expect(result).toEqual({ ok: false, reason: "bad-token" });
  });

  it("refuses a blank nickname", () => {
    const result = joinLobby(createLobby(), { token: tokenFor(0), nick: "   " }, testConfig());

    expect(result).toEqual({ ok: false, reason: "bad-nick" });
  });

  it("leaves the state it was given untouched", () => {
    const config = testConfig();
    const state = lobbyWith(1, config);
    const before = structuredClone(state);

    joinLobby(state, { token: tokenFor(1), nick: "bob" }, config);

    expect(state).toEqual(before);
  });
});

describe("leaveLobby", () => {
  it("frees the leaver's slot for the next player", () => {
    const config = testConfig();
    const state = leaveLobby(lobbyWith(3, config), tokenFor(1));

    const result = joinLobby(state, { token: tokenFor(7), nick: "new" }, config);

    expect(result).toMatchObject({ ok: true, slot: 1 });
  });

  it("keeps the other players in their slots", () => {
    const config = testConfig();

    const state = leaveLobby(lobbyWith(3, config), tokenFor(0));

    expect(state.players.map((p) => p.slot)).toEqual([1, 2]);
  });

  it("changes nothing for a token that is not in the lobby", () => {
    const config = testConfig();
    const state = lobbyWith(2, config);

    expect(leaveLobby(state, tokenFor(50))).toBe(state);
  });
});

describe("viewLobby", () => {
  it("never includes a token", () => {
    const config = testConfig();
    const state = lobbyWith(3, config);

    const view = viewLobby(state, new Set([0, 1, 2]), 0, config);

    expect(JSON.stringify(view)).not.toContain("player-token");
  });

  it("marks only the connected slots as connected", () => {
    const config = testConfig();
    const state = lobbyWith(3, config);

    const view = viewLobby(state, new Set([0, 2]), 2, config);

    expect(view.players.map((p) => p.connected)).toEqual([true, false, true]);
  });

  it("tells the viewer which slot is theirs and how many the room holds", () => {
    const config = testConfig();

    const view = viewLobby(lobbyWith(2, config), new Set([1]), 1, config);

    expect(view).toMatchObject({ you: 1, maxPlayers: config.maxPlayers });
  });

  it("says which game the room is for and whether it is on the list", () => {
    const config = testConfig();
    const joined = joinLobby(createLobby(DEFAULT_GAME, true), { token: tokenFor(0), nick: "ann" }, config);
    if (!joined.ok) throw new Error("fixture join refused");

    const view = viewLobby(joined.state, new Set([0]), 0, config);

    expect(view).toMatchObject({ game: DEFAULT_GAME, listed: true });
  });

  it("shows a room stored before rooms had a game or a listing as the first game, off the list", () => {
    const config = testConfig();
    const old: LobbyState = { players: lobbyWith(1, config).players };

    const view = viewLobby(old, new Set([0]), 0, config);

    expect(view).toMatchObject({ game: DEFAULT_GAME, listed: false });
  });

  it("never says when a player went away", () => {
    const config = testConfig();
    const state = markAway(lobbyWith(2, config), new Set([0]), NOW);

    const view = viewLobby(state, new Set([0]), 0, config);

    expect(JSON.stringify(view)).not.toContain("awaySince");
  });
});

/** An arbitrary moment the tests call "now", in ms. */
const NOW = 1_000_000;

describe("a new lobby", () => {
  it("is off the list unless asked to be on it", () => {
    expect(createLobby().listed).toBe(false);
    expect(createLobby(DEFAULT_GAME, true).listed).toBe(true);
  });

  it("is for the game it was made for", () => {
    expect(gameOf(createLobby(DEFAULT_GAME))).toBe(DEFAULT_GAME);
  });

  it("keeps its game and its listing as players come and go", () => {
    const config = testConfig();
    let state = createLobby(DEFAULT_GAME, true);

    const joined = joinLobby(state, { token: tokenFor(0), nick: "ann" }, config);
    if (!joined.ok) throw new Error("fixture join refused");
    state = leaveLobby(joined.state, tokenFor(0));

    expect(joined.state).toMatchObject({ game: DEFAULT_GAME, listed: true });
    expect(state).toMatchObject({ game: DEFAULT_GAME, listed: true, players: [] });
  });
});

describe("the length of a turn", () => {
  it("has no limit in a room reached by its code alone, as the game is documented", () => {
    expect(turnSecondsOf(createLobby(DEFAULT_GAME, false, testConfig()))).toBe(0);
  });

  it("starts at the limit rooms on the list have, in a room on the list", () => {
    const config = testConfig();

    expect(turnSecondsOf(createLobby(DEFAULT_GAME, true, config))).toBe(config.listedTurnSeconds);
  });

  it("has no limit in a room stored before rooms had one", () => {
    const config = testConfig();
    const old: LobbyState = { players: lobbyWith(1, config).players };

    expect(turnSecondsOf(old)).toBe(0);
    expect(viewLobby(old, new Set([0]), 0, config).turnSeconds).toBe(0);
  });

  it("can be set to any of the lengths the room offers", () => {
    const config = testConfig();
    const state = lobbyWith(1, config);

    for (const seconds of config.turnSecondsChoices) {
      const next = setTurnSeconds(state, seconds, config);
      expect(next === null ? null : turnSecondsOf(next)).toBe(seconds);
    }
  });

  it.each([["a length between the choices", 30], ["a negative length", -20], ["a fraction", 20.5], ["not a number", Number.NaN]])(
    "cannot be set to %s",
    (_what, seconds) => {
      const config = testConfig();

      expect(setTurnSeconds(lobbyWith(1, config), seconds, config)).toBeNull();
    },
  );

  it("changes nothing when it is already so", () => {
    const config = testConfig();
    const state = createLobby(DEFAULT_GAME, true, config);

    expect(setTurnSeconds(state, config.listedTurnSeconds, config)).toBe(state);
  });

  it("is shown to everyone in the room", () => {
    const config = testConfig();
    const state = setTurnSeconds(lobbyWith(2, config), 40, config);
    if (state === null) throw new Error("fixture setting refused");

    expect(viewLobby(state, new Set([0, 1]), 1, config).turnSeconds).toBe(40);
  });

  it("stays as it is while players come and go", () => {
    const config = testConfig();
    const set = setTurnSeconds(lobbyWith(2, config), 40, config);
    if (set === null) throw new Error("fixture setting refused");

    const next = leaveLobby(set, tokenFor(1));

    expect(turnSecondsOf(next)).toBe(40);
  });
});

describe("setListed", () => {
  it("puts a room on the list and takes it off", () => {
    const config = testConfig();
    const state = lobbyWith(1, config);

    const on = setListed(state, true);
    const off = setListed(on, false);

    expect(on.listed).toBe(true);
    expect(off.listed).toBe(false);
    expect(off.players).toEqual(state.players);
  });

  it("changes nothing when the room already is as asked", () => {
    const state = createLobby(DEFAULT_GAME, true);

    expect(setListed(state, true)).toBe(state);
  });

  it("does not change the state it was given", () => {
    const state = createLobby(DEFAULT_GAME, false);

    setListed(state, true);

    expect(state.listed).toBe(false);
  });
});

describe("markAway", () => {
  it("notes when a player without a connection went away", () => {
    const config = testConfig();

    const state = markAway(lobbyWith(3, config), new Set([0, 2]), NOW);

    expect(state.players.map((p) => p.awaySince)).toEqual([undefined, NOW, undefined]);
  });

  it("keeps the first moment a player was found away", () => {
    const config = testConfig();
    const first = markAway(lobbyWith(2, config), new Set([0]), NOW);

    const later = markAway(first, new Set([0]), NOW + 5000);

    expect(later.players[1].awaySince).toBe(NOW);
  });

  it("forgets it once the player is connected again", () => {
    const config = testConfig();
    const away = markAway(lobbyWith(2, config), new Set([0]), NOW);

    const back = markAway(away, new Set([0, 1]), NOW + 5000);

    expect(back.players[1]).toEqual({ slot: 1, token: tokenFor(1), nick: "p1" });
  });

  it("changes nothing when everyone is as noted", () => {
    const config = testConfig();
    const state = markAway(lobbyWith(2, config), new Set([0]), NOW);

    expect(markAway(state, new Set([0]), NOW + 5000)).toBe(state);
  });

  it("does not change the state it was given", () => {
    const config = testConfig();
    const state = lobbyWith(2, config);
    const before = JSON.stringify(state);

    markAway(state, new Set(), NOW);

    expect(JSON.stringify(state)).toBe(before);
  });
});

describe("a player coming back", () => {
  it("is no longer away", () => {
    const config = testConfig();
    const away = markAway(lobbyWith(2, config), new Set([0]), NOW);

    const result = joinLobby(away, { token: tokenFor(1), nick: "p1" }, config);

    if (!result.ok) throw new Error("rejoin refused");
    expect(result.state.players[1]).toEqual({ slot: 1, token: tokenFor(1), nick: "p1" });
  });
});

describe("awayPlayers", () => {
  it("lists the players who are away, longest away first", () => {
    const config = testConfig();
    let state = markAway(lobbyWith(3, config), new Set([0, 1]), NOW + 2000);
    state = markAway(state, new Set([0]), NOW + 4000);

    const away = awayPlayers(state, () => false);

    expect(away.map((p) => p.slot)).toEqual([2, 1]);
  });

  it("leaves out a player whose slot something keeps", () => {
    const config = testConfig();
    const state = markAway(lobbyWith(3, config), new Set([0]), NOW);

    const away = awayPlayers(state, (token) => token === tokenFor(1));

    expect(away.map((p) => p.slot)).toEqual([2]);
  });

  it("lists nobody when everyone is connected", () => {
    const config = testConfig();

    expect(awayPlayers(lobbyWith(3, config), () => false)).toEqual([]);
  });
});

describe("dropLapsed", () => {
  it("keeps an away player whose time is not up", () => {
    const config = testConfig();
    const state = markAway(lobbyWith(2, config), new Set([0]), NOW);

    expect(dropLapsed(state, NOW + config.awaySlotSeconds * 1000 - 1, config, () => false)).toBe(state);
  });

  it("removes an away player the moment their time is up", () => {
    const config = testConfig();
    const state = markAway(lobbyWith(2, config), new Set([0]), NOW);
    const lapses = slotLapsesAt(state.players[1], config);

    const next = dropLapsed(state, lapses, config, () => false);

    expect(lapses).toBe(NOW + config.awaySlotSeconds * 1000);
    expect(next.players.map((p) => p.slot)).toEqual([0]);
  });

  it("removes only those whose time is up", () => {
    const config = testConfig();
    let state = markAway(lobbyWith(3, config), new Set([0, 1]), NOW);
    state = markAway(state, new Set([0]), NOW + 30_000);

    const next = dropLapsed(state, NOW + config.awaySlotSeconds * 1000, config, () => false);

    expect(next.players.map((p) => p.slot)).toEqual([0, 1]);
  });

  it("keeps a player whose slot something holds, however long they are away", () => {
    const config = testConfig();
    const state = markAway(lobbyWith(2, config), new Set([0]), NOW);

    const next = dropLapsed(state, NOW + config.awaySlotSeconds * 1000 * 100, config, (token) => token === tokenFor(1));

    expect(next).toBe(state);
  });

  it("never removes a player who is connected", () => {
    const config = testConfig();
    const state = lobbyWith(2, config);

    expect(dropLapsed(state, NOW + config.awaySlotSeconds * 1000 * 100, config, () => false)).toBe(state);
  });

  it("keeps the room's game and listing", () => {
    const config = testConfig();
    const joined = joinLobby(createLobby(DEFAULT_GAME, true), { token: tokenFor(0), nick: "ann" }, config);
    if (!joined.ok) throw new Error("fixture join refused");
    const state = markAway(joined.state, new Set(), NOW);

    const next = dropLapsed(state, NOW + config.awaySlotSeconds * 1000, config, () => false);

    expect(next).toEqual({ players: [], game: DEFAULT_GAME, listed: true, turnSeconds: 0 });
  });
});

describe("normalizeNick", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeNick("  a   b  ", testConfig())).toBe("a b");
  });

  it("cuts to the configured length by character, not by byte", () => {
    expect(normalizeNick("가나다라마바사아", testConfig({ nickMaxLength: 6 }))).toBe("가나다라마바");
  });

  it("returns null when nothing is left", () => {
    expect(normalizeNick(" \t\n ", testConfig())).toBeNull();
  });

  it("takes out characters that are not for showing", () => {
    expect(normalizeNick("a\u0000\u202eb", testConfig())).toBe("a b");
    expect(normalizeNick("\u202e\u0007", testConfig())).toBeNull();
  });
});

describe("room codes", () => {
  it("accepts a code of the right length and alphabet", () => {
    expect(isValidRoomCode("ABCD", testConfig())).toBe(true);
  });

  it("rejects a code of the wrong length", () => {
    expect(isValidRoomCode("ABC", testConfig())).toBe(false);
  });

  it("rejects a code with a character outside the alphabet", () => {
    expect(isValidRoomCode("ABCZ", testConfig())).toBe(false);
  });

  it("builds a code from the injected random source", () => {
    const config = testConfig();
    const rolls = [0, 0.25, 0.5, 0.75];
    let i = 0;

    const code = generateRoomCode(() => rolls[i++ % rolls.length]!, config);

    expect(code).toBe("ABCD");
  });

  it("stays inside the alphabet when the random source returns its upper bound", () => {
    const config = testConfig();

    const code = generateRoomCode(() => 1, config);

    expect(isValidRoomCode(code, config)).toBe(true);
  });
});

describe("isValidToken", () => {
  it("accepts 16 to 64 URL-safe characters", () => {
    expect(isValidToken(tokenFor(0))).toBe(true);
  });

  it("rejects characters that are not URL-safe", () => {
    expect(isValidToken("has spaces and !! symbols")).toBe(false);
  });
});
