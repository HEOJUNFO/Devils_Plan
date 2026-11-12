/**
 * Sending a game as what has changed in it.
 *
 * A room sends each player the game as they may see it, again each time
 * that changes. In a game of sixteen most changes are one mark in a table
 * (someone is done with the round) while the rest, some ten thousand
 * letters in 미스터리 거래소, stands as it was. A page that says it reads
 * parts is sent the change alone, and makes the game of it and of the game
 * as it last had it.
 *
 * Everything here is about values as JSON carries them: a key that holds
 * `undefined` is a key that is not there.
 */

/**
 * What changed between two values:
 * - `s`: the later value itself, whole;
 * - `o`: of two objects, a part for each key that changed or came, and in
 *   `d` the keys that are gone;
 * - `a`: of two lists of one length, a part for each place that changed.
 */
export type Part = { s: unknown } | { o: Record<string, Part>; d?: string[] } | { a: Record<string, Part> };

type Json = Record<string, unknown>;

const isList = (value: unknown): value is unknown[] => Array.isArray(value);
const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);
/** The keys of an object that hold something. */
const keysOf = (value: Json): string[] => Object.keys(value).filter((key) => value[key] !== undefined);
/** An object of these keys and values, whatever the keys are named (`__proto__` too is only a key). */
const objectOf = (entries: Iterable<readonly [string, unknown]>): Json => Object.fromEntries(entries) as Json;

/** What changed from `before` to `after`; `null` when nothing did. */
export function partOf(before: unknown, after: unknown): Part | null {
  if (isList(before) && isList(after)) {
    if (before.length !== after.length) return { s: after };
    const places: [string, Part][] = [];
    after.forEach((item, at) => {
      const part = partOf(before[at], item);
      if (part !== null) places.push([String(at), part]);
    });
    return places.length === 0 ? null : { a: objectOf(places) as Record<string, Part> };
  }
  if (isObject(before) && isObject(after)) {
    const keys: [string, Part][] = [];
    for (const key of keysOf(after)) {
      const part = before[key] === undefined ? { s: after[key] } : partOf(before[key], after[key]);
      if (part !== null) keys.push([key, part]);
    }
    const gone = keysOf(before).filter((key) => after[key] === undefined);
    if (keys.length === 0 && gone.length === 0) return null;
    const changed = objectOf(keys) as Record<string, Part>;
    return gone.length === 0 ? { o: changed } : { o: changed, d: gone };
  }
  // a list in JSON has no place that holds nothing: it is sent as null
  return before === after || (before === undefined && after === null) ? null : { s: after };
}

/**
 * `before` with `part` put on it: the value the part was taken to. `before`
 * is left as it was. A part that does not fit (a part of an object, put on
 * a number) is put on an empty one of its kind: this never fails, and what
 * it makes then is for whoever reads it to refuse.
 */
export function withPart(before: unknown, part: Part): unknown {
  if ("s" in part) return part.s;
  if ("a" in part) {
    const list = isList(before) ? [...before] : [];
    for (const [at, each] of Object.entries(part.a ?? {})) {
      const place = Number(at);
      if (Number.isInteger(place) && place >= 0) list[place] = withPart(list[place], each);
    }
    return list;
  }
  const from = isObject(before) ? before : {};
  const gone = new Set(Array.isArray(part.d) ? part.d : []);
  const made = new Map<string, unknown>(Object.entries(from).filter(([key]) => !gone.has(key)));
  for (const [key, each] of Object.entries(isObject(part.o) ? part.o : {})) made.set(key, withPart(from[key], each as Part));
  return objectOf(made);
}

/** The type of the message a part of a game comes in. */
export const GAME_PART = "game-part";

/**
 * A game sent as what has changed in it since this connection was last sent
 * it: `part` is put on that message (`type`, `room` and all, but for its
 * `answer`) to make the one this stands for. `answer` as in a game sent whole.
 */
export interface GamePart {
  type: typeof GAME_PART;
  room: string;
  answer?: true;
  part: Part;
}

/**
 * Reads what one connection to a room is sent, as parsed JSON, and gives it
 * back with every part of a game made into the game it stands for: a
 * `{ type: "game", … }` like the one the room sends whole. Anything else is
 * given back as it came. `null` for a part that cannot be read: one with no
 * game before it, or for another room. A connection has a reader of its
 * own, and a new connection a new one: the room starts each with the game
 * whole.
 */
export function gameReader(): (data: unknown) => unknown {
  let last: Json | null = null;
  return (data) => {
    if (!isObject(data)) return data;
    if (data.type === "game") {
      // whether a message answers a move is said of that message alone
      last = objectOf(Object.entries(data).filter(([key]) => key !== "answer"));
      return data;
    }
    if (data.type !== GAME_PART) return data;
    if (last === null || data.room !== last.room || !isObject(data.part)) return null;
    const made = withPart(last, data.part as Part);
    if (!isObject(made) || made.type !== "game") return null;
    last = made;
    return data.answer === true ? { ...made, answer: true } : made;
  };
}
