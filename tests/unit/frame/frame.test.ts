import { describe, expect, it } from "vitest";
import { FRAME_H, FRAME_W, frameScale, hits, liftFor, placeFrame, reach, type Box, type Screen } from "../../../src/shared/frame";

/** A desktop window on a screen of two pixels to one, with a mouse. */
const DESKTOP: Screen = { width: 1512, height: 828, density: 2, coarse: false };
/** A phone of 844 by 390 held sideways in its browser, the bars and the notch taken off: three pixels to one, a finger. */
const PHONE: Screen = { width: 750, height: 340, density: 3, coarse: true };
/** A small phone of 667 by 375, as wide for its height as the frame: two pixels to one. */
const SMALL_PHONE: Screen = { width: 667, height: 375, density: 2, coarse: true };

describe("frameScale", () => {
  it("keeps a pixel of the game a whole number of the screen's pixels under a mouse", () => {
    // 1512/480 = 3.15 and 828/270 = 3.07: three whole, on a screen of two to one
    expect(frameScale(DESKTOP)).toBe(3);
    // 2.9 fits; on a screen of two to one that is 2.5, five of its pixels to one of the game's
    expect(frameScale({ width: 1400, height: 783, density: 2, coarse: false })).toBe(2.5);
  });

  it("draws the frame as large as the screen allows under a finger, where whole pixels would cost a quarter of its size", () => {
    const scale = frameScale(PHONE);

    expect(scale).toBeCloseTo(340 / FRAME_H, 10);
    // the same phone with a mouse's rule would be drawn at one
    expect(frameScale({ ...PHONE, coarse: false })).toBe(1);
    expect(scale).toBeGreaterThan(1.25);
  });

  it("fills a phone that is as wide for its height as the frame", () => {
    expect(frameScale(SMALL_PHONE)).toBeCloseTo(375 / FRAME_H, 10);
    expect(frameScale({ ...SMALL_PHONE, coarse: false })).toBe(1);
  });

  it("never draws the frame larger than the screen, whichever side is the short one", () => {
    for (const screen of [PHONE, SMALL_PHONE, { width: 390, height: 844, density: 3, coarse: true }, { width: 1024, height: 700, density: 2, coarse: true }]) {
      const scale = frameScale(screen);
      expect(FRAME_W * scale).toBeLessThanOrEqual(screen.width + 1e-9);
      expect(FRAME_H * scale).toBeLessThanOrEqual(screen.height + 1e-9);
      // and one of the two sides is used up
      expect(Math.min(screen.width - FRAME_W * scale, screen.height - FRAME_H * scale)).toBeLessThan(1e-9);
    }
  });

  it("shrinks the frame to fit a window too small for one to one, mouse or finger", () => {
    expect(frameScale({ width: 400, height: 300, density: 1, coarse: false })).toBeCloseTo(400 / FRAME_W, 10);
    expect(frameScale({ width: 400, height: 300, density: 1, coarse: true })).toBeCloseTo(400 / FRAME_W, 10);
  });

  it("answers one for a screen it is told nothing of, rather than nothing at all", () => {
    expect(frameScale({ width: 0, height: 0, density: 2, coarse: false })).toBe(1);
    expect(frameScale({ width: Number.NaN, height: 300, density: 2, coarse: true })).toBe(1);
  });

  it("takes a density it is not told for one", () => {
    expect(frameScale({ width: 1000, height: 600, density: 0, coarse: false })).toBe(2);
  });
});

describe("placeFrame", () => {
  it("puts the frame in the middle of the screen", () => {
    const placed = placeFrame(DESKTOP);

    expect(placed).toEqual({ scale: 3, left: (1512 - 1440) / 2, top: (828 - 810) / 2 });
  });

  it("puts the frame's corner on a whole pixel of the screen", () => {
    const placed = placeFrame(PHONE);

    // 480 * 1.2593 = 604.4: the room left over is 145.6, half of it 72.8, and the nearest third of a pixel is 72.667
    expect(placed.left * PHONE.density).toBeCloseTo(Math.round(placed.left * PHONE.density), 9);
    expect(placed.top * PHONE.density).toBeCloseTo(Math.round(placed.top * PHONE.density), 9);
    expect(placed.left).toBeCloseTo(72.667, 2);
    expect(placed.top).toBeCloseTo(0, 9);
  });
});

describe("liftFor", () => {
  /** How far above the keyboard a box is brought. */
  const MARGIN = 8;

  it("moves nothing while the box is in sight", () => {
    // the keyboard leaves 340 of the page in sight; the box ends at 200
    expect(liftFor(200, 0, 340, MARGIN)).toBe(0);
    // just in sight with its margin
    expect(liftFor(332, 0, 340, MARGIN)).toBe(0);
  });

  it("lifts the frame by as much as the box is under the keyboard, and the margin", () => {
    // the keyboard takes the lower 180 of 340: 160 are in sight, and the box ends at 300
    expect(liftFor(300, 0, 160, MARGIN)).toBe(300 + MARGIN - 160);
  });

  it("counts from where the part in sight begins when the browser has moved it", () => {
    // the browser has already moved the page up by 120: what is in sight is 120 to 280
    expect(liftFor(300, 120, 160, MARGIN)).toBe(300 + MARGIN - 280);
    // moved far enough by itself
    expect(liftFor(300, 150, 160, MARGIN)).toBe(0);
  });

  it("lifts by whole pixels", () => {
    expect(liftFor(300.2, 0, 160.5, MARGIN)).toBe(148);
  });
});

/** A small button of the bar: the one that leaves the results, 90 by 15. */
const SMALL: Box = [386, 250, 90, 15];

describe("reach", () => {
  it("adds the same on every side of a box", () => {
    expect(reach(SMALL, 4)).toEqual([382, 246, 98, 23]);
  });

  it("adds to each side apart: left, top, right, bottom", () => {
    expect(reach(SMALL, [1, 5, 2, 3])).toEqual([385, 245, 93, 23]);
  });

  it("leaves a box as it is for nothing added", () => {
    expect(reach(SMALL, 0)).toEqual([...SMALL]);
  });
});

describe("hits", () => {
  it("takes a press inside the box, mouse or finger", () => {
    expect(hits({ x: 400, y: 255, touch: false }, SMALL)).toBe(true);
    expect(hits({ x: 400, y: 255, touch: true }, SMALL)).toBe(true);
  });

  it("counts the left and top edges in and the right and bottom edges out, as the boxes are drawn", () => {
    expect(hits({ x: 386, y: 250, touch: false }, SMALL)).toBe(true);
    expect(hits({ x: 476, y: 250, touch: false }, SMALL)).toBe(false);
    expect(hits({ x: 386, y: 265, touch: false }, SMALL)).toBe(false);
  });

  it("takes a finger just outside a box that reaches for it", () => {
    const above = { x: 400, y: 246 };

    expect(hits({ ...above, touch: true }, SMALL, [0, 5, 0, 3])).toBe(true);
    // one pixel past the reach is out
    expect(hits({ x: 400, y: 244, touch: true }, SMALL, [0, 5, 0, 3])).toBe(false);
    expect(hits({ x: 400, y: 268, touch: true }, SMALL, [0, 5, 0, 3])).toBe(false);
  });

  it("never reaches for a mouse, which points to the pixel", () => {
    expect(hits({ x: 400, y: 246, touch: false }, SMALL, [0, 5, 0, 3])).toBe(false);
  });

  it("reaches no farther than the box for a finger it is given no reach for", () => {
    expect(hits({ x: 400, y: 249, touch: true }, SMALL)).toBe(false);
  });
});
