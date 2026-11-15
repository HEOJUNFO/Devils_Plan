import { lessMotion } from "./motion";
import * as fxlib from "./pixelfx.js";

/**
 * Effects of the pixelfx library played over a game's screen: a burst where
 * something was won. For the eye only: whatever it marks is said by a word
 * and a sound as well, and someone who asked their system for less motion
 * gets none (`motion.ts`).
 *
 * The screens of Russian Roulette and Count the Rectangles each carry their
 * own copy of this, older than this file.
 */
export interface Bursts {
  /**
   * Starts `effect` with its origin where `options` puts it, drawn inside
   * `box` (x, y, width, height on the screen): what would fall outside is
   * not drawn.
   */
  add(effect: fxlib.FxModule, options: fxlib.FxOptions, box: [number, number, number, number]): void;
  /** Moves every effect on by `dt` seconds and drops those that are over. */
  step(dt: number): void;
  /** Draws those still playing onto `ctx`. */
  draw(ctx: CanvasRenderingContext2D): void;
  /** Drops them all: the game they were of is gone. */
  clear(): void;
}

interface Playing {
  fx: fxlib.FxInstance;
  frame: fxlib.FxFrame;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  image: ImageData;
  x0: number;
  y0: number;
}

/** A screen's effects: none playing yet. */
export function createBursts(): Bursts {
  const playing: Playing[] = [];
  return {
    add(effect, options, box): void {
      if (lessMotion()) return;
      const [x0, y0, w, h] = box.map(Math.round) as [number, number, number, number];
      const buffer = document.createElement("canvas");
      buffer.width = w;
      buffer.height = h;
      const bufferCtx = buffer.getContext("2d");
      if (bufferCtx === null) return;
      playing.push({ fx: fxlib.createFx(effect, options), frame: fxlib.createFrame(w, h, x0, y0), canvas: buffer, ctx: bufferCtx, image: new ImageData(w, h), x0, y0 });
    },
    step(dt): void {
      for (let i = playing.length - 1; i >= 0; i--) {
        playing[i].fx.update(dt);
        if (playing[i].fx.done()) playing.splice(i, 1);
      }
    },
    draw(ctx): void {
      for (const p of playing) {
        fxlib.clearFrame(p.frame);
        p.fx.draw(p.frame);
        fxlib.composite(p.frame, p.image.data, null);
        p.ctx.putImageData(p.image, 0, 0);
        ctx.drawImage(p.canvas, p.x0, p.y0);
      }
    },
    clear(): void {
      playing.length = 0;
    },
  };
}
