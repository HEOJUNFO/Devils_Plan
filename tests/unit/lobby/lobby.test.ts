import { describe, expect, it } from "vitest";
import {
  createLobby,
  generateRoomCode,
  isValidRoomCode,
  isValidToken,
  joinLobby,
  leaveLobby,
  normalizeNick,
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
