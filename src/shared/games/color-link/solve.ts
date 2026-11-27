/**
 * A search for a proof of 컬러 링크: the partners and the paths that
 * {@link checkProof} of `rules.ts` takes.
 *
 * The room never judges a board by this (design/games/color-link.md: a proof
 * is what a player draws, as in the show). It is for the bot that fills a
 * place while developing, which has to prove a board like anyone else, and
 * for the tests, which make sure a board the config comes with can be
 * connected at all. The search gives up after a number of steps: `null` then
 * says nothing about the board.
 */
import { EMPTY, type Board, type LinkConfig, type Placing } from "./rules";

/** What a proof is made of. */
export interface Proof {
  partners: Placing[];
  paths: number[][];
}

/** What is to be joined: a piece and its partner, or a piece that has none yet. */
interface Task {
  letter: string;
  from: number;
  to: number | null;
}

/** A sequence of numbers from 0 up to 1 that is the same for the same `seed`: the search tries the same things for the same board. */
function sequence(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Partners and paths that prove the connections of `board`, found within
 * `budget` steps of the search; `null` where none was found in them.
 *
 * The pairs are joined one after another, each by the shortest path the
 * paths before it have left (or by one just long enough, where the shortest
 * would be under the least a path may be), and the pieces without a partner
 * last. A try that leaves a pair with no path is given up, and the pairs are
 * tried again in another order with other paths of the same length.
 */
export function solve(board: Board, config: Pick<LinkConfig, "letters" | "fixed" | "minPath">, budget: number): Proof | null {
  const { width, height } = board;
  const cells = [...board.cells];
  const pairs: Task[] = [];
  const alone: Task[] = [];
  for (const letter of [...config.fixed, ...config.letters]) {
    const at = cells.flatMap((cell, index) => (cell === letter ? [index] : []));
    if (at.length === 2) pairs.push({ letter, from: at[0], to: at[1] });
    else if (at.length === 1) alone.push({ letter, from: at[0], to: null });
  }
  if (pairs.length + alone.length === 0) return { partners: [], paths: [] };
  const distance = (a: number, b: number): number => Math.abs((a % width) - (b % width)) + Math.abs(Math.floor(a / width) - Math.floor(b / width));
  const neighbours: number[][] = cells.map((_, cell) => {
    const [x, y] = [cell % width, Math.floor(cell / width)];
    const found: number[] = [];
    if (y > 0) found.push(cell - width);
    if (x < width - 1) found.push(cell + 1);
    if (y < height - 1) found.push(cell + width);
    if (x > 0) found.push(cell - 1);
    return found;
  });
  const random = sequence(cells.reduce((sum, cell, index) => (sum * 31 + cell.charCodeAt(0) * (index + 1)) >>> 0, 7));
  const shuffled = <T>(list: readonly T[]): T[] => {
    const next = [...list];
    for (let at = next.length - 1; at > 0; at--) {
      const other = Math.floor(random() * (at + 1));
      [next[at], next[other]] = [next[other], next[at]];
    }
    return next;
  };
  let steps = 0;
  const taken = new Set<number>();
  const free = (cell: number): boolean => cells[cell] === EMPTY && !taken.has(cell);

  /** The shortest path from `from` to `to` over free squares, the two included; `null` where there is none. */
  const shortest = (from: number, to: number): number[] | null => {
    const before = new Map<number, number>([[from, -1]]);
    const queue = [from];
    for (let head = 0; head < queue.length; head++) {
      const cell = queue[head];
      steps += 1;
      for (const next of shuffled(neighbours[cell])) {
        if (before.has(next) || (next !== to && !free(next))) continue;
        before.set(next, cell);
        if (next === to) {
          const path = [to];
          for (let back = cell; back !== -1; back = before.get(back) as number) path.push(back);
          return path.reverse();
        }
        queue.push(next);
      }
    }
    return null;
  };

  /** A path of exactly `length` squares from the end of `path` over free squares, to `to` or (with `to` `null`) to any free square. */
  const exact = (path: number[], to: number | null, length: number): boolean => {
    steps += 1;
    const here = path[path.length - 1];
    if (path.length === length) return to === null || here === to;
    if (to !== null && path.length + distance(here, to) > length) return false;
    for (const next of shuffled(neighbours[here])) {
      if (path.includes(next)) continue;
      if (next === to ? path.length + 1 !== length : !free(next)) continue;
      path.push(next);
      if (exact(path, to, length)) return true;
      path.pop();
    }
    return false;
  };

  /** A path for `task` with the paths made so far in its way; `null` where it has none. */
  const route = (task: Task): number[] | null => {
    if (task.to === null) {
      const path = [task.from];
      return exact(path, null, config.minPath) ? path : null;
    }
    const direct = shortest(task.from, task.to);
    if (direct === null || direct.length >= config.minPath) return direct;
    // too near each other: a way round that is just long enough, or a little longer
    for (let length = config.minPath; length <= config.minPath + 5; length++) {
      const path = [task.from];
      if (exact(path, task.to, length)) return path;
    }
    return null;
  };

  const span = (task: Task): number => distance(task.from, task.to ?? task.from);
  for (let attempt = 0; steps < budget; attempt++) {
    // the pairs nearest each other first, then those farthest apart first, then by chance
    const order = attempt === 0 ? [...pairs].sort((a, b) => span(a) - span(b)) : attempt === 1 ? [...pairs].sort((a, b) => span(b) - span(a)) : shuffled(pairs);
    taken.clear();
    const paths: number[][] = [];
    const partners: Placing[] = [];
    let done = true;
    for (const task of [...order, ...shuffled(alone)]) {
      const path = route(task);
      if (path === null) {
        done = false;
        break;
      }
      for (const cell of path) taken.add(cell);
      paths.push(path);
      if (task.to === null) partners.push({ letter: task.letter, cell: path[path.length - 1] });
    }
    if (done) return { partners, paths };
    // one pair and nothing in its way: no other try will find what this one did not
    if (order.length + alone.length === 1) return null;
  }
  return null;
}
