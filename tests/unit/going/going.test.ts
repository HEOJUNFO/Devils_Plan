import { describe, expect, it } from "vitest";
import { comingOf, comingTo, isWho, mayAnswer, mayGiveAnother, meetPress, newWho, type GoingConfig } from "../../../src/shared/going";
import type { Meet } from "../../../src/shared/meet";

const CONFIG: GoingConfig = { perAddress: 4, most: 20 };
/** A meeting an hour long, and the one after it. */
const START = 1_800_000_000_000;
const NEXT = START + 86_400_000;
const meet = (on = false): Meet => ({ start: START, end: START + 3_600_000, game: "under-thirteen", on });
/** Fills with bytes that count up from 0: what is made of them is known. */
const counting = (bytes: Uint8Array): void => bytes.forEach((_byte, at) => bytes.fill(at, at, at + 1));

describe("newWho and isWho", () => {
  it("makes a number of thirty-two hexadecimal digits out of the random bytes it is given", () => {
    expect(newWho(counting)).toBe("000102030405060708090a0b0c0d0e0f");
    expect(isWho(newWho(counting))).toBe(true);
  });

  it("takes nothing else for such a number", () => {
    for (const raw of ["", "000102030405060708090a0b0c0d0e0", "000102030405060708090a0b0c0d0e0f0", "000102030405060708090A0B0C0D0E0F", "g00102030405060708090a0b0c0d0e0f", 12, null, undefined]) {
      expect(isWho(raw)).toBe(false);
    }
  });
});

describe("mayAnswer", () => {
  it("takes a word for the meeting that is next, and for the one that is on", () => {
    expect(mayAnswer(meet(), START)).toBe(true);
    expect(mayAnswer(meet(true), START)).toBe(true);
  });

  it("takes none for another meeting, nor where there is no meeting", () => {
    expect(mayAnswer(meet(), NEXT)).toBe(false);
    expect(mayAnswer(meet(), START - 1)).toBe(false);
    expect(mayAnswer(null, START)).toBe(false);
  });
});

describe("mayGiveAnother", () => {
  it("takes as many from one address as are set, and no more", () => {
    expect(mayGiveAnother(0, CONFIG)).toBe(true);
    expect(mayGiveAnother(CONFIG.perAddress - 1, CONFIG)).toBe(true);
    expect(mayGiveAnother(CONFIG.perAddress, CONFIG)).toBe(false);
  });
});

describe("comingOf", () => {
  it("tells how many, and of which meeting", () => {
    expect(comingOf(START, 3, CONFIG)).toEqual({ meet: START, count: 3, more: false });
    expect(comingOf(START, 0, CONFIG)).toEqual({ meet: START, count: 0, more: false });
  });

  it("tells no more than the most, and that there are more", () => {
    expect(comingOf(START, CONFIG.most, CONFIG)).toEqual({ meet: START, count: CONFIG.most, more: false });
    expect(comingOf(START, CONFIG.most + 1, CONFIG)).toEqual({ meet: START, count: CONFIG.most, more: true });
  });
});

describe("comingTo", () => {
  it("says nothing where there is no meeting, or nobody has said they will come", () => {
    expect(comingTo(null, { meet: START, count: 3, more: false }, START)).toBeNull();
    expect(comingTo(meet(), null, null)).toBeNull();
    expect(comingTo(meet(), { meet: START, count: 0, more: false }, null)).toBeNull();
  });

  it("says how many the directory said, and whether the reader is one of them", () => {
    expect(comingTo(meet(), { meet: START, count: 3, more: false }, null)).toEqual({ count: 3, more: false, mine: false });
    expect(comingTo(meet(), { meet: START, count: 3, more: false }, START)).toEqual({ count: 3, more: false, mine: true });
    expect(comingTo(meet(), { meet: START, count: 20, more: true }, null)).toEqual({ count: 20, more: true, mine: false });
  });

  it("counts the reader's own word before the directory has said so", () => {
    expect(comingTo(meet(), null, START)).toEqual({ count: 1, more: false, mine: true });
    expect(comingTo(meet(), { meet: START, count: 0, more: false }, START)).toEqual({ count: 1, more: false, mine: true });
  });

  it("reads nothing of what was said of another meeting, nor of a word given for one", () => {
    expect(comingTo(meet(), { meet: START - 86_400_000, count: 5, more: false }, null)).toBeNull();
    expect(comingTo(meet(), null, START - 86_400_000)).toBeNull();
    expect(comingTo(meet(), { meet: START, count: 2, more: false }, NEXT)).toEqual({ count: 2, more: false, mine: false });
  });
});

describe("meetPress", () => {
  it("opens the line before the hour: the reader will come, and the meeting's game is listed", () => {
    expect(meetPress(meet(), null, null)).toEqual({ going: true, list: "under-thirteen" });
    // whatever was listed, and though a word was given for another meeting
    expect(meetPress(meet(), "count-cubes", NEXT)).toEqual({ going: true, list: "under-thirteen" });
    expect(meetPress(meet(), "under-thirteen", null)).toEqual({ going: true, list: "under-thirteen" });
  });

  it("closes it with the next press: the word is taken back, and every game is listed again", () => {
    expect(meetPress(meet(), "under-thirteen", START)).toEqual({ going: false, list: null });
    // a reader who came back to a lobby that says they are coming: one press takes it back
    expect(meetPress(meet(), null, START)).toEqual({ going: false, list: null });
  });

  it("gives and takes no word while the meeting is on, and lists its game or every game again", () => {
    expect(meetPress(meet(true), null, null)).toEqual({ going: null, list: "under-thirteen" });
    expect(meetPress(meet(true), "count-cubes", START)).toEqual({ going: null, list: "under-thirteen" });
    expect(meetPress(meet(true), "under-thirteen", START)).toEqual({ going: null, list: null });
  });
});
