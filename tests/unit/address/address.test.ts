import { afterEach, describe, expect, it, vi } from "vitest";
import { withinLimit, type Limiter } from "../../../src/server/address";

/** An address out of the range kept for examples. */
const ADDRESS = "203.0.113.5";
const NAME = "TEST_LIMITER";

/** A limiter that answers `success` and keeps the keys it was asked about. */
function limiterSaying(success: boolean): Limiter & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    limit: async ({ key }) => {
      asked.push(key);
      return { success };
    },
  };
}

/** The time the fixtures start at, in ms since the epoch. */
const T0 = 1_800_000_000_000;
const MINUTE_MS = 60_000;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a limit kept by address", () => {
  it("lets through what the limiter lets through, asking by the address", async () => {
    const limiter = limiterSaying(true);

    expect(await withinLimit(limiter, ADDRESS, NAME)).toBe(true);
    expect(limiter.asked).toEqual([ADDRESS]);
  });

  it("holds back what the limiter holds back", async () => {
    expect(await withinLimit(limiterSaying(false), ADDRESS, NAME)).toBe(false);
  });

  it("lets a request with no address through without asking", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const limiter = limiterSaying(false);

    expect(await withinLimit(limiter, null, NAME)).toBe(true);
    expect(limiter.asked).toEqual([]);
  });

  it("says in the log, once and not for every connection, that one came with no address", async () => {
    const warned = vi.spyOn(console, "warn").mockImplementation(() => {});
    // the module anew: whether it has said so already is kept in it
    vi.resetModules();
    const fresh = await import("../../../src/server/address");

    await fresh.withinLimit(limiterSaying(true), null, NAME);
    await fresh.withinLimit(limiterSaying(true), null, NAME);

    expect(warned).toHaveBeenCalledTimes(1);
    expect(warned.mock.calls[0].join(" ")).toContain("no address");
  });

  it("says in the log that the limiter turned one away, without the address, and once a minute at most", async () => {
    const said = vi.spyOn(console, "log").mockImplementation(() => {});
    const limiter = limiterSaying(false);
    const name = "TURNED_AWAY_LIMITER";

    await withinLimit(limiter, ADDRESS, name, T0);
    await withinLimit(limiter, ADDRESS, name, T0 + MINUTE_MS - 1);
    await withinLimit(limiter, ADDRESS, name, T0 + MINUTE_MS);

    expect(said).toHaveBeenCalledTimes(2);
    expect(said.mock.calls[0].join(" ")).toContain(name);
    expect(said.mock.calls[0].join(" ")).not.toContain(ADDRESS);
  });

  it("lets a request through when the limiter fails, and says so in the log without the address", async () => {
    const warned = vi.spyOn(console, "warn").mockImplementation(() => {});
    const broken: Limiter = {
      limit: async () => {
        throw new Error("no such namespace");
      },
    };

    expect(await withinLimit(broken, ADDRESS, NAME)).toBe(true);
    expect(warned).toHaveBeenCalledTimes(1);
    expect(warned.mock.calls[0].join(" ")).toContain(NAME);
    expect(warned.mock.calls[0].join(" ")).toContain("no such namespace");
    expect(warned.mock.calls[0].join(" ")).not.toContain(ADDRESS);
  });

  it("lets a request through when there is no limiter at all, and says so in the log", async () => {
    const warned = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(await withinLimit(undefined, ADDRESS, NAME)).toBe(true);
    expect(warned).toHaveBeenCalledTimes(1);
    expect(warned.mock.calls[0].join(" ")).toContain(NAME);
  });
});
