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

/** How many groups of sixteen bits an IPv6 address has, and how many of them name the network it is on. */
const IPV6_GROUPS = 8;
const IPV6_NETWORK_GROUPS = 4;

/**
 * What the address `from` is counted as where the game keeps a count by
 * address. An IPv4 address is counted as itself. An IPv6 address is counted
 * as its network of 64 bits, written as that network's four groups: one line
 * is given a whole such network, so a count kept by the single address is
 * one its holder walks around by taking the next. What cannot be read as
 * either is counted as itself.
 */
export function countedAs(from: string): string {
  if (!from.includes(":")) return from;
  const halves = from.toLowerCase().split("::");
  if (halves.length > 2) return from;
  const groupsOf = (half: string): string[] => (half === "" ? [] : half.split(":"));
  const head = groupsOf(halves[0]);
  const tail = halves.length === 2 ? groupsOf(halves[1]) : [];
  // an IPv4 address written as the last two groups
  const last = tail.length > 0 ? tail : head;
  if (last.at(-1)?.includes(".")) last.splice(-1, 1, "0", "0");
  const missing = IPV6_GROUPS - head.length - tail.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return from;
  const groups = [...head, ...Array<string>(missing).fill("0"), ...tail];
  if (!groups.every((group) => /^[0-9a-f]{1,4}$/.test(group))) return from;
  return groups
    .slice(0, IPV6_NETWORK_GROUPS)
    .map((group) => parseInt(group, 16).toString(16))
    .join(":");
}

/** What a limit is asked of: Cloudflare's rate limiting binding, the game's own count, or something a test puts in its place. */
export interface Limiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/** Whether this copy of the Worker has said in the log that a connection came with no address. */
let saidNoAddress = false;
/** When each limiter was last said in the log to have turned one away, in ms since the epoch, by its name. */
const saidTurnedAway = new Map<string, number>();
/** A limiter that turns connections away is said so in the log this often at most, in ms: a flood is not answered with a flood of lines. */
const TURNED_AWAY_EVERY_MS = 60_000;

/**
 * Whether one more of something is taken from the address `from`, by the
 * count `limiter` keeps; `name` is what the log calls that count (for a
 * binding, its name in `wrangler.jsonc`).
 *
 * The limit is a guard, and the game does not stop for it: a request with no
 * address is let through, and so is every request while the limiter cannot
 * be asked.
 *
 * What the limit does is written to the log, never with the address: that a
 * connection came with none (once for each running copy of the Worker), that
 * the limiter could not be asked and why, and that it turned one away (once
 * a minute at most). A limit that fails quietly is one nobody knows is not
 * there.
 */
export async function withinLimit(limiter: Limiter | undefined, from: string | null, name: string, now = Date.now()): Promise<boolean> {
  if (from === null) {
    if (!saidNoAddress) console.warn(`${name}: a connection came with no address, and no limit is kept for it`);
    saidNoAddress = true;
    return true;
  }
  try {
    if (limiter === undefined) throw new Error("the binding is not there");
    const { success } = await limiter.limit({ key: from });
    if (!success && now - (saidTurnedAway.get(name) ?? -Infinity) >= TURNED_AWAY_EVERY_MS) {
      saidTurnedAway.set(name, now);
      console.log(`${name} turned one away`);
    }
    return success;
  } catch (error) {
    console.warn(`${name} could not be asked:`, error instanceof Error ? error.message : String(error));
    return true;
  }
}
