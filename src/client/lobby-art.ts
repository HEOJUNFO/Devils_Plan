/**
 * The picture behind the lobby's list of rooms: a corridor of closed doors
 * with light behind them, one lamp overhead. It belongs to no game; rows of
 * the list are laid over it from the top as rooms open.
 */
import { BAR_Y, CX, Light, Pen, SCENE_W, drawLamp } from "./game/draw";
import { C } from "./game/palette";

/** Where the wall meets the floor. */
const FLOOR_Y = 158;
/** The doors: where each stands, and its size. */
const DOOR_XS = [52, 152, 252];
const DOOR_W = 42;
const DOOR_H = 98;
/** Milliseconds between flickers of the light behind the doors. */
const FLICKER_MS = 900;

/** The light behind a door, seen through its slit: steadier or dimmer by `glow` (0 to 1). */
function drawSlit(pen: Pen, x: number, glow: number): void {
  const top = FLOOR_Y - DOOR_H + 14;
  pen.px(x - 9, top, 19, 8, C.ink);
  pen.px(x - 8, top + 1, 17, 6, glow > 0.5 ? C.amber : C.amberD);
  pen.px(x - 8, top + 1, 17, 2, glow > 0.5 ? C.brassH : C.amber);
  // the bars across it
  pen.px(x - 3, top + 1, 1, 6, C.ink);
  pen.px(x + 3, top + 1, 1, 6, C.ink);
}

function drawDoor(pen: Pen, x: number): void {
  const left = x - DOOR_W / 2;
  const top = FLOOR_Y - DOOR_H;
  // the frame, then the leaf
  pen.px(left - 4, top - 4, DOOR_W + 8, DOOR_H + 4, C.ink);
  pen.px(left - 3, top - 3, DOOR_W + 6, DOOR_H + 3, C.woodDD);
  pen.px(left, top, DOOR_W, DOOR_H, C.ink);
  pen.px(left + 1, top + 1, DOOR_W - 2, DOOR_H - 1, C.wood);
  pen.px(left + 1, top + 1, DOOR_W - 2, 1, C.woodH);
  pen.px(left + 1, top + 1, 1, DOOR_H - 1, C.woodH);
  pen.px(left + DOOR_W - 2, top + 1, 1, DOOR_H - 1, C.woodD);
  // two sunk panels
  for (const [py, ph] of [
    [28, 26],
    [60, 30],
  ]) {
    pen.px(left + 6, top + py, DOOR_W - 12, ph, C.woodD);
    pen.px(left + 7, top + py + 1, DOOR_W - 14, ph - 2, C.wood);
    pen.px(left + 7, top + py + ph - 2, DOOR_W - 14, 1, C.woodH);
  }
  // the knob
  pen.px(left + DOOR_W - 9, top + 54, 4, 4, C.ink);
  pen.px(left + DOOR_W - 8, top + 55, 2, 2, C.brass);
  // the plate over the door
  pen.px(x - 11, top - 16, 23, 9, C.ink);
  pen.px(x - 10, top - 15, 21, 7, C.brassD);
  pen.px(x - 9, top - 14, 19, 5, C.wallD);
  // light spilling under it
  pen.px(left + 2, FLOOR_Y, DOOR_W - 4, 1, C.amberD);
}

/** Draws the lobby's picture on `canvas` and keeps the light behind the doors flickering while the page shows it. */
export function drawLobbyArt(canvas: HTMLCanvasElement): void {
  canvas.width = SCENE_W;
  canvas.height = BAR_Y;
  const context = canvas.getContext("2d");
  if (context === null) return;
  context.imageSmoothingEnabled = false;
  const pen = new Pen(context);

  // the wall, panelled like the rooms behind it, and the floor
  pen.px(0, 0, SCENE_W, FLOOR_Y, C.wall);
  for (let x = 9; x < SCENE_W; x += 19) pen.px(x, 0, 1, FLOOR_Y, C.wallD);
  pen.px(0, FLOOR_Y - 26, SCENE_W, 2, C.wallD);
  pen.px(0, FLOOR_Y, SCENE_W, BAR_Y - FLOOR_Y, C.floor);
  pen.px(0, FLOOR_Y, SCENE_W, 1, C.ink);
  for (let y = FLOOR_Y + 12; y < BAR_Y; y += 11) {
    pen.px(0, y, SCENE_W, 1, C.floorD);
    for (let x = (y * 7) % 46; x < SCENE_W; x += 46) pen.px(x, y + 1, 1, 10, C.floorD);
  }
  // a runner along the corridor
  pen.px(0, FLOOR_Y + 22, SCENE_W, 30, C.rugD);
  pen.px(0, FLOOR_Y + 24, SCENE_W, 26, C.rug);
  pen.px(0, FLOOR_Y + 27, SCENE_W, 1, C.rugL);
  pen.px(0, FLOOR_Y + 46, SCENE_W, 1, C.rugL);

  for (const x of DOOR_XS) {
    drawDoor(pen, x);
    drawSlit(pen, x, 1);
  }
  drawLamp(pen, 0);
  new Light().draw(pen, CX, FLOOR_Y - 40, 1);

  // Someone is always playing behind one door or another: now and then a light dips.
  setInterval(() => {
    if (canvas.offsetParent === null) return;
    for (const x of DOOR_XS) drawSlit(pen, x, Math.random() < 0.18 ? 0 : 1);
  }, FLICKER_MS);
}
