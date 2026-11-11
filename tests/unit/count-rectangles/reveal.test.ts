import { describe, expect, it } from "vitest";
import shipped from "../../../src/shared/games/count-rectangles/config.json";
import { LIT_LEAST, LIT_SECONDS, litSeconds } from "../../../src/shared/games/count-rectangles/reveal";

/** The pause between two problems as shipped, in ms. */
const PAUSE_MS = shipped.pauseSeconds * 1000;

describe("showing a closed problem's rectangles", () => {
  it("lights each for its full time when the pause is long enough for all", () => {
    expect(litSeconds(PAUSE_MS, shipped.minAnswer)).toBe(LIT_SECONDS);
    expect(litSeconds(PAUSE_MS, 1)).toBe(LIT_SECONDS);
  });

  it("lights each for less when there are too many, so that the last is shown before the next problem", () => {
    const most = shipped.maxAnswer;

    const each = litSeconds(PAUSE_MS, most);

    // at the full time each, the last of the largest answer would be lit for under half of its turn
    expect(most * LIT_SECONDS).toBeGreaterThan(shipped.pauseSeconds);
    expect(each).toBeLessThan(LIT_SECONDS);
    expect(most * each).toBeCloseTo(shipped.pauseSeconds, 9);
  });

  it("shows every rectangle of every answer the rules draw, each for long enough to be read", () => {
    for (let answer = shipped.minAnswer; answer <= shipped.maxAnswer; answer++) {
      const each = litSeconds(PAUSE_MS, answer);

      expect(answer * each).toBeLessThanOrEqual(shipped.pauseSeconds + 1e-9);
      expect(each).toBeGreaterThan(LIT_LEAST);
    }
  });

  it("never lights one for so short a time that it only flickers, even if not all are reached", () => {
    expect(litSeconds(PAUSE_MS, 114)).toBe(LIT_LEAST);
    // someone who comes in with two seconds of the pause left
    expect(litSeconds(2000, shipped.maxAnswer)).toBe(LIT_LEAST);
  });

  it("takes its time when no next problem is coming, or there is nothing to show", () => {
    expect(litSeconds(null, shipped.maxAnswer)).toBe(LIT_SECONDS);
    expect(litSeconds(PAUSE_MS, 0)).toBe(LIT_SECONDS);
    expect(litSeconds(0, 0)).toBe(LIT_SECONDS);
  });
});
