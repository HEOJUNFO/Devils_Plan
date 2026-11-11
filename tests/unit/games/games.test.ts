import { describe, expect, it } from "vitest";
import tableSizes from "../../../src/shared/game/table-sizes.json";
import { DEFAULT_GAME, GAMES, GAME_IDS, isGameId } from "../../../src/shared/games";
import roomConfig from "../../../src/shared/room-config.json";

describe("the games a room can be made for", () => {
  it("offers at least one game, the first of which rooms without a game get", () => {
    expect(GAME_IDS.length).toBeGreaterThan(0);
    expect(GAME_IDS).toContain(DEFAULT_GAME);
  });

  it.each(GAME_IDS)("gives %s a name, a summary and a sensible range of players", (id) => {
    const game = GAMES[id];

    expect(game.title.trim()).not.toBe("");
    expect(game.summary.trim()).not.toBe("");
    expect(Number.isInteger(game.minPlayers)).toBe(true);
    expect(Number.isInteger(game.maxPlayers)).toBe(true);
    expect(game.minPlayers).toBeGreaterThanOrEqual(1);
    expect(game.maxPlayers).toBeGreaterThanOrEqual(game.minPlayers);
  });

  it.each(GAME_IDS)("fits a full game of %s in a room", (id) => {
    expect(GAMES[id].maxPlayers).toBeLessThanOrEqual(roomConfig.maxPlayers);
  });

  it.each(GAME_IDS)("says of %s whether it is played in turns and how many make a team", (id) => {
    const game = GAMES[id];

    expect(typeof game.turns).toBe("boolean");
    expect(Number.isInteger(game.teamSize)).toBe(true);
    expect(game.teamSize).toBeGreaterThanOrEqual(0);
    // a team must fit in a game, with someone left to play against
    expect(game.teamSize).toBeLessThan(game.maxPlayers);
  });

  it("lets one player alone start the two counting games, and no other game", () => {
    // the user, on 2026-11-11: solo play where a game can be played alone; 잔디 깔기 cannot ("이걸어케혼자해"), nor 러시안 룰렛
    const alone = GAME_IDS.filter((id) => GAMES[id].minPlayers === 1).sort();

    expect(alone).toEqual(["count-cubes", "count-rectangles"]);
    expect(GAMES["lay-the-grass"].minPlayers).toBe(2);
  });

  it("says of the first game what its tables say", () => {
    const sizes = Object.keys(tableSizes).map(Number);

    expect(GAMES["russian-roulette"].minPlayers).toBe(Math.min(...sizes));
    expect(GAMES["russian-roulette"].maxPlayers).toBe(Math.max(...sizes));
  });
});

describe("isGameId", () => {
  it("knows every game on the list", () => {
    for (const id of GAME_IDS) expect(isGameId(id)).toBe(true);
  });

  it.each([["a made-up name", "tiddlywinks"], ["a name every object has", "toString"], ["a number", 1], ["nothing", undefined]])(
    "does not take %s for a game",
    (_what, value) => {
      expect(isGameId(value)).toBe(false);
    },
  );
});
