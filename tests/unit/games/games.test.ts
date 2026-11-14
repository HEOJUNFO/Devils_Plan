import { describe, expect, it } from "vitest";
import { isDeck } from "../../../src/shared/games/lay-the-grass/cards";
import grassHosting from "../../../src/shared/games/lay-the-grass/host-config.json";
import marketHosting from "../../../src/shared/games/mystery-stock-market/host-config.json";
import { isRulebook } from "../../../src/shared/games/mystery-stock-market/rulebook";
import { REVEAL_VARIANT } from "../../../src/shared/game/host";
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

  it("lets a room of 미스터리 거래소 be played by rules drawn for each game, which it starts with, or by the show's, with everyone's holdings told at the end or not", () => {
    // what a room is made with tells nothing at the end: a game is told only where its host asked for that
    expect(GAMES["mystery-stock-market"].variants.map((each) => each.id)).toEqual(["fresh", "show", "fresh-told", "show-told"]);
  });

  it("has a way of playing 미스터리 거래소 in the host's settings for every way a room can ask for, each by rules there are, and tells holdings only in the two that say so", () => {
    const ways: Record<string, { rulebook: string; told?: boolean }> = marketHosting.ways;

    for (const variant of GAMES["mystery-stock-market"].variants) {
      expect(Object.hasOwn(ways, variant.id), variant.id).toBe(true);
      expect(isRulebook(ways[variant.id]?.rulebook), variant.id).toBe(true);
      expect(ways[variant.id]?.told === true, variant.id).toBe(variant.id.endsWith("-told"));
    }
  });

  it("lets a room of 잔디 깔기 be played with cards drawn for each game, which it starts with, or with the show's, over one park or three", () => {
    // what a room is made with is a game's first way: a game somebody has played is not known to them beforehand,
    // and one park, as the document's game is
    expect(GAMES["lay-the-grass"].variants.map((each) => each.id)).toEqual(["fresh", "show", "fresh-three", "show-three"]);
    expect(GAMES["lay-the-grass"].variants.map((each) => each.title.ko)).toEqual(["판마다 새 카드", "방송의 카드", "새 카드 · 공원 3곳", "방송의 카드 · 공원 3곳"]);
  });

  it("has a way of playing 잔디 깔기 in the host's settings for every way a room can ask for, each on cards there are", () => {
    for (const variant of GAMES["lay-the-grass"].variants) {
      expect(Object.hasOwn(grassHosting.ways, variant.id), variant.id).toBe(true);
      expect(isDeck(grassHosting.ways[variant.id as keyof typeof grassHosting.ways].deck), variant.id).toBe(true);
    }
  });

  it("lets a room of 러시안 룰렛 keep the hidden moves hidden when the game is over, which it starts with, or tell them then", () => {
    expect(GAMES["russian-roulette"].variants.map((each) => each.id)).toEqual(["kept", REVEAL_VARIANT]);
  });

  it("offers a choice of ways in the two games whose hidden part the show gives away, of length in the two games the show gives none, and of what is told at the end of the first", () => {
    expect(GAME_IDS.filter((id) => GAMES[id].variants.length > 0)).toEqual(["russian-roulette", "lay-the-grass", "count-cubes", "memory-poker", "mystery-stock-market"]);
  });

  it("lets a room of 큐브 세기 give its problem as long as its host says, starting with the five minutes it always had", () => {
    expect(GAMES["count-cubes"].variants.map((each) => each.id)).toEqual(["time-five", "time-three", "time-ten"]);
    expect(GAMES["count-cubes"].variants.map((each) => each.title.ko)).toEqual(["제한 5분", "제한 3분", "제한 10분"]);
  });

  it("lets a room of 기억 포커 be as many rounds as its host says, starting with the five it always was", () => {
    expect(GAMES["memory-poker"].variants.map((each) => each.id)).toEqual(["rounds-five", "rounds-three", "rounds-seven"]);
    expect(GAMES["memory-poker"].variants.map((each) => each.title.ko)).toEqual(["5라운드", "3라운드", "7라운드"]);
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
