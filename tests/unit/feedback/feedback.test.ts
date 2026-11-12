import { describe, expect, it } from "vitest";
import { normalizeFeedback, type FeedbackConfig } from "../../../src/shared/feedback";

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
