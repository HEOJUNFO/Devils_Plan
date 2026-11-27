/**
 * Makes the puzzles 울타리 치기 comes with: src/shared/games/loop-fence/puzzles.json.
 *
 *   npx esbuild tools/loop-fence-puzzles.ts --bundle --platform=node --format=esm --outfile=<somewhere>/make.mjs
 *   node <somewhere>/make.mjs <seed> <how many> <width> <height> <numbers kept> > src/shared/games/loop-fence/puzzles.json
 *
 * A puzzle is made from a fence: squares are taken one after another from a
 * first one, each beside one already taken, for as long as what bounds them
 * is still one loop; that loop is the fence. Every square then has its
 * number, and numbers are taken away, by chance, for as long as the fence is
 * still the only one that meets what is left, until `numbers kept` are left.
 * The same seed makes the same puzzles.
 *
 * Design: design/games/loop-fence.md.
 */
import { across, cluesOf, isLoop, sidesOf, upright, BLANK, type Puzzle } from "../src/shared/games/loop-fence/fence";
import { fencesOf } from "../src/shared/games/loop-fence/solve";

const [seed, many, width, height, kept] = process.argv.slice(2).map(Number);
if (![seed, many, width, height, kept].every(Number.isInteger)) throw new Error("usage: <seed> <how many> <width> <height> <numbers kept>");

/** mulberry32: a small generator, so that a seed makes the same puzzles on any machine. */
let state = seed >>> 0;
function random(): number {
  state = (state + 0x6d2b79f5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (below: number): number => Math.floor(random() * below);
function shuffled<T>(items: T[]): T[] {
  const list = [...items];
  for (let i = list.length - 1; i > 0; i--) {
    const j = pick(i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

const board = { width, height };

/** The sides that bound the squares `inside`. */
function boundOf(inside: boolean[]): boolean[] {
  const fence = Array.from({ length: sidesOf(board) }, () => false);
  const has = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < width && y < height && inside[y * width + x];
  for (let y = 0; y <= height; y++) for (let x = 0; x < width; x++) fence[across(board, x, y)] = has(x, y - 1) !== has(x, y);
  for (let y = 0; y < height; y++) for (let x = 0; x <= width; x++) fence[upright(board, x, y)] = has(x - 1, y) !== has(x, y);
  return fence;
}

/** A fence by chance: one loop round between two and three fifths of the squares. */
function fenceByChance(): boolean[] {
  const inside = Array.from({ length: width * height }, () => false);
  inside[pick(width * height)] = true;
  const wanted = Math.floor(width * height * (0.4 + random() * 0.2));
  let size = 1;
  for (let tries = 0; size < wanted && tries < width * height * 40; tries++) {
    const cell = pick(width * height);
    if (inside[cell]) continue;
    const [x, y] = [cell % width, Math.floor(cell / width)];
    const beside = [x > 0 && inside[cell - 1], x < width - 1 && inside[cell + 1], y > 0 && inside[cell - width], y < height - 1 && inside[cell + width]].filter(Boolean).length;
    // (a square with one neighbour taken makes an arm; with more, a lump: arms are let in more often)
    if (beside === 0 || (beside > 1 && random() < 0.6)) continue;
    inside[cell] = true;
    if (isLoop(board, boundOf(inside))) size += 1;
    else inside[cell] = false;
  }
  return boundOf(inside);
}

const made: { rows: string[]; fence: string }[] = [];
const seen = new Set<string>();
while (made.length < many) {
  const fence = fenceByChance();
  const puzzle: Puzzle = { width, height, clues: cluesOf(board, fence) };
  for (const cell of shuffled(puzzle.clues.map((_, index) => index))) {
    if (puzzle.clues.filter((clue) => clue !== null).length <= kept) break;
    const was = puzzle.clues[cell];
    puzzle.clues[cell] = null;
    if (fencesOf(puzzle, 2).length !== 1) puzzle.clues[cell] = was;
  }
  if (puzzle.clues.filter((clue) => clue !== null).length > kept) continue;
  const rows = Array.from({ length: height }, (_, y) => puzzle.clues.slice(y * width, (y + 1) * width).map((clue) => (clue === null ? BLANK : String(clue))).join(""));
  if (seen.has(rows.join("/"))) continue;
  seen.add(rows.join("/"));
  made.push({ rows, fence: fence.map((on) => (on ? "1" : "0")).join("") });
}
process.stdout.write(`[\n${made.map((puzzle) => `  ${JSON.stringify(puzzle)}`).join(",\n")}\n]\n`);
