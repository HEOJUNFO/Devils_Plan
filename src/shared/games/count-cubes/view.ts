/**
 * The solid of 큐브 세기 as a picture from any side: where each face of each
 * cube lies on the picture, for a solid turned about its upright axis and
 * looked at from more or less above. Pure arithmetic over plain numbers:
 * the screen (`src/client/games/count-cubes/screen.ts`) fills the faces in
 * and turns the solid with the pointer.
 *
 * The picture is made of shapes, not of pixels: every square face of every
 * cube is a four-cornered shape of its own, placed to a fraction of a pixel,
 * and the screen draws them at the sharpness of the display it is on. So an
 * edge is a straight line at any angle, and a solid turned a little moves a
 * little: nothing is rounded to a pixel on the way, which is what made an
 * earlier picture step along its edges and swim while it turned. A line goes
 * round every face, so it also falls between two cubes that stand flush with
 * each other: that is what lets them be counted.
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
/** The longest a cube's edge is drawn, in pixels: a small solid does not fill the picture. */
export const MAX_EDGE = 22;
/** Pixels left clear at the picture's edges, for the line around the solid. */
const MARGIN = 1;

/** The way a face looks: the top of a cube, or one of its four sides. */
export const SHADE = { top: 0, east: 1, south: 2, west: 3, north: 4 } as const;
export type Shade = (typeof SHADE)[keyof typeof SHADE];

/**
 * One square face of one cube, as it lies in the solid: a corner, the two
 * edges that leave it, and the way it faces. A column stands on the square
 * from `col`, `row` to `col + 1`, `row + 1` of the floor; `x` runs along the
 * columns, `z` along the rows, `y` upwards.
 */
export interface Face {
  shade: Shade;
  /** The column the cube stands in. */
  row: number;
  col: number;
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
 * How long a cube's edge is drawn, in pixels: the longest at which the solid
 * stays inside `width` by `height` from every side and at every tilt allowed,
 * so that turning it never changes its size, and no longer than
 * {@link MAX_EDGE}. Not a whole number: nothing in the picture is.
 */
export function cubeEdge(solid: Solid, width: number, height: number): number {
  // from the side its floor shows widest at: corner to corner
  const across = Math.hypot(solid.rows, solid.cols);
  const top = Math.max(1, topOf(solid));
  // The floor seen from above and the height seen from the side add up to how tall the picture is:
  // most at the tilt where the two are in step, or at the end of the tilts allowed that is nearest to it.
  const worst = Math.min(PITCH_MAX, Math.max(PITCH_MIN, (Math.atan2(across, top) * 180) / Math.PI));
  const tall = across * Math.sin((worst * Math.PI) / 180) + top * Math.cos((worst * Math.PI) / 180);
  return Math.min(MAX_EDGE, (width - 2 * MARGIN) / across, (height - 2 * MARGIN) / tall);
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
      faces.push({ shade: SHADE.top, row, col, x: col, y: height, z: row, u: ALONG_X, v: ALONG_Z, n: UP });
      for (let level = heightAt(solid, row, col + 1); level < height; level++) {
        faces.push({ shade: SHADE.east, row, col, x: col + 1, y: level, z: row, u: ALONG_Z, v: UP, n: [1, 0, 0] });
      }
      for (let level = heightAt(solid, row + 1, col); level < height; level++) {
        faces.push({ shade: SHADE.south, row, col, x: col, y: level, z: row + 1, u: ALONG_X, v: UP, n: [0, 0, 1] });
      }
      for (let level = heightAt(solid, row, col - 1); level < height; level++) {
        faces.push({ shade: SHADE.west, row, col, x: col, y: level, z: row, u: ALONG_Z, v: UP, n: [-1, 0, 0] });
      }
      for (let level = heightAt(solid, row - 1, col); level < height; level++) {
        faces.push({ shade: SHADE.north, row, col, x: col, y: level, z: row, u: ALONG_X, v: UP, n: [0, 0, -1] });
      }
    }
  }
  return faces;
}

/** A face that looks this little towards the eye is seen along its own plane, and does not show. */
const EDGE_ON = 1e-9;

/** A face as it lies on the picture. */
export interface Shown {
  /** Which face: its place in {@link facesOf}. */
  face: number;
  shade: Shade;
  /**
   * Its four corners, one after another round it: x and y of each, eight
   * numbers, in pixels from the picture's top left corner and not rounded.
   */
  corners: readonly number[];
}

/**
 * The picture of `solid` from `view` on `width` by `height` pixels: every
 * face that looks towards the eye, the farthest first. Drawn in that order,
 * each over what was drawn before it, what is nearer covers what it stands in
 * front of. The middle of the box the solid stands in is the middle of the
 * picture, from every side.
 *
 * The order goes by columns, from the far corner of the floor to the near
 * one: a column can only stand in front of one that is behind it along the
 * rows, along the columns, or both, and the eye is never below the floor.
 * The faces of one column never cover each other.
 */
export function pictureOf(solid: Solid, view: View, width: number, height: number, faces: readonly Face[] = facesOf(solid)): Shown[] {
  const { yaw, pitch } = settled(view);
  const sinYaw = Math.sin((yaw * Math.PI) / 180);
  const cosYaw = Math.cos((yaw * Math.PI) / 180);
  const sinPitch = Math.sin((pitch * Math.PI) / 180);
  const cosPitch = Math.cos((pitch * Math.PI) / 180);
  const edge = cubeEdge(solid, width, height);
  // A step of the solid as it falls on the picture: to the right, downwards, and towards the eye.
  const right = (x: number, z: number): number => (x * cosYaw - z * sinYaw) * edge;
  const down = (x: number, y: number, z: number): number => ((x * sinYaw + z * cosYaw) * sinPitch - y * cosPitch) * edge;
  const near = (x: number, y: number, z: number): number => (x * sinYaw + z * cosYaw) * cosPitch + y * sinPitch;
  const originX = width / 2 - right(solid.cols / 2, solid.rows / 2);
  const originY = height / 2 - down(solid.cols / 2, topOf(solid) / 2, solid.rows / 2);

  const shown: Shown[] = [];
  faces.forEach((face, number) => {
    // a face that looks away from the eye, or along its line of sight, does not show
    if (near(face.n[0], face.n[1], face.n[2]) <= EDGE_ON) return;
    const x0 = originX + right(face.x, face.z);
    const y0 = originY + down(face.x, face.y, face.z);
    const ux = right(face.u[0], face.u[2]);
    const uy = down(face.u[0], face.u[1], face.u[2]);
    const vx = right(face.v[0], face.v[2]);
    const vy = down(face.v[0], face.v[1], face.v[2]);
    shown.push({ face: number, shade: face.shade, corners: [x0, y0, x0 + ux, y0 + uy, x0 + ux + vx, y0 + uy + vy, x0 + vx, y0 + vy] });
  });
  // towards the eye the rows go up or down, and so do the columns: by the side the solid is looked at from
  const rowsUp = cosYaw >= 0 ? 1 : -1;
  const colsUp = sinYaw >= 0 ? 1 : -1;
  // faces of one column stay in the order they came in
  return shown.sort((a, b) => (faces[a.face].row - faces[b.face].row) * rowsUp || (faces[a.face].col - faces[b.face].col) * colsUp);
}
