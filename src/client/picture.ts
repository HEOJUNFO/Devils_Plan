/**
 * The picture of a game's result, for the player to pass on: the game's
 * screen as it stands, each of its pixels drawn several times over so that a
 * messenger does not blur it, and under it a strip that says where the game
 * is played. Nothing is in it that is not on the player's own screen, and
 * the room's code is on no game's screen.
 */

/** One canvas of the screen: how much of the frame it covers from the frame's top left, in the frame's pixels, and whether it is scaled smoothly (a picture of its own pixels) or in blocks (pixel art). */
export interface Layer {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  smooth: boolean;
}

/** How a picture is made up. */
export interface PictureLook {
  /** The frame's size, in its own pixels. */
  width: number;
  height: number;
  /** How many of the picture's pixels go to one of the frame's. */
  scale: number;
  /** What is under the layers where none is drawn. */
  ground: string;
  /** The strip under the frame: its height in the frame's pixels, its colours, and what it says. */
  strip: { height: number; ground: string; ink: string; text: string };
}

/** The file's bytes out of a `data:` address in base64. */
function bytesOf(address: string): Uint8Array<ArrayBuffer> {
  const packed = atob(address.slice(address.indexOf(",") + 1));
  const bytes = new Uint8Array(packed.length);
  for (let at = 0; at < packed.length; at++) bytes[at] = packed.charCodeAt(at);
  return bytes;
}

/**
 * The picture of `layers`, the lowest first, as a PNG. Made at once and not
 * in a while: a browser hands something on only in the press that asked for
 * it. `null` where the browser draws no picture.
 */
export function pictureOf(layers: readonly Layer[], look: PictureLook): Blob | null {
  const { scale, strip } = look;
  const canvas = document.createElement("canvas");
  canvas.width = look.width * scale;
  canvas.height = (look.height + strip.height) * scale;
  const context = canvas.getContext("2d");
  if (context === null) return null;
  context.fillStyle = look.ground;
  context.fillRect(0, 0, canvas.width, look.height * scale);
  for (const layer of layers) {
    context.imageSmoothingEnabled = layer.smooth;
    context.drawImage(layer.canvas, 0, 0, layer.width * scale, layer.height * scale);
  }
  context.fillStyle = strip.ground;
  context.fillRect(0, look.height * scale, canvas.width, strip.height * scale);
  context.fillStyle = strip.ink;
  context.font = `${12 * scale}px "Galmuri11", monospace`;
  context.textBaseline = "middle";
  context.fillText(strip.text, 6 * scale, (look.height + strip.height / 2) * scale);
  try {
    return new Blob([bytesOf(canvas.toDataURL("image/png"))], { type: "image/png" });
  } catch {
    return null;
  }
}
