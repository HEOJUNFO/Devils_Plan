import { describe, expect, it } from "vitest";
import { gradeOf, shownMs, withSample, type LatencyConfig } from "../../../src/shared/latency";

/** Round numbers, and few times kept, so the bounds are easy to reach. */
const CONFIG: LatencyConfig = { fairMs: 200, poorMs: 500, keep: 3 };

describe("gradeOf", () => {
  it("is good under the first bound, fair from it, poor from the second", () => {
    expect(gradeOf(0, CONFIG)).toBe("good");
    expect(gradeOf(CONFIG.fairMs - 1, CONFIG)).toBe("good");
    expect(gradeOf(CONFIG.fairMs, CONFIG)).toBe("fair");
    expect(gradeOf(CONFIG.poorMs - 1, CONFIG)).toBe("fair");
    expect(gradeOf(CONFIG.poorMs, CONFIG)).toBe("poor");
  });
});

describe("withSample", () => {
  it("keeps the latest so many", () => {
    const kept = [10, 20, 30, 40].reduce<number[]>((samples, ms) => withSample(samples, ms, CONFIG), []);

    expect(kept).toEqual([20, 30, 40]);
  });

  it("does not keep what is no time", () => {
    expect(withSample([10], -1, CONFIG)).toEqual([10]);
    expect(withSample([10], Number.NaN, CONFIG)).toEqual([10]);
    expect(withSample([10], Number.POSITIVE_INFINITY, CONFIG)).toEqual([10]);
  });

  it("does not modify the times it was given", () => {
    const samples = [10, 20, 30];

    withSample(samples, 40, CONFIG);

    expect(samples).toEqual([10, 20, 30]);
  });
});

describe("shownMs", () => {
  it("is nothing before anything was measured", () => {
    expect(shownMs([])).toBeNull();
  });

  it("is the one time there is, in whole milliseconds", () => {
    expect(shownMs([151.6])).toBe(152);
  });

  it("is the middle one, so that one answer held up does not show", () => {
    expect(shownMs([150, 2400, 160])).toBe(160);
    expect(shownMs([150, 160])).toBe(150);
  });
});
