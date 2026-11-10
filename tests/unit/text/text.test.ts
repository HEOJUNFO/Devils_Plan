import { describe, expect, it } from "vitest";
import { cleanLine, cutTo } from "../../../src/shared/text";

describe("cleanLine", () => {
  it("leaves an ordinary line as it is", () => {
    expect(cleanLine("안녕, 나 A 봤어!")).toBe("안녕, 나 A 봤어!");
  });

  it("trims the ends and makes each run of whitespace one space", () => {
    expect(cleanLine("  a \t b\n\nc  ")).toBe("a b c");
  });

  it.each([
    ["a null", "a\u0000b"],
    ["an escape", "a\u001bb"],
    ["a delete", "a\u007fb"],
    ["a control from the second block", "a\u0085b"],
    ["a mark that turns the text right to left", "a‮b"],
    ["a mark that isolates a direction", "a⁦b"],
    ["a byte order mark", "a﻿b"],
  ])("turns %s into a space", (_what, raw) => {
    expect(cleanLine(raw)).toBe("a b");
  });

  it("keeps the joiner that holds a family of emoji together", () => {
    const family = "\u{1f468}‍\u{1f469}‍\u{1f467}";

    expect(cleanLine(family)).toBe(family);
  });

  it("is empty for a line of nothing but whitespace and controls", () => {
    expect(cleanLine(" \u0000\t‮\n ")).toBe("");
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
    expect(cutTo("\u{1f600}\u{1f600}\u{1f600}", 2)).toBe("\u{1f600}\u{1f600}");
  });

  it("does not leave a space at the cut", () => {
    expect(cutTo("ab cd", 3)).toBe("ab");
  });
});
