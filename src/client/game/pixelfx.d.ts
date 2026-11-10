/** Types for pixelfx.js: the parts of the pixelfx library the table uses. */

/** A buffer effects draw into: `w` by `h` pixels whose top-left sits at (`ox`, `oy`) on the screen. */
export interface FxFrame {
  w: number;
  h: number;
  ox: number;
  oy: number;
  color: Uint32Array;
  light: Uint32Array;
}

/** An effect as the library ships it. */
export interface FxModule {
  meta: { size: [number, number]; origin: [number, number]; duration: number; loop: boolean };
  create(options: Record<string, unknown>): unknown;
}

/** One playing effect. */
export interface FxInstance {
  update(dt: number): void;
  draw(frame: FxFrame, layer?: "back" | "front"): void;
  stop(): void;
  done(): boolean;
}

/** Where and how an effect plays: its origin on the screen, mirrored or turned, and its own options. */
export interface FxOptions {
  x: number;
  y: number;
  flip?: boolean;
  angle?: number;
  seed?: number;
  [option: string]: unknown;
}

export function createFrame(w: number, h: number, ox?: number, oy?: number): FxFrame;
export function clearFrame(frame: FxFrame): FxFrame;
export function createFx(effect: FxModule, options?: FxOptions): FxInstance;
/** Writes the frame's colour and light as RGBA bytes into `out`; `background` null leaves it transparent. */
export function composite(frame: FxFrame, out: Uint8ClampedArray, background?: number | null): Uint8ClampedArray;

export const muzzlePistol: FxModule;
export const poof: FxModule;
export const confetti: FxModule;
