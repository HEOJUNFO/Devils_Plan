/**
 * The pixel font, asked for by every screen that draws letters on a canvas.
 *
 * The font comes with the page (`style.css`), and a canvas does not wait for
 * it: a screen asks, and draws its letters again once the font is in. Where
 * the connection dropped as the font was fetched, the browser marks the font
 * as failed, rejects what it promised and never asks again; a phone between
 * two networks is where that happens. So the asking is done here, once for
 * all the screens, and a font that did not come is asked for again
 * (`src/shared/font.ts`): as a face of the same family made by the script,
 * which the browser fetches anew and draws with in place of the failed one.
 */
import fontConfig from "../../shared/font-config.json";
import { fontIn, type FontConfig } from "../../shared/font";
import fontUrl from "../../../assets/fonts/Galmuri11-common.woff2?url";

const config: FontConfig = fontConfig;
/** The family the style sheet gives the font, and a size to ask for it by. */
const FAMILY = "Galmuri11";
const ASKED_AS = `12px ${FAMILY}`;

/** The asking under way, or the one that brought the font; none when the last was given up. */
let asking: Promise<boolean> | null = null;

/** Asks for the font anew: a face of the same family, kept by the page only if it comes. */
async function again(): Promise<void> {
  const face = new FontFace(FAMILY, `url("${fontUrl}") format("woff2")`);
  // among the page's fonts while it loads, so that the page hears of it as it does of its own (`draw.ts` measures anew)
  document.fonts.add(face);
  try {
    await face.load();
  } catch (error) {
    document.fonts.delete(face);
    throw error;
  }
}

/**
 * Asks for the pixel font, and says whether it is in. Never rejected.
 *
 * All the screens share one asking. One that was given up is not kept: the
 * next screen made asks again.
 */
export function pixelFont(): Promise<boolean> {
  if (typeof document === "undefined" || document.fonts === undefined) return Promise.resolve(false);
  if (asking !== null) return asking;
  const fonts = document.fonts;
  const mine = fontIn(
    () => fonts.load(ASKED_AS),
    again,
    (seconds) => new Promise((done) => setTimeout(done, seconds * 1000)),
    config,
  ).then((came) => {
    if (!came && asking === mine) asking = null;
    return came;
  });
  asking = mine;
  return asking;
}
