import { describe, expect, it } from "vitest";
import tableSizes from "../../../src/shared/game/table-sizes.json";
import { DEFAULT_GAME, GAMES, GAME_IDS, isGameId } from "../../../src/shared/games";
import { LANGS } from "../../../src/shared/lang";
import roomConfig from "../../../src/shared/room-config.json";

describe("the games a room can be made for", () => {
  it("offers at least one game, the first of which rooms without a game get", () => {
    expect(GAME_IDS.length).toBeGreaterThan(0);
    expect(GAME_IDS).toContain(DEFAULT_GAME);
  });

  it.each(GAME_IDS)("gives %s a name and a summary in every language, and a sensible range of players", (id) => {
    const game = GAMES[id];

    for (const lang of LANGS) {
      expect(game.title[lang].trim()).not.toBe("");
      expect(game.summary[lang].trim()).not.toBe("");
    }
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

  it.each(GAME_IDS)("says of %s in how many ways it can be played, each with an id of its own and a name in every language", (id) => {
    const variants = GAMES[id].variants;

    expect(Array.isArray(variants)).toBe(true);
    expect(new Set(variants.map((each) => each.id)).size).toBe(variants.length);
    for (const variant of variants) {
      expect(variant.id).toMatch(/^[a-z][a-z-]*$/);
      for (const lang of LANGS) expect(variant.title[lang].trim()).not.toBe("");
    }
    // one way only is no choice: such a game has none
    expect(variants.length).not.toBe(1);
  });

  it("lets a room of 미스터리 거래소 be played by rules drawn for each game, which it starts with, or by the show's", () => {
    expect(GAMES["mystery-stock-market"].variants.map((each) => each.id)).toEqual(["fresh", "show"]);
    expect(GAME_IDS.filter((id) => GAMES[id].variants.length > 0)).toEqual(["mystery-stock-market"]);
  });

  it("names each game in Korean as the show does, and in English as its English release does", () => {
    // CLAUDE.md, Project Rules: a game is shown under the name the show gives it, also where the show made the name up for it
    expect(GAME_IDS.map((id) => GAMES[id].title.ko)).toEqual(["러시안 룰렛", "네모 세기", "잔디 깔기", "큐브 세기", "기억 포커", "무거운 13", "미스터리 거래소"]);
    expect(GAME_IDS.map((id) => GAMES[id].title.en)).toEqual(["Russian Roulette", "Count the Rectangles", "Lay the Grass", "Count the Cubes", "Memory Poker", "Heavy 13", "Mystery Stock Market"]);
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
