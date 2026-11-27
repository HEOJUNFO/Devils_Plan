import { describe, expect, it } from "vitest";
import { fontIn, type FontConfig } from "../../../src/shared/font";
import fontConfig from "../../../src/shared/font-config.json";

/** Two more tries, a second and then three seconds after the one before. */
const CONFIG: FontConfig = { againSeconds: [1, 3] };

/** A way of asking that fails as many times as it is told to, and counts how often it was asked. */
function asking(failures: number): { ask: () => Promise<void>; asked: () => number } {
  let count = 0;
  return {
    ask: () => {
      count += 1;
      return count <= failures ? Promise.reject(new DOMException("A network error occurred.", "NetworkError")) : Promise.resolve();
    },
    asked: () => count,
  };
}

/** A wait that is over at once, and remembers how long each was to be. */
function waiting(): { wait: (seconds: number) => Promise<void>; waited: number[] } {
  const waited: number[] = [];
  return {
    wait: (seconds) => {
      waited.push(seconds);
      return Promise.resolve();
    },
    waited,
  };
}

describe("fontIn", () => {
  it("is in at once when the page's own asking brings it, and nothing is asked again", async () => {
    const first = asking(0);
    const again = asking(0);
    const { wait, waited } = waiting();
    await expect(fontIn(first.ask, again.ask, wait, CONFIG)).resolves.toBe(true);
    expect(first.asked()).toBe(1);
    expect(again.asked()).toBe(0);
    expect(waited).toEqual([]);
  });

  it("asks again after the first wait when the font did not come, and is in when that brings it", async () => {
    const first = asking(1);
    const again = asking(0);
    const { wait, waited } = waiting();
    await expect(fontIn(first.ask, again.ask, wait, CONFIG)).resolves.toBe(true);
    expect(first.asked()).toBe(1);
    expect(again.asked()).toBe(1);
    expect(waited).toEqual([1]);
  });

  it("waits longer before each further try", async () => {
    const first = asking(1);
    const again = asking(1);
    const { wait, waited } = waiting();
    await expect(fontIn(first.ask, again.ask, wait, CONFIG)).resolves.toBe(true);
    expect(again.asked()).toBe(2);
    expect(waited).toEqual([1, 3]);
  });

  it("gives up after the last try, saying the font is not in, and rejects nothing", async () => {
    const first = asking(1);
    const again = asking(99);
    const { wait, waited } = waiting();
    await expect(fontIn(first.ask, again.ask, wait, CONFIG)).resolves.toBe(false);
    expect(first.asked()).toBe(1);
    expect(again.asked()).toBe(2);
    expect(waited).toEqual([1, 3]);
  });

  it("takes an asking that throws where it stands as one that did not bring the font", async () => {
    const again = asking(0);
    const { wait } = waiting();
    const thrown = (): Promise<void> => {
      throw new TypeError("no such thing here");
    };
    await expect(fontIn(thrown, again.ask, wait, CONFIG)).resolves.toBe(true);
    expect(again.asked()).toBe(1);
  });

  it("with no further tries, says the font is not in when the first asking fails", async () => {
    const first = asking(1);
    const again = asking(0);
    const { wait, waited } = waiting();
    await expect(fontIn(first.ask, again.ask, wait, { againSeconds: [] })).resolves.toBe(false);
    expect(again.asked()).toBe(0);
    expect(waited).toEqual([]);
  });
});

describe("the font's config", () => {
  it("asks again at least once, each time after a wait longer than the one before", () => {
    const config: FontConfig = fontConfig;
    expect(config.againSeconds.length).toBeGreaterThan(0);
    config.againSeconds.forEach((seconds, at) => {
      expect(seconds).toBeGreaterThan(at === 0 ? 0 : (config.againSeconds[at - 1] ?? 0));
    });
  });
});
