import { describe, expect, it } from "vitest";
import { BUILD, heldBack, outOfDate, type OnPage } from "../../../src/shared/build";

describe("BUILD", () => {
  it("is dev where no build put a commit in", () => {
    expect(BUILD).toBe("dev");
  });
});

describe("outOfDate", () => {
  it("is so for a page of another build than the server's", () => {
    expect(outOfDate("aaaaaaa", "bbbbbbb", null)).toBe(true);
  });

  it("is not so for a page of the server's own build", () => {
    expect(outOfDate("aaaaaaa", "aaaaaaa", null)).toBe(false);
  });

  it("is not so when the server does not say which build it is", () => {
    for (const servers of [undefined, null, "", 7, { build: "bbbbbbb" }]) {
      expect(outOfDate("aaaaaaa", servers, null)).toBe(false);
    }
  });

  it("is not so again for a page that was loaded again from this build and came back the same", () => {
    expect(outOfDate("aaaaaaa", "bbbbbbb", "aaaaaaa")).toBe(false);
  });

  it("is so for a page loaded again from an older build, when the server has moved on once more", () => {
    expect(outOfDate("bbbbbbb", "ccccccc", "aaaaaaa")).toBe(true);
  });
});

describe("heldBack", () => {
  /** A page with nothing on it that loading again would take. */
  const bare: OnPage = { game: false, voice: false, onTheWay: false, startAsked: false, typed: false, reading: false };

  it("holds a page back for each thing that loading again would take, when nothing has happened", () => {
    expect(heldBack("idle", bare)).toBe(false);
    for (const key of Object.keys(bare) as (keyof OnPage)[]) expect(heldBack("idle", { ...bare, [key]: true })).toBe(true);
  });

  it("does not hold back for the results on the screen, or a start asked for, once the next game has begun", () => {
    expect(heldBack("start", { ...bare, game: true, startAsked: true })).toBe(false);
  });

  it("still holds back at a game's start for the voice chat and for words typed and not sent", () => {
    for (const key of ["voice", "onTheWay", "typed", "reading"] as const) expect(heldBack("start", { ...bare, game: true, [key]: true })).toBe(true);
  });

  it("holds nothing back once the game on the screen has gone wrong: the fault of 2026-11-26", () => {
    // (a page of b304243 in a game of 히든 워드 run by a newer room: `t.checks.length` of a hand that had no checks any more)
    expect(heldBack("fault", { game: true, voice: true, onTheWay: true, startAsked: true, typed: true, reading: true })).toBe(false);
  });

  it("holds back as when nothing has happened for what went wrong with no game on the screen", () => {
    expect(heldBack("fault", bare)).toBe(false);
    expect(heldBack("fault", { ...bare, typed: true })).toBe(true);
    expect(heldBack("fault", { ...bare, voice: true })).toBe(true);
  });
});
