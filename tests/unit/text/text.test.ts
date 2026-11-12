import { describe, expect, it } from "vitest";
import { cleanLine, cutTo, rowsOf } from "../../../src/shared/text";

/** The character with the number `code`: the ones tested here cannot be seen, so none is written in this file. */
const ch = (code: number): string => String.fromCodePoint(code);

describe("cleanLine", () => {
  it("leaves an ordinary line as it is", () => {
    expect(cleanLine("안녕, 나 A 봤어!")).toBe("안녕, 나 A 봤어!");
  });

  it("trims the ends and makes each run of whitespace one space", () => {
    expect(cleanLine(`  a ${ch(0x09)} b${ch(0x0a)}${ch(0x0a)}c  `)).toBe("a b c");
  });

  it.each([
    ["a null", 0x0000],
    ["an escape", 0x001b],
    ["a delete", 0x007f],
    ["a control from the second block", 0x0085],
    ["a soft hyphen", 0x00ad],
    ["an Arabic letter mark", 0x061c],
    ["a zero width space", 0x200b],
    ["a left-to-right mark", 0x200e],
    ["a right-to-left mark", 0x200f],
    ["a mark that turns the text right to left", 0x202e],
    ["a word joiner", 0x2060],
    ["a mark that isolates a direction", 0x2066],
    ["a byte order mark", 0xfeff],
  ])("turns %s into a space", (_what, code) => {
    expect(cleanLine(`a${ch(code)}b`)).toBe("a b");
  });

  it.each([
    ["Hangul fillers", [0x115f, 0x1160, 0x3164, 0xffa0]],
    ["blank Braille", [0x2800, 0x2800]],
    ["zero width spaces", [0x200b, 0x200b]],
    ["joiners with nothing to join", [0x200d, 0x200c]],
    ["selectors with nothing to style", [0xfe0f]],
    ["whitespace and controls", [0x20, 0x00, 0x09, 0x202e, 0x0a]],
  ])("is empty for a line of nothing but %s", (_what, codes) => {
    expect(cleanLine(codes.map(ch).join(""))).toBe("");
  });

  it("keeps the joiner that holds a family of emoji together", () => {
    const family = [0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467].map(ch).join("");

    expect(cleanLine(family)).toBe(family);
  });

  it("keeps what can be seen around what cannot", () => {
    expect(cleanLine(`${ch(0x3164)}가${ch(0x200b)}나${ch(0x2800)}`)).toBe("가 나");
  });
});

describe("cutTo", () => {
  it("leaves a line that fits", () => {
    expect(cutTo("abc", 3)).toBe("abc");
  });

  it("cuts a line that is too long", () => {
    expect(cutTo("abcdef", 4)).toBe("abcd");
  });

  it("counts a character outside the basic plane as one", () => {
    const face = ch(0x1f600);

    expect(cutTo(face + face + face, 2)).toBe(face + face);
  });

  it("does not leave a space at the cut", () => {
    expect(cutTo("ab cd", 3)).toBe("ab");
  });
});

describe("rowsOf", () => {
  /** A width for the tests: every character one pixel wide. */
  const byLength = (text: string): number => text.length;

  it("keeps parts that fit together on one row, joined", () => {
    expect(rowsOf(["ab", "cd", "ef"], " / ", 12, byLength)).toEqual(["ab / cd / ef"]);
  });

  it("starts a new row with the part that no longer fits, and breaks nowhere else", () => {
    // "ab / cd" is 7 wide and "ab / cd / ef" 12: at 11 the third part goes down
    expect(rowsOf(["ab", "cd", "ef"], " / ", 11, byLength)).toEqual(["ab / cd", "ef"]);
    expect(rowsOf(["ab", "cd", "ef", "gh"], " / ", 7, byLength)).toEqual(["ab / cd", "ef / gh"]);
  });

  it("fills a row to exactly its width", () => {
    expect(rowsOf(["ab", "cd"], " / ", 7, byLength)).toEqual(["ab / cd"]);
    expect(rowsOf(["ab", "cd"], " / ", 6, byLength)).toEqual(["ab", "cd"]);
  });

  it("gives a part wider than a row a row of its own, whole", () => {
    expect(rowsOf(["ab", "much too long", "cd"], " / ", 6, byLength)).toEqual(["ab", "much too long", "cd"]);
    expect(rowsOf(["much too long"], " / ", 6, byLength)).toEqual(["much too long"]);
  });

  it("has no rows for no parts", () => {
    expect(rowsOf([], " / ", 10, byLength)).toEqual([]);
  });

  it("leaves no part out and keeps their order, whatever the width", () => {
    const parts = ["Points +5", "Tile +39", "Manholes -4", "Flower beds +12", "Neighbors +16"];
    for (let max = 1; max <= 80; max++) {
      const rows = rowsOf(parts, " · ", max, byLength);

      expect(rows.join(" · ")).toBe(parts.join(" · "));
      for (const row of rows) expect(row.length <= max || !row.includes(" · ")).toBe(true);
    }
  });

  it("measures with the width it is given, not by counting characters", () => {
    // wide letters: each "W" is three pixels
    const wide = (text: string): number => Array.from(text).reduce((sum, each) => sum + (each === "W" ? 3 : 1), 0);

    expect(rowsOf(["WW", "ab"], "-", 8, byLength)).toEqual(["WW-ab"]);
    expect(rowsOf(["WW", "ab"], "-", 8, wide)).toEqual(["WW", "ab"]);
  });
});
