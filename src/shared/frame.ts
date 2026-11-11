/**
 * How the game's one frame is put on a screen: how large it is drawn, where
 * it sits, and how far it is lifted while the on-screen keyboard is up.
 *
 * Pure functions over plain numbers, so that the page only has to ask the
 * browser for the sizes and set what comes of them.
 */

/** The frame's size in its own pixels: the game's screen. */
export const FRAME_W = 480;
export const FRAME_H = 270;

/** The room a screen has for the frame, in CSS pixels, and how fine its own pixels are. */
export interface Screen {
  width: number;
  height: number;
  /** The screen's own pixels to a CSS pixel. */
  density: number;
  /** Whether the player presses with a finger (the browser's `pointer: coarse`). */
  coarse: boolean;
}

/** Where the frame is drawn: its scale, and its corner in CSS pixels. */
export interface Placement {
  scale: number;
  left: number;
  top: number;
}

/**
 * How large the frame is drawn in `screen`.
 *
 * With a mouse, as large as it goes while one pixel of the game stays a whole
 * number of the screen's own pixels: every pixel square and sharp, on a
 * screen of any density. A window too small even for one to one gets the
 * frame shrunk to fit, soft but whole.
 *
 * Under a finger size counts for more than squareness: a phone held sideways
 * has room for the frame at about one and a quarter, and kept to whole pixels
 * of a screen three to one it would be drawn at one, every button a quarter
 * smaller than it need be. There the frame is as large as the screen allows.
 */
export function frameScale(screen: Screen): number {
  const fit = Math.min(screen.width / FRAME_W, screen.height / FRAME_H);
  if (!(fit > 0)) return 1;
  if (screen.coarse) return fit;
  const density = screen.density > 0 ? screen.density : 1;
  const whole = Math.floor(fit * density) / density;
  return whole > 0 ? whole : fit;
}

/**
 * Where the frame is drawn in `screen`: in the middle, its corner on a whole
 * pixel of the screen, or everything in it blurs by half a pixel.
 */
export function placeFrame(screen: Screen): Placement {
  const scale = frameScale(screen);
  const density = screen.density > 0 ? screen.density : 1;
  const snap = (value: number): number => Math.round(value * density) / density;
  return {
    scale,
    left: snap((screen.width - FRAME_W * scale) / 2),
    top: snap((screen.height - FRAME_H * scale) / 2),
  };
}

/**
 * How far up the frame is moved, in CSS pixels, so that a text box being
 * typed in is not under the on-screen keyboard.
 *
 * `boxBottom` is where the box ends on the page with the frame where it
 * belongs; `seenTop` and `seenHeight` are the part of the page the keyboard
 * leaves in sight (the browser's visual viewport). The box is brought to
 * `margin` above the keyboard. Nothing is moved while the box is in sight
 * already, as it is when the browser has moved the page by itself.
 */
export function liftFor(boxBottom: number, seenTop: number, seenHeight: number, margin: number): number {
  const hidden = boxBottom + margin - (seenTop + seenHeight);
  return hidden > 0 ? Math.ceil(hidden) : 0;
}

/** A box on the frame, in its pixels: its left, its top, how wide and how tall. */
export type Box = readonly [number, number, number, number];

/** A press on the frame, in its pixels: by a finger when `touch`, by a mouse or a pen when not. */
export interface Press {
  x: number;
  y: number;
  touch: boolean;
}

/**
 * How much farther than its drawn edge a box takes a finger, in the frame's
 * pixels: the same on every side, or its left, top, right and bottom apart.
 * A finger is wider than a pointer and covers what it presses; the frame's
 * small buttons are drawn for a pointer, and have no room to be drawn larger.
 */
export type Reach = number | readonly [number, number, number, number];

/** `box` with `by` added round it. */
export function reach(box: Box, by: Reach): Box {
  const [left, top, right, bottom] = typeof by === "number" ? [by, by, by, by] : by;
  return [box[0] - left, box[1] - top, box[2] + left + right, box[3] + top + bottom];
}

/**
 * Whether `press` is on `box`. A finger is also on it within `finger` of its
 * edge; a mouse never is, which points to the pixel.
 */
export function hits(press: Press, box: Box, finger: Reach = 0): boolean {
  const [x, y, w, h] = press.touch ? reach(box, finger) : box;
  return press.x >= x && press.x < x + w && press.y >= y && press.y < y + h;
}
