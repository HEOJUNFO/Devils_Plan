import { describe, expect, it } from "vitest";
import { feedbackLetter, normalizeFeedback, type FeedbackConfig } from "../../../src/shared/feedback";

/** A short text and few letters, so the limits are reached with little. */
const CONFIG: FeedbackConfig = { maxLength: 20, viewerLimit: { burst: 2, windowSeconds: 60 }, dayLimit: 3 };

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

describe("feedbackLetter", () => {
  it("says the text first, then the language and the build of the page", () => {
    const letter = feedbackLetter("방이 안 보여요\n두 번째 줄", { lang: "ko", build: "abc1234" });

    expect(letter.text).toBe("방이 안 보여요\n두 번째 줄\n\n--\nlanguage: ko\nbuild: abc1234");
  });

  it("is headed with the first line", () => {
    expect(feedbackLetter("방이 안 보여요\n두 번째 줄", { lang: "ko", build: "a" }).subject).toBe("[Brain Survival] 방이 안 보여요");
  });

  it("cuts a long first line short in the heading, and not in the letter", () => {
    const long = "가".repeat(60);

    const letter = feedbackLetter(long, { lang: "ko", build: "a" });

    expect(letter.subject).toBe(`[Brain Survival] ${"가".repeat(40)}…`);
    expect(letter.text.startsWith(long)).toBe(true);
  });
});
