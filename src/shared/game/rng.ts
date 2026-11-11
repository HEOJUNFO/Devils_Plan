/**
 * A small seeded random number generator (mulberry32).
 *
 * Its whole state is one 32-bit integer, so a game keeps it inside its JSON
 * state and carries on with the same sequence after the room has hibernated
 * and reloaded. Nothing here reads the clock or `Math.random`.
 */

/** One draw: the number, and the state to draw the next one from. */
export interface RandomStep {
  /** A number in [0, 1). */
  value: number;
  /** The generator's state after this draw. */
  state: number;
}

/** A generator that remembers its place between draws inside one function call. */
export interface RandomSource {
  /** The next number in [0, 1). */
  next(): number;
  /** The state after the draws made so far; store it to continue the sequence. */
  readonly state: number;
}

/** Turns any finite number into a generator state (a 32-bit integer). */
export function seedFrom(seed: number): number {
  return Number.isFinite(seed) ? Math.trunc(seed) | 0 : 0;
}

/** Draws one number from `state` without changing anything. */
export function nextRandom(state: number): RandomStep {
  const next = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(next ^ (next >>> 15), next | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state: next };
}

/**
 * A generator starting at `state`. It keeps its place across calls to
 * `next()`; read `state` afterwards and store it, so the sequence continues
 * rather than repeats.
 */
export function randomSource(state: number): RandomSource {
  let current = state | 0;
  return {
    next(): number {
      const step = nextRandom(current);
      current = step.state;
      return step.value;
    },
    get state(): number {
      return current;
    },
  };
}

/**
 * Numbers in [0, 1) for what a game must keep from its players. `words` are
 * 32-bit numbers nobody could have guessed (a room has them from the
 * platform); each number drawn uses up one of them, whoever draws it, and
 * once they are used up, or where there were none, a draw is `fallback`'s.
 *
 * Why not the seed: a seed is one of 2^32, few enough to try every one. A
 * player who is shown anything drawn from it can find it that way, and with
 * it everything else that was drawn from it.
 */
export function chanceOf(words: readonly number[]): (fallback: () => number) => () => number {
  let used = 0;
  return (fallback) => () => (used < words.length ? (words[used++] >>> 0) / 4294967296 : fallback());
}

/** A whole number in [0, bound), drawn with `random`. */
export function randomInt(random: () => number, bound: number): number {
  return Math.min(bound - 1, Math.floor(random() * bound));
}
