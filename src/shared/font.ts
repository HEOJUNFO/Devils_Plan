/**
 * Asking for a font until it is in, or until asking has been given up.
 *
 * A browser asks for a page's font once. Where the connection dropped at
 * that moment the font is marked as failed and is not asked for again: the
 * page's letters stay in the device's own font until the page is loaded
 * anew, and the promise the page was given is rejected. This asks again,
 * a few times and further apart each time (`font-config.json`), and its own
 * promise is never rejected: a font that did not come is no error of the
 * page's, and is not noted as one (`src/client/fault.ts`).
 *
 * Nothing here knows the browser: what asks, and what waits, is handed in
 * (`src/client/game/pixel-font.ts`).
 */

/** How a font that did not come is asked for again. */
export interface FontConfig {
  /** How long to wait before each further try, in seconds: as many tries as there are waits. */
  againSeconds: number[];
}

/**
 * Whether the font came in.
 *
 * @param first Asks as the page first does; rejected (or throwing) where the font did not come.
 * @param again Asks anew, as each further try does; rejected (or throwing) likewise.
 * @param wait Is over after so many seconds.
 * @returns `true` once an asking brought the font, `false` when the last try did not. Never rejected.
 */
export async function fontIn(
  first: () => Promise<unknown>,
  again: () => Promise<unknown>,
  wait: (seconds: number) => Promise<void>,
  config: FontConfig,
): Promise<boolean> {
  try {
    await first();
    return true;
  } catch {
    // the font did not come: asked again below
  }
  for (const seconds of config.againSeconds) {
    await wait(seconds);
    try {
      await again();
      return true;
    } catch {
      // nor this time: the next try, if there is one
    }
  }
  return false;
}
