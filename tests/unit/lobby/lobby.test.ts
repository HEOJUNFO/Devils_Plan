import { describe, expect, it } from "vitest";
import { DEFAULT_GAME, GAMES, type GameId } from "../../../src/shared/games";
import {
  awayPlayers,
  capacityOf,
  createLobby,
  dropLapsed,
  gameOf,
  generateRoomCode,
  hostOf,
  isValidRoomCode,
  isValidToken,
  joinLobby,
  leadersOf,
  leaveLobby,
  markAway,
  normalizeNick,
  setListed,
  setTeam,
  setTurnSeconds,
  setVariant,
  slotLapsesAt,
  teamsIn,
  turnSecondsOf,
  variantOf,
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

/** A game in which players may team up before the start, and one in which they may not. */
const TEAM_GAME: GameId = "count-rectangles";
const SOLO_GAME: GameId = "russian-roulette";
const TEAM_SIZE = GAMES[TEAM_GAME].teamSize;

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

  it("refuses a player when the room's game takes no more, though a room may hold more", () => {
    const most = GAMES[SOLO_GAME].maxPlayers;
    const config = testConfig({ maxPlayers: most + 2 });
    const state = roomOf(SOLO_GAME, most, config);

    const result = joinLobby(state, { token: tokenFor(99), nick: "late" }, config);

    expect(result).toEqual({ ok: false, reason: "full" });
  });

  it("takes the last player the room's game takes", () => {
    const most = GAMES[SOLO_GAME].maxPlayers;
    const config = testConfig({ maxPlayers: most + 2 });
    const state = roomOf(SOLO_GAME, most - 1, config);

    const result = joinLobby(state, { token: tokenFor(99), nick: "last" }, config);

    expect(result).toMatchObject({ ok: true, slot: most - 1 });
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

  it("marks who leads each team, of those connected", () => {
    const config = testConfig({ maxPlayers: TEAM_SIZE * 2 });
    let state = roomOf(TEAM_GAME, 3, config);
    state = setTeam(state, tokenFor(1), 1, config)!;
    state = setTeam(state, tokenFor(0), 1, config)!;

    const all = viewLobby(state, new Set([0, 1, 2]), 0, config);
    const without = viewLobby(state, new Set([0, 2]), 0, config);

    expect(all.players.map((player) => player.leads)).toEqual([false, true, false]);
    expect(without.players.map((player) => player.leads)).toEqual([true, false, false]);
  });

  it("says a room holds no more than its game takes", () => {
    const most = GAMES[SOLO_GAME].maxPlayers;
    const config = testConfig({ maxPlayers: most + 2 });

    const view = viewLobby(roomOf(SOLO_GAME, 1, config), new Set([0]), 0, config);

    expect(view.maxPlayers).toBe(most);
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

  it("has no limit in a room of a game that is not played in turns, on the list or not", () => {
    const config = testConfig();

    expect(GAMES[TEAM_GAME].turns).toBe(false);
    expect(turnSecondsOf(createLobby(TEAM_GAME, true, config))).toBe(0);
    expect(turnSecondsOf(createLobby(TEAM_GAME, false, config))).toBe(0);
  });

  it("cannot be given a limit in such a room, and can be told to have none", () => {
    const config = testConfig();
    const state = createLobby(TEAM_GAME, true, config);

    expect(setTurnSeconds(state, config.listedTurnSeconds, config)).toBeNull();
    expect(setTurnSeconds(state, 0, config)).toBe(state);
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

describe("how a room's games are played", () => {
  /** A game that can be played in more ways than one, and the ways. */
  const VARIED_GAME = "mystery-stock-market" as const;
  const [FIRST, SECOND] = GAMES[VARIED_GAME].variants.map((each) => each.id);

  it("is the first of the game's ways in a new room", () => {
    expect(GAMES[VARIED_GAME].variants.length).toBeGreaterThan(1);
    expect(variantOf(createLobby(VARIED_GAME, false, testConfig()))).toBe(FIRST);
    expect(variantOf(createLobby(VARIED_GAME, true, testConfig()))).toBe(FIRST);
  });

  it("is none in a room of a game that is played one way only, and cannot be set there", () => {
    const state = createLobby(DEFAULT_GAME, false, testConfig());

    expect(GAMES[DEFAULT_GAME].variants).toEqual([]);
    expect(variantOf(state)).toBeNull();
    expect(setVariant(state, FIRST)).toBeNull();
  });

  it("can be set to any of the game's ways, and back", () => {
    const state = createLobby(VARIED_GAME, false, testConfig());

    const set = setVariant(state, SECOND);
    if (set === null) throw new Error("fixture setting refused");

    expect(variantOf(set)).toBe(SECOND);
    expect(variantOf(state)).toBe(FIRST);
    const back = setVariant(set, FIRST);
    expect(back === null ? null : variantOf(back)).toBe(FIRST);
  });

  it.each(["", "Show", "no-such-way"])("cannot be set to %j, which the game does not have", (variant) => {
    expect(setVariant(createLobby(VARIED_GAME, false, testConfig()), variant)).toBeNull();
  });

  it("changes nothing when it is already so", () => {
    const state = createLobby(VARIED_GAME, false, testConfig());
    const set = setVariant(state, SECOND);
    if (set === null) throw new Error("fixture setting refused");

    expect(setVariant(state, FIRST)).toBe(state);
    expect(setVariant(set, SECOND)).toBe(set);
  });

  it("is the game's first way in a room stored with one the game no longer has", () => {
    const old: LobbyState = { ...createLobby(VARIED_GAME, false, testConfig()), variant: "gone" };

    expect(variantOf(old)).toBe(FIRST);
  });

  it("is shown to everyone in the room, and as none where the game has one way only", () => {
    const config = testConfig();
    const joined = joinLobby(createLobby(VARIED_GAME, false, config), { token: tokenFor(0), nick: "p0" }, config);
    if (!joined.ok) throw new Error("fixture join refused");
    const set = setVariant(joined.state, SECOND);
    if (set === null) throw new Error("fixture setting refused");

    expect(viewLobby(joined.state, new Set([0]), 0, config).variant).toBe(FIRST);
    expect(viewLobby(set, new Set([0]), 0, config).variant).toBe(SECOND);
    expect(viewLobby(lobbyWith(1, config), new Set([0]), 0, config).variant).toBeNull();
  });

  it("stays as it is while players come and go", () => {
    const config = testConfig();
    const joined = joinLobby(createLobby(VARIED_GAME, false, config), { token: tokenFor(0), nick: "p0" }, config);
    if (!joined.ok) throw new Error("fixture join refused");
    const set = setVariant(joined.state, SECOND);
    if (set === null) throw new Error("fixture setting refused");

    expect(variantOf(leaveLobby(set, tokenFor(0)))).toBe(SECOND);
  });
});

describe("hostOf", () => {
  it("is the player who came into the room first, of those connected", () => {
    const config = testConfig();
    const state = lobbyWith(3, config);

    expect(hostOf(state, new Set([0, 1, 2]))?.slot).toBe(0);
    expect(hostOf(state, new Set([1, 2]))?.slot).toBe(1);
    expect(hostOf(state, new Set([2]))?.slot).toBe(2);
  });

  it("is nobody when nobody is connected", () => {
    const config = testConfig();

    expect(hostOf(lobbyWith(2, config), new Set())).toBeUndefined();
  });

  it("is not a latecomer who took the slot an earlier player left", () => {
    const config = testConfig();
    const without = leaveLobby(lobbyWith(3, config), tokenFor(0));
    const joined = joinLobby(without, { token: tokenFor(7), nick: "new" }, config);
    if (!joined.ok) throw new Error("fixture join refused");

    expect(joined.slot).toBe(0);
    expect(hostOf(joined.state, new Set([0, 1, 2]))?.slot).toBe(1);
    expect(viewLobby(joined.state, new Set([0, 1, 2]), 0, config).host).toBe(1);
  });

  it("stays the same player when they go away and come back", () => {
    const config = testConfig();
    const away = markAway(lobbyWith(2, config), new Set([1]), NOW);
    const back = joinLobby(away, { token: tokenFor(0), nick: "p0" }, config);
    if (!back.ok) throw new Error("fixture rejoin refused");

    expect(hostOf(away, new Set([1]))?.slot).toBe(1);
    expect(hostOf(back.state, new Set([0, 1]))?.slot).toBe(0);
  });

  it("goes by slot for players stored before the order of coming was kept", () => {
    const old: LobbyState = {
      players: [
        { slot: 0, token: tokenFor(0), nick: "p0" },
        { slot: 2, token: tokenFor(2), nick: "p2" },
      ],
    };

    expect(hostOf(old, new Set([0, 2]))?.slot).toBe(0);
    expect(hostOf(old, new Set([2]))?.slot).toBe(2);
  });

  it("gives someone who comes into such a room a later place than everyone already there", () => {
    const config = testConfig();
    const old: LobbyState = { players: [{ slot: 2, token: tokenFor(2), nick: "p2" }] };
    const joined = joinLobby(old, { token: tokenFor(5), nick: "new" }, config);
    if (!joined.ok) throw new Error("fixture join refused");

    expect(joined.slot).toBe(0);
    expect(hostOf(joined.state, new Set([0, 2]))?.slot).toBe(2);
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

    expect(back.players[1]).toEqual({ slot: 1, token: tokenFor(1), nick: "p1", seq: 1 });
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
    expect(result.state.players[1]).toEqual({ slot: 1, token: tokenFor(1), nick: "p1", seq: 1 });
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

    expect(next).toEqual({ players: [], game: DEFAULT_GAME, listed: true, turnSeconds: 0, nextSeq: 1 });
  });
});

/** A room of `game` holding players 0..count-1. */
function roomOf(game: GameId, count: number, config: RoomConfig): LobbyState {
  let state = createLobby(game);
  for (let n = 0; n < count; n++) {
    const result = joinLobby(state, { token: tokenFor(n), nick: `p${n}` }, config);
    if (!result.ok) throw new Error(`fixture join ${n} refused: ${result.reason}`);
    state = result.state;
  }
  return state;
}

describe("leadersOf", () => {
  const config = testConfig({ maxPlayers: TEAM_SIZE * 2 });

  /** Players 0..5 in the room; 2, 0 and 1 take team 1 in that order, then 4 and 3 take team 2. */
  function teams(): LobbyState {
    let state = roomOf(TEAM_GAME, 6, config);
    for (const [player, team] of [[2, 1], [0, 1], [1, 1], [4, 2], [3, 2]]) state = setTeam(state, tokenFor(player), team, config)!;
    return state;
  }

  it("is, in each team, whoever took it first", () => {
    expect(leadersOf(teams(), new Set([0, 1, 2, 3, 4, 5]))).toEqual(new Set([2, 4]));
  });

  it("passes to the next to have taken the team when the first does not count", () => {
    expect(leadersOf(teams(), new Set([0, 1, 3, 4, 5]))).toEqual(new Set([0, 4]));
  });

  it("is nobody in a team none of whose players counts, and nobody among players alone", () => {
    expect(leadersOf(teams(), new Set([5]))).toEqual(new Set());
    expect(leadersOf(roomOf(TEAM_GAME, 3, config), new Set([0, 1, 2]))).toEqual(new Set());
  });

  it("is the player in the lowest slot where a room stored before this was kept cannot say who was first", () => {
    const old: LobbyState = {
      ...roomOf(TEAM_GAME, 3, config),
    };
    old.players = old.players.map((player) => ({ ...player, team: 1 }));

    expect(leadersOf(old, new Set([0, 1, 2]))).toEqual(new Set([0]));
  });
});

describe("capacityOf", () => {
  it("is what a room holds, for a game that would take more", () => {
    const most = GAMES[SOLO_GAME].maxPlayers;

    expect(capacityOf(SOLO_GAME, testConfig({ maxPlayers: most - 1 }))).toBe(most - 1);
  });

  it("is what the game takes, in a room that could hold more", () => {
    const most = GAMES[SOLO_GAME].maxPlayers;

    expect(capacityOf(SOLO_GAME, testConfig({ maxPlayers: most + 1 }))).toBe(most);
  });
});

describe("teamsIn", () => {
  it("is as many teams of the game's size as fit in the room", () => {
    expect(teamsIn(TEAM_GAME, testConfig({ maxPlayers: TEAM_SIZE * 2 }))).toBe(2);
    expect(teamsIn(TEAM_GAME, testConfig({ maxPlayers: TEAM_SIZE * 2 - 1 }))).toBe(1);
    expect(teamsIn(TEAM_GAME, testConfig({ maxPlayers: TEAM_SIZE - 1 }))).toBe(0);
  });

  it("counts no more players than the game itself takes", () => {
    const most = GAMES[TEAM_GAME].maxPlayers;

    expect(teamsIn(TEAM_GAME, testConfig({ maxPlayers: most * 4 }))).toBe(Math.floor(most / TEAM_SIZE));
  });

  it("is none in a game everyone plays alone", () => {
    expect(GAMES[SOLO_GAME].teamSize).toBe(0);
    expect(teamsIn(SOLO_GAME, testConfig({ maxPlayers: 6 }))).toBe(0);
  });
});

describe("setTeam", () => {
  const config = testConfig({ maxPlayers: TEAM_SIZE * 2 });

  it("puts a player in a team for the next game, and nobody else", () => {
    const state = roomOf(TEAM_GAME, 3, config);

    const next = setTeam(state, tokenFor(1), 2, config);

    expect(next?.players.map((player) => player.team ?? 0)).toEqual([0, 2, 0]);
  });

  it("lets a player go back to playing alone", () => {
    const teamed = setTeam(roomOf(TEAM_GAME, 2, config), tokenFor(0), 1, config)!;

    const alone = setTeam(teamed, tokenFor(0), 0, config);

    expect(alone?.players[0].team).toBe(0);
  });

  it("takes the last team the room has, and refuses the one after it", () => {
    const state = roomOf(TEAM_GAME, 1, config);
    const last = teamsIn(TEAM_GAME, config);

    expect(setTeam(state, tokenFor(0), last, config)?.players[0].team).toBe(last);
    expect(setTeam(state, tokenFor(0), last + 1, config)).toBeNull();
  });

  it("refuses every team in a game everyone plays alone, and takes playing alone", () => {
    const state = roomOf(SOLO_GAME, 1, config);

    expect(setTeam(state, tokenFor(0), 1, config)).toBeNull();
    expect(setTeam(state, tokenFor(0), 0, config)).toBe(state);
  });

  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY])("refuses %s, which is not a team", (team) => {
    const state = roomOf(TEAM_GAME, 1, config);

    expect(setTeam(state, tokenFor(0), team, config)).toBeNull();
  });

  it("refuses someone who is not in the room", () => {
    const state = roomOf(TEAM_GAME, 1, config);

    expect(setTeam(state, tokenFor(7), 1, config)).toBeNull();
  });

  it("notes the order in which players take a team: each taking later than every one before it", () => {
    let state = roomOf(TEAM_GAME, 3, config);

    state = setTeam(state, tokenFor(2), 1, config)!;
    state = setTeam(state, tokenFor(0), 1, config)!;
    state = setTeam(state, tokenFor(1), 2, config)!;

    const since = state.players.map((player) => player.teamSince);
    expect(since[2]).toBeLessThan(since[0]!);
    expect(since[0]).toBeLessThan(since[1]!);
  });

  it("counts a player who changes team as taking the new one now, after those already in it", () => {
    let state = roomOf(TEAM_GAME, 2, config);
    state = setTeam(state, tokenFor(0), 2, config)!;
    state = setTeam(state, tokenFor(1), 1, config)!;

    state = setTeam(state, tokenFor(0), 1, config)!;

    expect(state.players[1].teamSince).toBeLessThan(state.players[0].teamSince!);
  });

  it("forgets when a player took a team once they play alone again", () => {
    const teamed = setTeam(roomOf(TEAM_GAME, 2, config), tokenFor(0), 1, config)!;

    const alone = setTeam(teamed, tokenFor(0), 0, config)!;

    expect(alone.players[0]).not.toHaveProperty("teamSince");
  });

  it("does not give a later taking a number an earlier one had, after players have left their teams", () => {
    let state = roomOf(TEAM_GAME, 2, config);
    state = setTeam(state, tokenFor(0), 1, config)!;
    state = setTeam(state, tokenFor(1), 1, config)!;
    const first = state.players[1].teamSince!;
    state = setTeam(state, tokenFor(1), 0, config)!;
    state = setTeam(state, tokenFor(0), 0, config)!;

    state = setTeam(state, tokenFor(0), 1, config)!;

    expect(state.players[0].teamSince).toBeGreaterThan(first);
  });

  it("changes nothing when the player is already there", () => {
    const state = roomOf(TEAM_GAME, 2, config);
    const teamed = setTeam(state, tokenFor(1), 1, config)!;

    expect(setTeam(state, tokenFor(1), 0, config)).toBe(state);
    expect(setTeam(teamed, tokenFor(1), 1, config)).toBe(teamed);
  });

  it("does not change the state it was given", () => {
    const state = roomOf(TEAM_GAME, 2, config);
    const before = structuredClone(state);

    setTeam(state, tokenFor(0), 1, config);

    expect(state).toEqual(before);
  });

  it("is told to everyone in the room, and is alone for someone who has not chosen", () => {
    const state = setTeam(roomOf(TEAM_GAME, 3, config), tokenFor(2), 1, config)!;

    const seen = viewLobby(state, new Set([0, 1, 2]), 0, config);

    expect(seen.players.map((player) => [player.slot, player.team])).toEqual([
      [0, 0],
      [1, 0],
      [2, 1],
    ]);
  });

  it("is kept for a player who goes away and comes back", () => {
    const teamed = setTeam(roomOf(TEAM_GAME, 2, config), tokenFor(1), 2, config)!;
    const away = markAway(teamed, new Set([0]), 1000);

    const back = joinLobby(away, { token: tokenFor(1), nick: "p1" }, config);

    if (!back.ok) throw new Error(`fixture rejoin refused: ${back.reason}`);
    expect(back.state.players[1]).toMatchObject({ slot: 1, team: 2 });
    expect(back.state.players[1].awaySince).toBeUndefined();
  });

  it("is not passed on to whoever takes the slot of a player who left", () => {
    const teamed = setTeam(roomOf(TEAM_GAME, 2, config), tokenFor(1), 2, config)!;
    const left = leaveLobby(teamed, tokenFor(1));

    const taken = joinLobby(left, { token: tokenFor(5), nick: "new" }, config);

    if (!taken.ok) throw new Error(`fixture join refused: ${taken.reason}`);
    expect(taken.slot).toBe(1);
    expect(taken.state.players[1].team ?? 0).toBe(0);
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
