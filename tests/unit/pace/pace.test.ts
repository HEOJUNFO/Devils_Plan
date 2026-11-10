import { describe, expect, it } from "vitest";
import { pace, type Pace } from "../../../src/shared/pace";

/** A small allowance and a short window, so both are reached in a few steps. */
const BURST = 3;
const WINDOW_SECONDS = 5;
/** An arbitrary moment the tests call "now", in ms. */
const NOW = 1_000_000;

describe("pace", () => {
  it("lets a sender who has done nothing go", () => {
    expect(pace(undefined, NOW, BURST, WINDOW_SECONDS)).toEqual({ ok: true, pace: { count: 1, since: NOW } });
  });

  it("lets a sender go as many times in a window as the allowance, and no more", () => {
    let previous: Pace | undefined;
    const allowed: boolean[] = [];

    for (let n = 0; n <= BURST; n++) {
      const result = pace(previous, NOW + n, BURST, WINDOW_SECONDS);
      allowed.push(result.ok);
      previous = result.pace;
    }

    expect(allowed).toEqual([...Array.from({ length: BURST }, () => true), false]);
    expect(previous).toEqual({ count: BURST, since: NOW });
  });

  it("refuses up to the last moment of the window, and allows from the first after it", () => {
    const full: Pace = { count: BURST, since: NOW };
    const end = NOW + WINDOW_SECONDS * 1000;

    expect(pace(full, end - 1, BURST, WINDOW_SECONDS).ok).toBe(false);
    expect(pace(full, end, BURST, WINDOW_SECONDS)).toEqual({ ok: true, pace: { count: 1, since: end } });
  });

  it("does not count a refusal against the sender", () => {
    const full: Pace = { count: BURST, since: NOW };

    expect(pace(full, NOW + 1, BURST, WINDOW_SECONDS).pace).toBe(full);
  });

  it("starts over when the clock has gone backwards", () => {
    const full: Pace = { count: BURST, since: NOW };

    expect(pace(full, NOW - 1, BURST, WINDOW_SECONDS)).toEqual({ ok: true, pace: { count: 1, since: NOW - 1 } });
  });

  it("allows nothing when the allowance is nothing, after the first", () => {
    const first = pace(undefined, NOW, 0, WINDOW_SECONDS);

    expect(pace(first.pace, NOW + 1, 0, WINDOW_SECONDS).ok).toBe(false);
  });
});
