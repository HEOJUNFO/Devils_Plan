import { describe, expect, it } from "vitest";
import { errorCorrection, qrCode, versionFor, type QrModules } from "../../../src/shared/qr";

/** An invitation as the waiting room writes it: the longest game's address, a code, and a time. */
const INVITE = "https://play.brain-survival.workers.dev/i/ko/mystery-stock-market/#4EUF8";

// ---- A reader written apart from the writer, by the standard's own tables ------------------------------
/** GF(256) by x^8 + x^4 + x^3 + x^2 + 1, as powers of 2. */
const POWERS: number[] = [];
for (let power = 0, value = 1; power < 255; power++) {
  POWERS.push(value);
  value = value * 2 >= 256 ? (value * 2) ^ 0x11d : value * 2;
}
const multiply = (a: number, b: number): number => (a === 0 || b === 0 ? 0 : (POWERS[(POWERS.indexOf(a) + POWERS.indexOf(b)) % 255] ?? 0));
/** The value of the codewords, read as a polynomial with the first the highest, at `x`. */
const valueAt = (words: readonly number[], x: number): number => words.reduce((sum, word) => multiply(sum, x) ^ word, 0);

/** Level L: error correction codewords a block, and the data codewords of each block, by version. */
const LEVEL_L: Record<number, { ec: number; blocks: number[] }> = {
  1: { ec: 7, blocks: [19] },
  2: { ec: 10, blocks: [34] },
  3: { ec: 15, blocks: [55] },
  4: { ec: 20, blocks: [80] },
  5: { ec: 26, blocks: [108] },
  6: { ec: 18, blocks: [68, 68] },
  7: { ec: 20, blocks: [78, 78] },
  8: { ec: 24, blocks: [97, 97] },
  9: { ec: 30, blocks: [116, 116] },
};
/** Where alignment patterns are centred, by version. */
const ALIGN: Record<number, number[]> = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46] };
const MASKED: ((row: number, column: number) => boolean)[] = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

/** Whether the module at `row`, `column` of a code of `version` is one of its own shapes, by where the standard puts them. */
function isShape(version: number, row: number, column: number): boolean {
  const size = 17 + 4 * version;
  // the finder patterns with their margins and the format beside them
  if (row <= 8 && column <= 8) return true;
  if (row <= 8 && column >= size - 8) return true;
  if (row >= size - 8 && column <= 8) return true;
  if (row === 6 || column === 6) return true;
  if (version >= 7 && ((row < 6 && column >= size - 11) || (column < 6 && row >= size - 11))) return true;
  const centres = ALIGN[version] ?? [];
  return centres.some((r) =>
    centres.some((c) => {
      if ((r === 6 && c === 6) || (r === 6 && c === size - 7) || (r === size - 7 && c === 6)) return false;
      return Math.abs(row - r) <= 2 && Math.abs(column - c) <= 2;
    }),
  );
}

/** What a code says, read without mending anything, with what its format says of it and its blocks as they were laid. */
function read(modules: QrModules): { text: string; level: number; mask: number; blocks: number[][] } {
  const size = modules.length;
  const version = (size - 17) / 4;
  const dark = (row: number, column: number): boolean => modules[row]?.[column] === true;
  // the format beside the top left finder pattern: bit 14 first
  const places: [number, number][] = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  ];
  const format = places.reduce((bits, [row, column]) => (bits << 1) | (dark(row, column) ? 1 : 0), 0) ^ 0x5412;
  const level = format >> 13;
  const mask = (format >> 10) & 7;
  const turned = MASKED[mask] ?? (() => false);
  const bits: number[] = [];
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let step = 0; step < size; step++) {
      const row = upward ? size - 1 - step : step;
      for (const column of [right, right - 1]) {
        if (isShape(version, row, column)) continue;
        bits.push(dark(row, column) !== turned(row, column) ? 1 : 0);
      }
    }
    upward = !upward;
  }
  const words: number[] = [];
  for (let at = 0; at + 8 <= bits.length; at += 8) words.push(bits.slice(at, at + 8).reduce((byte, bit) => (byte << 1) | bit, 0));
  const { ec, blocks: sizes } = LEVEL_L[version] ?? { ec: 0, blocks: [] };
  const blocks: number[][] = sizes.map(() => []);
  let next = 0;
  for (let at = 0; at < Math.max(...sizes); at++) sizes.forEach((length, block) => at < length && blocks[block]?.push(words[next++] ?? 0));
  const data = blocks.flat();
  for (let at = 0; at < ec; at++) sizes.forEach((_length, block) => blocks[block]?.push(words[next++] ?? 0));
  const stream = data.flatMap((word) => Array.from({ length: 8 }, (_none, bit) => (word >> (7 - bit)) & 1));
  const take = (from: number, count: number): number => stream.slice(from, from + count).reduce((value, bit) => (value << 1) | bit, 0);
  if (take(0, 4) !== 4) throw new Error("not byte mode");
  const length = take(4, 8);
  const bytes = Uint8Array.from({ length }, (_none, at) => take(12 + at * 8, 8));
  return { text: new TextDecoder().decode(bytes), level, mask, blocks };
}

describe("a QR code", () => {
  it("is the smallest version that holds the text: 21 modules a side for 17 bytes, 25 for 18", () => {
    expect(versionFor(17)).toBe(1);
    expect(versionFor(18)).toBe(2);
    expect(qrCode("a".repeat(17))).toHaveLength(21);
    expect(qrCode("a".repeat(18))).toHaveLength(25);
    expect(qrCode("a".repeat(18))?.every((row) => row.length === 25)).toBe(true);
  });

  it("holds 230 bytes at most, and is not made for more", () => {
    expect(qrCode("a".repeat(230))).toHaveLength(53);
    expect(versionFor(231)).toBeNull();
    expect(qrCode("a".repeat(231))).toBeNull();
  });

  it("holds an invitation in a code of 33 modules a side, and one that says when in 37", () => {
    expect(qrCode(INVITE)).toHaveLength(33);
    expect(qrCode(`${INVITE}@2026-11-15T21:00`)).toHaveLength(37);
  });

  it("has a finder pattern in three corners and none in the fourth, and the lines between them dark and light in turn", () => {
    const modules = qrCode(INVITE) ?? [];
    const size = modules.length;
    const finder = (top: number, left: number): boolean =>
      [0, 1, 2, 3, 4, 5, 6].every((dy) => [0, 1, 2, 3, 4, 5, 6].every((dx) => (modules[top + dy]?.[left + dx] === true) === (Math.max(Math.abs(dy - 3), Math.abs(dx - 3)) !== 2)));

    expect(finder(0, 0)).toBe(true);
    expect(finder(0, size - 7)).toBe(true);
    expect(finder(size - 7, 0)).toBe(true);
    expect(finder(size - 7, size - 7)).toBe(false);
    for (let n = 8; n < size - 8; n++) {
      expect(modules[6]?.[n]).toBe(n % 2 === 0);
      expect(modules[n]?.[6]).toBe(n % 2 === 0);
    }
    expect(modules[size - 8]?.[8]).toBe(true);
  });

  it.each([
    ["a text of one letter", "a"],
    ["an invitation", INVITE],
    ["an invitation that says when", `${INVITE}@2026-11-15T21:00`],
    ["Korean", "미스터리 거래소에서 만나요"],
    ["a text that fills version 5", "x".repeat(106)],
    ["a text of two blocks (version 6)", "y".repeat(120)],
    ["a text with the version written into it (version 7)", "z".repeat(150)],
    ["the longest text (version 9)", "w".repeat(230)],
  ])("is read back as it was written: %s", (_what, text) => {
    const modules = qrCode(text);
    if (modules === null) throw new Error("no code");

    const got = read(modules);

    expect(got.text).toBe(text);
    // level L is 01 in a code's format
    expect(got.level).toBe(1);
  });

  it("says its format twice, the same both times", () => {
    const modules = qrCode(INVITE) ?? [];
    const size = modules.length;
    const first = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
    const second = [
      ...[1, 2, 3, 4, 5, 6, 7].map((n) => [size - n, 8]),
      ...[8, 7, 6, 5, 4, 3, 2, 1].map((n) => [8, size - n]),
    ];

    expect(second.map(([row, column]) => modules[row ?? 0]?.[column ?? 0])).toEqual(first.map(([row, column]) => modules[row ?? 0]?.[column ?? 0]));
  });

  it("guards its format with ten bits that the standard's divisor leaves nothing of", () => {
    const modules = qrCode(INVITE) ?? [];
    const places = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
    let rest = places.reduce((bits, [row, column]) => (bits << 1) | (modules[row ?? 0]?.[column ?? 0] === true ? 1 : 0), 0) ^ 0x5412;

    for (let bit = 14; bit >= 10; bit--) if ((rest >> bit) & 1) rest ^= 0x537 << (bit - 10);

    expect(rest).toBe(0);
  });

  it("gives every block error correction that a reader's check finds nothing wrong with", () => {
    for (const text of [INVITE, "y".repeat(120), "w".repeat(230)]) {
      const { blocks } = read(qrCode(text) ?? []);
      const ec = LEVEL_L[((qrCode(text) ?? []).length - 17) / 4]?.ec ?? 0;

      for (const block of blocks) for (let root = 0; root < ec; root++) expect(valueAt(block, POWERS[root] ?? 0)).toBe(0);
    }
  });

  it("works out the error correction the standard's own example has", () => {
    // ISO/IEC 18004, annex I: "01234567" at version 1, level M
    const data = [0x10, 0x20, 0x0c, 0x56, 0x61, 0x80, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11];

    expect(errorCorrection(data, 10)).toEqual([0xa5, 0x24, 0xd4, 0xc1, 0xed, 0x36, 0xc7, 0x87, 0x2c, 0x55]);
  });

  it("is the same code for the same text", () => {
    expect(qrCode(INVITE)).toEqual(qrCode(INVITE));
  });
});
