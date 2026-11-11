/**
 * Drawing for the table: the pixel pen, the room, the lamp's light, the
 * cylinder and the figures. Design: design/game-brief.md (Look and
 * references): 480 by 270 at whole-number scale, one pixel size, dark
 * one-pixel outlines, two tones, and a lamp whose dithered amber light leans
 * to whoever's turn it is.
 *
 * Nothing here knows the rules: it draws what it is told.
 */
import { CHAIR_FAR, CHAIR_NEAR, CHAIR_SLATS, figureRects, type Rect } from "./figures";
import { C } from "./palette";

/** The table's native size, in pixels. */
export const W = 480;
export const H = 270;
/** The scene is the left part; the panel is to its right and the bar below both. */
export const SCENE_W = 304;
export const BAR_Y = 222;
export const PANEL_X = 308;
/** The middle of the table, and how far out the seats are. */
export const CX = 152;
export const CY = 112;
const SEAT_RX = 104;
const SEAT_RY = 70;
const TAB_RX = 78;
const TAB_RY = 41;
/** The cylinder: where the chambers sit, how big a chamber and the body are, where the muzzle ends. */
export const RING_RX = 27;
export const RING_RY = 15;
export const HATCH_RX = 7;
export const HATCH_RY = 6;
export const BODY_RX = 38;
export const BODY_RY = 24;
const TIP_RX = 54;
const TIP_RY = 34;

const TAU = Math.PI * 2;
const FONT = 'Galmuri11, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';

/** The letters chambers are known by. */
export const LETTERS = "ABCDEF";

const I = Math.round;

/**
 * How wide each text measured so far is, by its size and the text, and what
 * each text was cut to, by the room it had. A screen draws the same names and
 * numbers on every frame, and measuring is the dearest thing drawing a line
 * of text asks of the browser.
 */
const widths = new Map<string, number>();
const fits = new Map<string, string>();
/** Past this many of either the lot is forgotten: prices and clocks make new texts all game long. */
const KEPT_TEXTS = 4000;
/** Whether the page's fonts are being listened to yet. */
let listening = false;

/** A width measured before the pixel font was in is of another font: when fonts come in, everything is measured anew. */
function forgetWhenFontsLoad(): void {
  if (listening || typeof document === "undefined" || document.fonts === undefined) return;
  listening = true;
  document.fonts.addEventListener("loadingdone", () => {
    widths.clear();
    fits.clear();
  });
}

/** What is known of a chamber and how: content (1 live, 0 empty, null unknown) and source. */
export type HatchInfo = [0 | 1 | null, "public" | "private" | "inferred" | null];

/** Draws on the canvas in whole pixels. */
export class Pen {
  constructor(readonly ctx: CanvasRenderingContext2D) {}

  /** Fills the whole canvas. */
  clear(colour: string): void {
    this.ctx.fillStyle = colour;
    this.ctx.fillRect(0, 0, W, H);
  }

  /** A filled rectangle. */
  px(x: number, y: number, w: number, h: number, colour: string): void {
    this.ctx.fillStyle = colour;
    this.ctx.fillRect(I(x), I(y), w, h);
  }

  /** A filled ellipse, a row at a time. */
  ell(cx: number, cy: number, rx: number, ry: number, colour: string): void {
    this.ctx.fillStyle = colour;
    const x = I(cx);
    const y = I(cy);
    for (let dy = -ry; dy <= ry; dy++) {
      const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / ((ry + 0.5) * (ry + 0.5)))));
      this.ctx.fillRect(x - half, y + dy, half * 2 + 1, 1);
    }
  }

  /** Text; `y` is the top of the line. */
  txt(text: string, x: number, y: number, colour: string = C.bone, align: CanvasTextAlign = "left", size = 12): void {
    this.ctx.fillStyle = colour;
    this.ctx.font = `${size}px ${FONT}`;
    this.ctx.textAlign = align;
    this.ctx.textBaseline = "top";
    this.ctx.fillText(text, I(x), I(y));
  }

  /** How wide `text` is, in pixels. */
  width(text: string, size = 12): number {
    const key = `${size}\n${text}`;
    const known = widths.get(key);
    if (known !== undefined) return known;
    forgetWhenFontsLoad();
    this.ctx.font = `${size}px ${FONT}`;
    const measured = Math.ceil(this.ctx.measureText(text).width);
    if (widths.size >= KEPT_TEXTS) widths.clear();
    widths.set(key, measured);
    return measured;
  }

  /** `text` cut to fit `max` pixels, ending in an ellipsis when cut. */
  fit(text: string, max: number): string {
    if (this.width(text) <= max) return text;
    const key = `${max}\n${text}`;
    const known = fits.get(key);
    if (known !== undefined) return known;
    const chars = Array.from(text);
    while (chars.length > 1 && this.width(`${chars.join("")}…`) > max) chars.pop();
    const cut = `${chars.join("")}…`;
    if (fits.size >= KEPT_TEXTS) fits.clear();
    fits.set(key, cut);
    return cut;
  }

  /** A small picture given as rows of `#` and `.`. */
  bmp(rows: readonly string[], x: number, y: number, colour: string): void {
    this.ctx.fillStyle = colour;
    for (let r = 0; r < rows.length; r++) {
      for (let q = 0; q < rows[r].length; q++) {
        if (rows[r][q] === "#") this.ctx.fillRect(x + q, y + r, 1, 1);
      }
    }
  }

  /** A thick pixel line. */
  line(x0: number, y0: number, x1: number, y1: number, thick: number, colour: string): void {
    this.ctx.fillStyle = colour;
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    const half = (thick - 1) / 2;
    for (let i = 0; i <= steps; i++) {
      this.ctx.fillRect(I(x0 + ((x1 - x0) * i) / steps - half), I(y0 + ((y1 - y0) * i) / steps - half), thick, thick);
    }
  }

  /** Rectangles with a one-pixel dark outline round the whole shape. */
  rects(rects: readonly Rect[], x: number, y: number): void {
    this.ctx.fillStyle = C.ink;
    for (const q of rects) this.ctx.fillRect(x + q[0] - 1, y + q[1] - 1, q[2] + 2, q[3] + 2);
    for (const q of rects) {
      this.ctx.fillStyle = q[4];
      this.ctx.fillRect(x + q[0], y + q[1], q[2], q[3]);
    }
  }
}

/** Where a seat is drawn and how its figure, name and icon are placed. */
export interface SeatLayout {
  x: number;
  y: number;
  /** Seen from behind: the seats nearest the camera. */
  back: boolean;
  /** Which side the figure's shadow falls on. */
  side: 1 | -1;
  label: { x: number; y: number; align: "center" | "left" };
  bubble: { x: number; y: number };
}

/** The angle of place `pos` round a table of `n`: place 0 is nearest the camera, the rest run clockwise. */
export function posAngle(pos: number, n: number): number {
  return Math.PI / 2 + (pos * TAU) / n;
}

/** How place `pos` of `n` is laid out. */
export function seatLayout(pos: number, n: number): SeatLayout {
  const a = posAngle(pos, n);
  const x = I(CX + Math.cos(a) * SEAT_RX);
  const y = I(CY + Math.sin(a) * SEAT_RY);
  const back = Math.sin(a) > 0.3;
  const top = !back && Math.abs(Math.cos(a)) < 0.3;
  const left = x < CX - 1;
  return {
    x,
    y,
    back,
    side: left ? -1 : 1,
    // the name goes below a near seat, beside the far middle seat (the lamp hangs above it), above the rest
    label: back ? { x, y: y + 21, align: "center" } : top ? { x: x + 16, y: y - 16, align: "left" } : { x, y: y - 45, align: "center" },
    bubble: pos === 0 ? { x: x + 24, y: y - 12 } : back ? { x, y: y - 28 } : top ? { x: x - 21, y: y - 8 } : { x: x + (left ? 22 : -22), y: y - 7 },
  };
}

/** Where chamber `j` of `n` is drawn when chamber 0 sits at angle `ringA`. */
export function hatchXY(j: number, n: number, ringA: number): [number, number] {
  const a = ringA + (j * TAU) / n;
  return [I(CX + Math.cos(a) * RING_RX), I(CY + Math.sin(a) * RING_RY)];
}

/** Where the muzzle ends when it points along angle `a`. */
export function tipXY(a: number): [number, number] {
  return [CX + Math.cos(a) * TIP_RX, CY + Math.sin(a) * TIP_RY];
}

/** The pair of chambers nearest a point on the cylinder, or `null` when the point is off it. */
export function pairAt(x: number, y: number, n: number, ringA: number): number | null {
  const dx = (x - CX) / (BODY_RX + 6);
  const dy = (y - CY) / (BODY_RY + 5);
  if (dx * dx + dy * dy > 1) return null;
  const a = Math.atan2((y - CY) / RING_RY, (x - CX) / RING_RX);
  let best = 0;
  let gap = 9;
  for (let j = 0; j < n; j++) {
    let d = Math.abs(a - (ringA + ((j + 0.5) * TAU) / n)) % TAU;
    if (d > Math.PI) d = TAU - d;
    if (d < gap) {
      gap = d;
      best = j;
    }
  }
  return best;
}

/**
 * A picture of the scene that is the same every time: drawn once, on a canvas
 * of its own, and copied from there. The room and its table are some 1,300
 * rectangles, most of them the rows of their ellipses, and a screen draws
 * them on every frame.
 */
function kept(picture: (pen: Pen) => void): (pen: Pen) => void {
  let canvas: HTMLCanvasElement | null = null;
  return (pen) => {
    if (canvas === null) {
      canvas = document.createElement("canvas");
      canvas.width = SCENE_W;
      canvas.height = BAR_Y;
      const ctx = canvas.getContext("2d");
      if (ctx === null) throw new Error("no 2D drawing in this browser");
      picture(new Pen(ctx));
    }
    pen.ctx.drawImage(canvas, 0, 0);
  };
}

/** The back room: wall, boards and the rug the table stands on. */
export const drawRoom = kept((pen) => {
  pen.px(0, 0, SCENE_W, BAR_Y, C.floor);
  for (let y = 26; y < BAR_Y; y += 11) {
    pen.px(0, y, SCENE_W, 1, C.floorD);
    for (let x = (y * 7) % 46; x < SCENE_W; x += 46) pen.px(x, y + 1, 1, 10, C.floorD);
  }
  pen.px(0, 0, SCENE_W, 22, C.wall);
  pen.px(0, 22, SCENE_W, 3, C.wallD);
  pen.px(0, 25, SCENE_W, 1, C.ink);
  for (let x = 9; x < SCENE_W; x += 19) pen.px(x, 0, 1, 22, C.wallD);
  pen.ell(CX, CY + 6, 133, 87, C.rugD);
  pen.ell(CX, CY + 6, 129, 83, C.rug);
  pen.ell(CX, CY + 6, 120, 76, C.rugL);
  pen.ell(CX, CY + 6, 118, 74, C.rug);
});

/** The lamp's shade, cut off by the top of the frame; `sway` is how far it has swung. */
export function drawLamp(pen: Pen, sway: number): void {
  const x = CX + I(sway * 0.8);
  pen.line(CX, 0, x, 2, 1, C.steelD);
  pen.px(x - 4, 2, 9, 2, C.ink);
  pen.px(x - 8, 4, 17, 3, C.ink);
  pen.px(x - 13, 7, 27, 4, C.ink);
  pen.px(x - 3, 2, 7, 2, C.steelD);
  pen.px(x - 7, 4, 15, 3, C.steelD);
  pen.px(x - 12, 7, 25, 3, C.steelDD);
  pen.px(x - 6, 4, 4, 1, C.steelH);
  pen.px(x - 11, 10, 23, 1, C.amber);
  pen.px(x - 7, 11, 15, 1, C.brassH);
  pen.px(x - 4, 12, 9, 1, C.amberD);
}

/** The round table. */
export const drawTable = kept((pen) => {
  pen.ell(CX, CY + 10, TAB_RX + 2, TAB_RY + 1, "#0e0a12");
  pen.ell(CX, CY + 5, TAB_RX, TAB_RY, C.woodDD);
  pen.ell(CX, CY, TAB_RX, TAB_RY, C.woodD);
  pen.ell(CX, CY, TAB_RX - 3, TAB_RY - 2, C.wood);
  pen.ell(CX, CY, 60, 32, C.woodH);
  pen.ell(CX, CY, 59, 31, C.wood);
  const grain: [number, number, number][] = [[-52, -14, 22], [18, -24, 30], [-30, 22, 26], [30, 16, 20], [-64, 4, 12], [44, -6, 16]];
  for (const [x, y, w] of grain) pen.px(CX + x, CY + y, w, 1, C.woodD);
});

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** The parts of a pixel the pool's middle is told apart by, and the steps its strength is. */
const LIGHT_STEPS = 4;
const LIGHT_SHADES = 64;

/** The lamp's pool of light: amber inside it, and outside it the room falls away in dithered steps. */
export class Light {
  private readonly canvas = document.createElement("canvas");
  private readonly ctx: CanvasRenderingContext2D;
  private readonly image: ImageData;
  /** Where the pool on the canvas is centred and how strong it is: `null` before the first. */
  private drawn: { lx: number; ly: number; strength: number } | null = null;

  constructor() {
    this.canvas.width = SCENE_W;
    this.canvas.height = BAR_Y;
    const ctx = this.canvas.getContext("2d");
    if (ctx === null) throw new Error("no 2D drawing in this browser");
    this.ctx = ctx;
    this.image = ctx.createImageData(SCENE_W, BAR_Y);
  }

  /** Draws the pool centred on (`lx`, `ly`); `strength` is 1 as usual, less while the lamp flickers. */
  draw(pen: Pen, lx: number, ly: number, strength: number): void {
    // The pool is worked out again only when it has moved by a part of a pixel the eye can tell: a lamp that
    // hangs still asks for the same picture on every frame, and one that sways moves a pixel in a quarter of a second.
    const x = Math.round(lx * LIGHT_STEPS) / LIGHT_STEPS;
    const y = Math.round(ly * LIGHT_STEPS) / LIGHT_STEPS;
    const power = Math.round(strength * LIGHT_SHADES) / LIGHT_SHADES;
    if (this.drawn === null || this.drawn.lx !== x || this.drawn.ly !== y || this.drawn.strength !== power) {
      this.work(x, y, power);
      this.drawn = { lx: x, ly: y, strength: power };
    }
    pen.ctx.drawImage(this.canvas, 0, 0);
  }

  /** Works the pool out, a pixel at a time, onto the light's own canvas. */
  private work(lx: number, ly: number, strength: number): void {
    const data = this.image.data;
    const rx = 160 * strength;
    const ry = 114 * strength;
    let i = 0;
    for (let y = 0; y < BAR_Y; y++) {
      const dy = (y - ly) / ry;
      const dy2 = dy * dy;
      for (let x = 0; x < SCENE_W; x++) {
        const dx = (x - lx) / rx;
        const v = Math.sqrt(dx * dx + dy2);
        const f = (v - 0.64) * 2.1;
        const threshold = (BAYER[((y & 3) << 2) | (x & 3)] + 0.5) / 16;
        if (f > 0) {
          // past the pool's edge: night, in four dithered steps
          data[i] = 7;
          data[i + 1] = 9;
          data[i + 2] = 24;
          data[i + 3] = Math.min(3, Math.floor(f * 3 + threshold)) * 56;
        } else {
          // inside it: the lamp's amber, strongest under the lamp
          const g = (0.56 - v) * 4.2;
          data[i] = 255;
          data[i + 1] = 170;
          data[i + 2] = 50;
          data[i + 3] = g > 0 ? Math.min(2, Math.floor(g + threshold)) * 17 : 0;
        }
        i += 4;
      }
    }
    this.ctx.putImageData(this.image, 0, 0);
  }
}

/** A figure on its chair. */
export function drawFigure(pen: Pen, kind: number, x: number, y: number, back: boolean, side: 1 | -1): void {
  if (!back) pen.rects(CHAIR_FAR, x, y);
  pen.rects(figureRects(kind, back, side), x, y);
  if (back) {
    pen.rects(CHAIR_NEAR, x, y);
    for (const q of CHAIR_SLATS) pen.px(x + q[0], y + q[1], q[2], q[3], C.woodD);
  }
}

/** An empty chair. */
export function drawChair(pen: Pen, x: number, y: number, back: boolean): void {
  pen.rects(back ? CHAIR_NEAR : CHAIR_FAR, x, y);
}

/**
 * One chamber. A pale rim means the whole table has seen it; amber ticks mean
 * only this player knows it (seen alone, or worked out).
 */
export function drawHatch(pen: Pen, x: number, y: number, info: HatchInfo, letter: string): void {
  const [known, source] = info;
  pen.ell(x, y, HATCH_RX + 1, HATCH_RY + 1, source === "public" ? C.bone : C.ink);
  if (known === 1) {
    pen.ell(x, y, HATCH_RX, HATCH_RY, C.crimD);
    pen.ell(x, y, HATCH_RX - 2, HATCH_RY - 2, C.brass);
    pen.txt(letter, x, y - 6, C.ink, "center");
  } else if (known === 0) {
    pen.ell(x, y, HATCH_RX, HATCH_RY, C.tealD);
    pen.ell(x, y, HATCH_RX - 2, HATCH_RY - 2, C.ink);
    pen.txt(letter, x, y - 6, C.teal, "center");
  } else {
    pen.ell(x, y, HATCH_RX, HATCH_RY, C.steelDD);
    pen.ell(x, y, HATCH_RX - 1, HATCH_RY - 1, C.hatch);
    pen.txt(letter, x, y - 6, C.bone, "center");
  }
  if (source === "private" || source === "inferred") {
    pen.px(x - 1, y - HATCH_RY - 3, 3, 2, C.amber);
    pen.px(x - 1, y + HATCH_RY + 2, 3, 2, C.amber);
    pen.px(x - HATCH_RX - 3, y - 1, 2, 3, C.amber);
    pen.px(x + HATCH_RX + 2, y - 1, 2, 3, C.amber);
  }
}

function drawBarrel(pen: Pen, a: number): void {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const x0 = CX + c * (BODY_RX - 2);
  const y0 = CY + s * (BODY_RY - 2);
  const [x1, y1] = tipXY(a);
  pen.line(x0, y0 + 2, x1, y1 + 2, 5, "#1b1410");
  pen.line(x0, y0, x1, y1, 7, C.ink);
  pen.line(x0, y0, x1, y1, 5, C.steelD);
  pen.line(x0, y0 - 1, x1, y1 - 1, 2, C.steelH);
  pen.px(x1 - 3, y1 - 3, 7, 7, C.ink);
  pen.px(x1 - 2, y1 - 2, 5, 5, C.steel);
  pen.px(x1 - 1, y1 - 1, 3, 3, C.ink);
}

/**
 * The cylinder on the table: `n` chambers with chamber 0 at angle `ringA`, the
 * muzzle along `barrelA`. `info(j)` says what to show of chamber `j`; chambers
 * in `shut` are drawn closed whatever is known of them.
 */
export function drawDevice(
  pen: Pen,
  n: number,
  ringA: number,
  barrelA: number,
  info: (j: number) => HatchInfo,
  shut: readonly number[] = [],
): void {
  pen.ell(CX, CY + 4, BODY_RX + 1, BODY_RY, "#1b1410");
  pen.ell(CX, CY + 3, BODY_RX, BODY_RY, C.ink);
  pen.ell(CX, CY, BODY_RX, BODY_RY, C.steel);
  pen.ell(CX, CY, BODY_RX - 2, BODY_RY - 2, C.steelD);
  pen.ell(CX, CY, 9, 5, C.steelDD);
  pen.px(CX - 1, CY - 1, 3, 3, C.steelH);
  drawBarrel(pen, barrelA);
  for (let j = 0; j < n; j++) {
    const [x, y] = hatchXY(j, n, ringA);
    drawHatch(pen, x, y, shut.includes(j) ? [null, null] : info(j), LETTERS[j]);
  }
}

/** Corner marks round a chamber. */
export function brackets(pen: Pen, x: number, y: number, colour: string): void {
  const rx = HATCH_RX + 3;
  const ry = HATCH_RY + 3;
  const corners: [number, number][] = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  for (const [sx, sy] of corners) {
    pen.px(x + sx * rx - (sx > 0 ? 2 : 0), y + sy * ry, 3, 1, colour);
    pen.px(x + sx * rx, y + sy * ry - (sy > 0 ? 2 : 0), 1, 3, colour);
  }
}

/** Seven-by-seven icons for what a seat last did. */
export const ICONS = {
  public: [".......", "..###..", ".#...#.", "#..#..#", ".#...#.", "..###..", "......."],
  private: [".......", ".......", "#.....#", ".#...#.", "..###..", ".#.#.#.", "......."],
  rotate1: [".......", "..#....", "...#...", "....#..", "...#...", "..#....", "......."],
  rotate2: [".......", "#..#...", ".#..#..", "..#..#.", ".#..#..", "#..#...", "......."],
  tamper: [".......", "..###..", ".#####.", ".##.##.", ".#####.", "..###..", "......."],
  swap: [".#.....", "###....", ".#...#.", ".#...#.", ".#...#.", "....###", ".....#."],
} as const;

/** Which icon a seat shows. */
export type IconName = keyof typeof ICONS;

/** The colour each icon is drawn in. */
export const ICON_COLOUR: Record<IconName, string> = {
  public: C.bone,
  private: C.amber,
  rotate1: C.steelH,
  rotate2: C.steelH,
  tamper: C.brass,
  swap: C.crim,
};

/** The small dark box an icon sits in, beside a figure's head. */
/** How wide the mark of the voice chat is beside a name, with the gap after it. */
export const VOICE_MARK_W = 7;

/**
 * The mark of the voice chat beside a name, its top left at `x`, `y` (the top
 * of the name's line): three bars that move while the player speaks and stand
 * still while they are quiet, and a cross for a microphone switched off.
 */
export function drawVoiceMark(pen: Pen, x: number, y: number, mark: "in" | "muted" | "speaking", time: number): void {
  if (mark === "muted") {
    for (let i = 0; i < 5; i++) {
      pen.px(x + i, y + 4 + i, 1, 1, C.dim);
      pen.px(x + 4 - i, y + 4 + i, 1, 1, C.dim);
    }
    return;
  }
  for (let bar = 0; bar < 3; bar++) {
    const height = mark === "speaking" ? 2 + Math.round(2.5 + 2.5 * Math.sin(time * 14 + bar * 2.1)) : 2 + (bar === 1 ? 2 : 0);
    pen.px(x + bar * 2, y + 10 - height, 1, height, mark === "speaking" ? C.teal : C.dim);
  }
}

/** The widest a line of a speech bubble is, in pixels, and the most lines one has. */
const SPEECH_W = 104;
const SPEECH_LINES = 2;

/** `text` broken into the lines of a speech bubble. What does not fit ends in an ellipsis. */
export function speechLines(pen: Pen, text: string): string[] {
  const lines: string[] = [];
  let rest = text;
  while (rest !== "") {
    if (lines.length === SPEECH_LINES - 1 || pen.width(rest) <= SPEECH_W) {
      lines.push(pen.fit(rest, SPEECH_W));
      break;
    }
    // as many characters as fit, back to the last space if there is one
    const chars = Array.from(rest);
    let count = 1;
    while (count < chars.length && pen.width(chars.slice(0, count + 1).join("")) <= SPEECH_W) count++;
    const space = chars.slice(0, count).lastIndexOf(" ");
    const cut = space > 0 ? space : count;
    lines.push(chars.slice(0, cut).join(""));
    rest = chars.slice(cut).join("").trimStart();
  }
  return lines;
}

/** How long a line stays over its speaker's seat, in seconds: longer for more to read. */
export function speechSeconds(text: string): number {
  return Math.min(7, 2.5 + Array.from(text).length * 0.08);
}

/** A speech bubble over the name of the seat laid out as `at`, kept inside the scene. */
export function drawSpeech(pen: Pen, at: Pick<SeatLayout, "label">, lines: readonly string[]): void {
  if (lines.length === 0) return;
  const w = Math.max(...lines.map((line) => pen.width(line))) + 8;
  const h = lines.length * 13 + 3;
  const left = at.label.align === "center" ? at.label.x - Math.round(w / 2) : at.label.x - 4;
  const x = Math.max(2, Math.min(SCENE_W - 2 - w, left));
  const y = Math.max(2, Math.min(BAR_Y - 3 - h, at.label.y - 1));
  pen.px(x - 1, y - 1, w + 2, h + 2, C.ink);
  pen.px(x, y, w, h, C.bone);
  lines.forEach((line, i) => pen.txt(line, x + 4, y + 1 + i * 13, C.ink));
}

export function bubbleBox(pen: Pen, x: number, y: number): void {
  pen.px(x - 7, y - 7, 15, 15, C.ink);
  pen.px(x - 6, y - 6, 13, 13, C.btnH);
}
