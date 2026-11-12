/**
 * Who may read what players have written about the game.
 *
 * A word about the game (`src/shared/feedback.ts`) is kept by the directory
 * and read back by whoever makes the game, in the lobby opened with
 * `?inbox`, with a key that is a secret of the deployed Worker, set there
 * and written nowhere in the repository:
 *
 *   npx wrangler secret put FEEDBACK_KEY   (any long text of the reader's own)
 *
 * While developing it is a line of `.dev.vars` (not committed). Where it is
 * not set nobody could read what was written, so the game takes no feedback
 * and its page offers none.
 */

/** What of the Worker's environment the inbox needs: it is not in `wrangler.jsonc`, so it is not in `Env`. */
export interface InboxEnv {
  FEEDBACK_KEY?: string;
}

/** The key the inbox opens with, or `null` where none is set. */
export function inboxKey(env: InboxEnv): string | null {
  const key = env.FEEDBACK_KEY ?? "";
  return key === "" ? null : key;
}

/**
 * Whether `given` is the key `kept`. Their digests are compared, every byte
 * of them, so that how long the answer takes says nothing of how much of a
 * guess was right, nor of how long the key is.
 */
export async function sameKey(given: string, kept: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([crypto.subtle.digest("SHA-256", encoder.encode(given)), crypto.subtle.digest("SHA-256", encoder.encode(kept))]);
  const left = new Uint8Array(a);
  const right = new Uint8Array(b);
  let differing = 0;
  for (let i = 0; i < left.length; i++) differing |= left[i] ^ right[i];
  return differing === 0;
}
