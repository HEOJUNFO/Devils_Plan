/**
 * The solid of 큐브 세기 as a picture from any side: which face of which
 * cube shows at each pixel, for a solid turned about its upright axis and
 * looked at from more or less above. Pure arithmetic over plain numbers:
 * the screen (`src/client/games/count-cubes/screen.ts`) gives the pixels
 * their colours and turns the solid with the pointer.
 *
 * The way of drawing is that of pixel-art 3D: the solid is drawn small, one
 * sample to a pixel with nothing smoothed, and a line goes wherever two
 * neighbouring pixels belong to different faces. Every square face of every
 * cube is a face of its own here, so the line also falls between two cubes
 * that stand flush with each other: that is what lets them be counted.
 *
 * Design: design/games/count-cubes.md.
 */
import { heightAt, type Solid } from "./rules";

/** From where the solid is looked at. */
export interface View {
  /**
   * Degrees the solid is turned about its upright axis, from 0 up to 360.
   * At 45 the eye is at the corner where the solid's rows and columns end:
   * its low corner, from which no column hides another.
   */
  yaw: number;
  /** Degrees the eye stands above the floor. At 30 the top of a cube is a lozenge twice as wide as it is high. */
  pitch: number;
}

/** The view a solid is first shown from. */
export const FIRST_VIEW: View = { yaw: 45, pitch: 30 };
/**
 * How far the eye can be lowered and raised, in degrees. From higher up the
 * floor of a large solid takes more of the picture's height than there is,
 * at a size its cubes can still be counted at.
 */
export const PITCH_MIN = 15;
export const PITCH_MAX = 45;
/** Degrees the solid turns for each pixel the pointer drags the picture. */
export const DEGREES_PER_PIXEL = 0.75;
/** Half the width of a cube's top at the first view, in pixels: the largest it is drawn, and the smallest. Even, as every size is. */
export const MAX_HALF = 16;
export const MIN_HALF = 2;
/** Pixels left clear at the picture's edges, for the line around the solid. */
const MARGIN = 1;

/** What shows at a pixel: nothing, a line where a face ends, the top of a cube, or one of its four sides. */
export const SHADE = { none: 0, line: 1, top: 2, east: 3, south: 4, west: 5, north: 6 } as const;
export type Shade = (typeof SHADE)[keyof typeof SHADE];

/**
 * One square face of one cube, as it lies in the solid: a corner, the two
 * edges that leave it, and the way it faces. A column stands on the square
 * from `col`, `row` to `col + 1`, `row + 1` of the floor; `x` runs along the
 * columns, `z` along the rows, `y` upwards.
 */
export interface Face {
  shade: Shade;
  /** The corner. */
  x: number;
  y: number;
  z: number;
  /** The first edge from it, and the second. */
  u: readonly [number, number, number];
  v: readonly [number, number, number];
  /** The way the face looks. */
  n: readonly [number, number, number];
}

const ALONG_X = [1, 0, 0] as const;
const ALONG_Z = [0, 0, 1] as const;
const UP = [0, 1, 0] as const;

/** `view` with its turn brought into 0 to 360 and its tilt kept within what is allowed. */
export function settled(view: View): View {
  const yaw = ((view.yaw % 360) + 360) % 360;
  return { yaw, pitch: Math.min(PITCH_MAX, Math.max(PITCH_MIN, view.pitch)) };
}

/** `view` turned by `yaw` degrees and tilted by `pitch` more. */
export function turned(view: View, yaw: number, pitch: number): View {
  return settled({ yaw: view.yaw + yaw, pitch: view.pitch + pitch });
}

/**
 * `view` after the pointer has dragged the picture `dx` pixels to the right
 * and `dy` down: the near side of the solid goes with the pointer, and
 * dragging down brings the eye higher over it.
 */
export function dragged(view: View, dx: number, dy: number): View {
  return turned(view, -dx * DEGREES_PER_PIXEL, dy * DEGREES_PER_PIXEL);
}

/** How high the solid stands at its highest. */
function topOf(solid: Solid): number {
  return solid.heights.reduce((top, height) => Math.max(top, height), 0);
}

/**
 * Half the width, in pixels, of a cube's top as the first view shows it: an
 * even number, so that at the first view the corners of every top fall on
 * whole pixels, as pixel art has them. The largest at which the solid stays
 * inside `width` by `height` from every side and at every tilt allowed, so
 * that turning it never changes its size.
 */
export function cubeSize(solid: Solid, width: number, height: number): number {
  // from the side its floor shows widest at: corner to corner
  const across = Math.hypot(solid.rows, solid.cols);
  const top = Math.max(1, topOf(solid));
  // The floor seen from above and the height seen from the side add up to how tall the picture is:
  // most at the tilt where the two are in step, or at the end of the tilts allowed that is nearest to it.
  const worst = Math.min(PITCH_MAX, Math.max(PITCH_MIN, (Math.atan2(across, top) * 180) / Math.PI));
  const tall = across * Math.sin((worst * Math.PI) / 180) + top * Math.cos((worst * Math.PI) / 180);
  const edge = Math.min((width - 2 * MARGIN) / across, (height - 2 * MARGIN) / tall);
  return Math.max(MIN_HALF, Math.min(MAX_HALF, 2 * Math.floor(edge / Math.SQRT2 / 2)));
}

/**
 * Every face of the solid that can ever show: the top of each column, and of
 * each of its four sides what stands clear of the column beside it. The
 * faces underneath and those between two cubes are not among them.
 */
export function facesOf(solid: Solid): Face[] {
  const faces: Face[] = [];
  for (let row = 0; row < solid.rows; row++) {
    for (let col = 0; col < solid.cols; col++) {
      const height = heightAt(solid, row, col);
      if (height <= 0) continue;
      faces.push({ shade: SHADE.top, x: col, y: height, z: row, u: ALONG_X, v: ALONG_Z, n: UP });
      for (let level = heightAt(solid, row, col + 1); level < height; level++) {
        faces.push({ shade: SHADE.east, x: col + 1, y: level, z: row, u: ALONG_Z, v: UP, n: [1, 0, 0] });
      }
      for (let level = heightAt(solid, row + 1, col); level < height; level++) {
        faces.push({ shade: SHADE.south, x: col, y: level, z: row + 1, u: ALONG_X, v: UP, n: [0, 0, 1] });
      }
      for (let level = heightAt(solid, row, col - 1); level < height; level++) {
        faces.push({ shade: SHADE.west, x: col, y: level, z: row, u: ALONG_Z, v: UP, n: [-1, 0, 0] });
      }
      for (let level = heightAt(solid, row - 1, col); level < height; level++) {
        faces.push({ shade: SHADE.north, x: col, y: level, z: row, u: ALONG_X, v: UP, n: [0, 0, -1] });
      }
    }
  }
  return faces;
}

/** A pixel whose middle lies this close to a face's edge, in the face's own measure, still belongs to the face: no pixel falls between two faces that meet. */
const ON_EDGE = 1e-7;
/** Two faces as near as this to the eye at a pixel are level there: the one drawn first keeps it. */
const LEVEL = 1e-7;

/**
 * The picture of `solid` from `view`, `width` by `height` pixels: for each
 * pixel, row after row, the number of the face that shows there (its place
 * in {@link facesOf}), or -1 where nothing does. The solid is in the middle
 * of the picture, and of two faces at a pixel the nearer to the eye shows.
 */
export function faceMap(solid: Solid, view: View, width: number, height: number, faces: readonly Face[] = facesOf(solid)): Int32Array {
  const map = new Int32Array(width * height).fill(-1);
  const nearest = new Float64Array(width * height).fill(-Infinity);
  const { yaw, pitch } = settled(view);
  const sinYaw = Math.sin((yaw * Math.PI) / 180);
  const cosYaw = Math.cos((yaw * Math.PI) / 180);
  const sinPitch = Math.sin((pitch * Math.PI) / 180);
  const cosPitch = Math.cos((pitch * Math.PI) / 180);
  const scale = cubeSize(solid, width, height) * Math.SQRT2;
  // Each level of cubes is a whole number of pixels high, so that every level is drawn like the next.
  const rise = Math.max(1, Math.floor(scale * cosPitch + 1e-9));
  // A step of the solid as it falls on the picture: to the right, downwards, and towards the eye.
  const right = (x: number, z: number): number => (x * cosYaw - z * sinYaw) * scale;
  const down = (x: number, y: number, z: number): number => (x * sinYaw + z * cosYaw) * sinPitch * scale - y * rise;
  const near = (x: number, y: number, z: number): number => (x * sinYaw + z * cosYaw) * cosPitch + y * sinPitch;
  // The middle of the box the solid stands in is the middle of the picture, to the whole pixel: at the
  // first view the corners of every cube then fall on whole pixels, and all its cubes are drawn alike.
  const originX = Math.round(width / 2 - right(solid.cols / 2, solid.rows / 2));
  const originY = Math.round(height / 2 - down(solid.cols / 2, topOf(solid) / 2, solid.rows / 2));

  faces.forEach((face, number) => {
    // a face that looks away from the eye, or along its line of sight, does not show
    if (near(face.n[0], face.n[1], face.n[2]) <= LEVEL) return;
    const x0 = originX + right(face.x, face.z);
    const y0 = originY + down(face.x, face.y, face.z);
    const d0 = near(face.x, face.y, face.z);
    const ux = right(face.u[0], face.u[2]);
    const uy = down(face.u[0], face.u[1], face.u[2]);
    const ud = near(face.u[0], face.u[1], face.u[2]);
    const vx = right(face.v[0], face.v[2]);
    const vy = down(face.v[0], face.v[1], face.v[2]);
    const vd = near(face.v[0], face.v[1], face.v[2]);
    const area = ux * vy - uy * vx;
    if (Math.abs(area) < 1e-9) return;
    const fromX = Math.max(0, Math.floor(Math.min(x0, x0 + ux, x0 + vx, x0 + ux + vx)));
    const toX = Math.min(width - 1, Math.ceil(Math.max(x0, x0 + ux, x0 + vx, x0 + ux + vx)));
    const fromY = Math.max(0, Math.floor(Math.min(y0, y0 + uy, y0 + vy, y0 + uy + vy)));
    const toY = Math.min(height - 1, Math.ceil(Math.max(y0, y0 + uy, y0 + vy, y0 + uy + vy)));
    for (let py = fromY; py <= toY; py++) {
      for (let px = fromX; px <= toX; px++) {
        // where the middle of the pixel lies on the face, along each of its two edges: 0 to 1 is on it
        const rx = px + 0.5 - x0;
        const ry = py + 0.5 - y0;
        const s = (rx * vy - ry * vx) / area;
        const t = (ux * ry - uy * rx) / area;
        if (s < -ON_EDGE || s > 1 + ON_EDGE || t < -ON_EDGE || t > 1 + ON_EDGE) continue;
        const depth = d0 + s * ud + t * vd;
        const at = py * width + px;
        if (depth > nearest[at] + LEVEL) {
          nearest[at] = depth;
          map[at] = number;
        }
      }
    }
  });
  return map;
}

/**
 * The picture of `solid` from `view` as shades, a {@link SHADE} for each
 * pixel, row after row: each face in the shade of the way it looks, and a
 * line one pixel wide wherever a face ends: against another face, another
 * cube, or nothing.
 */
export function shadesOf(solid: Solid, view: View, width: number, height: number): Uint8Array {
  const faces = facesOf(solid);
  const map = faceMap(solid, view, width, height, faces);
  const shades = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = y * width + x;
      const face = map[at];
      if (face < 0) continue;
      const rightOf = x + 1 < width ? map[at + 1] : -1;
      const below = y + 1 < height ? map[at + width] : -1;
      const leftOf = x > 0 ? map[at - 1] : -1;
      const above = y > 0 ? map[at - width] : -1;
      // the line is the last pixel of a face before the next one, and its first after nothing
      shades[at] = rightOf !== face || below !== face || leftOf < 0 || above < 0 ? SHADE.line : faces[face].shade;
    }
  }
  return shades;
}
