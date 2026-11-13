import { describe, expect, it } from "vitest";
import { normalizeFeedback, parseFlag, type FeedbackConfig } from "../../../src/shared/feedback";

/** A short text and few of everything, so the limits are reached with little. */
const CONFIG: FeedbackConfig = {
  maxLength: 20,
  viewerLimit: { burst: 2, windowSeconds: 60 },
  dayLimit: 3,
  keep: 2,
  readLimit: { burst: 2, windowSeconds: 60 },
};

describe("normalizeFeedback", () => {
  it("keeps the lines of what was written, each trimmed", () => {
    expect(normalizeFeedback("  first \n second  ", CONFIG)).toBe("first\nsecond");
  });

  it("drops lines with nothing in them and characters that cannot be seen", () => {
    expect(normalizeFeedback("one\n\n \n​two\u0007", CONFIG)).toBe("one\ntwo");
  });

  it("cuts what is longer than the limit", () => {
    expect(normalizeFeedback("x".repeat(50), CONFIG)).toBe("x".repeat(20));
  });

  it("has nothing left of a text that shows nothing", () => {
    for (const raw of ["", "   ", "\n\n", "​ㅤ"]) expect(normalizeFeedback(raw, CONFIG)).toBeNull();
  });
});

describe("parseFlag", () => {
  /** A room sends at most so many lines, each and the name no longer than this. */
  const LIMITS = { lines: 2, lineLength: 10, nickLength: 5 };

  it("reads a flag as a room sends it", () => {
    const flag = { nick: "p1", game: "count-cubes", lines: ["one", "two"] };

    expect(parseFlag(flag, LIMITS)).toEqual(flag);
  });

  it("reads a flag with no lines: a name alone can be what is pointed at", () => {
    expect(parseFlag({ nick: "p1", game: "count-cubes", lines: [] }, LIMITS)).toEqual({ nick: "p1", game: "count-cubes", lines: [] });
  });

  it("keeps nothing a flag was sent with besides who, which game and the lines", () => {
    expect(parseFlag({ nick: "p1", game: "g", lines: [], by: "p0", code: "ABCDE" }, LIMITS)).toEqual({ nick: "p1", game: "g", lines: [] });
  });

  it("rejects what is no flag", () => {
    for (const raw of [null, "flag", 3, [], {}, { nick: "p1" }, { nick: "p1", game: "g" }, { nick: 1, game: "g", lines: [] }, { nick: "p1", game: 2, lines: [] }, { nick: "p1", game: "g", lines: "one" }]) {
      expect(parseFlag(raw, LIMITS)).toBeNull();
    }
  });

  it("rejects a flag with no name or no game", () => {
    expect(parseFlag({ nick: "", game: "g", lines: [] }, LIMITS)).toBeNull();
    expect(parseFlag({ nick: "p1", game: "", lines: [] }, LIMITS)).toBeNull();
  });

  it("rejects more lines, a longer line or a longer name than a room sends", () => {
    expect(parseFlag({ nick: "p1", game: "g", lines: ["a", "b", "c"] }, LIMITS)).toBeNull();
    expect(parseFlag({ nick: "p1", game: "g", lines: ["x".repeat(LIMITS.lineLength + 1)] }, LIMITS)).toBeNull();
    expect(parseFlag({ nick: "x".repeat(LIMITS.nickLength + 1), game: "g", lines: [] }, LIMITS)).toBeNull();
  });

  it("counts a name and a line as a reader does, not by code unit", () => {
    expect(parseFlag({ nick: "가".repeat(LIMITS.nickLength), game: "g", lines: ["😀".repeat(LIMITS.lineLength)] }, LIMITS)).not.toBeNull();
  });

  it("rejects a line that is not text, or has nothing in it", () => {
    expect(parseFlag({ nick: "p1", game: "g", lines: [3] }, LIMITS)).toBeNull();
    expect(parseFlag({ nick: "p1", game: "g", lines: [""] }, LIMITS)).toBeNull();
  });
});
