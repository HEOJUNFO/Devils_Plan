/**
 * A QR code for a short text, as a square of dark and light modules: the
 * waiting room draws the room's invitation as one, for a phone beside the
 * screen to be pointed at.
 *
 * Written here and not taken from a package: the page loads no script of
 * anyone else's, and what is needed is small. It is the standard's
 * (ISO/IEC 18004) byte mode at error correction level L, in versions 1 to 9:
 * a code read off a screen is neither torn nor dirty, so the lowest level
 * keeps the code small and its modules large; and version 9 holds 230 bytes,
 * more than twice the longest invitation.
 *
 * Nothing here knows of the page: text in, modules out.
 */

/** A code's modules, row by row from the top: `true` is dark. Its quiet margin is not in it. */
export type QrModules = boolean[][];

/**
 * What the standard gives each version at level L: the error correction
 * codewords of each block, the data codewords of each block, and where the
 * alignment patterns' centres are, along either side.
 */
const VERSIONS: readonly { ec: number; blocks: readonly number[]; align: readonly number[] }[] = [
  { ec: 7, blocks: [19], align: [] },
  { ec: 10, blocks: [34], align: [6, 18] },
  { ec: 15, blocks: [55], align: [6, 22] },
  { ec: 20, blocks: [80], align: [6, 26] },
  { ec: 26, blocks: [108], align: [6, 30] },
  { ec: 18, blocks: [68, 68], align: [6, 34] },
  { ec: 20, blocks: [78, 78], align: [6, 22, 38] },
  { ec: 24, blocks: [97, 97], align: [6, 24, 42] },
  { ec: 30, blocks: [116, 116], align: [6, 26, 46] },
];

/** The two bits that say "level L" in a code's format. */
const LEVEL_L = 1;
/** The eight masks, by the standard's numbers: whether the module in row `i`, column `j` is turned over. */
const MASKS: readonly ((i: number, j: number) => boolean)[] = [
  (i, j) => (i + j) % 2 === 0,
  (i) => i % 2 === 0,
  (_i, j) => j % 3 === 0,
  (i, j) => (i + j) % 3 === 0,
  (i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0,
  (i, j) => ((i * j) % 2) + ((i * j) % 3) === 0,
  (i, j) => (((i * j) % 2) + ((i * j) % 3)) % 2 === 0,
  (i, j) => (((i + j) % 2) + ((i * j) % 3)) % 2 === 0,
];

// ---- The field the error correction is worked in: GF(256) by x^8 + x^4 + x^3 + x^2 + 1 ----------------
const EXP: number[] = [];
const LOG: number[] = [];
for (let power = 0, value = 1; power < 255; power++) {
  EXP[power] = value;
  LOG[value] = power;
  value <<= 1;
  if (value & 0x100) value ^= 0x11d;
}

/** The product of two of the field's numbers. */
function times(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : (EXP[((LOG[a] ?? 0) + (LOG[b] ?? 0)) % 255] ?? 0);
}

/**
 * The error correction codewords for `data`, `count` of them: what is left
 * of the data, moved up by `count` places, when it is divided by the
 * product of (x - 2^0) … (x - 2^(count-1)).
 */
export function errorCorrection(data: readonly number[], count: number): number[] {
  // the divisor, its highest term (which is 1) left out
  let divisor = [1];
  for (let root = 0; root < count; root++) {
    const next = Array.from({ length: divisor.length + 1 }, () => 0);
    divisor.forEach((term, at) => {
      next[at] = (next[at] ?? 0) ^ term;
      next[at + 1] = (next[at + 1] ?? 0) ^ times(term, EXP[root] ?? 0);
    });
    divisor = next;
  }
  const left = Array.from({ length: count }, () => 0);
  for (const byte of data) {
    const factor = byte ^ (left.shift() ?? 0);
    left.push(0);
    for (let at = 0; at < count; at++) left[at] = (left[at] ?? 0) ^ times(divisor[at + 1] ?? 0, factor);
  }
  return left;
}

/** The fifteen bits of a code's format: its level and its mask, with the ten bits that guard them, masked as the standard says. */
function formatBits(mask: number): number {
  const data = (LEVEL_L << 3) | mask;
  let rest = data;
  for (let step = 0; step < 10; step++) rest = (rest << 1) ^ ((rest >> 9) * 0x537);
  return ((data << 10) | rest) ^ 0x5412;
}

/** The eighteen bits that say a code's version, from version 7 on. */
function versionBits(version: number): number {
  let rest = version;
  for (let step = 0; step < 12; step++) rest = (rest << 1) ^ ((rest >> 11) * 0x1f25);
  return (version << 12) | rest;
}

/** The codewords of `bytes` in `version`, as they are laid into the code: the data of each block in turn a codeword at a time, then the error correction likewise. */
function codewords(bytes: Uint8Array, version: number): number[] {
  const { ec, blocks } = VERSIONS[version - 1] ?? { ec: 0, blocks: [] };
  const room = blocks.reduce((sum, block) => sum + block, 0);
  // byte mode, how many bytes, the bytes, then an end of four nought bits: twelve bits before the bytes, so the bytes lie half a codeword on
  const bits: number[] = [0, 1, 0, 0];
  for (let at = 7; at >= 0; at--) bits.push((bytes.length >> at) & 1);
  for (const byte of bytes) for (let at = 7; at >= 0; at--) bits.push((byte >> at) & 1);
  for (let end = 0; end < 4 && bits.length < room * 8; end++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);
  const data: number[] = [];
  for (let at = 0; at < bits.length; at += 8) data.push(bits.slice(at, at + 8).reduce((byte, bit) => (byte << 1) | bit, 0));
  // what room is left is filled with the standard's two filling codewords in turn
  for (let fill = 0; data.length < room; fill++) data.push(fill % 2 === 0 ? 0xec : 0x11);

  const parts: { data: number[]; ec: number[] }[] = [];
  let from = 0;
  for (const size of blocks) {
    const block = data.slice(from, from + size);
    parts.push({ data: block, ec: errorCorrection(block, ec) });
    from += size;
  }
  const out: number[] = [];
  const longest = Math.max(...blocks);
  for (let at = 0; at < longest; at++) for (const part of parts) if (at < part.data.length) out.push(part.data[at] ?? 0);
  for (let at = 0; at < ec; at++) for (const part of parts) out.push(part.ec[at] ?? 0);
  return out;
}

/**
 * How unlike a code the standard wants `modules` are, by its four counts:
 * runs of one colour, blocks of one colour, shapes that look like a finder
 * pattern, and dark and light out of balance. The mask with the least is used.
 */
function penalty(modules: QrModules): number {
  const size = modules.length;
  const at = (row: number, column: number): boolean => modules[row]?.[column] === true;
  let points = 0;
  for (const across of [true, false]) {
    for (let line = 0; line < size; line++) {
      const cell = (n: number): boolean => (across ? at(line, n) : at(n, line));
      let run = 1;
      for (let n = 1; n <= size; n++) {
        if (n < size && cell(n) === cell(n - 1)) run += 1;
        else {
          if (run >= 5) points += run - 2;
          run = 1;
        }
      }
      // dark, light, three dark, light, dark, with four light before or after it
      for (let n = 0; n + 11 <= size; n++) {
        const shape = Array.from({ length: 11 }, (_none, k) => cell(n + k));
        const finder = (start: number): boolean => [true, false, true, true, true, false, true].every((dark, k) => shape[start + k] === dark);
        const clear = (start: number): boolean => [0, 1, 2, 3].every((k) => shape[start + k] === false);
        if ((finder(0) && clear(7)) || (clear(0) && finder(4))) points += 40;
      }
    }
  }
  let dark = 0;
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      if (at(row, column)) dark += 1;
      if (row + 1 < size && column + 1 < size && at(row, column) === at(row + 1, column) && at(row, column) === at(row, column + 1) && at(row, column) === at(row + 1, column + 1)) points += 3;
    }
  }
  return points + 10 * Math.floor(Math.abs((dark * 100) / (size * size) - 50) / 5);
}

/** The smallest version whose data holds `length` bytes, or `null` where none of those here does. */
export function versionFor(length: number): number | null {
  const found = VERSIONS.findIndex(({ blocks }) => blocks.reduce((sum, block) => sum + block, 0) - 2 >= length);
  return found < 0 ? null : found + 1;
}

/**
 * The QR code that says `text`, or `null` where it is longer than the
 * versions here hold (230 bytes). The code is 21 modules a side for the
 * shortest text and 53 for the longest; whoever draws it leaves four light
 * modules around it.
 */
export function qrCode(text: string): QrModules | null {
  const bytes = new TextEncoder().encode(text);
  const version = versionFor(bytes.length);
  if (version === null) return null;
  const size = 17 + 4 * version;
  const modules: QrModules = Array.from({ length: size }, () => Array.from({ length: size }, () => false));
  /** The modules that are the code's own shapes and not its data: no data is laid there and no mask turns them. */
  const fixed: boolean[][] = Array.from({ length: size }, () => Array.from({ length: size }, () => false));
  const set = (row: number, column: number, dark: boolean): void => {
    if (row < 0 || column < 0 || row >= size || column >= size) return;
    (modules[row] ?? [])[column] = dark;
    (fixed[row] ?? [])[column] = true;
  };

  // the three finder patterns with the light line around each
  for (const [top, left] of [
    [0, 0],
    [0, size - 7],
    [size - 7, 0],
  ] as const) {
    for (let row = -1; row <= 7; row++) {
      for (let column = -1; column <= 7; column++) {
        const ring = Math.max(Math.abs(row - 3), Math.abs(column - 3));
        set(top + row, left + column, ring !== 2 && ring !== 4);
      }
    }
  }
  // the two timing lines between them
  for (let n = 8; n < size - 8; n++) {
    set(6, n, n % 2 === 0);
    set(n, 6, n % 2 === 0);
  }
  // the alignment patterns, but for the three that would lie on a finder pattern
  const { align } = VERSIONS[version - 1] ?? { align: [] };
  for (const row of align) {
    for (const column of align) {
      if ((row === 6 && column === 6) || (row === 6 && column === size - 7) || (row === size - 7 && column === 6)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(row + dy, column + dx, Math.max(Math.abs(dy), Math.abs(dx)) !== 1);
    }
  }
  /** Writes the format's bits for `mask` in their two places, and the module that is always dark. */
  const writeFormat = (mask: number): void => {
    const bits = formatBits(mask);
    const bit = (n: number): boolean => ((bits >> n) & 1) === 1;
    for (let n = 0; n <= 5; n++) set(n, 8, bit(n));
    set(7, 8, bit(6));
    set(8, 8, bit(7));
    set(8, 7, bit(8));
    for (let n = 9; n < 15; n++) set(8, 14 - n, bit(n));
    for (let n = 0; n < 8; n++) set(8, size - 1 - n, bit(n));
    for (let n = 8; n < 15; n++) set(size - 15 + n, 8, bit(n));
    set(size - 8, 8, true);
  };
  // (kept clear of data from the start; the bits are written once the mask is known)
  writeFormat(0);
  if (version >= 7) {
    const bits = versionBits(version);
    for (let n = 0; n < 18; n++) {
      const dark = ((bits >> n) & 1) === 1;
      const a = size - 11 + (n % 3);
      const b = Math.floor(n / 3);
      set(b, a, dark);
      set(a, b, dark);
    }
  }

  // the data: up and down in columns two modules wide from the right, the timing line's column passed over
  const words = codewords(bytes, version);
  let laid = 0;
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let step = 0; step < size; step++) {
      const row = upward ? size - 1 - step : step;
      for (const column of [right, right - 1]) {
        if (fixed[row]?.[column] === true) continue;
        // (what room is left after the last codeword stays light)
        const word = words[laid >> 3];
        (modules[row] ?? [])[column] = word !== undefined && ((word >> (7 - (laid & 7))) & 1) === 1;
        laid += 1;
      }
    }
    upward = !upward;
  }

  // the mask that leaves the code least like what a reader stumbles on
  let best: { points: number; modules: QrModules } | null = null;
  for (let mask = 0; mask < MASKS.length; mask++) {
    const turns = MASKS[mask];
    if (turns === undefined) continue;
    writeFormat(mask);
    const masked = modules.map((line, row) => line.map((dark, column) => (fixed[row]?.[column] === true ? dark : dark !== turns(row, column))));
    const points = penalty(masked);
    if (best === null || points < best.points) best = { points, modules: masked };
  }
  return best?.modules ?? null;
}
