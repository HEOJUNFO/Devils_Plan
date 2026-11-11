import { describe, expect, it } from "vitest";
import { stand } from "../../../src/shared/standing";

/** The moment the fixtures call now, and how long a game may stand, in ms. */
const NOW = 5_000_000;
const STAND_MS = 180_000;

/** A game that is going, with someone there: each test changes what it is about. */
function at(change: Partial<Parameters<typeof stand>[0]> = {}): Parameters<typeof stand>[0] {
  return { frozenAt: null, here: true, inRoom: true, now: NOW, standMs: STAND_MS, ...change };
}

describe("a game and who is there to play it", () => {
  it("goes on while someone is there", () => {
    expect(stand(at())).toEqual({ now: "going" });
  });

  it("stands still from the moment nobody is connected", () => {
    expect(stand(at({ here: false }))).toEqual({ now: "standing", since: NOW });
  });

  it("goes on standing from when it first stood, however often it is asked", () => {
    expect(stand(at({ here: false, frozenAt: NOW - 60_000 }))).toEqual({ now: "standing", since: NOW - 60_000 });
  });

  it("goes on when someone is back, and says how long it stood", () => {
    expect(stand(at({ frozenAt: NOW - 60_000 }))).toEqual({ now: "back", stood: 60_000 });
  });

  it("never says it stood for less than no time, whatever the clocks say", () => {
    expect(stand(at({ frozenAt: NOW + 5000 }))).toEqual({ now: "back", stood: 0 });
  });

  it("is over when it has stood as long as a game may, and not a moment sooner", () => {
    expect(stand(at({ here: false, frozenAt: NOW - STAND_MS + 1 }))).toEqual({ now: "standing", since: NOW - STAND_MS + 1 });
    expect(stand(at({ here: false, frozenAt: NOW - STAND_MS }))).toEqual({ now: "over" });
  });

  it("is over at that moment even if someone is just back", () => {
    expect(stand(at({ here: true, frozenAt: NOW - STAND_MS }))).toEqual({ now: "over" });
  });

  it("is over at once when nobody who could go on is left in the room", () => {
    expect(stand(at({ here: false, inRoom: false }))).toEqual({ now: "over" });
    expect(stand(at({ here: true, inRoom: false }))).toEqual({ now: "over" });
  });
});
