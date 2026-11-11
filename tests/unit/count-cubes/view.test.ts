import { describe, expect, it } from "vitest";
import type { Solid } from "../../../src/shared/games/count-cubes/rules";
import {
  DEGREES_PER_PIXEL,
  FIRST_VIEW,
  MAX_HALF,
  MIN_HALF,
  PITCH_MAX,
  PITCH_MIN,
  SHADE,
  cubeSize,
  dragged,
  faceMap,
  facesOf,
  settled,
  shadesOf,
  turned,
  type View,
} from "../../../src/shared/games/count-cubes/view";

/** The picture the game's screen draws the solid on. */
const WIDTH = 288;
const HEIGHT = 190;

/** One cube. */
const CUBE: Solid = { rows: 1, cols: 1, heights: [1] };
/** Two cubes side by side along a row. */
const PAIR: Solid = { rows: 1, cols: 2, heights: [1, 1] };
/** A staircase like the game's own: highest at the back corner, never rising towards the low one. */
const STAIRS: Solid = { rows: 3, cols: 3, heights: [3, 3, 2, 3, 2, 1, 2, 1, 1] };
/** A row of three columns: a tall one, and two low ones behind it when looked at from its end. */
const WALL: Solid = { rows: 1, cols: 3, heights: [5, 1, 1] };
/** The largest solid the game makes: nine by nine, six high. */
const LARGEST: Solid = { rows: 9, cols: 9, heights: Array.from({ length: 81 }, () => 6) };
/** A long low one and a narrow tall one. */
const LONG: Solid = { rows: 5, cols: 9, heights: Array.from({ length: 45 }, () => 3) };

const view = (yaw: number, pitch = FIRST_VIEW.pitch): View => ({ yaw, pitch });

/** Which faces show anywhere in the picture of `solid` from `from`. */
function shown(solid: Solid, from: View): Set<number> {
  return new Set([...faceMap(solid, from, WIDTH, HEIGHT)].filter((face) => face >= 0));
}

/** Which shades are in the picture of `solid` from `from`, the line and the empty left out. */
function shadesIn(solid: Solid, from: View): number[] {
  const faces = facesOf(solid);
  return [...new Set([...shown(solid, from)].map((face) => faces[face].shade))].sort((a, b) => a - b);
}

/** The picture as text, a letter to a pixel: for looking at, and for a test to hold a picture to. */
function drawn(solid: Solid, from: View, width: number, height: number): string[] {
  const letters = ".#TESWN";
  const shades = shadesOf(solid, from, width, height);
  return Array.from({ length: height }, (_, y) => [...shades.subarray(y * width, (y + 1) * width)].map((shade) => letters[shade]).join(""));
}

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
  it("draws a small solid with the largest cubes, and the largest solid with cubes that still fit", () => {
    expect(cubeSize(CUBE, WIDTH, HEIGHT)).toBe(MAX_HALF);
    expect(cubeSize(STAIRS, WIDTH, HEIGHT)).toBe(MAX_HALF);
    expect(cubeSize(LARGEST, WIDTH, HEIGHT)).toBe(10);
  });

  it("draws every cube an even number of pixels, and none smaller than the smallest", () => {
    expect(cubeSize(LARGEST, 8, 8)).toBe(MIN_HALF);
    for (const solid of [CUBE, PAIR, STAIRS, WALL, LARGEST, LONG]) {
      for (const height of [60, 97, 131, HEIGHT]) expect(cubeSize(solid, WIDTH, height) % 2, `picture ${height} high`).toBe(0);
    }
  });

  it.each([
    ["the largest solid", LARGEST],
    ["a staircase", STAIRS],
    ["a long low solid", LONG],
    ["a single cube", CUBE],
  ])("keeps %s inside the picture from every side and at every tilt allowed", (_what, solid) => {
    for (let yaw = 0; yaw < 360; yaw += 15) {
      for (const pitch of [PITCH_MIN, FIRST_VIEW.pitch, 38, PITCH_MAX]) {
        const map = faceMap(solid, view(yaw, pitch), WIDTH, HEIGHT);
        let seen = 0;
        for (let y = 0; y < HEIGHT; y++) {
          for (let x = 0; x < WIDTH; x++) {
            if (map[y * WIDTH + x] < 0) continue;
            seen++;
            // nothing of the solid is on the picture's outermost pixels: it would be cut off there
            expect(x > 0 && x < WIDTH - 1 && y > 0 && y < HEIGHT - 1, `yaw ${yaw}, pitch ${pitch}, pixel ${x},${y}`).toBe(true);
          }
        }
        expect(seen, `yaw ${yaw}, pitch ${pitch}`).toBeGreaterThan(0);
      }
    }
  });

  it("draws a cube's top at the first view as pixel art does: a lozenge that steps one pixel down for two across", () => {
    const half = cubeSize(CUBE, WIDTH, HEIGHT);
    const faces = facesOf(CUBE);
    const map = faceMap(CUBE, FIRST_VIEW, WIDTH, HEIGHT);
    const xs: number[] = [];
    const ys: number[] = [];
    map.forEach((face, at) => {
      if (face >= 0 && faces[face].shade === SHADE.top) {
        xs.push(at % WIDTH);
        ys.push(Math.floor(at / WIDTH));
      }
    });

    // its rows are 2, 6, 10 … pixels wide to the middle and back again: two short of twice the size at the widest
    const rows = [...new Set(ys)].sort((a, b) => a - b).map((y) => xs.filter((_, at) => ys[at] === y).length);

    expect(rows).toHaveLength(half);
    expect(rows).toEqual([...Array.from({ length: half / 2 }, (_, i) => 4 * i + 2), ...Array.from({ length: half / 2 }, (_, i) => 4 * (half / 2 - 1 - i) + 2)]);
    expect(Math.max(...xs) - Math.min(...xs) + 1).toBe(2 * half - 2);
  });
});

describe("큐브 세기, the solid from any side: what shows", () => {
  it("shows the top of every column from the first view: no column hides another", () => {
    const faces = facesOf(STAIRS);
    const tops = faces.flatMap((face, number) => (face.shade === SHADE.top ? [number] : []));

    const seen = shown(STAIRS, FIRST_VIEW);

    expect(tops).toHaveLength(9);
    expect(tops.every((top) => seen.has(top))).toBe(true);
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

  it("hides what stands behind something taller: from the tall end of a row, the low columns are out of sight", () => {
    const faces = facesOf(WALL);
    const topOfColumn = (col: number): number => faces.findIndex((face) => face.shade === SHADE.top && face.x === col);

    const fromTallEnd = shown(WALL, view(270, PITCH_MIN));
    const fromLowEnd = shown(WALL, view(90, PITCH_MIN));

    expect(fromTallEnd.has(topOfColumn(0))).toBe(true);
    expect(fromTallEnd.has(topOfColumn(1))).toBe(false);
    expect(fromTallEnd.has(topOfColumn(2))).toBe(false);
    // and from the other end all three tops show, the tall column behind the low ones
    expect([0, 1, 2].every((col) => fromLowEnd.has(topOfColumn(col)))).toBe(true);
  });

  it("shows of two faces at a pixel the one nearer the eye: a cube in front covers the wall behind it", () => {
    // a wall three high with one cube standing before its middle, looked at from in front
    const solid: Solid = { rows: 2, cols: 3, heights: [3, 3, 3, 0, 1, 0] };
    const faces = facesOf(solid);
    const wallBehindCube = faces.findIndex((face) => face.shade === SHADE.south && face.z === 1 && face.x === 1 && face.y === 0);
    const wallAboveCube = faces.findIndex((face) => face.shade === SHADE.south && face.z === 1 && face.x === 1 && face.y === 2);
    const frontOfCube = faces.findIndex((face) => face.shade === SHADE.south && face.z === 2 && face.x === 1);

    const seen = shown(solid, view(0, PITCH_MIN));

    // the wall's lowest square behind the cube is not a face at all: the cube stands against it
    expect(wallBehindCube).toBe(-1);
    expect(seen.has(frontOfCube)).toBe(true);
    expect(seen.has(wallAboveCube)).toBe(true);
  });

  it("leaves the picture empty around the solid", () => {
    const map = faceMap(STAIRS, FIRST_VIEW, WIDTH, HEIGHT);

    expect(map[0]).toBe(-1);
    expect(map[WIDTH - 1]).toBe(-1);
    expect(map[(HEIGHT - 1) * WIDTH]).toBe(-1);
    expect(map[HEIGHT * WIDTH - 1]).toBe(-1);
    // and the solid is in the middle of it
    expect(map[Math.floor(HEIGHT / 2) * WIDTH + Math.floor(WIDTH / 2)]).toBeGreaterThanOrEqual(0);
  });

  it("is the same picture for the same view, and after a whole turn", () => {
    expect(faceMap(STAIRS, view(100, 20), WIDTH, HEIGHT)).toEqual(faceMap(STAIRS, view(100, 20), WIDTH, HEIGHT));
    expect(faceMap(STAIRS, view(405), WIDTH, HEIGHT)).toEqual(faceMap(STAIRS, view(45), WIDTH, HEIGHT));
  });

  it("is another picture from another side", () => {
    expect(faceMap(STAIRS, view(60), WIDTH, HEIGHT)).not.toEqual(faceMap(STAIRS, view(45), WIDTH, HEIGHT));
    expect(faceMap(STAIRS, view(45, 40), WIDTH, HEIGHT)).not.toEqual(faceMap(STAIRS, view(45, 30), WIDTH, HEIGHT));
  });
});

describe("큐브 세기, the solid from any side: the lines between cubes", () => {
  it.each([
    ["the first view", FIRST_VIEW],
    ["a view from the back", view(200, 20)],
    ["a view from high up", view(100, PITCH_MAX)],
  ])("draws a line wherever one face ends and another begins, at %s", (_what, from) => {
    const map = faceMap(STAIRS, from, WIDTH, HEIGHT);
    const shades = shadesOf(STAIRS, from, WIDTH, HEIGHT);

    for (let y = 0; y < HEIGHT - 1; y++) {
      for (let x = 0; x < WIDTH - 1; x++) {
        const at = y * WIDTH + x;
        if (map[at] < 0) continue;
        // the face to the right or below is another: this pixel is the line between them
        if (map[at + 1] !== map[at] || map[at + WIDTH] !== map[at]) expect(shades[at], `pixel ${x},${y}`).toBe(SHADE.line);
      }
    }
  });

  it("draws a line around the solid, against the empty picture", () => {
    const map = faceMap(STAIRS, FIRST_VIEW, WIDTH, HEIGHT);
    const shades = shadesOf(STAIRS, FIRST_VIEW, WIDTH, HEIGHT);

    for (let y = 1; y < HEIGHT - 1; y++) {
      for (let x = 1; x < WIDTH - 1; x++) {
        const at = y * WIDTH + x;
        if (map[at] < 0) {
          expect(shades[at]).toBe(SHADE.none);
          continue;
        }
        const edge = [map[at - 1], map[at + 1], map[at - WIDTH], map[at + WIDTH]].some((face) => face < 0);
        if (edge) expect(shades[at], `pixel ${x},${y}`).toBe(SHADE.line);
      }
    }
  });

  it("parts two cubes that stand flush: each top keeps its own shade, with a line between", () => {
    const faces = facesOf(PAIR);
    const map = faceMap(PAIR, FIRST_VIEW, WIDTH, HEIGHT);
    const shades = shadesOf(PAIR, FIRST_VIEW, WIDTH, HEIGHT);
    const tops = faces.flatMap((face, number) => (face.shade === SHADE.top ? [number] : []));
    let touching = 0;
    let lined = 0;
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH - 1; x++) {
        const at = y * WIDTH + x;
        if (map[at] === tops[0] && map[at + 1] === tops[1]) {
          touching++;
          if (shades[at] === SHADE.line) lined++;
        }
      }
    }

    expect(tops).toHaveLength(2);
    // the two tops meet along an edge of the picture, and every pixel of the first along it is the line
    expect(touching).toBeGreaterThan(4);
    expect(lined).toBe(touching);
    for (const top of tops) {
      const own = [...map].filter((face, at) => face === top && shades[at] === SHADE.top).length;
      expect(own).toBeGreaterThan(50);
    }
  });

  it("leaves every face that shows at the first view some pixels of its own shade", () => {
    const faces = facesOf(LARGEST);
    const map = faceMap(LARGEST, FIRST_VIEW, WIDTH, HEIGHT);
    const shades = shadesOf(LARGEST, FIRST_VIEW, WIDTH, HEIGHT);
    const own = new Map<number, number>();
    map.forEach((face, at) => {
      if (face >= 0 && shades[at] === faces[face].shade) own.set(face, (own.get(face) ?? 0) + 1);
    });

    for (const face of shown(LARGEST, FIRST_VIEW)) expect(own.get(face) ?? 0, `face ${face}`).toBeGreaterThan(8);
  });

  it("draws one cube at the first view as pixel art would: a lozenge over two sides, lined all round", () => {
    // a picture small enough to be looked at here: T the top, S the side to the left, E the side to the right, # the line
    expect(drawn(CUBE, FIRST_VIEW, 20, 20)).toEqual(SMALL_CUBE);
  });
});

/** One cube at the first view on twenty pixels by twenty: looked at, and kept. */
const SMALL_CUBE: string[] = [
  "....................",
  "....................",
  "....................",
  "....................",
  ".........##.........",
  ".......##TT##.......",
  ".....##TTTTTT##.....",
  "....###TTTTTT###....",
  "....#S###TT##EE#....",
  "....#SSS###EEEE#....",
  "....#SSSS#EEEEE#....",
  "....#SSSS#EEEEE#....",
  "....#SSSS#EEEEE#....",
  "....#SSSS#EEEEE#....",
  ".....##SS#EEE##.....",
  ".......###E##.......",
  ".........##.........",
  "....................",
  "....................",
  "....................",
];
