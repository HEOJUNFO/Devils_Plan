/**
 * The header in which Cloudflare tells a Worker the network address a
 * request came from. A request made inside the Worker, or by a test, has
 * none; the limits kept by address then do not apply.
 *
 * An address is not a person: a household, a school or a phone network can
 * be many players behind one. The limits kept by it are set well above what
 * such a group does, and are there for a script, not for a crowd.
 */
export const ADDRESS_HEADER = "cf-connecting-ip";

/** What a limit is asked of: Cloudflare's rate limiting binding, or something a test puts in its place. */
export interface Limiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/**
 * Whether one more of something is taken from the address `from`, by the
 * count `limiter` keeps (the binding called `name` in `wrangler.jsonc`).
 *
 * The limit is a guard, and the game does not stop for it: a request with no
 * address is let through, and so is every request while the limiter cannot
 * be asked. That last is written to the log, by the binding's name and what
 * went wrong, never with the address: a limit that fails quietly is one
 * nobody knows is not there.
 */
export async function withinLimit(limiter: Limiter | undefined, from: string | null, name: string): Promise<boolean> {
  if (from === null) return true;
  try {
    if (limiter === undefined) throw new Error("the binding is not there");
    return (await limiter.limit({ key: from })).success;
  } catch (error) {
    console.warn(`${name} could not be asked:`, error instanceof Error ? error.message : String(error));
    return true;
  }
}
