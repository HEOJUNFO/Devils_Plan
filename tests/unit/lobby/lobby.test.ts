import { describe, expect, it } from "vitest";
import { waitsOnHost } from "../../../src/shared/again";
import { DEFAULT_GAME, GAMES, GAME_IDS, type GameId } from "../../../src/shared/games";
import {
  awayPlayers,
  capacityOf,
  clearReady,
  gameHolds,
  setGame,
  handHost,
  kickPlayer,
  nextHost,
  setReady,
  waitingOnHost,
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
  setWhen,
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
    maxPendingConnections: 8,
    maxStrayMessages: 2,
    awayTurnSeconds: 5,
    awaySlotSeconds: 60,
    hostIdleSeconds: 60,
    hostAnswerSeconds: 10,
    maxBarred: 2,
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
    hiddenRetrySeconds: 180,
    reconnect: { firstMs: 100, jitterMs: 100, grow: 1.5, mostMs: 2000 },
    warmUpMs: 100,
    warmFreshSeconds: 45,
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
/** A game one player can start alone. */
const ALONE_GAME: GameId = "count-cubes";
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

  it("tells each viewer how many of the others have the rules open, and not who", () => {
    const config = testConfig();
    const state = lobbyWith(3, config);
    const there = new Set([0, 1, 2]);

    expect(viewLobby(state, there, 0, config, false, new Set([1, 2])).reading).toBe(2);
    expect(viewLobby(state, there, 1, config, false, new Set([1, 2])).reading).toBe(1);
    expect(JSON.stringify(viewLobby(state, there, 0, config, false, new Set([1])))).not.toContain("[1]");
  });

  it("says nothing of the rules while nobody else has them open", () => {
    const config = testConfig();
    const state = lobbyWith(3, config);
    const there = new Set([0, 1, 2]);

    expect("reading" in viewLobby(state, there, 0, config)).toBe(false);
    expect("reading" in viewLobby(state, there, 0, config, false, new Set())).toBe(false);
    expect("reading" in viewLobby(state, there, 1, config, false, new Set([1]))).toBe(false);
  });

  it("does not count as reading a seat nobody holds, or one whose connection is gone", () => {
    const config = testConfig();
    const state = lobbyWith(2, config);

    expect("reading" in viewLobby(state, new Set([0, 1, 2]), 0, config, false, new Set([2]))).toBe(false);
    expect("reading" in viewLobby(state, new Set([0]), 0, config, false, new Set([1]))).toBe(false);
  });

  it("tells everyone how many asked for each other game, and each viewer which they asked for", () => {
    const config = testConfig();
    const state = lobbyWith(3, config);
    const there = new Set([0, 1, 2]);
    const other = GAME_IDS.find((id) => id !== gameOf(state))!;
    const wished = new Map([
      [1, other],
      [2, other],
    ]);

    expect(viewLobby(state, there, 0, config, false, undefined, wished)).toMatchObject({ wishes: { [other]: 2 } });
    expect("wish" in viewLobby(state, there, 0, config, false, undefined, wished)).toBe(false);
    expect(viewLobby(state, there, 1, config, false, undefined, wished)).toMatchObject({ wishes: { [other]: 2 }, wish: other });
  });

  it("does not count a word for a game that has no place for someone who is in the room", () => {
    const config = testConfig({ maxPlayers: GAMES[ALONE_GAME].maxPlayers });
    const small = SOLO_GAME;
    const large = TEAM_GAME;
    const fits = GAMES[small].maxPlayers;
    const wished = new Map([
      [1, small],
      [2, large],
    ]);
    const all = (count: number): Set<number> => new Set(Array.from({ length: count }, (_, slot) => slot));

    const roomy = viewLobby(roomOf(ALONE_GAME, fits, config), all(fits), 1, config, false, undefined, wished);
    const crowded = viewLobby(roomOf(ALONE_GAME, fits + 1, config), all(fits + 1), 1, config, false, undefined, wished);

    expect(roomy).toMatchObject({ wishes: { [small]: 1, [large]: 1 }, wish: small });
    // one more has come in than the small game seats: the host could not change to it, and is not shown a count for it
    expect(crowded.wishes).toEqual({ [large]: 1 });
    expect("wish" in crowded).toBe(false);
  });

  it("says nothing of another game while nobody has asked for one", () => {
    const config = testConfig();
    const state = lobbyWith(2, config);
    const there = new Set([0, 1]);
    const other = GAME_IDS.find((id) => id !== gameOf(state))!;

    expect("wishes" in viewLobby(state, there, 0, config)).toBe(false);
    expect("wishes" in viewLobby(state, there, 0, config, false, undefined, new Map())).toBe(false);
    // the host's own word, a word for the room's own game, and the word of someone who is gone are not counted
    expect("wishes" in viewLobby(state, there, 0, config, false, undefined, new Map([[0, other]]))).toBe(false);
    expect("wishes" in viewLobby(state, there, 1, config, false, undefined, new Map([[1, gameOf(state)]]))).toBe(false);
    expect("wish" in viewLobby(state, there, 1, config, false, undefined, new Map([[1, gameOf(state)]]))).toBe(false);
    expect("wishes" in viewLobby(state, new Set([0]), 0, config, false, undefined, new Map([[1, other]]))).toBe(false);
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
  /** A game that is played one way only. */
  const ONE_WAY_GAME = "under-thirteen" as const;
  const [FIRST, SECOND] = GAMES[VARIED_GAME].variants.map((each) => each.id);

  it("is the first of the game's ways in a new room", () => {
    expect(GAMES[VARIED_GAME].variants.length).toBeGreaterThan(1);
    expect(variantOf(createLobby(VARIED_GAME, false, testConfig()))).toBe(FIRST);
    expect(variantOf(createLobby(VARIED_GAME, true, testConfig()))).toBe(FIRST);
  });

  it("is none in a room of a game that is played one way only, and cannot be set there", () => {
    const state = createLobby(ONE_WAY_GAME, false, testConfig());

    expect(GAMES[ONE_WAY_GAME].variants).toEqual([]);
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
    const oneWay = joinLobby(createLobby(ONE_WAY_GAME, false, config), { token: tokenFor(0), nick: "p0" }, config);
    if (!oneWay.ok) throw new Error("fixture join refused");
    expect(viewLobby(oneWay.state, new Set([0]), 0, config).variant).toBeNull();
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

describe("setWhen", () => {
  /** A moment, as a room keeps one. */
  const AT = 1_800_000_000_000;

  it("notes when the room's people meet, and shows it to everyone in the room", () => {
    const config = testConfig();
    const state = setWhen(lobbyWith(2, config), AT);

    expect(state.when).toBe(AT);
    expect(viewLobby(state, new Set([0, 1]), 0, config).when).toBe(AT);
    expect(viewLobby(state, new Set([0, 1]), 1, config).when).toBe(AT);
  });

  it("takes the time back, and then says nothing of one", () => {
    const config = testConfig();
    const state = setWhen(setWhen(lobbyWith(2, config), AT), null);

    expect("when" in state).toBe(false);
    expect("when" in viewLobby(state, new Set([0, 1]), 0, config)).toBe(false);
  });

  it("is the same state where nothing changes", () => {
    const config = testConfig();
    const plain = lobbyWith(2, config);
    const timed = setWhen(plain, AT);

    expect(setWhen(plain, null)).toBe(plain);
    expect(setWhen(timed, AT)).toBe(timed);
  });

  it("does not modify the state it was given", () => {
    const config = testConfig();
    const state = lobbyWith(2, config);
    const before = JSON.stringify(state);

    setWhen(state, AT);

    expect(JSON.stringify(state)).toBe(before);
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

describe("being ready", () => {
  it("shows a player who said so as ready, and nobody else", () => {
    const config = testConfig();
    const state = setReady(lobbyWith(3, config), tokenFor(1), true);

    const view = viewLobby(state, new Set([0, 1, 2]), 0, config);

    expect(view.players.map((p) => p.ready)).toEqual([false, true, false]);
  });

  it("takes it back when the player says so", () => {
    const config = testConfig();
    const ready = setReady(lobbyWith(2, config), tokenFor(1), true);

    const view = viewLobby(setReady(ready, tokenFor(1), false), new Set([0, 1]), 0, config);

    expect(view.players.map((p) => p.ready)).toEqual([false, false]);
  });

  it("changes nothing when it is already so, or for someone not in the room", () => {
    const config = testConfig();
    const state = lobbyWith(2, config);
    const ready = setReady(state, tokenFor(1), true);

    expect(setReady(state, tokenFor(1), false)).toBe(state);
    expect(setReady(ready, tokenFor(1), true)).toBe(ready);
    expect(setReady(state, tokenFor(9), true)).toBe(state);
  });

  it("does not modify the state it was given", () => {
    const config = testConfig();
    const state = lobbyWith(2, config);
    const before = JSON.stringify(state);

    setReady(state, tokenFor(1), true);

    expect(JSON.stringify(state)).toBe(before);
  });

  it("never shows the host as ready: the host starts", () => {
    const config = testConfig();
    const state = setReady(lobbyWith(2, config), tokenFor(0), true);

    expect(viewLobby(state, new Set([0, 1]), 1, config).players.map((p) => p.ready)).toEqual([false, false]);
  });

  it("does not show a player who is not connected as ready", () => {
    const config = testConfig();
    const state = setReady(lobbyWith(3, config), tokenFor(2), true);

    expect(viewLobby(state, new Set([0, 1]), 0, config).players.map((p) => p.ready)).toEqual([false, false, false]);
  });

  it("is taken back from a player who goes away", () => {
    const config = testConfig();
    const ready = setReady(lobbyWith(3, config), tokenFor(2), true);

    const away = markAway(ready, new Set([0, 1]), NOW);

    expect(viewLobby(away, new Set([0, 1, 2]), 0, config).players.map((p) => p.ready)).toEqual([false, false, false]);
  });

  it("is taken back from everyone when a game starts", () => {
    const config = testConfig();
    const ready = setReady(setReady(lobbyWith(3, config), tokenFor(1), true), tokenFor(2), true);

    const view = viewLobby(clearReady(ready), new Set([0, 1, 2]), 0, config);

    expect(view.players.map((p) => p.ready)).toEqual([false, false, false]);
  });

  it("leaves a room where nobody was ready as it is", () => {
    const state = lobbyWith(2, testConfig());

    expect(clearReady(state)).toBe(state);
  });
});

describe("handHost", () => {
  it("makes the player in the slot the host", () => {
    const config = testConfig();

    const handed = handHost(lobbyWith(3, config), 2);

    expect(handed === null ? null : hostOf(handed, new Set([0, 1, 2]))?.slot).toBe(2);
  });

  it("leaves whoever was host before as the next in line", () => {
    const config = testConfig();

    const handed = handHost(lobbyWith(3, config), 2);

    expect(handed === null ? null : hostOf(handed, new Set([0, 1]))?.slot).toBe(0);
  });

  it("can be done again, to anyone", () => {
    const config = testConfig();
    const once = handHost(lobbyWith(3, config), 2);
    if (once === null) throw new Error("fixture hand-over refused");

    const twice = handHost(once, 1);

    expect(twice === null ? null : hostOf(twice, new Set([0, 1, 2]))?.slot).toBe(1);
    expect(twice === null ? null : hostOf(twice, new Set([0, 2]))?.slot).toBe(2);
  });

  it("takes back the new host's word that they are ready", () => {
    const config = testConfig();
    const ready = setReady(lobbyWith(2, config), tokenFor(1), true);
    const handed = handHost(ready, 1);
    if (handed === null) throw new Error("fixture hand-over refused");

    // shown from the seat of a third who would see them as ready were they still: the old host is host again
    const back = handHost(handed, 0);

    expect(back === null ? null : viewLobby(back, new Set([0, 1]), 0, config).players.map((p) => p.ready)).toEqual([false, false]);
  });

  it("is refused for a slot nobody holds", () => {
    expect(handHost(lobbyWith(2, testConfig()), 2)).toBeNull();
  });

  it("does not modify the state it was given", () => {
    const state = lobbyWith(2, testConfig());
    const before = JSON.stringify(state);

    handHost(state, 1);

    expect(JSON.stringify(state)).toBe(before);
  });
});

describe("kickPlayer", () => {
  it("takes the player out of the room", () => {
    const config = testConfig();

    const kicked = kickPlayer(lobbyWith(3, config), 1, config);

    expect(kicked === null ? null : viewLobby(kicked, new Set([0, 2]), 0, config).players.map((p) => p.slot)).toEqual([0, 2]);
  });

  it("does not let them back in", () => {
    const config = testConfig();
    const kicked = kickPlayer(lobbyWith(3, config), 1, config);
    if (kicked === null) throw new Error("fixture kick refused");

    expect(joinLobby(kicked, { token: tokenFor(1), nick: "p1" }, config)).toEqual({ ok: false, reason: "kicked" });
  });

  it("lets someone else take the place", () => {
    const config = testConfig();
    const kicked = kickPlayer(lobbyWith(3, config), 1, config);
    if (kicked === null) throw new Error("fixture kick refused");

    expect(joinLobby(kicked, { token: tokenFor(7), nick: "new" }, config)).toMatchObject({ ok: true, slot: 1 });
  });

  it("remembers the latest it sent out, as many as the room keeps, and forgets those before", () => {
    const config = testConfig({ maxPlayers: 5 });
    let state: LobbyState = lobbyWith(5, config);
    const sentOut = Array.from({ length: config.maxBarred + 1 }, (_, n) => n + 1);
    for (const slot of sentOut) {
      const next = kickPlayer(state, slot, config);
      if (next === null) throw new Error(`fixture kick of ${slot} refused`);
      state = next;
    }

    const answers = sentOut.map((slot) => joinLobby(state, { token: tokenFor(slot), nick: "back" }, config).ok);

    expect(answers).toEqual([true, ...Array.from({ length: config.maxBarred }, () => false)]);
  });

  it("is refused for a slot nobody holds", () => {
    const config = testConfig();

    expect(kickPlayer(lobbyWith(2, config), 2, config)).toBeNull();
  });

  it("does not modify the state it was given", () => {
    const config = testConfig();
    const state = lobbyWith(2, config);
    const before = JSON.stringify(state);

    kickPlayer(state, 1, config);

    expect(JSON.stringify(state)).toBe(before);
  });
});

describe("a room that waits on its host", () => {
  /** A room of `count` players for a game one player can start: with that many, the host could start it. */
  const roomOf = (count: number, config: RoomConfig): LobbyState => ({ ...lobbyWith(count, config), game: ALONE_GAME });

  it("does once everyone else who is connected is ready", () => {
    const config = testConfig();
    const one = setReady(roomOf(3, config), tokenFor(1), true);
    const both = setReady(one, tokenFor(2), true);

    expect(waitingOnHost(one, new Set([0, 1, 2]))).toBe(false);
    expect(waitingOnHost(both, new Set([0, 1, 2]))).toBe(true);
  });

  it("does not wait for someone who is not connected to be ready", () => {
    const config = testConfig();
    const one = setReady(roomOf(3, config), tokenFor(1), true);

    expect(waitingOnHost(one, new Set([0, 1]))).toBe(true);
  });

  it("does not while the host is alone, or nobody is connected", () => {
    const config = testConfig();
    const state = setReady(roomOf(2, config), tokenFor(1), true);

    expect(waitingOnHost(state, new Set([0]))).toBe(false);
    expect(waitingOnHost(state, new Set())).toBe(false);
  });

  it("does not while fewer are connected than its game takes: the host could not start it either", () => {
    const config = testConfig();
    const few = setReady(lobbyWith(GAMES[DEFAULT_GAME].minPlayers - 1, { ...config, maxPlayers: GAMES[DEFAULT_GAME].minPlayers }), tokenFor(1), true);
    const all = new Set(few.players.map((p) => p.slot));
    const ready = few.players.slice(2).reduce((state, p) => setReady(state, p.token, true), few);

    expect(GAMES[DEFAULT_GAME].minPlayers).toBeGreaterThan(2);
    expect(waitingOnHost(ready, all)).toBe(false);
  });

  it("is read the same by a page, from what the room shows it", () => {
    const config = testConfig();
    const one = setReady(roomOf(3, config), tokenFor(1), true);
    const both = setReady(one, tokenFor(2), true);
    const few = setReady(lobbyWith(GAMES[DEFAULT_GAME].minPlayers - 1, { ...config, maxPlayers: GAMES[DEFAULT_GAME].minPlayers }), tokenFor(1), true);
    const rooms: [LobbyState, Set<number>][] = [
      [one, new Set([0, 1, 2])],
      [both, new Set([0, 1, 2])],
      [one, new Set([0, 1])],
      [both, new Set([0])],
      [both, new Set()],
      [few.players.slice(2).reduce((state, p) => setReady(state, p.token, true), few), new Set(few.players.map((p) => p.slot))],
    ];

    for (const [state, there] of rooms) {
      const view = viewLobby(state, there, 0, config);

      expect(waitsOnHost(view.players, view.host, view.knockout, GAMES[view.game].minPlayers)).toBe(waitingOnHost(state, there));
    }
  });

  it("passes to whoever came first of those ready and connected", () => {
    const config = testConfig();
    const both = setReady(setReady(roomOf(3, config), tokenFor(1), true), tokenFor(2), true);

    expect(nextHost(both, new Set([0, 1, 2]))?.slot).toBe(1);
    expect(nextHost(both, new Set([0, 2]))?.slot).toBe(2);
  });

  it("passes to nobody when nobody else is ready", () => {
    const config = testConfig();

    expect(nextHost(roomOf(3, config), new Set([0, 1, 2]))).toBeUndefined();
  });

  it("no longer waits once it has passed: the host it left is not ready", () => {
    const config = testConfig();
    const both = setReady(setReady(roomOf(3, config), tokenFor(1), true), tokenFor(2), true);
    const next = nextHost(both, new Set([0, 1, 2]));
    const handed = next === undefined ? null : handHost(both, next.slot);
    if (handed === null) throw new Error("fixture hand-over refused");

    expect(hostOf(handed, new Set([0, 1, 2]))?.slot).toBe(1);
    expect(waitingOnHost(handed, new Set([0, 1, 2]))).toBe(false);
  });
});

describe("setGame", () => {
  /** A game played in turns and one that is not; one with variants; and the game with the fewest places, with one that has more. */
  const TURN_GAME = GAME_IDS.find((id) => GAMES[id].turns)!;
  const NO_TURN_GAME = GAME_IDS.find((id) => !GAMES[id].turns)!;
  const VARIANT_GAME = GAME_IDS.find((id) => GAMES[id].variants.length > 1)!;
  const SMALL_GAME = GAME_IDS.reduce((least, id) => (GAMES[id].maxPlayers < GAMES[least].maxPlayers ? id : least));
  const BIG_GAME = GAME_IDS.reduce((most, id) => (GAMES[id].maxPlayers > GAMES[most].maxPlayers ? id : most));
  /** A room of `game` with players 0..count-1. */
  const roomOf = (game: GameId, count: number, config: RoomConfig, listed = false): LobbyState => {
    let state = createLobby(game, listed, config);
    for (let n = 0; n < count; n++) {
      const result = joinLobby(state, { token: tokenFor(n), nick: `p${n}` }, config);
      if (!result.ok) throw new Error(`fixture join ${n} refused: ${result.reason}`);
      state = result.state;
    }
    return state;
  };

  it("makes the room one for the game asked for, with as many places as that game has", () => {
    const config = testConfig({ maxPlayers: GAMES[BIG_GAME].maxPlayers });
    const changed = setGame(roomOf(SMALL_GAME, 2, config), BIG_GAME, config);

    const view = changed === null ? null : viewLobby(changed, new Set([0, 1]), 0, config);

    expect(view).toMatchObject({ game: BIG_GAME, maxPlayers: GAMES[BIG_GAME].maxPlayers });
    expect(view?.players.map((p) => p.nick)).toEqual(["p0", "p1"]);
  });

  it("changes nothing when the room is for that game already", () => {
    const config = testConfig();
    const state = roomOf(TEAM_GAME, 2, config);

    expect(setGame(state, TEAM_GAME, config)).toBe(state);
  });

  it("is refused when someone holds a place the game does not have", () => {
    const config = testConfig({ maxPlayers: GAMES[BIG_GAME].maxPlayers });
    const full = roomOf(BIG_GAME, GAMES[SMALL_GAME].maxPlayers + 1, config);

    expect(GAMES[SMALL_GAME].maxPlayers).toBeLessThan(GAMES[BIG_GAME].maxPlayers);
    expect(setGame(full, SMALL_GAME, config)).toBeNull();
  });

  it("is refused for a high place held even when few are in the room", () => {
    const config = testConfig({ maxPlayers: GAMES[BIG_GAME].maxPlayers });
    const full = roomOf(BIG_GAME, GAMES[SMALL_GAME].maxPlayers + 1, config);
    // everyone but the first and the last has left: two players, one of them in a place the small game has not
    const two = full.players.slice(1, -1).reduce((state, p) => leaveLobby(state, p.token), full);

    expect(two.players.map((p) => p.slot)).toEqual([0, GAMES[SMALL_GAME].maxPlayers]);
    expect(setGame(two, SMALL_GAME, config)).toBeNull();
    expect(gameHolds([0, GAMES[SMALL_GAME].maxPlayers], SMALL_GAME, config)).toBe(false);
    expect(gameHolds([0, GAMES[SMALL_GAME].maxPlayers - 1], SMALL_GAME, config)).toBe(true);
  });

  it("is allowed when exactly as many are in as the game has places", () => {
    const config = testConfig({ maxPlayers: GAMES[BIG_GAME].maxPlayers });
    const full = roomOf(BIG_GAME, GAMES[SMALL_GAME].maxPlayers, config);

    expect(setGame(full, SMALL_GAME, config)).not.toBeNull();
  });

  it("takes back everyone's team and everyone's word that they are ready", () => {
    const config = testConfig({ maxPlayers: TEAM_SIZE * 2 });
    const teamed = setTeam(roomOf(TEAM_GAME, 2, config), tokenFor(0), 1, config);
    if (teamed === null) throw new Error("fixture team refused");
    const ready = setReady(teamed, tokenFor(1), true);

    const other = GAME_IDS.find((id) => id !== TEAM_GAME)!;
    const away = setGame(ready, other, config);
    if (away === null) throw new Error("fixture change refused");

    // seen in a room of the game with teams again: a team kept through the change would show there
    const back = setGame(away, TEAM_GAME, config);

    const view = back === null ? null : viewLobby(back, new Set([0, 1]), 0, config);
    expect(view?.players.map((p) => [p.team, p.leads, p.ready])).toEqual([
      [0, false, false],
      [0, false, false],
    ]);
  });

  it("forgets the way the game it had was played: the room comes back to it at that game's first", () => {
    const config = testConfig({ maxPlayers: GAMES[BIG_GAME].maxPlayers });
    const variants = GAMES[VARIANT_GAME].variants;
    const chosen = setVariant(roomOf(VARIANT_GAME, 1, config), variants[1].id);
    if (chosen === null) throw new Error("fixture variant refused");
    const other = GAME_IDS.find((id) => id !== VARIANT_GAME)!;

    const away = setGame(chosen, other, config);
    const back = away === null ? null : setGame(away, VARIANT_GAME, config);

    expect(variantOf(chosen)).toBe(variants[1].id);
    expect(back === null ? null : variantOf(back)).toBe(variants[0].id);
  });

  it("leaves a game without turns no limit on a turn", () => {
    const config = testConfig();
    const timed = setTurnSeconds(roomOf(TURN_GAME, 1, config), config.turnSecondsChoices[1], config);
    if (timed === null) throw new Error("fixture clock refused");

    const changed = setGame(timed, NO_TURN_GAME, config);

    expect(changed === null ? null : turnSecondsOf(changed)).toBe(0);
  });

  it("starts a game played in turns as a new room of it would: with the limit of a room on the list, or none", () => {
    const config = testConfig();

    const listed = setGame(roomOf(NO_TURN_GAME, 1, config, true), TURN_GAME, config);
    const unlisted = setGame(roomOf(NO_TURN_GAME, 1, config, false), TURN_GAME, config);

    expect(listed === null ? null : turnSecondsOf(listed)).toBe(config.listedTurnSeconds);
    expect(unlisted === null ? null : turnSecondsOf(unlisted)).toBe(0);
  });

  it("keeps who is host, who is on the list and who was sent out", () => {
    const config = testConfig({ maxPlayers: GAMES[BIG_GAME].maxPlayers });
    const handed = handHost(roomOf(BIG_GAME, 3, config, true), 2);
    const kicked = handed === null ? null : kickPlayer(handed, 1, config);
    if (kicked === null) throw new Error("fixture refused");

    const changed = setGame(kicked, SMALL_GAME, config);
    if (changed === null) throw new Error("change refused");

    expect(viewLobby(changed, new Set([0, 2]), 0, config)).toMatchObject({ host: 2, listed: true });
    expect(joinLobby(changed, { token: tokenFor(1), nick: "p1" }, config)).toEqual({ ok: false, reason: "kicked" });
  });

  it("does not modify the state it was given", () => {
    const config = testConfig({ maxPlayers: GAMES[BIG_GAME].maxPlayers });
    const state = roomOf(SMALL_GAME, 2, config);
    const before = JSON.stringify(state);

    setGame(state, BIG_GAME, config);

    expect(JSON.stringify(state)).toBe(before);
  });
});
