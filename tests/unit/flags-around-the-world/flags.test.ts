import { describe, expect, it } from "vitest";
import flagsJson from "../../../src/shared/games/flags-around-the-world/flags.json";
import { FLAG_CELL, FLAG_IDS, FLAG_SHEET, FLAG_TWINS, flagSpot, isFlag, twinsOf } from "../../../src/shared/games/flags-around-the-world/flags";

describe("the flags of 만국기", () => {
  it("are those of the 193 member states of the United Nations, each once, by two letters", () => {
    expect(FLAG_IDS).toHaveLength(193);
    expect(new Set(FLAG_IDS).size).toBe(193);
    expect(FLAG_IDS.every((id) => /^[a-z]{2}$/.test(id))).toBe(true);
    expect(["kr", "kp", "jp", "us", "gb", "ie", "ci", "nl", "jm", "ru"].every(isFlag)).toBe(true);
    // not members: no flag of theirs is in the game
    expect(["tw", "ps", "xk", "va", "hk", "eu", "KR", "", 3, null].some(isFlag)).toBe(false);
  });

  it("have a cell each on a sheet as large as the list needs, in the order of the list", () => {
    expect(FLAG_CELL).toEqual([44, 33]);
    expect(flagSpot(FLAG_IDS[0])).toEqual([0, 0]);
    expect(flagSpot(FLAG_IDS[1])).toEqual([44, 0]);
    expect(flagSpot(FLAG_IDS[flagsJson.columns])).toEqual([0, 33]);
    expect(flagSpot("zz")).toBeNull();
    // (the picture itself is drawn from the same list by tools/flag-sprite.mjs: a test here reads no file)
    expect(FLAG_SHEET).toBe("/flags-v1.png");
    const last = flagSpot(FLAG_IDS[FLAG_IDS.length - 1]);
    expect(last).toEqual([((FLAG_IDS.length - 1) % flagsJson.columns) * 44, Math.floor((FLAG_IDS.length - 1) / flagsJson.columns) * 33]);
  });

  it("name the pairs that look the same, each flag in one pair at most", () => {
    expect(FLAG_TWINS.every((pair) => pair.length === 2 && pair.every(isFlag))).toBe(true);
    expect(new Set(FLAG_TWINS.flat()).size).toBe(FLAG_TWINS.flat().length);
    expect(twinsOf("ro")).toEqual(["td"]);
    expect(twinsOf("mc")).toEqual(["id"]);
    expect(twinsOf("kr")).toEqual([]);
  });
});
