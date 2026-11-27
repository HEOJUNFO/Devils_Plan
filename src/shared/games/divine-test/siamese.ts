/**
 * The magic square the Siamese method makes: the one the show's test was
 * passed with (design/games/divine-test.md).
 *
 * The room never judges a board by this: any board whose lines all add up
 * passes (`isMagic` of `rules.ts`). It is for the bot that fills a place
 * while developing, and for the tests.
 */

/**
 * The tile on each square of a board `size` across (an odd number), a row
 * after another from the top: 1 on the middle square of the top row, each
 * next tile up and to the right of the last, going round the edges of the
 * board, and under the last where that square is taken.
 */
export function siamese(size: number): number[] {
  const cells = Array.from({ length: size * size }, () => 0);
  let [x, y] = [Math.floor(size / 2), 0];
  for (let tile = 1; tile <= size * size; tile++) {
    cells[y * size + x] = tile;
    const [nx, ny] = [(x + 1) % size, (y - 1 + size) % size];
    if (cells[ny * size + nx] === 0) [x, y] = [nx, ny];
    else y = (y + 1) % size;
  }
  return cells;
}
