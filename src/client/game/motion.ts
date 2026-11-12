/**
 * Whether this player has asked their device for less motion (the system's
 * "reduce motion" setting, which the browser passes on).
 *
 * For them the screens leave out what moves only for the eye: the shake and
 * the flicker of a shot, bursts of particles, a frame that strobes, the
 * lamp's sway, a cylinder turning with nothing to turn for. What a movement
 * tells stays: where the muzzle points, whose turn it is, a clock running
 * down, and the words over a shot.
 */
const asked = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;

/** Whether to leave such motion out. Read where it is drawn, so a setting changed while the page is open holds from the next frame. */
export function lessMotion(): boolean {
  return asked !== null && asked.matches;
}
