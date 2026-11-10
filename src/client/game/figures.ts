/**
 * The six figures who can sit at the table, and their chairs, drawn as
 * rectangles: one pixel size, a one-pixel dark outline, two tones.
 * Design: design/game-brief.md (Look and references). Every figure has its
 * own outline, so players can tell each other apart at a glance.
 */
import { C, shade } from "./palette";

/** One filled rectangle of a figure: x, y, width, height (from the middle of the shoulder line), colour. */
export type Rect = [number, number, number, number, string];

interface Look {
  coat: string;
  hair: string;
  skin: string;
  hat: string;
  accent: string;
}

/** The six looks. A player keeps one for the whole game. */
const LOOKS: Look[] = [
  { coat: "#44547c", hair: "#3a2c36", skin: "#e6b48c", hat: "#2b3350", accent: "#ffb43c" },
  { coat: "#8a343a", hair: "#4a3428", skin: "#d9a070", hat: "#4a3428", accent: "#d8c9a0" },
  { coat: "#343b5c", hair: "#20222e", skin: "#f0c9a4", hat: "#20222e", accent: "#efe6cc" },
  { coat: "#6a4690", hair: "#8a4a30", skin: "#edc19a", hat: "#8a4a30", accent: "#e08ab4" },
  { coat: "#8fa3b8", hair: "#8fa3b8", skin: "#e2ac84", hat: "#8fa3b8", accent: "#bfeaff" },
  { coat: "#566a42", hair: "#cfc8ba", skin: "#e2ac84", hat: "#cfc8ba", accent: "#3fd0b6" },
];

/** How many different figures there are. */
export const FIGURE_COUNT = LOOKS.length;

const cache = new Map<string, Rect[]>();

/**
 * The rectangles of figure `kind`, seen from the front or from behind.
 * `side` is 1 when the lamp is to the figure's left (shadow on its right),
 * -1 the other way round.
 */
export function figureRects(kind: number, back: boolean, side: 1 | -1): Rect[] {
  const key = `${kind}${back ? "b" : "f"}${side}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const look = LOOKS[kind % FIGURE_COUNT];
  const shape = kind % FIGURE_COUNT;
  const rects: Rect[] = [];
  const add = (x: number, y: number, w: number, h: number, colour: string) => {
    rects.push([x, y, w, h, colour]);
  };
  // on the side away from the lamp
  const shadow = (x: number, y: number, w: number, h: number, colour: string) => {
    if (side > 0) add(x, y, w, h, colour);
    else add(-x - w + 1, y, w, h, colour);
  };
  const coatD = shade(look.coat, 0.68);
  const coatH = shade(look.coat, 1.28);
  const skinD = shade(look.skin, 0.76);
  const hairD = shade(look.hair, 0.7);
  const hatD = shade(look.hat, 0.7);
  const hatH = shade(look.hat, 1.3);
  const bw = shape === 1 ? 12 : shape === 2 ? 8 : 10;

  // the body: squared shoulders and a narrower chest (the hooded one wears a cloak that does not narrow)
  add(-bw, 0, bw * 2 + 1, 5, look.coat);
  if (shape === 4) add(-bw - 1, 5, bw * 2 + 3, 9, look.coat);
  else add(-bw + 2, 5, bw * 2 - 3, 9, look.coat);
  add(-bw + 1, 0, bw * 2 - 1, 1, coatH);
  shadow(bw - 2, 1, 3, 4, coatD);
  shadow(bw - (shape === 4 ? 1 : 4), 5, 3, 9, coatD);
  if (shape !== 4) add(-2, -2, 5, 2, skinD);

  if (shape === 0) {
    // a wide-brimmed hat
    add(-4, -11, 9, 9, back ? look.hair : look.skin);
    shadow(3, -11, 2, 9, back ? hairD : skinD);
    if (back) add(-3, 0, 7, 2, coatD);
    else {
      add(-4, -11, 1, 3, look.hair);
      add(4, -11, 1, 3, look.hair);
      add(-1, 0, 3, 4, "#d8d2c0");
      add(0, 1, 1, 4, look.accent);
    }
    add(-7, -13, 15, 2, look.hat);
    add(-4, -17, 9, 4, look.hat);
    add(-3, -17, 7, 1, hatH);
    add(-4, -14, 9, 1, look.accent);
    shadow(3, -17, 2, 3, hatD);
  } else if (shape === 1) {
    // bald and bearded, with the widest shoulders
    add(-5, -12, 11, 10, look.skin);
    shadow(4, -12, 2, 10, skinD);
    add(-6, -8, 1, 3, skinD);
    add(6, -8, 1, 3, skinD);
    if (back) {
      add(-3, -4, 7, 1, skinD);
      add(-1, 0, 3, 14, coatD);
    } else {
      add(-3, -9, 7, 1, look.hair);
      add(-4, -5, 9, 4, look.hair);
      add(-3, -1, 7, 1, look.hair);
      add(-3, 0, 7, 7, look.accent);
      add(0, 2, 1, 1, C.ink);
      add(0, 5, 1, 1, C.ink);
    }
  } else if (shape === 2) {
    // slim, with hair standing in spikes
    add(-4, -11, 9, 9, back ? look.hair : look.skin);
    shadow(3, -11, 2, 9, back ? hairD : skinD);
    add(-5, -13, 11, 4, look.hair);
    add(-5, -15, 2, 2, look.hair);
    add(-2, -18, 2, 5, look.hair);
    add(1, -16, 2, 3, look.hair);
    add(4, -15, 2, 2, look.hair);
    if (!back) {
      add(-5, -9, 1, 3, look.hair);
      add(5, -9, 1, 3, look.hair);
    }
    add(-4, -2, 9, 3, look.accent);
    add(0, 1, 1, 13, look.accent);
  } else if (shape === 3) {
    // long straight hair past the shoulders
    if (back) {
      add(-6, -13, 13, 20, look.hair);
      add(-2, -11, 1, 16, shade(look.hair, 1.3));
      shadow(4, -12, 2, 18, hairD);
      add(-bw, 2, 3, 3, look.accent);
      add(bw - 2, 2, 3, 3, look.accent);
    } else {
      add(-4, -11, 9, 9, look.skin);
      shadow(3, -11, 2, 9, skinD);
      add(-bw, 0, bw * 2 + 1, 3, look.accent);
      add(-5, -13, 11, 4, look.hair);
      add(-6, -10, 2, 17, look.hair);
      add(5, -10, 2, 17, look.hair);
      add(-4, -11, 9, 2, look.hair);
      add(0, 4, 1, 2, C.brassH);
    }
  } else if (shape === 4) {
    // a pointed hood, the face lost in it
    add(-6, -13, 13, 13, look.coat);
    add(-2, -16, 5, 3, look.coat);
    add(-1, -18, 3, 2, look.coat);
    add(-5, -13, 11, 1, coatH);
    shadow(5, -12, 2, 12, coatD);
    if (back) add(0, -12, 1, 11, coatD);
    else {
      add(-3, -9, 7, 8, "#141726");
      add(-2, -6, 1, 2, look.accent);
      add(2, -6, 1, 2, look.accent);
      add(0, 0, 1, 2, look.accent);
    }
  } else {
    // hair tied in a bun on top, round glasses, a scarf
    add(-4, -11, 9, 9, back ? look.hair : look.skin);
    shadow(3, -11, 2, 9, back ? hairD : skinD);
    add(-5, -13, 11, 4, look.hair);
    add(-2, -17, 5, 4, look.hair);
    add(-1, -17, 3, 1, shade(look.hair, 1.15));
    if (!back) {
      add(-5, -9, 1, 4, look.hair);
      add(5, -9, 1, 4, look.hair);
      add(-3, -8, 3, 3, "#cfe8ff");
      add(1, -8, 3, 3, "#cfe8ff");
      add(0, -7, 1, 1, C.ink);
      add(-2, -7, 1, 1, C.ink);
      add(2, -7, 1, 1, C.ink);
    }
    add(-5, -2, 11, 3, look.accent);
    add(back ? -4 : 2, 1, 3, 7, look.accent);
  }

  if (!back) {
    // eyes and mouth, then the hands towards the table
    if (shape === 0 || shape === 2 || shape === 3) {
      add(-2, -7, 1, 2, C.ink);
      add(2, -7, 1, 2, C.ink);
      add(-1, -4, 3, 1, skinD);
    }
    if (shape === 1) {
      add(-2, -8, 1, 2, C.ink);
      add(2, -8, 1, 2, C.ink);
    }
    if (shape === 5) add(-1, -4, 3, 1, skinD);
    add(-bw + 1, 12, 4, 3, look.skin);
    add(bw - 4, 12, 4, 3, look.skin);
  }
  cache.set(key, rects);
  return rects;
}

/** The chair behind a figure seen from the front. */
export const CHAIR_FAR: Rect[] = [
  [-8, -5, 17, 10, C.woodD],
  [-9, -7, 19, 3, C.wood],
];

/** The chair in front of a figure seen from behind: its back hides the figure's body. */
export const CHAIR_NEAR: Rect[] = [
  [-8, 5, 17, 10, C.wood],
  [-9, 3, 19, 3, C.woodH],
  [-8, 15, 2, 4, C.woodD],
  [7, 15, 2, 4, C.woodD],
];

/** The slats of the near chair's back: x, y, width, height. */
export const CHAIR_SLATS: [number, number, number, number][] = [
  [-5, 7, 1, 7],
  [0, 7, 1, 7],
  [5, 7, 1, 7],
];

/** A chair knocked over, where a player was hit. */
export const CHAIR_DOWN: Rect[] = [
  [-11, 7, 23, 5, C.wood],
  [-9, 3, 2, 4, C.woodD],
  [8, 3, 2, 4, C.woodD],
];
