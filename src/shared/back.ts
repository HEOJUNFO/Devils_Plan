/**
 * The browser's back button, inside the page.
 *
 * The page is one address: the lobby, a room, a game and the sheets over them
 * are all the same document, so a press on the browser's back button (or a
 * phone's back gesture) would leave the site from any of them. Here the page
 * keeps as many places of its own in the browser's history as there are
 * screens to step back from: one for a room, one more for a game in it, one
 * for each sheet that is open. A press back then lands one place lower,
 * still on the page, and the page takes one step back: closes the sheet,
 * asks whether to leave the game, leaves the room. From the lobby with
 * nothing open there is no place of the page's own left, and a press back
 * leaves as it would.
 *
 * How deep the page is and what a step back does are asked of the page each
 * time (`Screens`), from what is on show, so nothing has to say when a
 * screen opens or closes. The page calls `sync` when what is on show may
 * have changed and `arrived` when the browser says it has moved.
 *
 * A place is added only once the player has pressed or typed something since
 * the page was last moved by the browser (`Trail.touched`). A browser passes
 * over places a page added by itself when its back button is pressed (so
 * that a page cannot hold a visitor in), and it would pass over the page's
 * first place with them, out of the site. So a step back that leaves
 * something to step back from (a game asks before it lets go of a seat)
 * adds nothing: the next press back lands one place lower again, and the
 * places are made up when the player goes on playing.
 *
 * Nothing here touches a browser: `Trail` is what it needs of one.
 */

/** What is kept with a place the page holds: how many places up from the page's first it is. */
export interface Held {
  readonly back: number;
}

/**
 * How many places up from the page's first the place with `state` is, going
 * by what the browser kept with it: 0 for the first, and for anything the
 * page did not put there.
 */
export function heldAt(state: unknown): number {
  if (typeof state !== "object" || state === null) return 0;
  const at = (state as { back?: unknown }).back;
  return typeof at === "number" && Number.isInteger(at) && at > 0 ? at : 0;
}

/** What is kept with a place of the page's that is none of those it holds above its first: the first itself, and a place the address was changed to. */
export const FIRST: Held = { back: 0 };

/**
 * Whether the page has been at the place with `state` before. A place it has
 * not been at is one the browser added when the address was changed under
 * the page: an invitation opened in the tab the page is in changes only what
 * is after `#`, which loads nothing.
 */
export function isKnown(state: unknown): boolean {
  if (typeof state !== "object" || state === null) return false;
  const at = (state as { back?: unknown }).back;
  return typeof at === "number" && Number.isInteger(at) && at >= 0;
}

/** What is needed of the browser's history. */
export interface Trail {
  /** What the browser kept with the place the page is at now. */
  state(): unknown;
  /** Adds a place above this one, at the page's own address and kept with `held`, and goes to it. */
  hold(held: Held): void;
  /** Asks the browser to move `by` places (below zero: back). It arrives later, as a press on its button does. */
  go(by: number): void;
  /** Writes the page's own address on the place it is at, keeping what was kept with it. */
  settle(): void;
  /** Keeps `FIRST` with the place the page is at, leaving its address as it is. */
  mark(): void;
  /** Whether the player has pressed or typed anything on the page since the browser last moved it. */
  touched(): boolean;
}

/** What is asked of the page. */
export interface Screens {
  /** How many steps back there are from what is on show: 0 in the lobby with nothing open. */
  depth(): number;
  /** Takes one step back. It need not make the page less deep: a game asks first. */
  step(): void;
}

/** The things the page tells it. */
export interface BackTrail {
  /** The page has loaded: the place it is at is one it knows from here on, and its places are put right (`sync`). */
  start(): void;
  /** What is on show may have changed: adds the places that are missing, or steps off those there are too many of. */
  sync(): void;
  /** The browser moved to another place of this page (`popstate`). */
  arrived(): void;
}

/** Keeps the browser's back button inside the page for as long as there is a screen to step back to. */
export function backTrail(trail: Trail, screens: Screens): BackTrail {
  /** A move the page asked for itself is on its way: its arrival is not the player's press. */
  let moving = false;

  function sync(): void {
    // the browser is between places: what is wanted is looked at again when it arrives
    if (moving) return;
    const at = heldAt(trail.state());
    const depth = screens.depth();
    if (depth < at) {
      moving = true;
      trail.go(depth - at);
    } else if (trail.touched()) {
      for (let next = at + 1; next <= depth; next++) trail.hold({ back: next });
    }
  }

  function start(): void {
    if (!isKnown(trail.state())) trail.mark();
    sync();
  }

  function arrived(): void {
    if (!isKnown(trail.state())) {
      // A place the page has not been at: the address was changed under it. What the address asks for is the
      // page's to follow, so it is left as it is; the place is known from here on. A move of the page's own
      // that was on its way may never arrive now, and is not waited for.
      moving = false;
      trail.mark();
      return;
    }
    // Lower than the page is deep: the player pressed back, and one step is taken. Higher (a press forward, to
    // where a screen once was): there is no going forward to a screen, and `sync` steps off it.
    if (moving) moving = false;
    else if (screens.depth() > heldAt(trail.state())) screens.step();
    // The place arrived at may have a room in its address that the page is no longer in, or lack the one it is in.
    trail.settle();
    sync();
  }

  return { start, sync, arrived };
}
