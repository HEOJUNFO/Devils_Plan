import { describe, expect, it } from "vitest";
import type { Solid } from "../../../src/shared/games/count-cubes/rules";
import {
  DEGREES_PER_PIXEL,
  FIRST_VIEW,
  MAX_EDGE,
  PITCH_MAX,
  PITCH_MIN,
  SHADE,
  cubeEdge,
  dragged,
  facesOf,
  pictureOf,
  settled,
  turned,
  type Face,
  type Shown,
  type View,
} from "../../../src/shared/games/count-cubes/view";

/** The picture the game's screen draws the solid on. */
const WIDTH = 288;
const HEIGHT = 190;
/** Half the line the screen draws round a face: the solid's outermost corners stay this far inside the picture. */
const HALF_LINE = 0.5;

/** One cube. */
const CUBE: Solid = { rows: 1, cols: 1, heights: [1] };
/** Two cubes side by side along a row. */
const PAIR: Solid = { rows: 1, cols: 2, heights: [1, 1] };
/** A staircase like the game's own: highest at the back corner, never rising towards the low one. */
const STAIRS: Solid = { rows: 3, cols: 3, heights: [3, 3, 2, 3, 2, 1, 2, 1, 1] };
/** A row of three columns: a tall one, and two low ones behind it when looked at from its end. */
const WALL: Solid = { rows: 1, cols: 3, heights: [5, 1, 1] };
/** Columns of every height in no order, with a gap in the middle: from any side something stands before something. */
const JUMBLE: Solid = { rows: 3, cols: 3, heights: [1, 4, 2, 5, 0, 3, 2, 6, 1] };
/** The largest solid the game makes: nine by nine, six high. */
const LARGEST: Solid = { rows: 9, cols: 9, heights: Array.from({ length: 81 }, () => 6) };
/** A long low one and a narrow tall one. */
const LONG: Solid = { rows: 5, cols: 9, heights: Array.from({ length: 45 }, () => 3) };

const view = (yaw: number, pitch = FIRST_VIEW.pitch): View => ({ yaw, pitch });
const picture = (solid: Solid, from: View): Shown[] => pictureOf(solid, from, WIDTH, HEIGHT);

/** Which shades are in the picture of `solid` from `from`. */
function shadesIn(solid: Solid, from: View): number[] {
  return [...new Set(picture(solid, from).map((shape) => shape.shade))].sort((a, b) => a - b);
}

/** The corners of every shape of a picture, as points. */
function cornersOf(shapes: readonly Shown[]): { x: number; y: number }[] {
  return shapes.flatMap((shape) => [0, 2, 4, 6].map((at) => ({ x: shape.corners[at], y: shape.corners[at + 1] })));
}

/** How far the picture reaches: its leftmost, rightmost, highest and lowest corner. */
function reach(shapes: readonly Shown[]): { left: number; right: number; top: number; bottom: number } {
  const points = cornersOf(shapes);
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
}

/** The farthest any corner of a face in both pictures lies in one from where it lies in the other, in pixels. */
function farthestMove(before: readonly Shown[], after: readonly Shown[]): number {
  const was = new Map(before.map((shape) => [shape.face, shape.corners]));
  let farthest = 0;
  for (const shape of after) {
    const old = was.get(shape.face);
    if (old === undefined) continue;
    shape.corners.forEach((value, at) => {
      farthest = Math.max(farthest, Math.abs(value - old[at]));
    });
  }
  return farthest;
}

/**
 * Whether face `front` stands between the eye and the point of face `behind`
 * that lies `s` along its first edge and `t` along its second: worked out in
 * the solid itself, along the line from that point to the eye, and not from
 * the picture.
 */
function covers(front: Face, behind: Face, s: number, t: number, from: View): boolean {
  const yaw = (from.yaw * Math.PI) / 180;
  const pitch = (from.pitch * Math.PI) / 180;
  // the way to the eye
  const eye = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
  const point = [behind.x + s * behind.u[0] + t * behind.v[0], behind.y + s * behind.u[1] + t * behind.v[1], behind.z + s * behind.u[2] + t * behind.v[2]];
  const dot = (a: readonly number[], b: readonly number[]): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const towards = dot(eye, front.n);
  if (Math.abs(towards) < 1e-9) return false;
  const corner = [front.x, front.y, front.z];
  const steps = dot([corner[0] - point[0], corner[1] - point[1], corner[2] - point[2]], front.n) / towards;
  if (steps <= 1e-6) return false;
  const hit = [point[0] + steps * eye[0] - corner[0], point[1] + steps * eye[1] - corner[1], point[2] + steps * eye[2] - corner[2]];
  const along = dot(hit, front.u);
  const up = dot(hit, front.v);
  return along > 1e-6 && along < 1 - 1e-6 && up > 1e-6 && up < 1 - 1e-6;
}

/** Points of a face well inside it: its middle, and towards each corner. */
const INSIDE: readonly (readonly [number, number])[] = [[0.5, 0.5], [0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]];

describe("큐브 세기, the solid from any side: its faces", () => {
  it("gives one cube its top and its four sides", () => {
    expect(facesOf(CUBE).map((face) => face.shade)).toEqual([SHADE.top, SHADE.east, SHADE.south, SHADE.west, SHADE.north]);
  });

  it("leaves out the faces between two cubes that stand together, and the ones underneath", () => {
    const faces = facesOf(PAIR);

    // two tops, the two ends of the row, and each cube's two long sides: the two faces where they touch are not there
    expect(faces).toHaveLength(8);
    expect(faces.filter((face) => face.shade === SHADE.east)).toHaveLength(1);
    expect(faces.filter((face) => face.shade === SHADE.west)).toHaveLength(1);
    expect(faces.every((face) => face.n[1] >= 0)).toBe(true);
  });

  it("has of each side what stands clear of the column beside it", () => {
    const faces = facesOf(WALL);
    const count = (shade: number): number => faces.filter((face) => face.shade === shade).length;

    expect(count(SHADE.top)).toBe(3);
    // the tall column shows four levels over its neighbour, and the last column its one level at the row's end
    expect(count(SHADE.east)).toBe(5);
    // from the other end only the tall column shows: all five levels of it
    expect(count(SHADE.west)).toBe(5);
    expect(count(SHADE.south)).toBe(7);
    expect(count(SHADE.north)).toBe(7);
    // and they are where they belong: each side is measured against the column on that side, not the other
    const placed = (shade: number): number[][] => faces.filter((face) => face.shade === shade).map((face) => [face.x, face.y]);
    expect(placed(SHADE.west)).toEqual([[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]]);
    expect(placed(SHADE.east)).toEqual([[1, 1], [1, 2], [1, 3], [1, 4], [3, 0]]);
  });

  it("measures the north and the south side each against the row on that side", () => {
    // a column of rows: a tall one at the back, two low ones before it
    const faces = facesOf({ rows: 3, cols: 1, heights: [5, 1, 1] });
    const placed = (shade: number): number[][] => faces.filter((face) => face.shade === shade).map((face) => [face.z, face.y]);

    expect(placed(SHADE.north)).toEqual([[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]]);
    expect(placed(SHADE.south)).toEqual([[1, 1], [1, 2], [1, 3], [1, 4], [3, 0]]);
  });

  it("has a face for every square of the solid's surface that is not on the floor", () => {
    // a block of two by three, two high: its top and its four walls
    const block: Solid = { rows: 2, cols: 3, heights: [2, 2, 2, 2, 2, 2] };

    expect(facesOf(block)).toHaveLength(6 + 2 * (2 * 2) + 2 * (3 * 2));
  });

  it("says of each face which column its cube stands in", () => {
    const faces = facesOf(STAIRS);

    // nine columns, and every face of a column begins at that column's own square or on its far edge
    expect(new Set(faces.map((face) => `${face.row},${face.col}`)).size).toBe(9);
    expect(faces.every((face) => [0, 1].includes(face.x - face.col) && [0, 1].includes(face.z - face.row))).toBe(true);
  });

  it("has no face for a place where nothing stands", () => {
    expect(facesOf({ rows: 1, cols: 2, heights: [0, 0] })).toEqual([]);
  });
});

describe("큐브 세기, the solid from any side: the view", () => {
  it("keeps the turn within one whole turn and the tilt within what is allowed", () => {
    expect(settled(view(-30))).toEqual(view(330));
    expect(settled(view(370))).toEqual(view(10));
    expect(settled(view(360))).toEqual(view(0));
    expect(settled(view(45, 5))).toEqual(view(45, PITCH_MIN));
    expect(settled(view(45, 89))).toEqual(view(45, PITCH_MAX));
    expect(settled(FIRST_VIEW)).toEqual(FIRST_VIEW);
  });

  it("turns and tilts by the degrees given", () => {
    expect(turned(view(350, 30), 20, 5)).toEqual(view(10, 35));
    expect(turned(view(10, 30), -20, -5)).toEqual(view(350, 25));
  });

  it("turns the near side of the solid with the pointer: a drag to the right turns it one way, to the left the other", () => {
    expect(dragged(FIRST_VIEW, 40, 0)).toEqual(view(45 - 40 * DEGREES_PER_PIXEL));
    expect(dragged(FIRST_VIEW, -40, 0)).toEqual(view(45 + 40 * DEGREES_PER_PIXEL));
    expect(dragged(FIRST_VIEW, 480, 0)).toEqual(view(45));
  });

  it("brings the eye higher when the picture is dragged down, and no higher or lower than allowed", () => {
    expect(dragged(FIRST_VIEW, 0, 8).pitch).toBe(FIRST_VIEW.pitch + 8 * DEGREES_PER_PIXEL);
    expect(dragged(FIRST_VIEW, 0, 500).pitch).toBe(PITCH_MAX);
    expect(dragged(FIRST_VIEW, 0, -500).pitch).toBe(PITCH_MIN);
  });

  it("first shows the solid from its low corner", () => {
    expect(FIRST_VIEW).toEqual({ yaw: 45, pitch: 30 });
    expect(FIRST_VIEW.pitch).toBeGreaterThanOrEqual(PITCH_MIN);
    expect(FIRST_VIEW.pitch).toBeLessThanOrEqual(PITCH_MAX);
  });
});

describe("큐브 세기, the solid from any side: its size", () => {
  it("draws a small solid with the longest edge, and the largest solid with cubes that still fit", () => {
    expect(cubeEdge(CUBE, WIDTH, HEIGHT)).toBe(MAX_EDGE);
    expect(cubeEdge(STAIRS, WIDTH, HEIGHT)).toBe(MAX_EDGE);
    // nine by nine and six high, in a picture 190 high: looked at, and kept
    expect(cubeEdge(LARGEST, WIDTH, HEIGHT)).toBeCloseTo(14.2, 1);
  });

  it("draws a solid too wide for the picture by its width, not its height", () => {
    // one row of thirty in a picture a hundred wide: from corner to corner it has the width less a pixel's margin on each side
    const row: Solid = { rows: 1, cols: 30, heights: Array.from({ length: 30 }, () => 1) };

    expect(cubeEdge(row, 100, HEIGHT)).toBeCloseTo(98 / Math.hypot(1, 30), 6);
  });

  it.each([
    ["the largest solid", LARGEST],
    ["a staircase", STAIRS],
    ["a long low solid", LONG],
    ["a single cube", CUBE],
  ])("keeps %s inside the picture from every side and at every tilt allowed", (_what, solid) => {
    for (let yaw = 0; yaw < 360; yaw += 15) {
      for (const pitch of [PITCH_MIN, FIRST_VIEW.pitch, 38, PITCH_MAX]) {
        const shapes = picture(solid, view(yaw, pitch));
        const { left, right, top, bottom } = reach(shapes);

        expect(shapes.length, `yaw ${yaw}, pitch ${pitch}`).toBeGreaterThan(0);
        expect(Math.min(left, top), `yaw ${yaw}, pitch ${pitch}`).toBeGreaterThanOrEqual(HALF_LINE);
        expect(right, `yaw ${yaw}, pitch ${pitch}`).toBeLessThanOrEqual(WIDTH - HALF_LINE);
        expect(bottom, `yaw ${yaw}, pitch ${pitch}`).toBeLessThanOrEqual(HEIGHT - HALF_LINE);
      }
    }
  });

  it("draws the largest solid as large as the picture lets it: at the view it stands tallest from, it reaches the margins", () => {
    const { top, bottom } = reach(picture(LARGEST, view(45, PITCH_MAX)));

    expect(top).toBeCloseTo(1, 6);
    expect(bottom).toBeCloseTo(HEIGHT - 1, 6);
  });

  it("keeps the middle of a block in the middle of the picture from every side", () => {
    for (const from of [FIRST_VIEW, view(100, 20), view(200, PITCH_MAX), view(333, PITCH_MIN)]) {
      const { left, right, top, bottom } = reach(picture(LONG, from));

      expect((left + right) / 2, `yaw ${from.yaw}`).toBeCloseTo(WIDTH / 2, 6);
      expect((top + bottom) / 2, `yaw ${from.yaw}`).toBeCloseTo(HEIGHT / 2, 6);
    }
  });

  it("draws a cube's top at the first view as a lozenge twice as wide as it is high", () => {
    const top = picture(CUBE, FIRST_VIEW).filter((shape) => shape.shade === SHADE.top);

    const { left, right, top: highest, bottom } = reach(top);

    expect(top).toHaveLength(1);
    expect(right - left).toBeCloseTo(MAX_EDGE * Math.SQRT2, 6);
    expect(bottom - highest).toBeCloseTo((right - left) / 2, 6);
  });
});

describe("큐브 세기, the solid from any side: turning it", () => {
  it("moves no corner more than a hair for a hair's turn, all the way round: nothing jumps a pixel", () => {
    // a twentieth of a degree at a time; the corner farthest from the middle is some 60 pixels out
    const step = 0.05;
    let farthest = 0;
    let before = picture(STAIRS, view(0));
    for (let turn = 1; turn <= 360 / step; turn++) {
      const after = picture(STAIRS, view(turn * step));
      farthest = Math.max(farthest, farthestMove(before, after));
      before = after;
    }

    expect(farthest).toBeGreaterThan(0);
    expect(farthest).toBeLessThan(0.1);
  });

  it("moves no corner more than a hair for a hair's tilt, from the lowest to the highest", () => {
    const step = 0.05;
    let farthest = 0;
    let before = picture(STAIRS, view(70, PITCH_MIN));
    for (let pitch = PITCH_MIN + step; pitch <= PITCH_MAX; pitch += step) {
      const after = picture(STAIRS, view(70, pitch));
      farthest = Math.max(farthest, farthestMove(before, after));
      before = after;
    }

    expect(farthest).toBeGreaterThan(0);
    expect(farthest).toBeLessThan(0.1);
  });

  it("is the same picture for the same view, and after a whole turn", () => {
    expect(picture(STAIRS, view(100, 20))).toEqual(picture(STAIRS, view(100, 20)));
    expect(picture(STAIRS, view(405))).toEqual(picture(STAIRS, view(45)));
  });

  it("is another picture from another side", () => {
    expect(picture(STAIRS, view(60))).not.toEqual(picture(STAIRS, view(45)));
    expect(picture(STAIRS, view(45, 40))).not.toEqual(picture(STAIRS, view(45, 30)));
  });
});

describe("큐브 세기, the solid from any side: what shows", () => {
  it("shows the top of every column from the first view: no column hides another", () => {
    const faces = facesOf(STAIRS);
    const tops = faces.filter((face) => face.shade === SHADE.top);

    const hidden = tops.filter((top) => faces.some((other) => other !== top && covers(other, top, 0.5, 0.5, FIRST_VIEW)));

    expect(tops).toHaveLength(9);
    expect(hidden).toEqual([]);
    expect(picture(STAIRS, FIRST_VIEW).filter((shape) => shape.shade === SHADE.top)).toHaveLength(9);
  });

  it("shows the tops and the two sides that face the eye, and never the two that look away", () => {
    expect(shadesIn(STAIRS, view(45))).toEqual([SHADE.top, SHADE.east, SHADE.south]);
    expect(shadesIn(STAIRS, view(135))).toEqual([SHADE.top, SHADE.east, SHADE.north]);
    expect(shadesIn(STAIRS, view(225))).toEqual([SHADE.top, SHADE.west, SHADE.north]);
    expect(shadesIn(STAIRS, view(315))).toEqual([SHADE.top, SHADE.south, SHADE.west]);
  });

  it("shows one side alone when the solid is looked at square on", () => {
    expect(shadesIn(STAIRS, view(0))).toEqual([SHADE.top, SHADE.south]);
    expect(shadesIn(STAIRS, view(90))).toEqual([SHADE.top, SHADE.east]);
    expect(shadesIn(STAIRS, view(180))).toEqual([SHADE.top, SHADE.north]);
    expect(shadesIn(STAIRS, view(270))).toEqual([SHADE.top, SHADE.west]);
  });

  it("has a shape for every face that looks towards the eye, and each face once", () => {
    const shapes = picture(LARGEST, FIRST_VIEW);

    // eighty-one tops, and nine columns of six on each of the two sides that show
    expect(shapes).toHaveLength(81 + 9 * 6 + 9 * 6);
    expect(new Set(shapes.map((shape) => shape.face)).size).toBe(shapes.length);
  });

  it("names each shape's face and gives it that face's shade", () => {
    const faces = facesOf(STAIRS);

    const shapes = picture(STAIRS, view(200, 20));

    expect(shapes.every((shape) => faces[shape.face].shade === shape.shade)).toBe(true);
  });

  it("draws what stands in front after what it covers: from the tall end of a row, the tall column comes last", () => {
    const faces = facesOf(WALL);
    const columnOf = (shape: Shown): number => faces[shape.face].col;

    const fromTallEnd = picture(WALL, view(270, PITCH_MIN)).map(columnOf);
    const fromLowEnd = picture(WALL, view(90, PITCH_MIN)).map(columnOf);

    // column 0 is the tall one: from its own end it is drawn over the two low ones behind it, from the other end under them
    expect([...new Set(fromTallEnd)]).toEqual([2, 1, 0]);
    expect([...new Set(fromLowEnd)]).toEqual([0, 1, 2]);
  });

  it("draws the rows from the far one to the near one as well as the columns", () => {
    const solid: Solid = { rows: 3, cols: 1, heights: [5, 1, 1] };
    const faces = facesOf(solid);
    const rowOf = (shape: Shown): number => faces[shape.face].row;

    expect([...new Set(picture(solid, view(0, PITCH_MIN)).map(rowOf))]).toEqual([0, 1, 2]);
    expect([...new Set(picture(solid, view(180, PITCH_MIN)).map(rowOf))]).toEqual([2, 1, 0]);
  });

  it.each([
    ["a staircase", STAIRS],
    ["a row with a tall end", WALL],
    ["columns of every height in no order", JUMBLE],
  ])("never draws a face over one that stands in front of it, from any side: %s", (_what, solid) => {
    const faces = facesOf(solid);
    let pairs = 0;
    // the first face found drawn under one it covers
    let wrong: string | undefined;
    for (let yaw = 0; yaw < 360; yaw += 7) {
      for (const pitch of [PITCH_MIN, FIRST_VIEW.pitch, PITCH_MAX]) {
        const from = view(yaw, pitch);
        const order = picture(solid, from).map((shape) => shape.face);
        order.forEach((behind, drawnAt) => {
          order.forEach((front, frontAt) => {
            if (front === behind || !INSIDE.some(([s, t]) => covers(faces[front], faces[behind], s, t, from))) return;
            pairs++;
            if (frontAt < drawnAt) wrong ??= `yaw ${yaw}, pitch ${pitch}: face ${front} is in front of face ${behind} and drawn before it`;
          });
        });
      }
    }

    // one check for all the views, not one for a pair: checks by the thousand took an earlier test past its time on CI
    expect(wrong).toBeUndefined();
    expect(pairs).toBeGreaterThan(0);
  });
});

describe("큐브 세기, the solid from any side: the shapes the lines go round", () => {
  it("gives every face a four-cornered shape whose corners go round it", () => {
    for (const shape of picture(STAIRS, view(200, 20))) {
      const [x0, y0, x1, y1, x2, y2, x3, y3] = shape.corners;

      expect(shape.corners).toHaveLength(8);
      // opposite corners are across the middle from each other: the shape is not twisted
      expect(x0 + x2).toBeCloseTo(x1 + x3, 6);
      expect(y0 + y2).toBeCloseTo(y1 + y3, 6);
    }
  });

  it("parts two cubes that stand flush: each top is a shape of its own, and the two share an edge", () => {
    const tops = picture(PAIR, FIRST_VIEW).filter((shape) => shape.shade === SHADE.top);
    const points = tops.map((top) => cornersOf([top]));

    const shared = points[0].filter((a) => points[1].some((b) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-6));

    expect(tops).toHaveLength(2);
    expect(shared).toHaveLength(2);
  });

  it("gives every face that shows at the first view a shape with room inside the line round it", () => {
    for (const shape of picture(LARGEST, FIRST_VIEW)) {
      const [x0, y0, x1, y1, , , x3, y3] = shape.corners;
      // the area of a shape with two edges from one corner
      const area = Math.abs((x1 - x0) * (y3 - y0) - (y1 - y0) * (x3 - x0));

      expect(area, `face ${shape.face}`).toBeGreaterThan(80);
    }
  });
});
