/**
 * Whether the page is played with a finger, and how its words follow from
 * that: a sentence that names a key is of no use on a phone.
 *
 * Settled once, as the page loads, like the language (`lang.ts`): the words of
 * every screen are taken then. A press itself says what made it (`Press.touch`
 * in `shared/frame.ts`), so a screen played with a mouse on a tablet, or with
 * a finger on a laptop, still takes each press for what it is.
 */

/**
 * Whether the player's main way to press is a finger: the browser's
 * `pointer: coarse`. A laptop with a touch screen has a mouse first, and is
 * not one.
 */
export const TOUCH: boolean = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;

/** Whether what the player presses with can be held over something without pressing it. */
export const HOVERS: boolean = typeof matchMedia !== "function" || matchMedia("(hover: hover)").matches;

/**
 * The words on a button a key also presses: the key before them where the
 * player has keys ("Enter 확정", "Esc to room"), and the words alone under a
 * finger, which then begin the button and take a capital where the language
 * has them ("To room").
 */
export function keyed(key: string, label: string): string {
  return TOUCH ? label.charAt(0).toUpperCase() + label.slice(1) : `${key} ${label}`;
}

/** Of one thing said two ways, to someone with keys and to someone with a finger, the one for this player. */
export function byInput<T>(keys: T, finger: T): T {
  return TOUCH ? finger : keys;
}
