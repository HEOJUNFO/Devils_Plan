import { describe, expect, it } from "vitest";

import { initialsOf } from "../../../src/shared/initials";

const letters = (nicks: readonly string[]): string[] => initialsOf(nicks).map((initial) => initial.letter);

describe("initialsOf", () => {
  it("is the first letter of a name where no one else begins with it", () => {
    expect(letters(["철수", "영희", "Mina"])).toEqual(["철", "영", "M"]);
    expect(initialsOf(["철수"])[0]).toEqual({ letter: "철", at: 0 });
  });

  it("gives players who share a first letter a later letter of their own name", () => {
    expect(letters(["김철수", "김영희", "박민"])).toEqual(["철", "영", "박"]);
    expect(initialsOf(["김철수", "김영희"])[1]).toEqual({ letter: "영", at: 1 });
  });

  it("tells the bots apart by their numbers, past the space in their names", () => {
    expect(initialsOf(["봇 1", "봇 2", "봇 3"])).toEqual([
      { letter: "1", at: 2 },
      { letter: "2", at: 2 },
      { letter: "3", at: 2 },
    ]);
  });

  it("does not give a letter that is someone's first letter, or that was given already", () => {
    // 철 begins the third name, and the second 김 cannot have 수 again
    expect(letters(["김철수", "김수", "철이"])).toEqual(["수", "김", "철"]);
    expect(letters(["김철민", "김철수"])).toEqual(["철", "수"]);
  });

  it("takes letters that differ only by case for one letter", () => {
    expect(letters(["alex", "Amy"])).toEqual(["l", "m"]);
    expect(letters(["Bo", "Ab", "ad"])).toEqual(["B", "A", "d"]);
  });

  it("gives only a letter or a figure: not a mark, a joiner or a sign that shows nothing by itself", () => {
    // a heart with its variation selector, a family joined by zero-width joiners, a flag of two halves, an accent written apart
    expect(letters(["\u2764\uFE0F민수", "\u2764\uFE0F영희"])).toEqual(["민", "영"]);
    expect(letters(["\u{1F468}\u200D\u{1F469}\u200D\u{1F467}A", "\u{1F468}\u200D\u{1F4BB}B"])).toEqual(["A", "B"]);
    expect(letters(["\u{1F1F0}\u{1F1F7}철수", "\u{1F1F0}\u{1F1F7}영희"])).toEqual(["철", "영"]);
    expect(letters(["e\u0301a", "eb"])).toEqual(["a", "b"]);
    expect(letters(["A.B", "A-C"])).toEqual(["B", "C"]);
  });

  it("keeps the first letter of a name that has no other to give", () => {
    expect(letters(["김", "김"])).toEqual(["김", "김"]);
    expect(letters(["aa", "aa"])).toEqual(["a", "a"]);
  });

  it("starts at the first letter that is not a space, and has no letter for an empty name", () => {
    expect(initialsOf([" 철수", ""])).toEqual([
      { letter: "철", at: 1 },
      { letter: "", at: 0 },
    ]);
  });
});
