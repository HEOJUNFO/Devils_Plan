/**
 * The pointer over a game's screen: where it is, where it pressed, and when
 * it is over nothing any more. Every game's screen is a canvas of the frame's
 * own pixels that the page scales, and hears of the pointer the same way.
 *
 * A finger is not a mouse that happens to be clumsy. It is over the screen
 * only while it presses, so what it was last on is not pointed at once it has
 * lifted; and a second finger laid down beside the first is not another
 * press.
 */
import type { Press, Reach } from "../../shared/frame";

/**
 * How far the two small buttons under a game's results take a finger: the
 * next game above, the way back to the waiting room below. Every game has
 * them in the same place, 15 pixels tall and ten apart, with nothing else
 * near: between them they share the gap, and the lower one reaches to the
 * frame's edge.
 */
export const AGAIN_REACH: Reach = [6, 3, 4, 5];
export const LOBBY_REACH: Reach = [6, 5, 4, 5];

/**
 * How long a game's results are up, in seconds, before those two buttons take a press. They come up where the
 * game's own buttons were (a pad's "입력", "놓기", "말하기"), at the moment the room says the game is over: the
 * second press of a double press, or a press already on its way when someone else ended the game, is not a
 * press of theirs. (Keys wait longer, `RESULTS_HOLD` of each screen: Enter is held down, a finger is not.)
 */
export const RESULTS_PRESS_HOLD = 0.8;

/** A place on the screen, in its own pixels. */
export interface Point {
  x: number;
  y: number;
}

/** What a screen is told of the pointer. */
export interface PointerWatch {
  /** The pointer is at `p`: a mouse moving, or a finger moving while it presses. */
  move(p: Point, event: PointerEvent): void;
  /** The pointer pressed at `p`. */
  down(p: Press, event: PointerEvent): void;
  /** The press ended at `p`, or the browser took it away. */
  up?(p: Point, event: PointerEvent): void;
  /** The pointer is over nothing of the screen any more: it left, or the finger that was it lifted. */
  gone(): void;
}

/**
 * Tells `watch` of the pointer over `canvas`, a screen `width` by `height`
 * pixels of its own however large the page shows it. Returns what stops it.
 */
export function watchPointer(canvas: HTMLCanvasElement, width: number, height: number, watch: PointerWatch): () => void {
  const at = (event: PointerEvent): Point => {
    const rect = canvas.getBoundingClientRect();
    return { x: ((event.clientX - rect.left) * width) / (rect.width || width), y: ((event.clientY - rect.top) * height) / (rect.height || height) };
  };
  const finger = (event: PointerEvent): boolean => event.pointerType === "touch";
  const onMove = (event: PointerEvent): void => {
    if (finger(event) && !event.isPrimary) return;
    watch.move(at(event), event);
  };
  const onDown = (event: PointerEvent): void => {
    // a second finger beside the first is a hand resting, not a press
    if (finger(event) && !event.isPrimary) return;
    watch.down({ ...at(event), touch: finger(event) }, event);
  };
  const onUp = (event: PointerEvent): void => {
    if (finger(event) && !event.isPrimary) return;
    watch.up?.(at(event), event);
    // a finger that has lifted points at nothing; a mouse is still where it was
    if (finger(event)) watch.gone();
  };
  const onLeave = (): void => watch.gone();
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("pointerleave", onLeave);
  return () => {
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerdown", onDown);
    canvas.removeEventListener("pointerup", onUp);
    canvas.removeEventListener("pointercancel", onUp);
    canvas.removeEventListener("pointerleave", onLeave);
  };
}
